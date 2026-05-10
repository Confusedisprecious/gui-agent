import { useState } from 'react';
import { useAgent } from '@/hooks/useAgent';
import { ChatView } from '@/components/ChatView';
import { ConfigPanel } from '@/components/ConfigPanel';

type View = 'chat' | 'config';

export default function App() {
    const [view, setView] = useState<View>('chat');
    const { status, messages, error, pageUrl, pageTitle, sendMessage, clearMessages } = useAgent();

    return (
        <div className="flex h-full flex-col bg-slate-900">
            {view === 'chat' ? (
                <ChatView
                    messages={messages}
                    status={status}
                    pageUrl={pageUrl}
                    pageTitle={pageTitle}
                    onSend={sendMessage}
                    onClear={clearMessages}
                />
            ) : (
                <ConfigPanel onClose={() => setView('chat')} />
            )}

            {/* Bottom nav */}
            <div className="flex border-t border-slate-700">
                <button
                    onClick={() => setView('chat')}
                    className={`flex-1 py-2 text-xs font-medium ${
                        view === 'chat'
                            ? 'bg-slate-800 text-blue-400 border-t-2 border-blue-400 -mt-px'
                            : 'text-slate-500 hover:text-slate-300'
                    }`}
                >
                    Chat
                </button>
                <button
                    onClick={() => setView('config')}
                    className={`flex-1 py-2 text-xs font-medium ${
                        view === 'config'
                            ? 'bg-slate-800 text-blue-400 border-t-2 border-blue-400 -mt-px'
                            : 'text-slate-500 hover:text-slate-300'
                    }`}
                >
                    Settings
                </button>
            </div>

            {error && (
                <div className="border-t border-red-800 bg-red-900/50 px-3 py-1.5">
                    <p className="text-xs text-red-300">{error}</p>
                </div>
            )}
        </div>
    );
}
