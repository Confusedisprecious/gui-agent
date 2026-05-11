import type { SkillDefinition } from './types';

interface SkillFrontmatter {
    name: string;
    description: string;
    icon: string;
    triggers: string[];
}

/**
 * Parse YAML frontmatter from a SKILL.md file.
 * Handles key: value pairs and list items (triggers).
 */
export function parseFrontmatter(md: string): SkillDefinition {
    const match = md.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
    if (!match) throw new Error('SKILL.md missing frontmatter (--- delimiters)');

    const fmText = match[1]!;
    const body = match[2]!.trim();

    const meta: Record<string, unknown> = { triggers: [] };
    const lines = fmText.split('\n');

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i]!;
        if (!line.trim() || line.trim().startsWith('#')) continue;

        const colonIdx = line.indexOf(':');
        if (colonIdx === -1) continue;

        const key = line.substring(0, colonIdx).trim();
        const value = line.substring(colonIdx + 1).trim();

        if (key === 'triggers') {
            const items: string[] = [];
            while (i + 1 < lines.length) {
                const next = lines[i + 1]!;
                const listMatch = next.match(/^\s*-\s+(.+)$/);
                if (!listMatch) break;
                items.push(listMatch[1]!.trim());
                i++;
            }
            meta[key] = items;
        } else {
            meta[key] = value;
        }
    }

    return {
        name: String(meta.name || ''),
        description: String(meta.description || ''),
        icon: String(meta.icon || ''),
        triggers: meta.triggers as string[],
        instructions: body,
    };
}
