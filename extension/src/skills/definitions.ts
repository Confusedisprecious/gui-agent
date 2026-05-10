import type { SkillDefinition } from './types';

/**
 * Step 1 — Scan Discovery (扫描发现)
 *
 * Use Vite's import.meta.glob to automatically scan the definitions/ directory.
 * To add a new skill, just drop a .ts file into definitions/ that exports a
 * SkillDefinition as its default export. No other changes needed.
 */
const modules = import.meta.glob<{ default: SkillDefinition }>(
    './definitions/*.ts',
    { eager: true },
);

export const SKILLS: SkillDefinition[] = Object.values(modules).map(
    (m) => m.default,
);
