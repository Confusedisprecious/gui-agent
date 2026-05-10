import { type FormEvent, useRef, useState } from 'react';
import type { AgentStatus, ChatMessage } from '@/lib/types';
import { cn } from '@/lib/utils';
import { MessageBubble } from './MessageBubble';

interface Props {
    messages: ChatMessage[];
    status: AgentStatus;
    pageUrl?: string;
    pageTitle?: string;
    onSend: (text: string) => void;
    onClear: () => void;
}

const STATUS_LABELS: Record<AgentStatus, string> = {
    idle: 'Ready',
    connecting: 'Thinking...',
    running: 'Running...',
    completed: 'Completed',
    error: 'Error',
    stopped: 'Stopped',
};

const STATUS_COLORS: Record<AgentStatus, string> = {
    idle: 'bg-slate-500',
    connecting: 'bg-yellow-500 animate-pulse',
    running: 'bg-green-500 animate-pulse',
    completed: 'bg-blue-500',
    error: 'bg-red-500',
    stopped: 'bg-orange-500',
};

export function ChatView({ messages, status, pageUrl, pageTitle, onSend, onClear }: Props) {
    const [input, setInput] = useState('');
    const inputRef = useRef<HTMLTextAreaElement>(null);
    const messagesEndRef = useRef<HTMLDivElement>(null);

    function handleSubmit(e: FormEvent) {
        e.preventDefault();
        const text = input.trim();
        if (!text) return;
        onSend(text);
        setInput('');
        if (inputRef.current) inputRef.current.style.height = 'auto';
        setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
    }

    function handleKeyDown(e: React.KeyboardEvent) {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSubmit(e);
        }
    }

    function handleInput(e: React.ChangeEvent<HTMLTextAreaElement>) {
        setInput(e.target.value);
        if (inputRef.current) {
            inputRef.current.style.height = 'auto';
            inputRef.current.style.height = inputRef.current.scrollHeight + 'px';
        }
    }

    const isBusy = status === 'running' || status === 'connecting';

    return (
        <div className="flex h-full flex-col">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-slate-700 px-3 py-2">
                <div className="flex items-center gap-2">
                    <span className={cn('h-2 w-2 rounded-full', STATUS_COLORS[status])} />
                    <span className="text-sm font-medium text-slate-200">Medical Agent</span>
                    <span className="text-xs text-slate-500">({STATUS_LABELS[status]})</span>
                </div>
                <button
                    onClick={onClear}
                    className="rounded px-2 py-0.5 text-xs text-slate-400 hover:bg-slate-700 hover:text-slate-200"
                >
                    Clear
                </button>
            </div>

            {/* Page indicator */}
            {pageUrl && (
                <div className="border-b border-slate-700/50 bg-slate-800/50 px-3 py-1">
                    <span className="text-xs text-green-400" title={pageUrl}>
                        &#9679; Connected: {pageTitle || pageUrl}
                    </span>
                </div>
            )}

            {/* Messages */}
            <div className="flex-1 overflow-y-auto px-3 py-3">
                {messages.length === 0 && (
                    <div className="flex h-full items-center justify-center text-slate-500 text-sm">
                        <div className="text-center">
                            <p className="mb-1 text-lg">&#x1F489;</p>
                            <p>Ask me anything about the medical planning software</p>
                        </div>
                    </div>
                )}

                {messages.map((msg) => (
                    <MessageBubble key={msg.id} message={msg} />
                ))}

                {isBusy && (
                    <div className="flex justify-start mb-3">
                        <div className="rounded-lg bg-slate-700 px-3 py-2 text-xs text-slate-400">
                            Thinking...
                        </div>
                    </div>
                )}

                <div ref={messagesEndRef} />
            </div>

            {/* Input */}
            <form onSubmit={handleSubmit} className="border-t border-slate-700 p-3">
                <textarea
                    ref={inputRef}
                    value={input}
                    onChange={handleInput}
                    onKeyDown={handleKeyDown}
                    placeholder="Enter your message..."
                    disabled={isBusy}
                    rows={1}
                    className="w-full resize-none rounded-lg border border-slate-600 bg-slate-800 px-3 py-2 text-sm text-slate-200 placeholder-slate-500 focus:border-blue-500 focus:outline-none disabled:opacity-50"
                />
                <div className="mt-2 flex justify-end">
                    <button
                        type="submit"
                        disabled={isBusy || !input.trim()}
                        className="rounded-lg bg-blue-600 px-3 py-1 text-xs text-white hover:bg-blue-700 disabled:opacity-50"
                    >
                        Send
                    </button>
                </div>
            </form>
        </div>
    );
}
