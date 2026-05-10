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

export interface AgentStep {
    stepNumber: number;
    thinking: string;
    evaluation: string;
    nextGoal: string;
    actions: Array<Record<string, unknown>>;
    url: string;
    activeSkills?: Array<{ name: string; icon: string }>;
}

export const DEFAULT_CONFIG: ModelConfig = {
    apiKey: '',
    model: 'deepseek-v4-flash',
    baseUrl: 'https://api.deepseek.com/v1',
};
