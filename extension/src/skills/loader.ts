import type { SkillDefinition, SkillMetadata, ActiveSkill } from './types';

// =========================================================================
//  Step 2 — Metadata Loading (元数据加载)
//    Lightweight: name + description + icon. Always in the system prompt.
//    The LLM sees what skills are available and decides which to use.
//    ~100 words per skill — cheap to keep in context permanently.
//    Matching is purely LLM semantic: the description field tells the LLM
//    when to use the skill (standard SKILL.md behavior).
// =========================================================================

/** Extract lightweight metadata from all skills (Step 2 — always in prompt) */
export function getSkillsMetadata(skills: SkillDefinition[]): SkillMetadata[] {
    return skills.map((s) => ({
        name: s.name,
        description: s.description,
        icon: s.icon,
    }));
}

/** Render metadata as a prompt section for injection into system prompt */
export function renderMetadataPrompt(meta: SkillMetadata[]): string {
    if (meta.length === 0) return '';
    return [
        '\n<available_skills>',
        ...meta.map((m) => `  <skill>\n    <name>${m.icon} ${m.name}</name>\n    <description>${m.description}</description>\n  </skill>`),
        '</available_skills>',
        '\n当用户的任务匹配某个技能时，参考该技能的 instructions 来执行操作。',
    ].join('\n');
}

// =========================================================================
//  Step 3 — Request Matching (请求匹配)
//    LLM semantic matching: the LLM sees skill metadata in the system prompt
//    and self-selects which skills to use. This mirrors Claude Code's approach
//    where the description field is the primary triggering mechanism.
// =========================================================================

/** Build the skill router prompt for LLM semantic matching (Step 3) */
export function buildSkillRouterPrompt(skills: SkillDefinition[]): string {
    if (skills.length === 0) return '';
    const lines = skills.map((s, i) =>
        `${i + 1}. **${s.icon} ${s.name}** — ${s.description}`,
    );
    return [
        '\n## 可用技能',
        '以下技能可供使用。分析用户任务，如果需要使用某个技能，在回复中注明。',
        ...lines,
    ].join('\n');
}

// =========================================================================
//  Step 4 — Activation Execution (激活执行)
//    Full instructions injected when a skill is used. Mirrors Claude Code's
//    <command-name>skill-name</command-name> pattern.
// =========================================================================

/** Load full instructions for activated skills (Step 4) */
export function getActivatedInstructions(
    skills: SkillDefinition[],
    active: ActiveSkill[],
): string {
    if (active.length === 0) return '';

    const skillDefs = skills.filter((s) =>
        active.some((a) => a.name === s.name),
    );
    if (skillDefs.length === 0) return '';

    const blocks = skillDefs.map((s, i) =>
        `### ${i + 1}. ${s.icon} ${s.name}\n<command-name>${s.name}</command-name>\n${s.instructions}`,
    );

    return '\n\n## ⚡ 已激活技能（完整指令已注入）\n' + blocks.join('\n\n');
}

// =========================================================================
//  Convenience — activate all skills (LLM self-selects via metadata)
// =========================================================================

/** Activate all known skills — the LLM decides which to use based on metadata */
export function activateAll(skills: SkillDefinition[]): {
    activeSkills: ActiveSkill[];
    instructions: string;
} {
    const activeSkills: ActiveSkill[] = skills.map((s) => ({
        name: s.name,
        icon: s.icon,
    }));
    const instructions = getActivatedInstructions(skills, activeSkills);
    return { activeSkills, instructions };
}
