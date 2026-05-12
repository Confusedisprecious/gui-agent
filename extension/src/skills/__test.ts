/**
 * Skills 系统测试脚本
 * 运行: npx tsx src/skills/__test.ts
 *
 * 直接用 fs 读取 skills/ 下的 SKILL.md 文件，测试标准格式兼容性。
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { SkillDefinition } from './types';
import { parseFrontmatter } from './frontmatter';
import {
    getSkillsMetadata,
    renderMetadataPrompt,
    buildSkillRouterPrompt,
    getActivatedInstructions,
    activateAll,
} from './loader';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Directories to exclude from discovery (dev tools, not runtime skills)
const EXCLUDE_DIRS = ['skill-creator'];

// Scan skills/ directory for SKILL.md files
function discoverSkills(): SkillDefinition[] {
    const skillsDir = path.resolve(__dirname, '../../skills');
    if (!fs.existsSync(skillsDir)) return [];

    const skills: SkillDefinition[] = [];
    for (const entry of fs.readdirSync(skillsDir, { withFileTypes: true })) {
        if (!entry.isDirectory() || EXCLUDE_DIRS.includes(entry.name)) continue;
        const mdPath = path.join(skillsDir, entry.name, 'SKILL.md');
        if (!fs.existsSync(mdPath)) continue;
        try {
            const content = fs.readFileSync(mdPath, 'utf-8');
            skills.push(parseFrontmatter(content));
        } catch (e) {
            console.warn(`[Test] Failed to parse ${mdPath}:`, e);
        }
    }
    return skills;
}

const SKILLS = discoverSkills();

let passed = 0;
let failed = 0;

function test(name: string, fn: () => void) {
    try {
        fn();
        passed++;
        console.log(`  ✓ ${name}`);
    } catch (e) {
        failed++;
        console.log(`  ✗ ${name}`);
        console.log(`    ${e instanceof Error ? e.message : String(e)}`);
    }
}

function assert(cond: boolean, msg: string) {
    if (!cond) throw new Error(msg);
}

console.log('=== Skills 系统测试 ===');
console.log(`发现 ${SKILLS.length} 个技能: ${SKILLS.map((s) => s.name).join(', ')}\n`);

// ── Step 1: Discovery + Standard Format ──────────────────

console.log('Step 1 — 扫描发现 & 标准格式兼容:');

test('discoverSkills 发现至少一个技能', () => {
    assert(SKILLS.length > 0, '应至少发现 test-medical');
});

test('SKILL.md 只包含标准字段 (name, description)', () => {
    for (const s of SKILLS) {
        assert(s.name.length > 0, `${s.name}: 缺少 name`);
        assert(s.description.length > 0, `${s.name}: 缺少 description`);
    }
});

test('非标准字段有默认值 (icon=🛠️)', () => {
    for (const s of SKILLS) {
        assert(s.icon === '🛠️', `${s.name}: icon 应为默认值 🛠️`);
    }
});

test('instructions 来自 markdown 正文', () => {
    for (const s of SKILLS) {
        assert(s.instructions.length > 0, `${s.name}: 缺少 instructions`);
        // 正文内容不应包含 frontmatter 分隔符
        assert(!s.instructions.startsWith('---'), `${s.name}: instructions 不应以 --- 开头`);
    }
});

// ── Step 2: Metadata Loading ──────────────────────────────

console.log('\nStep 2 — 元数据加载:');

test('getSkillsMetadata 返回正确数量', () => {
    const meta = getSkillsMetadata(SKILLS);
    assert(meta.length === SKILLS.length, `期望 ${SKILLS.length}，实际 ${meta.length}`);
});

test('getSkillsMetadata 只包含 name/description/icon', () => {
    const meta = getSkillsMetadata(SKILLS);
    for (const m of meta) {
        assert('name' in m && 'description' in m && 'icon' in m, '缺少字段');
        assert(!('instructions' in m), '不应包含 instructions');
    }
});

test('renderMetadataPrompt 生成 XML 格式', () => {
    const meta = getSkillsMetadata(SKILLS);
    const prompt = renderMetadataPrompt(meta);
    assert(prompt.includes('<available_skills>'), '应包含 <available_skills>');
    assert(prompt.includes('</available_skills>'), '应包含 </available_skills>');
    assert(prompt.includes('<skill>'), '应包含 <skill>');
    assert(prompt.includes(SKILLS[0]!.name), '应包含技能名称');
});

test('renderMetadataPrompt 空数组返回空字符串', () => {
    assert(renderMetadataPrompt([]) === '', '应返回空字符串');
});

// ── Step 3: LLM Semantic Matching ─────────────────────────

console.log('\nStep 3 — LLM 语义匹配:');

test('buildSkillRouterPrompt 包含所有技能', () => {
    const prompt = buildSkillRouterPrompt(SKILLS);
    assert(prompt.includes('可用技能'), '应包含标题');
    for (const s of SKILLS) {
        assert(prompt.includes(s.name), `应包含 ${s.name}`);
        assert(prompt.includes(s.description.slice(0, 20)), '应包含 description');
    }
});

test('buildSkillRouterPrompt 空技能返回空字符串', () => {
    assert(buildSkillRouterPrompt([]) === '', '应返回空字符串');
});

// ── Step 4: Activation ────────────────────────────────────

console.log('\nStep 4 — 激活执行:');

test('getActivatedInstructions 返回完整指令', () => {
    const active = [{ name: 'test-medical', icon: '🛠️' }];
    const instructions = getActivatedInstructions(SKILLS, active);
    assert(instructions.includes('已激活技能'), '应包含激活标记');
    assert(instructions.includes('<command-name>test-medical</command-name>'), '应包含 command-name 标签');
    assert(instructions.includes('患者信息填写'), '应包含技能详细指令');
});

test('getActivatedInstructions 空激活列表返回空字符串', () => {
    assert(getActivatedInstructions(SKILLS, []) === '', '应返回空字符串');
});

test('不匹配的技能名不注入指令', () => {
    const active = [{ name: '不存在的技能', icon: '❓' }];
    const instructions = getActivatedInstructions(SKILLS, active);
    assert(instructions === '', '应返回空字符串');
});

// ── activateAll ───────────────────────────────────────────

console.log('\nactivateAll (激活全部):');

test('activateAll 激活所有已发现技能', () => {
    const { activeSkills, instructions } = activateAll(SKILLS);
    assert(activeSkills.length === SKILLS.length, `应激活 ${SKILLS.length} 个技能`);
    assert(instructions.length > 0, '应返回指令');
    assert(instructions.includes('test-medical'), '指令应包含技能名');
});

test('activateAll 空技能返回空', () => {
    const { activeSkills, instructions } = activateAll([]);
    assert(activeSkills.length === 0, '应为空');
    assert(instructions === '', '指令应为空');
});

// ── Summary ───────────────────────────────────────────────

console.log(`\n=== 结果: ${passed} 通过, ${failed} 失败 ===`);
process.exit(failed > 0 ? 1 : 0);
