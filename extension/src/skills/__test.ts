/**
 * Skills 系统测试脚本
 * 运行: npx tsx src/skills/__test.ts
 *
 * 直接用 fs 读取 skills/ 下的 SKILL.md 文件，不会触发 Vite 的 import.meta.glob。
 * 新增技能后会自动被扫描到（遍历 skills/ 目录）。
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { SkillDefinition } from './types';
import { parseFrontmatter } from './frontmatter';
import {
    getSkillsMetadata,
    renderMetadataPrompt,
    matchByKeywords,
    buildSkillRouterPrompt,
    getActivatedInstructions,
    matchAndActivate,
} from './loader';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Scan skills/ directory for SKILL.md files (mirrors Vite's import.meta.glob at build time)
function discoverSkills(): SkillDefinition[] {
    const skillsDir = path.resolve(__dirname, '../../skills');
    if (!fs.existsSync(skillsDir)) return [];

    const skills: SkillDefinition[] = [];
    for (const entry of fs.readdirSync(skillsDir, { withFileTypes: true })) {
        if (!entry.isDirectory()) continue;
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

// ── Step 1: Discovery ─────────────────────────────────────

console.log('Step 1 — 扫描发现:');

test('discoverSkills 发现至少一个技能', () => {
    assert(SKILLS.length > 0, '应至少发现 test-medical');
});

test('发现的技能有完整字段', () => {
    for (const s of SKILLS) {
        assert(s.name.length > 0, `${s.name}: 缺少 name`);
        assert(s.description.length > 0, `${s.name}: 缺少 description`);
        assert(s.icon.length > 0, `${s.name}: 缺少 icon`);
        assert(s.triggers.length > 0, `${s.name}: 缺少 triggers`);
        assert(s.instructions.length > 0, `${s.name}: 缺少 instructions`);
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
        assert(!('triggers' in m), '不应包含 triggers');
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

// ── Step 3A: Keyword Pre-filter ───────────────────────────

console.log('\nStep 3A — 关键字匹配:');

test('中文医疗关键词触发匹配', () => {
    const active = matchByKeywords(SKILLS, '帮我搜索患者张三的病历');
    assert(active.length > 0, '应至少匹配一个技能');
    assert(active[0]!.name === 'test-medical', '应匹配test-medical');
    assert(active[0]!.source === 'keyword', '来源应为 keyword');
});

test('英文关键词触发匹配', () => {
    const active = matchByKeywords(SKILLS, 'search for patient treatment records');
    assert(active.length > 0, '应匹配');
});

test('不相关文本不触发匹配', () => {
    const active = matchByKeywords(SKILLS, '今天天气怎么样');
    assert(active.length === 0, '不应匹配任何技能');
});

test('pageText 参与匹配', () => {
    const active = matchByKeywords(SKILLS, '帮我填表', '页面包含患者信息和处方');
    assert(active.length > 0, 'pageText 中的关键词应触发匹配');
});

// ── Step 3B: LLM Skill Router ─────────────────────────────

console.log('\nStep 3B — LLM 语义匹配提示词:');

test('buildSkillRouterPrompt 包含所有技能', () => {
    const prompt = buildSkillRouterPrompt(SKILLS);
    assert(prompt.includes('可用技能'), '应包含标题');
    for (const s of SKILLS) {
        assert(prompt.includes(s.name), `应包含 ${s.name}`);
    }
});

test('buildSkillRouterPrompt 空技能返回空字符串', () => {
    assert(buildSkillRouterPrompt([]) === '', '应返回空字符串');
});

// ── Step 4: Activation ────────────────────────────────────

console.log('\nStep 4 — 激活执行:');

test('getActivatedInstructions 返回完整指令', () => {
    const active = [{ name: 'test-medical', icon: '🏥', source: 'keyword' as const }];
    const instructions = getActivatedInstructions(SKILLS, active);
    assert(instructions.includes('已激活技能'), '应包含激活标记');
    assert(instructions.includes('<command-name>test-medical</command-name>'), '应包含 command-name 标签');
    assert(instructions.includes('患者信息填写'), '应包含技能详细指令');
});

test('getActivatedInstructions 空激活列表返回空字符串', () => {
    assert(getActivatedInstructions(SKILLS, []) === '', '应返回空字符串');
});

test('不匹配的技能名不注入指令', () => {
    const active = [{ name: '不存在的技能', icon: '❓', source: 'keyword' as const }];
    const instructions = getActivatedInstructions(SKILLS, active);
    assert(instructions === '', '应返回空字符串');
});

// ── Combined Pipeline ─────────────────────────────────────

console.log('\n全流程测试 (matchAndActivate):');

test('医疗任务匹配并返回指令', () => {
    const { activeSkills, instructions } = matchAndActivate(SKILLS, '帮我给患者开处方');
    assert(activeSkills.length > 0, '应匹配技能');
    assert(instructions.length > 0, '应返回指令');
    assert(instructions.includes('test-medical'), '指令应包含技能名');
});

test('无关任务不触发', () => {
    const { activeSkills, instructions } = matchAndActivate(SKILLS, 'tell me a joke');
    assert(activeSkills.length === 0, '不应匹配');
    assert(instructions === '', '指令应为空');
});

// ── Summary ───────────────────────────────────────────────

console.log(`\n=== 结果: ${passed} 通过, ${failed} 失败 ===`);
process.exit(failed > 0 ? 1 : 0);
