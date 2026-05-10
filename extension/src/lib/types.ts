export interface ModelConfig {
    apiKey: string;
    model: string;
    baseUrl: string;
}

export type AgentStatus = 'idle' | 'connecting' | 'running' | 'completed' | 'error' | 'stopped';

export interface ChatMessage {
    id: string;
    role: 'user' | 'agent' | 'system';
    content: string;
    timestamp: number;
}

export const DEFAULT_CONFIG: ModelConfig = {
    apiKey: 'sk-16b78952b84d4e7c9ab071f8ce5e9dca',
    model: 'deepseek-v4-flash',
    baseUrl: 'https://api.deepseek.com/v1',
};
