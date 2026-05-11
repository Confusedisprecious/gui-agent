import type { SkillDefinition } from './types';
import { parseFrontmatter } from './frontmatter';

/**
 * Step 1 — Scan Discovery (扫描发现)
 *
 * Scans the skills/ directory for SKILL.md files at BUILD TIME via Vite's
 * import.meta.glob. Each skill is a folder containing a SKILL.md with
 * YAML frontmatter (name, description, icon, triggers) and markdown body.
 *
 * To add a skill: create a new folder under skills/ with a SKILL.md inside.
 * No code changes needed.
 */

function loadSkills(): SkillDefinition[] {
    const mdModules = import.meta.glob<string>(
        '../../skills/**/SKILL.md',
        { query: '?raw', import: 'default', eager: true },
    );

    const skills: SkillDefinition[] = [];

    for (const [path, content] of Object.entries(mdModules)) {
        try {
            skills.push(parseFrontmatter(content));
        } catch (e) {
            console.warn(`[Skills] Failed to parse ${path}:`, e);
        }
    }

    return skills;
}

export const SKILLS: SkillDefinition[] = loadSkills();
