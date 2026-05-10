export default defineBackground(() => {
    console.log('[MedicalAgent] Service Worker started');

    // --- State ---
    let ws: WebSocket | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let reconnectAttempts = 0;
    const MAX_RECONNECT = 10;
    const WS_URL = 'ws://127.0.0.1:8765/ws';

    const DEFAULT_CONFIG: ModelConfig = {
        apiKey: 'sk-16b78952b84d4e7c9ab071f8ce5e9dca',
        model: 'deepseek-v4-flash',
        baseUrl: 'https://api.deepseek.com/v1',
    };

    // --- WebSocket ---

    function connectWs() {
        if (ws?.readyState === WebSocket.OPEN || ws?.readyState === WebSocket.CONNECTING) return;
        ws = new WebSocket(WS_URL);
        ws.onopen = () => { reconnectAttempts = 0; broadcast({ type: 'ws_status', status: 'connected' }); };
        ws.onmessage = (ev) => { try { broadcast(JSON.parse(ev.data)); } catch { /* ignore */ } };
        ws.onclose = () => { broadcast({ type: 'ws_status', status: 'disconnected' }); scheduleReconnect(); };
    }

    function scheduleReconnect() {
        if (reconnectAttempts >= MAX_RECONNECT) return;
        const delay = Math.min(1000 * Math.pow(2, reconnectAttempts), 30000);
        reconnectAttempts++;
        reconnectTimer = setTimeout(connectWs, delay);
    }

    function sendWs(data: unknown): boolean {
        if (ws?.readyState === WebSocket.OPEN) { ws.send(JSON.stringify(data)); return true; }
        return false;
    }

    function broadcast(data: unknown) {
        chrome.runtime.sendMessage({ type: 'ws_message', data }).catch(() => {});
    }

    // --- Config ---

    async function loadConfig(): Promise<ModelConfig> {
        const result = await chrome.storage.local.get('medical_agent_config');
        if (result.medical_agent_config) return { ...DEFAULT_CONFIG, ...result.medical_agent_config };
        return { ...DEFAULT_CONFIG };
    }

    async function saveConfig(config: ModelConfig): Promise<void> {
        await chrome.storage.local.set({ medical_agent_config: config });
    }

    // --- Page context ---

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
                    const clone = document.body.cloneNode(true) as HTMLElement;
                    clone.querySelectorAll('script, style, noscript, [aria-hidden="true"]').forEach((el) => el.remove());
                    return clone.innerText.slice(0, 8000);
                },
            });
            text = results[0]?.result || '';
        } catch { /* restricted page */ }
        return { url, title, text };
    }

    function buildSystemPrompt(ctx: { url: string; title: string; text: string }): string {
        let p = 'You are an AI assistant embedded in a Chrome extension. You help users interact with and understand the web page they are currently viewing.';
        if (ctx.url) {
            p += `\n\n## Current Page\nURL: ${ctx.url}\nTitle: ${ctx.title}`;
            if (ctx.text) p += `\n\n### Page Content (first 8000 chars)\n\`\`\`\n${ctx.text}\n\`\`\``;
            p += '\n\nUse the page content above to answer questions.';
        }
        return p;
    }

    // --- Direct chat (always available) ---

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
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${cfg.apiKey}` },
            body: JSON.stringify({ model: cfg.model, messages, temperature: 0.7, max_tokens: 4096 }),
        });

        if (!resp.ok) throw new Error(`API error ${resp.status}: ${await resp.text()}`);
        const data = await resp.json();
        return { content: data.choices?.[0]?.message?.content || '', pageContext };
    }

    // --- Browser-use task (requires Python backend + CDP) ---

    async function handleExecuteTask(config: any) {
        const cfg = config || {};
        const defaultCfg = await loadConfig();
        const task = cfg.task || '';
        if (!task) throw new Error('No task specified');

        const sent = sendWs({
            type: 'execute_task',
            config: {
                task,
                api_key: cfg.apiKey || defaultCfg.apiKey,
                model: cfg.model || defaultCfg.model,
                base_url: cfg.baseUrl || defaultCfg.baseUrl,
                max_steps: cfg.maxSteps || 50,
                use_vision: cfg.useVision || false,
                skills: cfg.skills || [],
            },
        });

        if (!sent) {
            throw new Error(
                'Browser control backend not connected.\n\n' +
                'Please run: medical-agent\\launcher\\start_all.bat\n\n' +
                'This starts Chrome with CDP + the Python agent backend.'
            );
        }

        return { accepted: true };
    }

    // --- Message routing ---

    chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
        if (msg.type === 'chat') {
            handleChat(msg.config, msg.message, msg.history)
                .then(sendResponse).catch((err) => sendResponse({ error: err.message }));
            return true;
        }
        if (msg.type === 'execute_task') {
            handleExecuteTask(msg.config)
                .then(sendResponse).catch((err) => sendResponse({ error: err.message }));
            return true;
        }
        if (msg.type === 'stop_task') {
            sendWs({ type: 'stop_task' });
            sendResponse({ ok: true });
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
        if (msg.type === 'ws_reconnect') {
            connectWs();
            sendResponse({ ok: true });
            return true;
        }
    });

    chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});
    connectWs();
});

// --- Types (outside defineBackground, used by the closure above) ---

interface ModelConfig {
    apiKey: string;
    model: string;
    baseUrl: string;
}
