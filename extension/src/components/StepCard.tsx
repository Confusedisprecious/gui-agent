import type { AgentStep } from '@/lib/types';

interface Props {
    step: AgentStep;
}

export function StepCard({ step }: Props) {
    return (
        <div className="mb-3 rounded-lg border border-slate-600 bg-slate-800 p-3 text-xs">
            <div className="mb-2 flex items-center justify-between">
                <span className="font-semibold text-blue-400">Step {step.stepNumber}</span>
                {step.url && (
                    <span className="max-w-[60%] truncate text-slate-500" title={step.url}>
                        {step.url}
                    </span>
                )}
            </div>

            {step.thinking && (
                <div className="mb-1.5">
                    <span className="font-medium text-amber-400">Thinking: </span>
                    <span className="text-slate-300">{step.thinking}</span>
                </div>
            )}

            {step.evaluation && (
                <div className="mb-1.5">
                    <span className="font-medium text-green-400">Evaluation: </span>
                    <span className="text-slate-300">{step.evaluation}</span>
                </div>
            )}

            {step.nextGoal && (
                <div className="mb-1.5">
                    <span className="font-medium text-purple-400">Next Goal: </span>
                    <span className="text-slate-300">{step.nextGoal}</span>
                </div>
            )}

            {step.actions && step.actions.length > 0 && (
                <div>
                    <span className="font-medium text-cyan-400">Actions: </span>
                    {step.actions.map((a, i) => (
                        <span key={i} className="mr-1 rounded bg-slate-700 px-1 py-0.5 font-mono text-slate-300">
                            {JSON.stringify(a)}
                        </span>
                    ))}
                </div>
            )}
        </div>
    );
}
