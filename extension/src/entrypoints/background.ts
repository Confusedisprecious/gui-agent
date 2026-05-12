import { activateAll, getSkillsMetadata, renderMetadataPrompt } from '@/skills/loader';
import { SKILLS } from '@/skills/definitions';

export default defineBackground(() => {
    console.log('[MedicalAgent] Service Worker started');

    // --- State ---
    let ws: WebSocket | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let reconnectAttempts = 0;
    const MAX_RECONNECT = 10;
    const WS_URL = 'ws://127.0.0.1:8765/ws';

    let agentRunning = false;
    let agentStopRequested = false;
    let agentTabId: number | null = null;

    // CDP bridge state (for browser-use backend mode)
    let cdpBridgeWs: WebSocket | null = null;
    let cdpBridgeTabId: number | null = null;
    let cdpBridgeSessionId: string | null = null;

    const DEFAULT_CONFIG: ModelConfig = {
        apiKey: '',
        model: 'deepseek-v4-flash',
        baseUrl: 'https://api.deepseek.com/v1',
    };

    // --- WebSocket (kept for optional Python backend) ---

    function connectWs() {
        if (ws?.readyState === WebSocket.OPEN || ws?.readyState === WebSocket.CONNECTING) return;
        ws = new WebSocket(WS_URL);
        ws.onopen = () => { reconnectAttempts = 0; broadcast({ type: 'ws_status', status: 'connected' }); };
        ws.onmessage = (ev) => {
            try {
                const data = JSON.parse(ev.data);
                // Intercept CDP bridge start command
                if (data.type === 'start_cdp_bridge') {
                    startCdpBridge(data.bridge_url, data.session_id).catch((err) => {
                        console.error('[MedicalAgent] CDP bridge start failed:', err);
                        broadcast({ type: 'agent_error', session_id: data.session_id, error: `CDP bridge: ${err.message}` });
                    });
                }
                // Reset agent state on backend completion
                if (data.type === 'agent_result' || data.type === 'agent_error') {
                    agentRunning = false;
                    closeCdpBridge();
                }
                if (data.type === 'status_change' && data.status === 'stopped') {
                    agentRunning = false;
                    closeCdpBridge();
                }
                // Always broadcast to sidepanel
                broadcast(data);
            } catch { /* ignore */ }
        };
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

    // --- Page context (for chat) ---

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
        // Step 2: Always inject skills metadata so LLM knows what skills are available
        const skillsMeta = getSkillsMetadata(SKILLS);
        p += renderMetadataPrompt(skillsMeta);
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

    // =========================================================================
    //  NATIVE CDP BROWSER AGENT (chrome.debugger — no flags, no launcher)
    // =========================================================================

    function sleep(ms: number): Promise<void> {
        return new Promise((r) => setTimeout(r, ms));
    }

    function handleDebuggerDetach(source: chrome.debugger.Debuggee, reason: string) {
        if (source.tabId === agentTabId) {
            console.log(`[MedicalAgent] Debugger detached from tab ${agentTabId}: ${reason}`);
            agentStopRequested = true;
            broadcast({
                type: 'agent_error',
                session_id: 'native',
                error: `Browser control lost: ${reason}. You may have closed the tab or opened DevTools.`,
            });
        }
    }

    /**
     * Inject a script that labels every interactive element with data-agent-id
     * and returns { url, title, elements: [...] }.
     */
    async function extractPageElements(tabId: number): Promise<PageState> {
        const expression = `(${elementExtractionFn.toString()})()`;
        const response = await chrome.debugger.sendCommand(
            { tabId },
            'Runtime.evaluate',
            { expression, returnByValue: true, awaitPromise: false },
        );
        if (response.exceptionDetails) {
            throw new Error(`Element extraction failed: ${JSON.stringify(response.exceptionDetails)}`);
        }
        return response.result?.value as PageState;
    }

    function buildAgentPrompt(
        task: string,
        page: PageState,
        history: Array<{ role: string; content: string }>,
        skillInstructions: string = '',
    ): Array<{ role: string; content: string }> {
        let elemDesc = '';
        const maxElems = 80;
        const shown = page.elements.slice(0, maxElems);
        for (const el of shown) {
            const tag = el.type ? `${el.tag}[type="${el.type}"]` : el.tag;
            let label = el.text || el.placeholder || el.ariaLabel || el.name || el.id || '';
            label = label.slice(0, 80);
            const pos = `(${el.rect.x},${el.rect.y}) ${el.rect.w}x${el.rect.h}`;
            let extra = '';
            if (el.tag === 'select' && el.options?.length) {
                extra = ' options: [' + el.options.slice(0, 10).join(', ') + ']';
            }
            if (el.value) extra += ` value="${el.value.slice(0, 40)}"`;
            elemDesc += `[${el.index}] <${tag}> "${label}" at ${pos}${extra}\n`;
        }
        if (page.elements.length > maxElems) {
            elemDesc += `... and ${page.elements.length - maxElems} more elements not shown.\n`;
        }

        const historyBlock = history.length > 0
            ? history.map((h) => `${h.role}: ${h.content.slice(0, 300)}`).join('\n')
            : '(none)';

        // Step 2: Skills metadata — always visible so LLM knows what skills are available
        const skillsMetaPrompt = renderMetadataPrompt(getSkillsMetadata(SKILLS));

        const systemPrompt = `你是一个浏览器自动化助手，你的任务是通过操作网页元素来完成用户的指令。

## 当前页面
URL: ${page.url}
标题: ${page.title}
可见元素数: ${page.elements.length}

## 可交互元素
${elemDesc}
${skillsMetaPrompt}

## 回复格式
每次回复只输出一个 JSON 对象，描述你的下一步操作：
{
  "thinking": "分析当前页面状态和下一步该做什么",
  "action": "click" | "type" | "select" | "scroll" | "done" | "fail",
  "elementIndex": <元素编号, click/type/select 时必填>,
  "text": "<要输入的文本或要选择的选项>",
  "deltaY": <滚动距离, 正数向下, 负数向上>,
  "key": "<可选, 操作后按键: Enter/Escape/Tab/ArrowUp/ArrowDown>",
  "message": "<完成或失败时的总结, 用中文>"
}

## 操作规则
- click: 点击按钮、链接、选项卡、菜单等
- type: 在输入框中输入文本，配合 key: "Enter" 可直接触发搜索
- select: 在下拉框中选择选项
- scroll: 滚动页面（deltaY=300 约等于一屏）
- done: 任务已完全完成，在 message 中用中文总结完成了什么
- fail: 任务无法完成，在 message 中用中文解释原因
- key: 操作后模拟按键，搜索框输入后常用 key: "Enter"

## ⚠️ 关键规则
1. 每次只执行一个操作
2. 搜索场景：用 type 输入关键词并加上 key: "Enter" 一步完成搜索！不要分两步
3. 搜索执行后、表单提交后、页面跳转后 —— 立即用 done 结束，不要继续操作
4. 不要重复执行已经完成的操作
5. 如果上一个操作已经完成了任务，必须返回 done
6. thinking 字段必须用中文` + skillInstructions;

        return [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: `## 用户任务\n${task}\n\n## 已执行步骤\n${historyBlock}\n\n请决定下一步操作。只回复 JSON。` },
        ];
    }

    async function callLLMForAction(
        messages: Array<{ role: string; content: string }>,
        config: ModelConfig,
    ): Promise<string> {
        const resp = await fetch(`${config.baseUrl}/chat/completions`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${config.apiKey}`,
            },
            body: JSON.stringify({
                model: config.model,
                messages,
                temperature: 0.3,
                max_tokens: 1024,
            }),
        });

        if (!resp.ok) throw new Error(`LLM API error ${resp.status}: ${await resp.text()}`);
        const data = await resp.json();
        const content: string = data.choices?.[0]?.message?.content || '';
        return content;
    }

    function parseActionResponse(raw: string): AgentAction {
        // Strip markdown code fences if present
        let json = raw.trim();
        if (json.startsWith('```')) {
            json = json.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
        }
        // Try to find the first JSON object in the text
        const match = json.match(/\{[\s\S]*\}/);
        if (!match) throw new Error(`No JSON object found in LLM response: ${raw.slice(0, 200)}`);
        const parsed = JSON.parse(match[0]);

        return {
            thinking: String(parsed.thinking || ''),
            action: String(parsed.action || 'done'),
            elementIndex: typeof parsed.elementIndex === 'number' ? parsed.elementIndex : -1,
            text: String(parsed.text || ''),
            deltaY: typeof parsed.deltaY === 'number' ? parsed.deltaY : 0,
            message: String(parsed.message || ''),
            key: String(parsed.key || ''),
        };
    }

    async function pressKey(tabId: number, key: string) {
        if (!key) return;
        // Map common key names to CDP key event codes
        const keyMap: Record<string, { key: string; code: string; vKey: number }> = {
            'Enter': { key: 'Enter', code: 'Enter', vKey: 13 },
            'Tab': { key: 'Tab', code: 'Tab', vKey: 9 },
            'Escape': { key: 'Escape', code: 'Escape', vKey: 27 },
            'Backspace': { key: 'Backspace', code: 'Backspace', vKey: 8 },
            'ArrowUp': { key: 'ArrowUp', code: 'ArrowUp', vKey: 38 },
            'ArrowDown': { key: 'ArrowDown', code: 'ArrowDown', vKey: 40 },
        };
        const k = keyMap[key] || { key, code: key, vKey: 0 };
        for (const type of ['keyDown', 'keyUp'] as const) {
            await chrome.debugger.sendCommand(
                { tabId },
                'Input.dispatchKeyEvent',
                { type, key: k.key, code: k.code, windowsVirtualKeyCode: k.vKey },
            );
        }
    }

    async function executeAction(tabId: number, action: AgentAction): Promise<string> {
        const { action: act, elementIndex, text, deltaY, key } = action;

        if (act === 'scroll') {
            await chrome.debugger.sendCommand(
                { tabId },
                'Runtime.evaluate',
                { expression: `window.scrollBy(0, ${deltaY || 300})`, returnByValue: false },
            );
            return `Scrolled by ${deltaY || 300}px`;
        }

        if (act === 'click') {
            if (elementIndex < 0) throw new Error('No element index for click');

            // Step 1: scroll into view + get center coordinates
            const posResult = await chrome.debugger.sendCommand(
                { tabId },
                'Runtime.evaluate',
                {
                    expression: `(() => {
                        const el = document.querySelector('[data-agent-id="agent-${elementIndex}"]');
                        if (!el) return { ok: false, error: 'Element not found' };
                        el.scrollIntoView({ block: 'center', behavior: 'instant' });
                        const r = el.getBoundingClientRect();
                        return { ok: true, x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) };
                    })()`,
                    returnByValue: true,
                },
            );
            const posValue = posResult.result?.value;
            if (!posValue?.ok) throw new Error(posValue?.error || 'Click: element not found');

            const cx = posValue.x as number;
            const cy = posValue.y as number;

            // Step 2: simulate real mouse click via CDP Input domain
            await chrome.debugger.sendCommand(
                { tabId },
                'Input.dispatchMouseEvent',
                { type: 'mouseMoved', x: cx, y: cy },
            );
            await sleep(50);
            await chrome.debugger.sendCommand(
                { tabId },
                'Input.dispatchMouseEvent',
                { type: 'mousePressed', x: cx, y: cy, button: 'left', clickCount: 1 },
            );
            await sleep(80);
            await chrome.debugger.sendCommand(
                { tabId },
                'Input.dispatchMouseEvent',
                { type: 'mouseReleased', x: cx, y: cy, button: 'left', clickCount: 1 },
            );

            if (key) await pressKey(tabId, key);
            return `Clicked element [${elementIndex}] at (${cx},${cy})${key ? ' + ' + key : ''}`;
        }

        if (act === 'type') {
            if (elementIndex < 0) throw new Error('No element index for type');

            // Step 1: scroll into view, get position + focus + select all
            const posResult = await chrome.debugger.sendCommand(
                { tabId },
                'Runtime.evaluate',
                {
                    expression: `(() => {
                        const el = document.querySelector('[data-agent-id="agent-${elementIndex}"]');
                        if (!el) return { ok: false, error: 'Element not found' };
                        el.scrollIntoView({ block: 'center', behavior: 'instant' });
                        const r = el.getBoundingClientRect();
                        el.focus();
                        // Select all existing text
                        if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
                            el.select();
                        } else if (el.isContentEditable) {
                            const range = document.createRange();
                            range.selectNodeContents(el);
                            const sel = window.getSelection();
                            sel?.removeAllRanges();
                            sel?.addRange(range);
                        }
                        return { ok: true, x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) };
                    })()`,
                    returnByValue: true,
                },
            );
            const posValue = posResult.result?.value;
            if (!posValue?.ok) throw new Error(posValue?.error || 'Type: element not found');

            // Step 2: click to ensure focus is set at OS level
            await chrome.debugger.sendCommand(
                { tabId },
                'Input.dispatchMouseEvent',
                { type: 'mousePressed', x: posValue.x, y: posValue.y, button: 'left', clickCount: 1 },
            );
            await sleep(50);
            await chrome.debugger.sendCommand(
                { tabId },
                'Input.dispatchMouseEvent',
                { type: 'mouseReleased', x: posValue.x, y: posValue.y, button: 'left', clickCount: 1 },
            );
            await sleep(50);

            // Step 3: insert text via CDP (triggers proper input events)
            await chrome.debugger.sendCommand(
                { tabId },
                'Input.insertText',
                { text },
            );

            if (key) await pressKey(tabId, key);
            return `Typed "${text.slice(0, 60)}" into element [${elementIndex}]${key ? ' + ' + key : ''}`;
        }

        if (act === 'select') {
            if (elementIndex < 0) throw new Error('No element index for select');
            const escapedText = JSON.stringify(text);
            const result = await chrome.debugger.sendCommand(
                { tabId },
                'Runtime.evaluate',
                {
                    expression: `(() => {
                        const el = document.querySelector('[data-agent-id="agent-${elementIndex}"]');
                        if (!el || el.tagName !== 'SELECT') return { ok: false, error: 'Not a select element' };
                        el.scrollIntoView({ block: 'center', behavior: 'instant' });
                        const opt = Array.from(el.options).find(o => o.text === ${escapedText});
                        if (opt) { el.value = opt.value; el.dispatchEvent(new Event('change', { bubbles: true })); return { ok: true }; }
                        return { ok: false, error: 'Option not found: ' + ${escapedText} };
                    })()`,
                    returnByValue: true,
                },
            );
            const value = result.result?.value;
            if (!value?.ok) throw new Error(value?.error || 'Select failed');
            return `Selected "${text}" in element [${elementIndex}]`;
        }

        if (act === 'done' || act === 'fail') {
            return action.message || (act === 'done' ? 'Task completed.' : 'Task failed.');
        }

        throw new Error(`Unknown action: ${act}`);
    }

    async function runNativeAgent(task: string, config: ModelConfig, maxSteps: number) {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!tab?.id) throw new Error('No active tab found');
        if (tab.url?.startsWith('chrome://')) throw new Error('Cannot control chrome:// pages');

        agentTabId = tab.id;
        agentRunning = true;
        agentStopRequested = false;

        // Force-detach if already attached (e.g. previous run crashed)
        try { await chrome.debugger.detach({ tabId: tab.id }); } catch { /* not attached */ }

        await chrome.debugger.attach({ tabId: tab.id }, '1.3');
        chrome.debugger.onDetach.addListener(handleDebuggerDetach);

        broadcast({ type: 'status_change', session_id: 'native', status: 'running' });

        // Step 3-4: Match and activate skills based on task keywords
        const { activeSkills, instructions: skillInstructions } = activateAll(SKILLS);
        if (activeSkills.length > 0) {
            console.log('[MedicalAgent] Skills activated:', activeSkills.map((s) => s.name));
        }

        const history: Array<{ role: string; content: string }> = [];
        let finalResult = '';
        let finalSuccess = false;

        try {
            for (let step = 1; step <= maxSteps && !agentStopRequested; step++) {
                // 1. Extract page elements
                let pageState: PageState;
                try {
                    pageState = await extractPageElements(tab.id);
                } catch (e) {
                    broadcast({
                        type: 'agent_step',
                        session_id: 'native',
                        step_number: step,
                        thinking: `Extraction error: ${e}`,
                        evaluation: '',
                        next_goal: 'Retrying...',
                        actions: [],
                        url: '',
                        activeSkills,
                    });
                    await sleep(1500);
                    continue;
                }

                // 2. Build prompt & call LLM
                const messages = buildAgentPrompt(task, pageState, history, skillInstructions);
                const rawResponse = await callLLMForAction(messages, config);

                // 3. Parse action
                let agentAction: AgentAction;
                try {
                    agentAction = parseActionResponse(rawResponse);
                } catch (e) {
                    broadcast({
                        type: 'agent_step',
                        session_id: 'native',
                        step_number: step,
                        thinking: `Parse error: ${e}. Raw: ${rawResponse.slice(0, 300)}`,
                        evaluation: '',
                        next_goal: 'Re-requesting valid JSON...',
                        actions: [],
                        url: pageState.url,
                        activeSkills,
                    });
                    history.push({ role: 'assistant', content: `[parse error] ${rawResponse.slice(0, 200)}` });
                    continue;
                }

                // 4. Broadcast step
                broadcast({
                    type: 'agent_step',
                    session_id: 'native',
                    step_number: step,
                    thinking: agentAction.thinking,
                    evaluation: '',
                    next_goal: agentAction.action,
                    actions: [{
                        action: agentAction.action,
                        elementIndex: agentAction.elementIndex,
                        text: agentAction.text,
                        deltaY: agentAction.deltaY,
                        key: agentAction.key,
                    }],
                    url: pageState.url,
                    activeSkills,
                });

                // 5. Done / Fail check
                if (agentAction.action === 'done' || agentAction.action === 'fail') {
                    finalResult = agentAction.message || (agentAction.action === 'done' ? 'Task completed.' : 'Task failed.');
                    finalSuccess = agentAction.action === 'done';
                    break;
                }

                // 6. Execute action
                let resultDesc: string;
                try {
                    resultDesc = await executeAction(tab.id, agentAction);
                } catch (e) {
                    resultDesc = `Action error: ${e}`;
                }

                history.push({
                    role: 'assistant',
                    content: `Step ${step}: ${agentAction.action} → ${resultDesc}`,
                });

                // 7. Wait for page to settle
                await sleep(800);
            }

            if (agentStopRequested && !finalResult) {
                finalResult = 'Task stopped by user.';
                finalSuccess = false;
            }
            if (!finalResult) {
                finalResult = `Reached max steps (${maxSteps}).`;
                finalSuccess = false;
            }

        } catch (e) {
            finalResult = `Agent error: ${e instanceof Error ? e.message : String(e)}`;
            finalSuccess = false;
        } finally {
            chrome.debugger.onDetach.removeListener(handleDebuggerDetach);
            try { await chrome.debugger.detach({ tabId: tab.id }); } catch { /* already detached */ }
            agentRunning = false;
            agentTabId = null;

            broadcast({
                type: 'agent_result',
                session_id: 'native',
                success: finalSuccess,
                summary: finalResult,
            });
        }
    }

    async function handleExecuteTask(config: any) {
        const cfg = config || {};
        const defaultCfg = await loadConfig();
        const task = cfg.task || '';
        if (!task) throw new Error('No task specified');
        if (agentRunning) throw new Error('An agent task is already running. Wait for it to finish or stop it first.');

        const mergedConfig: ModelConfig = {
            apiKey: cfg.apiKey || defaultCfg.apiKey,
            model: cfg.model || defaultCfg.model,
            baseUrl: cfg.baseUrl || defaultCfg.baseUrl,
        };
        const maxSteps = cfg.maxSteps || 30;

        // Prefer Python backend (browser-use + CDP bridge) when connected
        if (ws?.readyState === WebSocket.OPEN) {
            agentRunning = true;
            broadcast({ type: 'status_change', session_id: 'backend', status: 'starting' });
            const sent = sendWs({
                type: 'execute_task',
                config: {
                    task,
                    api_key: mergedConfig.apiKey,
                    model: mergedConfig.model,
                    base_url: mergedConfig.baseUrl,
                    max_steps: maxSteps,
                    use_vision: cfg.useVision || false,
                    skills: cfg.skills || [],
                },
            });
            if (!sent) {
                agentRunning = false;
                throw new Error('Failed to send task to backend');
            }
            return { accepted: true, backend: true };
        }

        // Fallback: native CDP agent
        broadcast({ type: 'status_change', session_id: 'native', status: 'starting' });
        runNativeAgent(task, mergedConfig, maxSteps).catch((err) => {
            console.error('[MedicalAgent] Native agent crash:', err);
            broadcast({
                type: 'agent_error',
                session_id: 'native',
                error: err instanceof Error ? err.message : String(err),
            });
            agentRunning = false;
        });

        return { accepted: true, backend: false };
    }

    // =========================================================================
    //  CDP BRIDGE — Proxies CDP between Python (Playwright/browser-use) and chrome.debugger
    // =========================================================================

    function closeCdpBridge() {
        if (cdpBridgeWs) {
            try { cdpBridgeWs.close(); } catch { /* ignore */ }
            cdpBridgeWs = null;
        }
        if (cdpBridgeTabId !== null) {
            chrome.debugger.onDetach.removeListener(handleCdpBridgeDetach);
            chrome.debugger.onEvent.removeListener(handleCdpBridgeEvent);
            try { chrome.debugger.detach({ tabId: cdpBridgeTabId }); } catch { /* ignore */ }
            cdpBridgeTabId = null;
        }
        cdpBridgeSessionId = null;
    }

    function handleCdpBridgeDetach(source: chrome.debugger.Debuggee, reason: string) {
        if (source.tabId === cdpBridgeTabId) {
            console.log(`[MedicalAgent] CDP bridge debugger detached: ${reason}`);
            closeCdpBridge();
        }
    }

    function handleCdpBridgeEvent(source: chrome.debugger.Debuggee, method: string, params?: object) {
        if (source.tabId !== cdpBridgeTabId || !cdpBridgeWs || cdpBridgeWs.readyState !== WebSocket.OPEN) return;
        cdpBridgeWs.send(JSON.stringify({
            type: 'cdp_event',
            method,
            params: params || {},
        }));
    }

    async function startCdpBridge(bridgeUrl: string, sessionId: string) {
        // Clean up any previous bridge
        closeCdpBridge();

        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!tab?.id) throw new Error('No active tab for CDP bridge');
        if (tab.url?.startsWith('chrome://')) throw new Error('Cannot control chrome:// pages');

        // Attach debugger to the tab
        try { await chrome.debugger.detach({ tabId: tab.id }); } catch { /* not attached */ }
        await chrome.debugger.attach({ tabId: tab.id }, '1.3');

        cdpBridgeTabId = tab.id;
        cdpBridgeSessionId = sessionId;

        chrome.debugger.onDetach.addListener(handleCdpBridgeDetach);
        chrome.debugger.onEvent.addListener(handleCdpBridgeEvent);

        // Connect bridge WebSocket
        const bridgeWs = new WebSocket(bridgeUrl);
        cdpBridgeWs = bridgeWs;

        return new Promise<void>((resolve, reject) => {
            bridgeWs.onopen = async () => {
                console.log(`[MedicalAgent] CDP bridge connected for ${sessionId}`);
                // Enable CDP domains needed by Playwright
                const domains = ['Page', 'Runtime', 'DOM', 'Input', 'Network', 'Target', 'Browser', 'Emulation', 'Log'];
                for (const domain of domains) {
                    try {
                        await chrome.debugger.sendCommand({ tabId: tab.id! }, `${domain}.enable`);
                    } catch { /* some domains may not be available */ }
                }
                resolve();
            };

            bridgeWs.onmessage = async (ev) => {
                try {
                    const data = JSON.parse(ev.data);
                    if (data.type === 'cdp_command') {
                        const { msgId, method, params } = data;
                        try {
                            const result = await chrome.debugger.sendCommand(
                                { tabId: tab.id! },
                                method,
                                params || {},
                            );
                            bridgeWs.send(JSON.stringify({
                                type: 'cdp_response',
                                msgId,
                                result,
                            }));
                        } catch (e) {
                            bridgeWs.send(JSON.stringify({
                                type: 'cdp_error',
                                msgId,
                                error: {
                                    code: -32000,
                                    message: e instanceof Error ? e.message : String(e),
                                },
                            }));
                        }
                    }
                } catch { /* invalid JSON on bridge */ }
            };

            bridgeWs.onclose = () => {
                console.log(`[MedicalAgent] CDP bridge disconnected for ${sessionId}`);
                closeCdpBridge();
            };

            bridgeWs.onerror = () => {
                closeCdpBridge();
                reject(new Error('CDP bridge WebSocket failed'));
            };
        });
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
            agentStopRequested = true;
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
        if (msg.type === 'open_sidepanel') {
            const tabId = _sender.tab?.id;
            if (tabId) {
                chrome.sidePanel.open({ tabId }).catch(() => {
                    // Fallback: sidePanel.open may need user gesture
                    console.log('[MedicalAgent] sidePanel.open failed, user may need to click extension icon');
                });
            }
            sendResponse({ ok: true });
            return true;
        }
    });

    chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});
    connectWs();
});

// =========================================================================
//  Types
// =========================================================================

interface ModelConfig {
    apiKey: string;
    model: string;
    baseUrl: string;
}

interface ElementInfo {
    index: number;
    agentId: string;
    tag: string;
    type: string;
    text: string;
    id: string;
    name: string;
    placeholder: string;
    ariaLabel: string;
    value: string;
    href: string;
    options: string[];
    rect: { x: number; y: number; w: number; h: number };
}

interface PageState {
    url: string;
    title: string;
    elements: ElementInfo[];
}

interface AgentAction {
    thinking: string;
    action: string;
    elementIndex: number;
    text: string;
    deltaY: number;
    message: string;
    key: string;
}

// =========================================================================
//  Injected function — runs in page context to extract elements
// =========================================================================

function elementExtractionFn(): PageState {
    const elements: ElementInfo[] = [];
    const seen = new Set<Element>();

    const selectors = [
        'a[href]', 'button', 'input:not([type="hidden"])', 'textarea', 'select',
        '[role="button"]', '[onclick]', '[tabindex]:not([tabindex="-1"])',
        '[role="link"]', '[role="menuitem"]', '[role="option"]', '[role="tab"]',
        '[role="checkbox"]', '[role="radio"]', '[role="switch"]', '[role="combobox"]',
        '[role="textbox"]', '[contenteditable="true"]', 'summary',
    ];

    for (const sel of selectors) {
        try {
            document.querySelectorAll(sel).forEach((el) => {
                if (seen.has(el)) return;
                seen.add(el);

                const rect = el.getBoundingClientRect();
                if (rect.width === 0 || rect.height === 0) return;

                const style = window.getComputedStyle(el);
                if (style.visibility === 'hidden' || style.display === 'none' || style.opacity === '0') return;

                const idx = elements.length;
                const agentId = 'agent-' + idx;
                el.setAttribute('data-agent-id', agentId);

                const tag = el.tagName.toLowerCase();
                const text = (el.textContent || '').trim().slice(0, 200).replace(/\s+/g, ' ');

                elements.push({
                    index: idx,
                    agentId,
                    tag,
                    type: el.getAttribute('type') || '',
                    text,
                    id: el.id || '',
                    name: el.getAttribute('name') || '',
                    placeholder: el.getAttribute('placeholder') || '',
                    ariaLabel: el.getAttribute('aria-label') || '',
                    value: (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) ? el.value.slice(0, 100) : '',
                    href: el instanceof HTMLAnchorElement ? el.href : '',
                    options: tag === 'select' ? Array.from((el as HTMLSelectElement).options).map((o) => o.text) : [],
                    rect: {
                        x: Math.round(rect.x),
                        y: Math.round(rect.y),
                        w: Math.round(rect.width),
                        h: Math.round(rect.height),
                    },
                });
            });
        } catch { /* skip broken selectors */ }
    }

    return {
        url: window.location.href,
        title: document.title,
        elements,
    };
}
