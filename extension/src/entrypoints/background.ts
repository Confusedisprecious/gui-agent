export default defineBackground(() => {
    let ws: WebSocket | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let pingInterval: ReturnType<typeof setInterval> | null = null;
    let reconnectAttempts = 0;
    const MAX_RECONNECT = 10;
    const WS_URL = 'ws://127.0.0.1:8765/ws';

    function connect() {
        if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
            return;
        }

        ws = new WebSocket(WS_URL);

        ws.onopen = () => {
            reconnectAttempts = 0;
            startPing();
            broadcastToSidepanel({ type: 'ws_status', status: 'connected' });
        };

        ws.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                broadcastToSidepanel(data);
            } catch {
                // ignore parse errors
            }
        };

        ws.onclose = () => {
            stopPing();
            broadcastToSidepanel({ type: 'ws_status', status: 'disconnected' });
            scheduleReconnect();
        };

        ws.onerror = () => {
            // onclose will fire after this
        };
    }

    function disconnect() {
        if (reconnectTimer) {
            clearTimeout(reconnectTimer);
            reconnectTimer = null;
        }
        stopPing();
        if (ws) {
            ws.onclose = null;
            ws.close();
            ws = null;
        }
    }

    function scheduleReconnect() {
        if (reconnectAttempts >= MAX_RECONNECT) return;
        const delay = Math.min(1000 * Math.pow(2, reconnectAttempts), 30000);
        reconnectAttempts++;
        reconnectTimer = setTimeout(connect, delay);
    }

    function startPing() {
        stopPing();
        pingInterval = setInterval(() => {
            if (ws?.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({ type: 'ping' }));
            }
        }, 25000);
    }

    function stopPing() {
        if (pingInterval) {
            clearInterval(pingInterval);
            pingInterval = null;
        }
    }

    function broadcastToSidepanel(data: unknown) {
        chrome.runtime.sendMessage({ type: 'ws_message', data }).catch(() => {
            // sidepanel may not be open
        });
    }

    // Listen for messages from sidepanel
    chrome.runtime.onMessage.addListener((msg) => {
        if (msg.type === 'ws_send') {
            if (ws?.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify(msg.data));
            }
        } else if (msg.type === 'ws_connect') {
            connect();
        } else if (msg.type === 'ws_disconnect') {
            disconnect();
        }
    });

    // Connect on startup
    connect();
});
