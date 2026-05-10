import { type FormEvent, useEffect, useState } from 'react';
import { loadConfig, saveConfig } from '@/lib/storage';
import type { ModelConfig } from '@/lib/types';
import { DEFAULT_CONFIG } from '@/lib/types';

interface Props {
    onClose: () => void;
}

export function ConfigPanel({ onClose }: Props) {
    const [config, setConfig] = useState<ModelConfig>(DEFAULT_CONFIG);
    const [saved, setSaved] = useState(false);

    useEffect(() => {
        loadConfig().then(setConfig);
    }, []);

    async function handleSave(e: FormEvent) {
        e.preventDefault();
        await saveConfig(config);
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
    }

    return (
        <div className="flex h-full flex-col">
            <div className="flex items-center justify-between border-b border-slate-700 px-3 py-2">
                <span className="text-sm font-medium text-slate-200">Model Configuration</span>
                <button
                    onClick={onClose}
                    className="text-xs text-slate-400 hover:text-slate-200"
                >
                    &#x2715;
                </button>
            </div>

            <form onSubmit={handleSave} className="flex-1 space-y-4 p-4">
                <div>
                    <label className="mb-1 block text-xs font-medium text-slate-400">
                        API Key
                    </label>
                    <input
                        type="password"
                        value={config.apiKey}
                        onChange={(e) => setConfig({ ...config, apiKey: e.target.value })}
                        className="w-full rounded-lg border border-slate-600 bg-slate-800 px-3 py-2 text-sm text-slate-200 focus:border-blue-500 focus:outline-none"
                        placeholder="sk-..."
                    />
                </div>

                <div>
                    <label className="mb-1 block text-xs font-medium text-slate-400">
                        Model Name
                    </label>
                    <input
                        type="text"
                        value={config.model}
                        onChange={(e) => setConfig({ ...config, model: e.target.value })}
                        className="w-full rounded-lg border border-slate-600 bg-slate-800 px-3 py-2 text-sm text-slate-200 focus:border-blue-500 focus:outline-none"
                        placeholder="deepseek-v4-flash"
                    />
                </div>

                <div>
                    <label className="mb-1 block text-xs font-medium text-slate-400">
                        Base URL
                    </label>
                    <input
                        type="text"
                        value={config.baseUrl}
                        onChange={(e) => setConfig({ ...config, baseUrl: e.target.value })}
                        className="w-full rounded-lg border border-slate-600 bg-slate-800 px-3 py-2 text-sm text-slate-200 focus:border-blue-500 focus:outline-none"
                        placeholder="https://api.deepseek.com/v1"
                    />
                </div>

                <div className="flex items-center justify-between pt-2">
                    <button
                        type="button"
                        onClick={onClose}
                        className="rounded-lg bg-slate-700 px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-600"
                    >
                        Back
                    </button>
                    <button
                        type="submit"
                        className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs text-white hover:bg-blue-700"
                    >
                        {saved ? 'Saved!' : 'Save'}
                    </button>
                </div>
            </form>
        </div>
    );
}
