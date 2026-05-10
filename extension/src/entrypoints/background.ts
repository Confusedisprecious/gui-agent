export default defineBackground(() => {
    console.log('[MedicalAgent] Service Worker started');

    chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
        if (msg.type === 'chat') {
            handleChat(msg.config, msg.message, msg.history)
                .then(sendResponse)
                .catch((err) => sendResponse({ error: err.message }));
            return true;
        }
        if (msg.type === 'get_config') {
            loadConfig().then(sendResponse).catch(() => sendResponse(null));
            return true;
        }
        if (msg.type === 'save_config') {
            saveConfig(msg.config).then(() => sendResponse({ ok: true }));
            return true;
        }
    });

    chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});
});

interface ModelConfig {
    apiKey: string;
    model: string;
    baseUrl: string;
}

const DEFAULT_CONFIG: ModelConfig = {
    apiKey: 'sk-16b78952b84d4e7c9ab071f8ce5e9dca',
    model: 'deepseek-v4-flash',
    baseUrl: 'https://api.deepseek.com/v1',
};

async function loadConfig(): Promise<ModelConfig> {
    const result = await chrome.storage.local.get('medical_agent_config');
    if (result.medical_agent_config) {
        return { ...DEFAULT_CONFIG, ...result.medical_agent_config };
    }
    return { ...DEFAULT_CONFIG };
}

async function saveConfig(config: ModelConfig): Promise<void> {
    await chrome.storage.local.set({ medical_agent_config: config });
}

async function getPageContext(): Promise<{ url: string; title: string; text: string }> {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) return { url: '', title: '', text: '' };

    const url = tab.url || '';
    const title = tab.title || '';

    let text = '';
    try {
        const results = await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: () => {
                // Clone body to avoid mutating the live page
                const clone = document.body.cloneNode(true) as HTMLElement;
                // Remove scripts, styles, and hidden elements
                const removes = clone.querySelectorAll('script, style, noscript, [aria-hidden="true"]');
                removes.forEach((el) => el.remove());
                return clone.innerText.slice(0, 8000);
            },
        });
        text = results[0]?.result || '';
    } catch {
        // Can't inject into this page (chrome://, etc.)
        text = '';
    }

    return { url, title, text };
}

function buildSystemPrompt(pageContext: { url: string; title: string; text: string }): string {
    let prompt = 'You are an AI assistant embedded in a Chrome extension. You help users interact with and understand the web page they are currently viewing. Answer questions clearly and helpfully.';

    if (pageContext.url) {
        prompt += `\n\n## Current Page\nURL: ${pageContext.url}\nTitle: ${pageContext.title}`;
        if (pageContext.text) {
            prompt += `\n\n### Page Content (first 8000 chars)\n\`\`\`\n${pageContext.text}\n\`\`\``;
            prompt += '\n\nUse the page content above to answer the user\'s questions about this page.';
        } else {
            prompt += '\n(Page content could not be extracted - this may be a restricted page like chrome:// or a new tab)';
        }
    } else {
        prompt += '\n\nNo web page is currently open.';
    }

    return prompt;
}

async function handleChat(
    config: ModelConfig | null,
    message: string,
    history: Array<{ role: string; content: string }>,
) {
    const cfg = config || (await loadConfig());
    const pageContext = await getPageContext();

    const messages = [
        { role: 'system', content: buildSystemPrompt(pageContext) },
        ...(history || []),
        { role: 'user', content: message },
    ];

    const resp = await fetch(`${cfg.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${cfg.apiKey}`,
        },
        body: JSON.stringify({
            model: cfg.model,
            messages,
            temperature: 0.7,
            max_tokens: 4096,
        }),
    });

    if (!resp.ok) {
        const errText = await resp.text();
        throw new Error(`API error ${resp.status}: ${errText}`);
    }

    const data = await resp.json();
    const content = data.choices?.[0]?.message?.content || '';

    return { content, pageContext };
}
