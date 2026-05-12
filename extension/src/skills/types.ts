/** Full skill definition — loaded from SKILL.md via frontmatter parsing */
export interface SkillDefinition {
    name: string;
    description: string;
    icon: string;
    /** Full markdown body — injected when skill is activated */
    instructions: string;
}

/** Lightweight metadata — always in system prompt (~100 words/skill) */
export interface SkillMetadata {
    name: string;
    description: string;
    icon: string;
}

/** An activated skill shown in the UI badge */
export interface ActiveSkill {
    name: string;
    icon: string;
}
