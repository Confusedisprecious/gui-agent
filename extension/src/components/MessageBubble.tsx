import type { ChatMessage } from '@/lib/types';
import { cn } from '@/lib/utils';

interface Props {
    message: ChatMessage;
}

export function MessageBubble({ message }: Props) {
    const isUser = message.role === 'user';

    return (
        <div className={cn('flex mb-3', isUser ? 'justify-end' : 'justify-start')}>
            <div
                className={cn(
                    'max-w-[85%] rounded-lg px-3 py-2 text-sm leading-relaxed',
                    isUser
                        ? 'bg-blue-600 text-white rounded-br-sm'
                        : 'bg-slate-700 text-slate-100 rounded-bl-sm',
                )}
            >
                <p className="whitespace-pre-wrap break-words">{message.content}</p>
            </div>
        </div>
    );
}
