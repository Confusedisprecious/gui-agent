import { useCallback, useEffect, useRef, useState } from 'react';
import type { AgentStatus, AgentStep, ChatMessage } from '@/lib/types';
import { generateId } from '@/lib/utils';

export function useAgent() {
    const [status, setStatus] = useState<AgentStatus>('idle');
    const [wsConnected, setWsConnected] = useState(false);
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [currentStep, setCurrentStep] = useState<AgentStep | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [pageUrl, setPageUrl] = useState('');
    const [pageTitle, setPageTitle] = useState('');
    const [history, setHistory] = useState<Array<{ role: string; content: string }>>([]);
    const listenerRef = useRef<((msg: any) => void) | null>(null);

    // Listen for WS messages broadcasted from background
    useEffect(() => {
        function handleMessage(msg: any) {
            if (msg.type !== 'ws_message') return;
            const data = msg.data;
            if (!data?.type) return;

            switch (data.type) {
                case 'ws_status':
                    setWsConnected(data.status === 'connected');
                    break;

                case 'agent_step':
                    setCurrentStep({
                        stepNumber: data.step_number || 0,
                        thinking: data.thinking || '',
                        evaluation: data.evaluation || '',
                        nextGoal: data.next_goal || '',
                        actions: data.actions || [],
                        url: data.url || '',
                        activeSkills: data.activeSkills || [],
                    });
                    if (data.url) setPageUrl(data.url);
                    break;

                case 'agent_result':
                    setMessages((prev) => [...prev, {
                        id: generateId(),
                        role: 'agent',
                        content: data.summary || 'Task completed.',
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

    // --- Send message (auto-detects chat vs task) ---

    const sendMessage = useCallback(async (text: string) => {
        const userMsg: ChatMessage = {
            id: generateId(),
            role: 'user',
            content: text,
            timestamp: Date.now(),
        };
        setMessages((prev) => [...prev, userMsg]);
        setError(null);

        // Detect if this is a browser control task or simple chat
        const taskKeywords = ['click', 'type', 'scroll', 'find', 'search', 'go to',
            'open', 'navigate', 'fill', 'submit', 'extract', 'plan', 'schedule',
            'patient', 'treatment', 'dose', 'drug', 'medication', '帮我', '请',
            '填写', '点击', '搜索', '打开', '跳转', '输入'];
        const isTask = taskKeywords.some((kw) => text.toLowerCase().includes(kw));

        if (isTask) {
            // Use native CDP browser agent (always available)
            setStatus('connecting');
            try {
                const response = await chrome.runtime.sendMessage({
                    type: 'execute_task',
                    config: { task: text },
                });
                if (response?.error) {
                    throw new Error(response.error);
                }
                // Task accepted - status will update via broadcast messages
            } catch (e) {
                const errMsg = e instanceof Error ? e.message : 'Unknown error';
                setError(errMsg);
                setStatus('error');
            }
        } else {
            // Use direct chat API
            setStatus('connecting');
            const updatedHistory = [
                ...history,
                ...messages.map((m) => ({
                    role: m.role === 'user' ? 'user' : 'assistant',
                    content: m.content,
                } satisfies { role: string; content: string })),
            ];

            try {
                const response = await chrome.runtime.sendMessage({
                    type: 'chat',
                    message: text,
                    history: updatedHistory,
                });

                if (response?.error) throw new Error(response.error);

                const agentMsg: ChatMessage = {
                    id: generateId(),
                    role: 'agent',
                    content: response?.content || '',
                    timestamp: Date.now(),
                };
                setMessages((prev) => [...prev, agentMsg]);

                setHistory([
                    ...updatedHistory,
                    { role: 'user', content: text },
                    { role: 'assistant', content: response?.content || '' },
                ]);

                if (response?.pageContext) {
                    setPageUrl(response.pageContext.url || '');
                    setPageTitle(response.pageContext.title || '');
                }

                setStatus('idle');
            } catch (e) {
                const errMsg = e instanceof Error ? e.message : 'Unknown error';
                setError(errMsg);
                setStatus('error');
            }
        }
    }, [messages, history]);

    const stopTask = useCallback(() => {
        chrome.runtime.sendMessage({ type: 'stop_task' });
    }, []);

    const clearMessages = useCallback(() => {
        setMessages([]);
        setHistory([]);
        setCurrentStep(null);
        setError(null);
        setStatus('idle');
    }, []);

    return {
        status,
        wsConnected,
        messages,
        currentStep,
        error,
        pageUrl,
        pageTitle,
        sendMessage,
        stopTask,
        clearMessages,
    };
}
