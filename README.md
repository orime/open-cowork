# My First Cowork（基于 OpenWork）

面向前端开发者的 OpenWork 变体：提供多 Provider、多模型、直连对话、生图工作室、技能与自动化能力，并兼容 OpenCode 原生工作流。

## 0.1 你到底做了什么（和“直接用 OpenCode”有什么区别）

如果你只想在终端里直接跑 Agent，确实可以只用 `opencode`。  
这个客户端的价值不是“替代引擎”，而是把引擎能力产品化：

- 同时管理多工作区、多会话、技能、插件、审批、审计
- 图形化配置多 Provider / 多模型（含直连对话与生图）
- 桌面端一键集成本地能力（文件打开、更新器、sidecar 管理）
- 远程/本地同一套 UI，面向非终端用户更易用

换句话说：`opencode` 是引擎，My First Cowork 是“引擎 + 主机服务 + UI + 桌面壳”的产品层。

## 0.2 功能依赖矩阵（是否必须依赖 OpenCode）

| 功能 | 是否依赖 OpenCode | 说明 |
|---|---|---|
| Session/Agent 对话（Plan、Timeline、工具调用、审批） | 是 | 这条链路由 OpenCode 执行 |
| Studio 直连对话（OpenAI-compatible） | 否 | 走 `openwork-server` 的 `/cowork/chat` 代理 |
| Studio 生图 | 否 | 走 `openwork-server` 的 `/cowork/images` 代理 |
| Provider/模型配置 | 否 | 存在本机 `~/.config/my-first-cowork` |
| Skills 真正执行 | 是 | skills 最终由 OpenCode 在任务中调用 |

结论：

- 只体验“直连对话/生图/模型配置”可以不装 OpenCode。
- 要完整 Agent 工作流，必须有 OpenCode。

## 0. 先说清楚：OpenCode / OpenWork / Server 到底是什么

你看到的名字很多，职责其实很清晰：

1. `OpenCode`（执行引擎）
- 真正跑会话、工具调用、计划、SSE 事件流。
- 你发消息后真正执行的地方是它，不是 UI。
- 常见启动命令：`opencode serve --hostname 127.0.0.1 --port 4096`

2. `openwork-server`（OpenWork 的主机服务）
- 是 UI 和 OpenCode 之间的“桥接层”。
- 负责统一配置、权限审批、provider 代理、skills/plugins 管理、审计与健康检查。
- 常见启动端口：`8787`。

3. `Web UI / Desktop UI`（前端界面）
- 同一套 SolidJS 前端，只是运行环境不同（浏览器/Tauri）。
- 负责展示和交互，不负责执行会话。

一句话：**OpenCode 是引擎，openwork-server 是桥，UI 是壳**。  
“会话发出去没返回”通常不是 UI 卡死，而是引擎/模型/认证链路出错。

## 1. 项目定位

My First Cowork 的目标是把 OpenCode 能力变成「可视化、可配置、可协作」的产品体验：

- 非技术用户：在 UI 内就能跑任务、看计划、做审批。
- 前端开发者：可以直接配置 OpenAI-compatible Provider、模型、技能与自动化模板。
- 团队协作：同一套工作区和配置可以在桌面端、Web 端、远程主机之间流转。

## 2. 架构总览（四层）

### 2.1 Web UI（浏览器）

- 代码位置：`packages/app`
- 技术栈：SolidJS + Tailwind + OpenCode SDK Client
- 职责：
  - 展示会话、步骤、权限、设置、技能、工作室
  - 触发 API 调用（OpenCode / OpenWork Server）
- 限制：
  - 浏览器本身不能直接做本机进程管理、原生文件系统操作、桌面更新安装

### 2.2 UI 端（同一套前端在不同 Runtime）

同一套 `packages/app` UI 会运行在两种环境：

1. 浏览器（`pnpm dev:ui`）
2. 桌面壳（Tauri，`pnpm dev`）

区别在于 runtime 能力：

- 浏览器：偏远程控制、界面展示
- Tauri：可调用本地能力（sidecar、系统对话框、更新器、文件打开等）

### 2.3 客户端（Desktop / Tauri）

- 代码位置：`packages/desktop`（Rust + Tauri 2）
- 职责：
  - 启动桌面窗口
  - 装配 sidecar（`opencode`、`openwork-server`、`openwrk`、`owpenbot`）
  - 提供本地原生能力（文件选择、打开路径、自动更新）

### 2.4 OpenWork Server + OpenCode Engine

- OpenWork Server：配置管理、审批、能力代理、审计
- OpenCode Engine：会话执行、工具调用、事件流（SSE）
- UI 通过 SDK/HTTP 与它们通信，完成实际任务执行

## 3. 运行模式

### 3.1 `pnpm dev`（桌面联调）

- 启动 Tauri 桌面客户端
- 自动启动前端 dev server
- 客户端窗口会自动打开并加载本地 dev URL

### 3.2 `pnpm dev:ui`（纯 Web UI）

- 只启动前端 Vite 服务
- 适合做 UI 开发和页面调试
- 要跑完整链路需额外连接可用的 OpenCode/OpenWork 服务

### 3.3 `pnpm dev:stack`（推荐，一键本地可用）

- 自动拉起：
  - `opencode serve`
  - `openwork-server`
  - `vite` Web UI
- 自动分配端口并打印访问地址与 token
- 适合“我就想一条命令先跑通”

### 3.4 `pnpm dev:headless-web`（Headless + Web）

- 使用 headless 方式编排服务并搭配 Web UI
- 用于接近线上的无桌面壳体验

## 4. 为什么 `pnpm dev` 会自动打开客户端

`pnpm dev` 的执行链路如下：

1. 根脚本：`pnpm dev` -> `pnpm --filter @different-ai/openwork dev`
2. 桌面包脚本：`@different-ai/openwork` 的 `dev` 执行 `tauri dev`
3. `tauri dev` 读取 `packages/desktop/src-tauri/tauri.conf.json`：
   - `beforeDevCommand` 会先跑前端 dev 命令
   - `devUrl` 指向前端地址（默认 `http://localhost:5173`）
4. Tauri 启动桌面窗口并加载 `devUrl`，所以你会看到“自动打开客户端”

本质上：`pnpm dev` 不是只跑前端，它是在跑「桌面壳 + 前端联调」。

## 5. 启动方式（按场景）

### 5.0 前置条件

- Node.js + pnpm（项目依赖与脚本运行）
- Bun（用于构建 openwork-server/sidecars）
- opencode CLI（本地引擎服务）

### 5.1 只看 UI（最快）

```bash
pnpm install
pnpm dev:ui
```

这个模式只起前端，不会自动起 OpenCode 和 openwork-server。

### 5.2 一键本地完整链路（推荐）

```bash
pnpm install
pnpm --filter openwork-server build:bin
pnpm dev:stack
```

`dev:stack` 会自动启动：

- `opencode serve`
- `packages/server/dist/bin/openwork-server`
- `@different-ai/openwork-ui`（Vite）

并自动注入 `VITE_OPENWORK_URL/VITE_OPENWORK_TOKEN`，所以 UI 打开后就能直接连。

### 5.3 完全手动启动（用于排障）

当你想精确控制每一步时，用 3 个终端：

终端 A（OpenCode 引擎）：

```bash
opencode serve --hostname 127.0.0.1 --port 4096
```

终端 B（OpenWork Server 桥接层）：

```bash
pnpm --filter openwork-server build:bin
packages/server/dist/bin/openwork-server \
  --host 127.0.0.1 \
  --port 8787 \
  --workspace /Users/orime/CascadeProjects/22.cowork/01.my-first-cowork \
  --opencode-base-url http://127.0.0.1:4096 \
  --opencode-directory /Users/orime/CascadeProjects/22.cowork/01.my-first-cowork \
  --token dev-token \
  --host-token dev-host-token \
  --cors "*"
```

终端 C（Web UI）：

```bash
VITE_OPENWORK_URL=http://127.0.0.1:8787 \
VITE_OPENWORK_PORT=8787 \
VITE_OPENWORK_TOKEN=dev-token \
pnpm dev:ui
```

### 5.4 桌面端（Tauri）

```bash
pnpm dev
```

这会起 Tauri 窗口，并通过 `beforeDevCommand + devUrl` 连接前端开发服务。

### 5.5 远程 Host 连接

- 在设置中配置 OpenWork Server 地址和 Token
- 切换到远程工作区
- 同一 UI 控制远程 OpenCode 执行

## 6. 根目录脚本说明（完整，对应 `package.json`）

| 脚本 | 作用 |
|---|---|
| `dev` | 启动桌面联调（`@different-ai/openwork dev`） |
| `dev:ui` | 启动纯 Web UI（`@different-ai/openwork-ui dev`） |
| `dev:web` | `dev:ui` 别名 |
| `dev:stack` | 一键启动本地完整链路（OpenCode + OpenWork Server + UI） |
| `dev:headless-web` | Headless 编排 + Web UI |
| `build` | 构建桌面应用（Tauri build） |
| `build:ui` | 构建前端 |
| `build:web` | `build:ui` 别名 |
| `preview` | 预览前端构建产物 |
| `typecheck` | 前端 TypeScript 类型检查 |
| `test:health` | 健康检查脚本 |
| `test:sessions` | 会话相关脚本测试 |
| `test:refactor` | 组合回归（typecheck + health + sessions） |
| `test:events` | 事件链路测试 |
| `test:todos` | Todo 链路测试 |
| `test:permissions` | 权限链路测试 |
| `test:session-switch` | 会话切换回归 |
| `test:fs-engine` | 文件系统引擎回归 |
| `test:e2e` | 端到端脚本回归（聚合） |
| `test:openwrk` | Headless 路由测试 |
| `bump:patch` | 版本号补丁升级 |
| `bump:minor` | 版本号小升级 |
| `bump:major` | 版本号大升级 |
| `bump:set` | 手动指定版本号 |
| `release:review` | 发布前检查脚本 |
| `release:desktop` | 桌面端一键发布脚本 |
| `tauri` | 透传 Tauri CLI（在 desktop 包内执行） |

## 7. 子包脚本说明（完整）

### 7.1 `packages/app/package.json`（前端）

| 脚本 | 作用 |
|---|---|
| `dev` / `dev:web` | 启动 Vite |
| `build` / `build:web` | 构建前端 |
| `preview` | 本地预览构建产物 |
| `typecheck` | TS 类型检查 |
| `test:health` | 健康检查脚本 |
| `test:sessions` | 会话脚本测试 |
| `test:refactor` | 组合测试 |
| `test:events` | 事件链路测试 |
| `test:todos` | Todo 链路测试 |
| `test:permissions` | 权限链路测试 |
| `test:session-switch` | 会话切换测试 |
| `test:fs-engine` | 文件系统链路测试 |
| `test:ui-interactions` | UI 交互静态回归脚本 |
| `test:e2e` | 聚合 e2e 测试 |
| `bump:patch/minor/major/set` | 版本号管理 |

### 7.2 `packages/desktop/package.json`（桌面壳）

| 脚本 | 作用 |
|---|---|
| `dev` | `tauri dev`，联调桌面窗口 |
| `build` | `tauri build`，构建安装包 |
| `prepare:sidecar` | 准备桌面依赖 sidecar |

### 7.3 `packages/headless/package.json`（openwrk）

| 脚本 | 作用 |
|---|---|
| `dev` | Headless CLI 开发运行 |
| `build` | TypeScript 编译 |
| `build:bin` | 编译 `openwrk` 可执行文件 |
| `build:bin:bundled` | 侧车打包 + openwrk 编译 |
| `build:sidecars` | 构建 sidecar 资产 |
| `typecheck` | TS 类型检查 |
| `test:router` | Headless 路由/编排测试 |
| `prepublishOnly` | 发布前构建二进制 |

## 8. 常见问题 FAQ

### 8.0 我能不能完全不装 OpenCode，只用这个客户端？

可以，但只能用 Studio（直连对话/生图）和 Provider 配置。  
如果你要 Session/Agent（步骤、工具、技能执行、权限审批），必须启动 OpenCode。

### 8.1 会话发送后没有返回（一直 Sending）

先看会话页右侧「诊断」抽屉：

- 事件流是否已连接
- 会话状态是否停在 `sending/thinking`
- 最近事件时间是否过久
- 是否有待处理权限
- 最近错误信息

常见处理：

1. 刷新当前会话
2. 去「设置 -> 模型供应商」检查 provider/key/model
3. 重新做 provider 认证
4. 确认 OpenWork Server / OpenCode 服务可达

### 8.6 客户端配置的模型 vs OpenCode 配置的模型，有什么区别？

- 客户端（Settings -> 模型供应商）：
  - 主要用于 Studio 直连对话/生图
  - 存在 `~/.config/my-first-cowork/providers.json` + `secrets.json`
- OpenCode（`opencode.json` / 运行时配置）：
  - 主要用于 Session/Agent 任务执行
  - 决定 Agent 真正调用哪个 provider/model

两者可以不同步。若你希望 Session 和 Studio 行为一致，需要两边都配置到同一 provider/model。

### 8.7 macOS 未签名应用如何打开（绕过 Gatekeeper）

如果是未签名构建，拖到 `Applications` 后首次打开可能被 Gatekeeper 拦截。执行：

```bash
xattr -dr com.apple.quarantine "/Applications/OpenWork.app"
open "/Applications/OpenWork.app"
```

如果你放在其他目录，把路径替换成你的实际 `OpenWork.app` 路径即可。

### 8.2 Studio 输入框回车规则是什么？

- `Enter`：发送
- `Shift + Enter`：换行
- 输入法组合输入（IME composing）期间不会误发送

### 8.3 设置页右上角 “安装并重启” 是什么？

这是 **桌面客户端更新**（OpenWork App 本体更新），不是模型更新、也不是 provider 更新。

- 看到“桌面端新版本已下载，可安装”表示更新包已经准备好
- 点击“安装并重启”会安装新版本并自动重启应用

### 8.4 “OpenCode Agent is ready for input” 是什么？

这是 OpenCode 引擎的就绪提示，表示引擎进程可接收新任务，不是报错。

### 8.5 最短启动排障（按顺序）

1. 执行 `pnpm dev:stack`
2. 打开脚本打印的 Web 地址（例如 `http://127.0.0.1:49xxx`）
3. 进入设置页确认 Connection 为“已连接”
4. 再去会话页发送测试消息
5. 若仍异常，看右侧“诊断”抽屉的：
   - 事件流是否连接
   - 最近错误信息
   - 待处理权限数量

## 9. 开发与验收清单

建议每次改动至少执行：

```bash
pnpm typecheck
pnpm test:e2e
```

UI 交互改动建议增加真机冒烟：

1. 启动 `pnpm dev:ui`（或 `pnpm dev`）
2. 验证 Studio 的 Enter/Shift+Enter 行为
3. 验证会话页诊断抽屉信息完整
4. 验证设置页更新提示文案可理解

---

更多背景请阅读：

- `AGENTS.md`
- `VISION.md`
- `PRINCIPLES.md`
- `PRODUCT.md`
- `ARCHITECTURE.md`
- `INFRASTRUCTURE.md`
