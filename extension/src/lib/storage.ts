import { DEFAULT_CONFIG, type ModelConfig } from './types';

const CONFIG_KEY = 'medical_agent_config';

export async function loadConfig(): Promise<ModelConfig> {
    const result = await chrome.storage.local.get(CONFIG_KEY);
    if (result[CONFIG_KEY]) {
        return { ...DEFAULT_CONFIG, ...result[CONFIG_KEY] };
    }
    return { ...DEFAULT_CONFIG };
}

export async function saveConfig(config: ModelConfig): Promise<void> {
    await chrome.storage.local.set({ [CONFIG_KEY]: config });
}
