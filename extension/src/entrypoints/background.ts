export default defineBackground(() => {
    console.log('[MedicalAgent] Service Worker started');

    // Listen for messages from sidepanel
    chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
        if (msg.type === 'chat') {
            handleChat(msg.config, msg.message, msg.history)
                .then(sendResponse)
                .catch((err) => sendResponse({ error: err.message }));
            return true; // keep channel open for async response
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

    // Setup side panel behavior
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

async function handleChat(
    config: ModelConfig | null,
    message: string,
    history: Array<{ role: string; content: string }>,
) {
    const cfg = config || (await loadConfig());

    const messages = [
        { role: 'system', content: 'You are a helpful medical planning assistant. Answer questions clearly and concisely.' },
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

    return { content };
}
