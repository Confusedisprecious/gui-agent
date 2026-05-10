import type { SkillDefinition, SkillMetadata, ActiveSkill } from './types';

// =========================================================================
//  Step 2 — Metadata Loading (元数据加载)
//    Lightweight: name + description + icon. Always in the system prompt.
//    The LLM sees what skills are available and decides which to use.
//    ~50 words per skill — cheap to keep in context permanently.
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
//    Two-level matching inspired by Claude Code's approach:
//    A) Keyword pre-filter: triggers in user task → candidate skills (fast)
//    B) LLM semantic match: LLM decides activation based on metadata (accurate)
//       The metadata in the system prompt enables the LLM to self-select.
// =========================================================================

/** Keyword-based pre-filter (Step 3A) — fast first pass */
export function matchByKeywords(
    skills: SkillDefinition[],
    task: string,
    pageText?: string,
): ActiveSkill[] {
    const searchText = (task + ' ' + (pageText || '')).toLowerCase();
    const active: ActiveSkill[] = [];

    for (const skill of skills) {
        const hit = skill.triggers.some((t) =>
            searchText.includes(t.toLowerCase()),
        );
        if (hit) {
            active.push({ name: skill.name, icon: skill.icon, source: 'keyword' });
        }
    }
    return active;
}

/**
 * Build the LLM matching prompt (Step 3B).
 * When the LLM sees this in the system prompt, it can self-select skills
 * by outputting a skill activation command. This mirrors Claude Code's
 * approach where the LLM itself decides skill activation.
 */
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
//    When a skill is matched (keyword or LLM), its full instructions are
//    injected into the system prompt. The UI shows the active skill badges.
//    Mirrors Claude Code's <command-name>skill-name</command-name> pattern.
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
//  Convenience — one-call skill matching for the native agent
// =========================================================================

/** Run full matching pipeline and return instructions string */
export function matchAndActivate(
    skills: SkillDefinition[],
    task: string,
    pageText?: string,
): {
    activeSkills: ActiveSkill[];
    instructions: string;
} {
    const activeSkills = matchByKeywords(skills, task, pageText);
    const instructions = getActivatedInstructions(skills, activeSkills);
    return { activeSkills, instructions };
}
