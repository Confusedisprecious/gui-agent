import { useCallback, useEffect, useRef, useState } from 'react';
import { loadConfig } from '@/lib/storage';
import type { AgentConfig, AgentStatus, AgentStep, ChatMessage, WsMessage } from '@/lib/types';
import { generateId } from '@/lib/utils';

export function useAgent() {
    const [status, setStatus] = useState<AgentStatus>('idle');
    const [wsConnected, setWsConnected] = useState(false);
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [currentStep, setCurrentStep] = useState<AgentStep | null>(null);
    const [currentUrl, setCurrentUrl] = useState('');
    const [error, setError] = useState<string | null>(null);
    const listenerRef = useRef<((msg: unknown) => void) | null>(null);

    // Listen for WS messages from background
    useEffect(() => {
        function handleMessage(msg: { type: string; data: WsMessage }) {
            if (msg.type !== 'ws_message') return;
            const data = msg.data;
            if (!data?.type) return;

            switch (data.type) {
                case 'connection_ready':
                case 'ws_status':
                    setWsConnected(data.type === 'ws_status' ? data.status === 'connected' : true);
                    if (data.type === 'ws_status' && data.status === 'connected') {
                        setStatus('idle');
                    } else if (data.type === 'ws_status' && data.status === 'disconnected') {
                        setStatus('idle');
                    }
                    break;

                case 'chat_response':
                    setMessages((prev) => [...prev, {
                        id: generateId(),
                        role: 'agent',
                        content: data.message || '',
                        timestamp: Date.now(),
                    }]);
                    setStatus('idle');
                    break;

                case 'chat_error':
                    setError(data.error || 'Chat error');
                    setStatus('error');
                    break;

                case 'agent_step':
                    setCurrentStep({
                        stepNumber: data.step_number || 0,
                        thinking: data.thinking || '',
                        evaluation: data.evaluation || '',
                        nextGoal: data.next_goal || '',
                        actions: data.actions || [],
                        url: data.url || '',
                    });
                    if (data.url) setCurrentUrl(data.url);
                    break;

                case 'agent_result':
                    setMessages((prev) => [...prev, {
                        id: generateId(),
                        role: 'agent',
                        content: data.summary || 'Task completed',
                        timestamp: Date.now(),
                    }]);
                    setStatus('completed');
                    setCurrentStep(null);
                    break;

                case 'agent_error':
                    setError(data.error || 'Agent error');
                    setStatus('error');
                    break;

                case 'status_change':
                    if (data.status === 'running') setStatus('running');
                    else if (data.status === 'stopped') setStatus('stopped');
                    else if (data.status === 'starting') setStatus('connecting');
                    break;

                case 'pong':
                    break;
            }
        }

        listenerRef.current = handleMessage;
        chrome.runtime.onMessage.addListener(handleMessage);
        return () => {
            if (listenerRef.current) {
                chrome.runtime.onMessage.removeListener(listenerRef.current);
            }
        };
    }, []);

    // Connect to backend on mount
    useEffect(() => {
        chrome.runtime.sendMessage({ type: 'ws_connect' });
    }, []);

    const sendChat = useCallback(async (message: string) => {
        const config = await loadConfig();
        const userMsg: ChatMessage = {
            id: generateId(),
            role: 'user',
            content: message,
            timestamp: Date.now(),
        };
        setMessages((prev) => [...prev, userMsg]);
        setStatus('connecting');
        setError(null);

        chrome.runtime.sendMessage({
            type: 'ws_send',
            data: {
                type: 'chat_message',
                message,
                config: {
                    api_key: config.apiKey,
                    model: config.model,
                    base_url: config.baseUrl,
                },
            },
        });
    }, []);

    const executeTask = useCallback(async (task: string) => {
        const config = await loadConfig();
        const userMsg: ChatMessage = {
            id: generateId(),
            role: 'user',
            content: task,
            timestamp: Date.now(),
        };
        setMessages((prev) => [...prev, userMsg]);
        setStatus('connecting');
        setError(null);

        chrome.runtime.sendMessage({
            type: 'ws_send',
            data: {
                type: 'execute_task',
                config: {
                    task,
                    api_key: config.apiKey,
                    model: config.model,
                    base_url: config.baseUrl,
                    max_steps: 50,
                    use_vision: false,
                    skills: [],
                },
            },
        });
    }, []);

    const stopTask = useCallback(() => {
        chrome.runtime.sendMessage({
            type: 'ws_send',
            data: { type: 'stop_task' },
        });
    }, []);

    const clearMessages = useCallback(() => {
        setMessages([]);
        setCurrentStep(null);
        setError(null);
    }, []);

    return {
        status,
        wsConnected,
        messages,
        currentStep,
        currentUrl,
        error,
        sendChat,
        executeTask,
        stopTask,
        clearMessages,
    };
}
