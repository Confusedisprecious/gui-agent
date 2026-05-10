import type { AgentStep } from '@/lib/types';

interface Props {
    step: AgentStep;
}

export function StepCard({ step }: Props) {
    return (
        <div className="mb-3 rounded-lg border border-slate-600 bg-slate-800 p-3 text-xs">
            <div className="mb-2 flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <span className="font-semibold text-blue-400">Step {step.stepNumber}</span>
                    {step.activeSkills && step.activeSkills.length > 0 && (
                        <div className="flex items-center gap-1">
                            {step.activeSkills.map((s, i) => (
                                <span
                                    key={i}
                                    className="inline-flex items-center gap-0.5 rounded-full bg-indigo-900/60 border border-indigo-500/40 px-1.5 py-0.5 text-[10px] text-indigo-300"
                                >
                                    <span>{s.icon}</span>
                                    <span>{s.name}</span>
                                </span>
                            ))}
                        </div>
                    )}
                </div>
                {step.url && (
                    <span className="max-w-[60%] truncate text-slate-500" title={step.url}>
                        {step.url}
                    </span>
                )}
            </div>

            {step.thinking && (
                <div className="mb-1.5">
                    <span className="font-medium text-amber-400">思考: </span>
                    <span className="text-slate-300">{step.thinking}</span>
                </div>
            )}

            {step.evaluation && (
                <div className="mb-1.5">
                    <span className="font-medium text-green-400">评估: </span>
                    <span className="text-slate-300">{step.evaluation}</span>
                </div>
            )}

            {step.nextGoal && (
                <div className="mb-1.5">
                    <span className="font-medium text-purple-400">下一步: </span>
                    <span className="text-slate-300">{step.nextGoal}</span>
                </div>
            )}

            {step.actions && step.actions.length > 0 && (
                <div>
                    <span className="font-medium text-cyan-400">操作: </span>
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
