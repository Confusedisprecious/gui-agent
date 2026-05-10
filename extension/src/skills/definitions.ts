import type { SkillDefinition } from './types';

export const SKILLS: SkillDefinition[] = [
    {
        name: '医疗规划助手',
        description: '专门处理医疗规划软件中的患者数据填写、记录搜索、治疗方案制定等任务',
        icon: '🏥',
        triggers: [
            '患者', '病例', '病历', '治疗', '处方', '用药', '诊断',
            '医生', '护士', '科室', '挂号', '就诊', '住院', '出院',
            '药品', '剂量', '检查', '检验', '手术', '麻醉', '护理',
            'patient', 'treatment', 'drug', 'dose', 'diagnosis',
            'medical', 'clinical', 'prescription',
        ],
        instructions: `
## 医疗规划助手技能

你是医疗规划软件的智能助手，帮助用户完成以下操作：

### 常见任务模式
1. **患者信息填写** - 在表单中输入患者的姓名、年龄、性别、病历号等基本信息
2. **医疗记录搜索** - 根据关键词搜索患者的就诊记录、检查报告、处方信息
3. **治疗方案制定** - 辅助医生浏览和选择治疗方案、药品、剂量
4. **表单提交** - 填写完毕后提交表单或保存记录

### 页面交互要点
- 医疗软件通常将表单组织在多个标签页或分区中，需要先切换到对应分区
- 搜索功能通常在页面顶部或侧边栏，包含关键词输入框和搜索按钮
- 填写表单时注意必填项（通常标有 * 或红色标记）
- 下拉选择框广泛用于科室、药品、诊断类型等选择
- 提交操作前确认所有必填项已填写
- 操作完成后确认页面反馈（如"保存成功"提示或页面跳转）
`,
    },
];

export function getSkillInstructions(skills: SkillDefinition[]): string {
    if (skills.length === 0) return '';
    return '\n\n## 已激活的技能\n' + skills.map((s) => s.instructions).join('\n');
}
