/** Full skill definition — all data for one skill */
export interface SkillDefinition {
    name: string;
    description: string;
    icon: string;
    /** Always-active triggers — auto-activate when keywords present */
    triggers: string[];
    /** Full instructions — only injected when skill is activated */
    instructions: string;
}

/** Lightweight metadata — always in system prompt (~50 words/skill) */
export interface SkillMetadata {
    name: string;
    description: string;
    icon: string;
}

/** An activated skill with match source info */
export interface ActiveSkill {
    name: string;
    icon: string;
    /** How this skill was matched */
    source: 'keyword' | 'llm';
}
