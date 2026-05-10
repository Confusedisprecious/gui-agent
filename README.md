# Medical Agent — AI 浏览器智能助手

Chrome 扩展形态的 AI 智能体，为医学规划软件提供自然语言驱动的浏览器自动化能力。通过侧边栏对话框与 AI 对话，自动操控浏览器完成患者数据填写、病历搜索、治疗方案制定等任务。

## 架构

```
Chrome（医学规划软件页面）
  └── Chrome 扩展 (Side Panel)
       ├── float-button.content.ts    页面右下角浮标入口
       ├── background.ts              原生 CDP Agent + 直接对话 + CDP Bridge
       ├── sidepanel/App.tsx          聊天 UI + 配置面板
       ├── skills/                    技能系统（渐进式披露）
       └── hooks/useAgent.ts          状态管理

Python 后端（可选，默认启动）
  └── FastAPI + browser-use
       ├── browser-use Agent          Playwright 浏览器自动化引擎
       ├── cdp_proxy.py               CDP Bridge：Playwright ↔ chrome.debugger
       └── skills/                    后端技能目录（SKILL.md）
```

**双引擎设计：**

| 模式 | 引擎 | 何时使用 |
|------|------|----------|
| 后端模式 | **browser-use** (Playwright) | Python 后端运行中，WS 已连接（优先） |
| 离线模式 | 原生 CDP Agent | 后端不可用时自动回退 |

**后端模式**：用户任务 → background.ts 发送到 Python 后端 → browser-use Agent 调用 Playwright → CDP Proxy 将 Playwright 的 CDP 命令转发给 chrome.debugger → 在用户当前 Chrome 页面执行。完整复用 browser-use 的规划、记忆、视觉能力。

**离线模式**：用户任务 → background.ts 内原生 Agent 循环 → 提取页面元素 → 调 LLM 决策 → CDP Input 域执行操作。始终可用，无需任何外部进程。

**直接对话**：非操作类问题直接调 LLM API，注入页面 DOM 文本辅助回答。

## 快速开始

### 1. 安装扩展

```bash
cd extension
npm install
npm run build
```

加载扩展：Chrome `chrome://extensions/` → 开发者模式 → 加载已解压 → 选择 `extension/.output/chrome-mv3/`

### 2. 配置 API Key

打开扩展侧边栏 → 设置图标 → 填入 DeepSeek API Key。

默认配置：
- Base URL: `https://api.deepseek.com/v1`
- Model: `deepseek-v4-flash`

### 3. 启动后端（可选，推荐）

```bash
cd backend
pip install -r requirements.txt
python main.py
```

后端启动后扩展自动连接，优先使用 browser-use 引擎。不启动后端也能用，扩展自带离线 Agent。

### 4. 使用

- **浮标入口**：打开医学规划软件页面，右下角出现蓝色浮标，点击打开侧边栏
- **对话模式**：直接输入问题，AI 基于当前页面内容回答
- **任务模式**：输入操作指令（如"搜索患者张三的病历"），Agent 自动操控浏览器执行

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

## 技术栈

| 层 | 技术 |
|----|------|
| 扩展框架 | WXT + React + TypeScript |
| UI 组件 | shadcn/ui + Tailwind CSS |
| 浏览器控制 | chrome.debugger (CDP) |
| 自动化引擎 | browser-use + Playwright |
| LLM | DeepSeek API（可切换 OpenAI/Anthropic） |
| 后端 | FastAPI + WebSocket |
