import type { SkillDefinition } from './types';

/**
 * Parse YAML frontmatter from a standard SKILL.md file.
 * Standard format only requires name + description in frontmatter.
 * Other fields (icon, triggers) get sensible defaults.
 */
export function parseFrontmatter(md: string): SkillDefinition {
    const match = md.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
    if (!match) throw new Error('SKILL.md missing frontmatter (--- delimiters)');

    const fmText = match[1]!;
    const body = match[2]!.trim();

    const meta: Record<string, string> = {};
    const lines = fmText.split('\n');

    for (const line of lines) {
        if (!line.trim() || line.trim().startsWith('#')) continue;
        const colonIdx = line.indexOf(':');
        if (colonIdx === -1) continue;
        const key = line.substring(0, colonIdx).trim();
        const value = line.substring(colonIdx + 1).trim();
        meta[key] = value;
    }

    return {
        name: meta.name || '',
        description: meta.description || '',
        icon: '🛠️',
        instructions: body,
    };
}
