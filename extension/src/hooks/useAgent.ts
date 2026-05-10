import { useCallback, useState } from 'react';
import type { AgentStatus, ChatMessage } from '@/lib/types';
import { generateId } from '@/lib/utils';

export function useAgent() {
    const [status, setStatus] = useState<AgentStatus>('idle');
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [error, setError] = useState<string | null>(null);
    const [pageUrl, setPageUrl] = useState('');
    const [pageTitle, setPageTitle] = useState('');
    const [history, setHistory] = useState<Array<{ role: string; content: string }>>([]);

    const sendMessage = useCallback(async (message: string) => {
        const userMsg: ChatMessage = {
            id: generateId(),
            role: 'user',
            content: message,
            timestamp: Date.now(),
        };
        setMessages((prev) => [...prev, userMsg]);
        setStatus('connecting');
        setError(null);

        const updatedHistory = [
            ...history,
            ...messages.map((m) => ({ role: m.role === 'user' ? 'user' : 'assistant', content: m.content } satisfies { role: string; content: string })),
        ];

        try {
            const response = await chrome.runtime.sendMessage({
                type: 'chat',
                message,
                history: updatedHistory,
            });

            if (response?.error) {
                throw new Error(response.error);
            }

            const agentMsg: ChatMessage = {
                id: generateId(),
                role: 'agent',
                content: response?.content || '',
                timestamp: Date.now(),
            };
            setMessages((prev) => [...prev, agentMsg]);

            setHistory([
                ...updatedHistory,
                { role: 'user', content: message },
                { role: 'assistant', content: response?.content || '' },
            ]);

            setStatus('idle');

            if (response?.pageContext) {
                setPageUrl(response.pageContext.url || '');
                setPageTitle(response.pageContext.title || '');
            }
        } catch (e) {
            const errMsg = e instanceof Error ? e.message : 'Unknown error';
            setError(errMsg);
            setStatus('error');
        }
    }, [messages, history]);

    const clearMessages = useCallback(() => {
        setMessages([]);
        setHistory([]);
        setError(null);
        setStatus('idle');
    }, []);

    return {
        status,
        messages,
        error,
        pageUrl,
        pageTitle,
        sendMessage,
        clearMessages,
    };
}
