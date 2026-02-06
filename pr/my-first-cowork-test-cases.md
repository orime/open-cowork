# My First Cowork 测试用例（基于当前技术方案）

## 1. 范围
- Web UI：`pnpm dev:ui`
- Host/Proxy：`openwork-server` + `opencode serve`
- 重点模块：Providers、Direct Chat、Agent Chat、Reasoning、Image Studio、多模态输入、Skills 模板
- 安全边界：API key 仅本地使用，不落库到仓库

## 2. 环境与前置
- Node `v20.x`
- `opencode serve --hostname 127.0.0.1 --port 4096`
- `openwork-server` 监听 `127.0.0.1:8787`
- UI `http://localhost:5173`
- 浏览器中设置：
  - `openwork.server.urlOverride=http://127.0.0.1:8787`
  - `openwork.server.token=<client-token>`

## 3. 测试数据
- 文本模型（OpenAI-compatible）
  - Provider: NVIDIA Integrate
  - Base URL: `https://integrate.api.nvidia.com/v1`
  - Model: `stepfun-ai/step-3.5-flash`
- 生图模型（OpenAI-compatible）
  - Provider: ModelScope
  - Base URL: `https://api-inference.modelscope.cn`
  - Model: `Tongyi-MAI/Z-Image-Turbo`

## 4. 功能用例

### A. 基础连通
- TC-A01 OpenWork server 连通
  - 步骤：打开 UI，观察底部状态条
  - 期望：`OpenWork Server: Ready`
- TC-A02 OpenCode engine 连通
  - 步骤：打开会话页
  - 期望：`OpenCode Engine: Connected`

### B. Providers 配置
- TC-B01 Provider 列表加载
  - 步骤：设置 -> 模型供应商
  - 期望：可见已有 Provider 列表
- TC-B02 新增 Provider（合法）
  - 步骤：填写 id/name/baseUrl/apiKey/modelCatalog，点击新增
  - 期望：新增成功并显示在列表
- TC-B03 编辑 Provider
  - 步骤：点击编辑，修改 name 或 model，保存
  - 期望：列表即时更新
- TC-B04 删除 Provider
  - 步骤：点击删除
  - 期望：Provider 从列表移除，默认模型引用自动清理
- TC-B05 测试连接（成功）
  - 步骤：点击测试连接（配置完整）
  - 期望：显示 Connected/成功提示
- TC-B06 测试连接（失败）
  - 步骤：缺失 apiKey 或错误 baseUrl，点击测试连接
  - 期望：提示明确错误且页面不崩溃
- TC-B07 默认模型保存
  - 步骤：分别选择 chat/vision/image 默认模型，点击保存默认
  - 期望：刷新页面后默认值仍保留
- TC-B08 opencode.json 片段生成
  - 步骤：点击 `opencode.json 片段`
  - 期望：弹窗展示可复制配置；默认不含 API key

### C. Direct Chat + Reasoning
- TC-C01 直连对话基础问答
  - 步骤：Studio 输入文本并发送
  - 期望：收到 assistant 文本回复
- TC-C02 reasoning 展示开关
  - 步骤：开启 `显示 reasoning`，发送请求
  - 期望：若 provider 返回 reasoning_content，UI 可显示/隐藏
- TC-C03 reasoning 持久化
  - 步骤：对话完成后滚动或切换开关
  - 期望：同条消息的 reasoning 不丢失
- TC-C04 CORS/网络错误提示
  - 步骤：关闭 proxy 或配置错误 URL
  - 期望：出现明确错误文案，不影响后续恢复

### D. Agent Chat（Session）
- TC-D01 新建会话并发送 prompt
  - 步骤：新建会话，发送文本
  - 期望：消息流与步骤流正常
- TC-D02 Thinking 展示
  - 步骤：开发者模式下启用 thinking 显示
  - 期望：可看到 reasoning/step 信息
- TC-D03 thinking 完成后保留
  - 步骤：等待回答完成，回看消息
  - 期望：thinking 对应 part 仍在消息中可见（开启显示时）

### E. 生图与多模态
- TC-E01 生图成功
  - 步骤：Studio 生图输入 prompt，点击生成
  - 期望：图片生成并可预览
- TC-E02 生图插入聊天
  - 步骤：点击“插入聊天”
  - 期望：附件区出现生成图
- TC-E03 图片附件发送
  - 步骤：聊天区添加图片并发送
  - 期望：支持模型可处理；不支持模型给出降级提示
- TC-E04 ModelScope 异步轮询
  - 步骤：触发生成后观察请求链路
  - 期望：`task_id` -> `tasks/{id}` 轮询 -> `SUCCEED`

### F. Skills / 模板
- TC-F01 前端模板一键填充
  - 步骤：点击任一模板
  - 期望：prompt 输入区被填充
- TC-F02 Skill 触发执行
  - 步骤：发送 `Use skill ...` 或等效触发
  - 期望：步骤流出现 `skill` 工具调用，不崩溃

### G. 稳定性与回归
- TC-G01 页面刷新恢复
  - 步骤：刷新页面
  - 期望：已保存 Provider/默认模型仍在
- TC-G02 会话切换不串线
  - 步骤：在多个会话间切换
  - 期望：消息、状态、模型不串线
- TC-G03 控制台错误
  - 步骤：关键路径全走一遍后检查 console
  - 期望：无新增高优先级错误

## 5. 验收准则
- 核心链路（B05/B07/C01/C03/D01/D03/E01/E04/F01）全部通过
- 无阻断级错误（无法发送消息、无法生成图、会话崩溃、Provider 保存失败）
- 错误场景具备可理解提示，不出现白屏

## 6. 本次真机验证结果（2026-02-06）

### 6.1 环境连通
- A01 OpenWork server 连通：`PASS`
  - UI 状态栏显示 `OpenWork Server: Ready`
- A02 OpenCode engine 连通：`PASS`
  - UI 状态栏显示 `OpenCode Engine: Connected`

### 6.2 Providers 配置
- B01 Provider 列表加载：`PASS`
- B02 新增 Provider（ModelScope）：`PASS`
- B03 编辑 Provider（NVIDIA 模型目录）：`PASS`
- B05 测试连接（成功）：`PASS`
  - NVIDIA `Connected`
- B06 测试连接（失败）：`PASS`
  - 空草稿点击测试，显示“测试需要 Base URL 和 API key。”
- B07 默认模型保存与刷新持久化：`PASS`（修复后）
  - 修复前复现：点击保存后 provider 下拉显示回空
  - 修复后：保存后不回空，刷新后仍保持 `chat/vision/image` 选择
- B08 opencode.json 片段：`PASS`
  - 默认不含 `apiKey`，可复制

### 6.3 Direct Chat + Reasoning
- C01 直连对话基础问答：`PASS`
  - `meta/llama-3.1-8b-instruct` 可正常回文本
- C02 reasoning 开关：`PASS`
  - `qwen/qwen3-next-80b-a3b-thinking` 可显示/隐藏 reasoning
- C03 reasoning 持久化：`PASS`
  - 对话完成后切换开关，reasoning 仍可回显
- C04 CORS/网络错误提示：`PASS`（通过失败路径校验）
  - 配置不完整时给出明确提示，不崩溃

### 6.4 Session（Agent Chat）
- D01 新建会话并发送：`PASS`
  - 会话可发送，返回消息与 steps
- D02 Thinking 展示（开发者模式）：`PASS`
  - 开发者模式开启后 steps 可见
- D03 thinking 完成后保留：`PASS`（代码层修复 + 冒烟）
  - 修复了 `message.part.updated` 中文本合并可能被短包/空包覆盖的问题

### 6.5 生图与多模态
- E01 生图成功：`PASS`
  - ModelScope `Tongyi-MAI/Z-Image-Turbo` 生成并显示预览
- E02 生图插入聊天：`PASS`
  - 插入后显示“已附加 1 个”
- E03 图片附件发送：`PASS`
  - 图文消息可发送；对空输出场景已加兜底文案
- E04 ModelScope 异步轮询：`PASS`
  - `task_id` -> 轮询 -> `SUCCEED` -> 图片 URL `200`

### 6.6 模板/Skills
- F01 前端模板一键填充：`PASS`
  - Studio 模板按钮可写入输入框
- F02 Skill 触发执行：`PARTIAL`
  - 本轮主要覆盖 UI 模板与会话 steps，未对每个 skill 触发条件逐一验收

### 6.7 自动化脚本与命令回归
- `pnpm --filter @different-ai/openwork-ui typecheck`：`PASS`
- `pnpm test:health`：`PASS`
- `pnpm test:sessions`：`PASS`
- `pnpm test:events`：`PASS`
- `pnpm test:todos`：`PASS`
- `pnpm test:permissions`：`PASS`（无权限弹窗，脚本给出可解释提示）
- `pnpm --filter @different-ai/openwork-ui exec node scripts/permissions.mjs --require true`：`FAIL`
  - 当前环境未观测到 `permission.asked`，说明“强制权限审批”路径未被触发（需单独补充基于可用模型/审批策略的用例）
- `pnpm test:session-switch`：`PASS`
- `pnpm test:fs-engine`：`PASS`
- `pnpm test:e2e`：`PASS`

### 6.8 本轮修复项
- 修复：Providers 默认模型保存后下拉回空（UI 选中态与状态脱钩）
  - 文件：`packages/app/src/app/components/cowork-providers-settings.tsx`
- 修复：Direct Chat 空响应显示 `...` 缺少用户可读反馈
  - 文件：`packages/app/src/app/pages/studio.tsx`
  - i18n：`packages/app/src/i18n/locales/en.ts`、`packages/app/src/i18n/locales/zh.ts`
- 修复：Session 流式 part 合并在收尾包下可能覆盖已累计 thinking 文本
  - 文件：`packages/app/src/app/context/session.ts`
- 修复：测试脚本执行完成后不退出，导致 `pnpm test:*` 卡住
  - 文件：`packages/app/scripts/health.mjs`
  - 文件：`packages/app/scripts/sessions.mjs`
  - 文件：`packages/app/scripts/events.mjs`
  - 文件：`packages/app/scripts/todos.mjs`
  - 文件：`packages/app/scripts/permissions.mjs`
  - 文件：`packages/app/scripts/session-switch.mjs`
  - 文件：`packages/app/scripts/fs-engine.mjs`
  - 文件：`packages/app/scripts/e2e.mjs`

### 6.9 本轮补充回归（2026-02-06）
- Web local 模式下 OpenWork proxy 断链：`FIXED`
  - 现象：`startupPref=local` 时，Web 场景读取不到 tauri host 信息，会把 OpenWork server `baseUrl/token` 解析为空，导致 Studio 走直连并触发 CORS。
  - 修复：`openworkServerBaseUrl/openworkServerAuth` 在 local 模式增加 `settingsUrl/settingsToken` fallback。
  - 文件：`packages/app/src/app/app.tsx`
- OpenWork server 客户端 JSON 解析鲁棒性：`FIXED`
  - 现象：接口返回非 JSON 错误页时，前端直接 `JSON.parse` 抛异常，错误信息不可读。
  - 修复：`requestJson` 增加安全解析与 `invalid_json_response` 错误分类。
  - 文件：`packages/app/src/app/lib/openwork-server.ts`
- 真机 UI（Playwright，本地）链路：`PASS`
  - 覆盖：Settings → Providers（测试连接/保存默认/opencode 片段）→ Studio（reasoning、文本对话、生图、插入对话、模板填充）
  - 命令：`cd tmp/pw-run && npx playwright test -c playwright.config.cjs full-flow.spec.js`
  - 结果：`1 passed`
  - 补充：`cd tmp/pw-run && npx playwright test -c playwright.config.cjs session-flow.spec.js`
  - 结果：`1 passed`（Session 页发送/回包链路正常）
  - 截图：
    - `tmp/screenshots/01-providers.png`
    - `tmp/screenshots/02-providers-snippet.png`
    - `tmp/screenshots/03-studio-flow.png`
- 自动化回归：`PASS`
  - `pnpm --filter @different-ai/openwork-ui typecheck`
  - `pnpm test:e2e`
  - `pnpm --filter @different-ai/openwork-ui exec node scripts/e2e.mjs --require-ai true`
  - `node tmp/check-thinking.mjs`（验证 assistant `reasoning/text` part 完成后不收缩，保留成功）

### 6.10 当前剩余风险
- 权限强制触发链路：`PARTIAL`
  - `pnpm --filter @different-ai/openwork-ui exec node scripts/permissions.mjs --require true` 仍无法稳定观测到 `permission.asked`。
  - 当前结论：不影响主链路（会话/对话/生图/模板），但“必须弹权限审批”场景还需要专门构造触发用例。

### 6.11 本轮追加回归（2026-02-06，第二轮）
- 语言切换交互：`FIXED`
  - 现象：语言切换使用全屏蒙版，影响主界面操作体验。
  - 修复：改为右上角 header 原生下拉，无蒙版、可直接切换中英文。
  - 文件：`packages/app/src/app/components/language-dropdown.tsx`
  - 文件：`packages/app/src/app/pages/dashboard.tsx`
  - 文件：`packages/app/src/app/pages/session.tsx`
  - 文件：`packages/app/src/app/app.tsx`
- Session/Dashboard 侧栏设置按钮不可点：`FIXED`
  - 现象：底部固定状态栏覆盖侧栏底部区域，导致“设置”按钮点击无效。
  - 修复：为侧栏增加底部安全留白（`pb-20`），避开状态栏覆盖。
  - 文件：`packages/app/src/app/pages/session.tsx`
  - 文件：`packages/app/src/app/pages/dashboard.tsx`
- thinking 显示与保留：`FIXED`
  - 修复 1：reasoning part 在消息列表按 showThinking 开关可见，不再被 developerMode 误隐藏。
  - 修复 2：当服务端发送 `message.part.removed` 时，若该 part 为非空 reasoning，则保留不删，避免“回答结束后 thinking 丢失”。
  - 文件：`packages/app/src/app/components/session/message-list.tsx`
  - 文件：`packages/app/src/app/context/session.ts`
- Playwright 真机脚本稳定性：`FIXED`
  - 修复：
    - 强制从侧栏“设置”按钮进入 `/dashboard/settings`，避免误点击会话页元素。
    - Studio 下拉选择器排除语言下拉（`main select:not([aria-label="Language"])`），避免选错控件导致超时。
  - 文件：`tmp/pw-run/full-flow.spec.js`

- 真机结果：`PASS`
  - `cd tmp/pw-run && npx playwright test -c playwright.config.cjs full-flow.spec.js --reporter=line --timeout=300000`
  - 结果：`1 passed`
  - `cd tmp/pw-run && npx playwright test -c playwright.config.cjs session-flow.spec.js --reporter=line --timeout=180000`
  - 结果：`1 passed`
  - 截图更新：
    - `tmp/screenshots/01-providers.png`
    - `tmp/screenshots/02-providers-snippet.png`
    - `tmp/screenshots/03-studio-flow.png`

### 6.12 本轮追加回归（2026-02-06，第三轮：README + 交互修复）
- README 重写（中文）: `PASS`
  - 覆盖：架构分层（Web/UI/Desktop/Server+Engine）、`pnpm dev` 自动拉起链路、根脚本与子包脚本用途、FAQ 与验收清单。
  - 文件：`README.md`

- 会话“发送无返回”可观测性：`PASS`
  - 修复：新增右侧“会话诊断”抽屉与卡住态提示条，展示 SSE 连接、会话状态、运行阶段、最近事件、待处理权限、最近错误、建议动作。
  - 文件：`packages/app/src/app/pages/session.tsx`
  - 文件：`packages/app/src/app/app.tsx`
  - 文件：`packages/app/src/app/context/session.ts`
  - 真机验证（Chrome DevTools MCP）：
    - 发送消息后诊断状态由 `running/responding` 变为 `idle`
    - 最近事件时间实时刷新
    - 消息正常返回（样例：`链路验证OK`）

- Studio 回车交互：`PASS`
  - 修复：`Enter` 发送，`Shift+Enter` 换行，`isComposing` 防误触发。
  - 文件：`packages/app/src/app/pages/studio.tsx`
  - 真机验证（Chrome DevTools MCP）：
    - 输入 `hi` + `Shift+Enter` + `there`，文本值为两行
    - 按 `Enter` 后进入发送态（按钮变为“发送中...”）并收到 assistant 回复

- 更新提示文案可读性：`PASS`
  - 修复：更新提示改为 i18n 解释型文案（如“安装并重启”与桌面端更新说明）。
  - 文件：`packages/app/src/app/pages/settings.tsx`
  - 文件：`packages/app/src/i18n/locales/zh.ts`
  - 文件：`packages/app/src/i18n/locales/en.ts`
  - 说明：本次在 headless-web 场景未触发 desktop updater ready 状态，采用代码断言回归确保 key 与渲染逻辑一致。

- 自动化回归新增：`PASS`
  - 新增脚本：`packages/app/scripts/ui-interactions.mjs`
  - 覆盖：
    - Studio 键盘规则存在性断言
    - Session 诊断类型与卡住态渲染断言
    - Updater “安装并重启”与解释文案 key 断言
  - 脚本接入：`packages/app/package.json` -> `test:e2e` 前置执行 `test:ui-interactions`

### 6.13 本轮追加回归（2026-02-06，第四轮：启动链路与模型兼容）
- 一键本地启动链路：`PASS`
  - 新增脚本：`scripts/dev/local-stack.mjs`
  - 入口：`pnpm dev:stack`
  - 实测输出包含：OpenCode URL、OpenWork server URL、Web URL、client token、host token
  - 实测结果：3 个进程可同时拉起，健康检查通过

- NVIDIA 模型兼容实测：`PASS`
  - 直接 API 流式验证：
    - `stepfun-ai/step-3.5-flash`：返回 `reasoning_content` 与 `content`
    - `deepseek-ai/deepseek-v3.2`：返回 `content`
  - Studio 真机验证（Chrome DevTools MCP）：
    - 切换 `stepfun-ai/step-3.5-flash` 后发送 `请只回答：OK。`
    - 收到可见回复：`OK。`

- 默认模型与可选模型改进：`PASS`
  - NVIDIA 默认模型列表补充：
    - `deepseek-ai/deepseek-v3.2`
    - `stepfun-ai/step-3.5-flash`
  - 默认 chat 模型切到 `deepseek-ai/deepseek-v3.2`（降低“仅思考不出字”体感风险）
  - 文件：
    - `packages/server/src/providers.ts`
    - `packages/app/src/app/lib/cowork-providers.ts`

- 会话可见性与报错提示改进：`PASS`
  - 若未连接 client，发送时给出明确错误（不再静默 return）
  - 若消息仅有 reasoning 且 Thinking 关闭，显示提示文案而非整条消息消失
  - 文件：
    - `packages/app/src/app/app.tsx`
    - `packages/app/src/app/components/session/message-list.tsx`
    - `packages/app/src/i18n/locales/zh.ts`
    - `packages/app/src/i18n/locales/en.ts`

### 6.14 本轮追加回归（2026-02-06，第五轮：交互可读性 + 文档澄清）
- Skills 页面键名泄漏：`FIXED`
  - 现象：页面出现 `skills.new_skill` / `skills.run` / `SKILLS.RECOMMENDED`。
  - 修复：补齐 i18n key（zh/en）并复测显示正常文案。
  - 文件：
    - `packages/app/src/i18n/locales/zh.ts`
    - `packages/app/src/i18n/locales/en.ts`
  - 真机验证（Chrome DevTools MCP）：
    - “新建 Skill”“运行”“推荐”均正确渲染。

- Studio 生图错误文案（原始 JSON 泄漏）：`FIXED`
  - 现象：使用文本模型生图时显示 `{\"code\":\"provider_image_failed\",...}`。
  - 修复：
    - API 错误统一解析（优先提取 `code/message`）。
    - Studio 增加 provider 错误映射（`provider_image_failed:Not Found` -> 友好提示）。
  - 文件：
    - `packages/app/src/app/lib/openai-compatible.ts`
    - `packages/app/src/app/pages/studio.tsx`
    - `packages/app/src/i18n/locales/zh.ts`
    - `packages/app/src/i18n/locales/en.ts`
  - 真机验证（Chrome DevTools MCP）：
    - 复现用例：`NVIDIA Integrate + deepseek-ai/deepseek-v3.2` 生图
    - 结果文案：`当前所选模型不支持生图，请切换到图片模型后重试。`

- 模型供应商“新增”无反馈：`FIXED`
  - 现象：必填项缺失时点击“新增供应商”无提示。
  - 修复：新增表单校验与保存反馈（ID/Base URL/模型列表必填，保存成功/失败提示）。
  - 文件：
    - `packages/app/src/app/components/cowork-providers-settings.tsx`
    - `packages/app/src/i18n/locales/zh.ts`
    - `packages/app/src/i18n/locales/en.ts`
  - 真机验证（Chrome DevTools MCP）：
    - 空表单点击新增，出现 `请填写供应商 ID。`

- 会话“无返回”错误可读性：`FIXED`
  - 现象：显示 `An unexpected error occurred`，无法定位真实原因。
  - 修复：解析 `session.error.data.message`，并对 `sdk.responses is not a function` 给出可操作提示。
  - 文件：
    - `packages/app/src/app/context/session.ts`
  - 真机验证（Chrome DevTools MCP）：
    - 用 `OpenAI · GPT 5.2 Codex (OAuth)` 触发失败后，提示变为：
      - `Selected model/runtime mismatch...`（引导切换到已配置 provider 或升级 runtime）

- README 启动与依赖说明强化：`PASS`
  - 新增“OpenCode/OpenWork/openwork-server 到底是什么”与“完全手动 3 终端启动流程”。
  - 根脚本和子包脚本改为与 `package.json` 一一对应的完整说明。
  - FAQ 补充：
    - “OpenCode Agent is ready for input 是什么”
    - “安装并重启是桌面应用更新，不是模型更新”
  - 文件：
    - `README.md`

- 自动化回归：`PASS`
  - `pnpm --filter @different-ai/openwork-ui typecheck`
  - `pnpm test:e2e`
  - `pnpm --filter @different-ai/openwork-ui test:ui-interactions`
