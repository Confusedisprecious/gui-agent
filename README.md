# Medical Agent — AI 浏览器智能助手

Chrome 扩展形态的 AI 智能体，为医学规划软件提供自然语言驱动的浏览器自动化能力。零配置启动，通过侧边栏对话框与 AI 对话，自动操控网页完成患者数据填写、病历搜索、治疗方案制定等任务。

## 架构

```
Chrome（医学规划软件页面）
  └── Chrome 扩展 (Side Panel)
       ├── float-button.content.ts    页面右下角浮标入口
       ├── background.ts              原生 CDP Agent + 直接对话 + CDP Bridge
       ├── sidepanel/App.tsx          聊天 UI + 配置面板
       ├── skills/                    技能系统（渐进式披露）
       └── hooks/useAgent.ts          状态管理
```

- **浏览器控制**：基于 `chrome.debugger` API 的原生 CDP Agent，无需 `--remote-debugging-port` 启动参数，无需重启 Chrome
- **对话模式**：background.ts 直接调用 LLM API，注入页面上下文辅助回答
- **Agent 循环**：attach debugger → 提取页面元素 → 调用 LLM → 解析动作 → 通过 CDP Input 域执行 → 循环
- **可选后端**：Python FastAPI + browser-use 后端，通过 CDP Bridge 代理 Playwright 命令到 chrome.debugger

## 快速开始

### 1. 安装依赖 & 构建

```bash
cd extension
npm install
npm run build
```

### 2. 加载扩展

1. 打开 Chrome，访问 `chrome://extensions/`
2. 开启「开发者模式」
3. 点击「加载已解压的扩展程序」
4. 选择 `extension/.output/chrome-mv3/` 目录

### 3. 配置 API Key

点击扩展图标打开侧边栏 → 点击设置图标 → 填入 DeepSeek API Key 和模型名称。

默认使用 DeepSeek API：
- Base URL: `https://api.deepseek.com/v1`
- Model: `deepseek-v4-flash`

### 4. 使用

- **浮标入口**：打开医学规划软件页面，右下角出现蓝色浮标，点击打开侧边栏
- **对话模式**：直接输入问题，AI 基于当前页面内容回答
- **任务模式**：输入包含操作指令的消息（如"搜索患者张三的病历"），Agent 自动操控浏览器执行

## 技能系统

采用渐进式披露架构，四步流程：

| 步骤 | 说明 |
|------|------|
| 扫描发现 | 启动时加载 skill 定义（`src/skills/definitions.ts`） |
| 元数据加载 | 始终注入轻量元数据（名称+描述），约 50 词/技能 |
| 请求匹配 | 关键字预过滤 + LLM 语义匹配 |
| 激活执行 | 匹配后注入完整指令，UI 显示技能徽章 |

### 添加新技能

编辑 `extension/src/skills/definitions.ts`，在 `SKILLS` 数组中添加：

```ts
{
    name: '技能名称',
    description: '简短描述',
    icon: '🧬',
    triggers: ['触发词1', '触发词2'],
    instructions: `详细的技能指令...`,
}
```

## 可选：Python 后端

如需使用 browser-use 的高级功能：

```bash
cd backend
pip install -r requirements.txt
python main.py
```

后端启动后，扩展自动检测 WebSocket 连接，优先通过 CDP Bridge 使用 browser-use 的 Playwright 引擎执行任务。

## 技术栈

| 层 | 技术 |
|----|------|
| 扩展框架 | WXT + React + TypeScript |
| UI 组件 | shadcn/ui + Tailwind CSS |
| 浏览器控制 | chrome.debugger (CDP) |
| LLM | DeepSeek API（可配置 OpenAI/Anthropic） |
| 后端（可选） | FastAPI + browser-use + Playwright |
