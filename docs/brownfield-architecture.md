# CUI (Common Agent UI) 现状架构文档

## 简介

本文档记录CUI代码库的**当前实际状态**，包括技术债务、架构决策和实际实现模式。为AI agents理解系统和实现slash command功能提供参考。

### 文档范围

聚焦于：进程通信机制和slash command集成点

### 变更日志

| 日期       | 版本 | 描述             | 作者     |
| ---------- | ---- | ---------------- | -------- |
| 2025-01-11 | 1.0  | 初始现状分析     | Winston  |

## 快速参考 - 核心文件和入口点

### 理解系统的关键文件

- **主入口**: `src/server.ts` - Express服务器启动
- **核心服务**: `src/cui-server.ts` - CUI服务器主类
- **进程管理**: `src/services/claude-process-manager.ts` - Claude CLI进程管理器
- **流管理**: `src/services/stream-manager.ts` - SSE流连接管理
- **前端入口**: `src/web/index.tsx` - React应用入口
- **消息输入**: `src/web/chat/components/Composer/Composer.tsx` - 前端输入组件

### Slash Command增强影响区域

- `src/services/claude-process-manager.ts:647-710` - buildStartArgs方法
- `src/web/chat/components/Composer/Composer.tsx:496-636` - slash命令自动完成
- `src/routes/conversation.routes.ts` - 会话路由处理
- 需新增: slash命令解析服务

## 高层架构

### 技术摘要

```
┌─────────────┐       SSE        ┌──────────────┐
│   Browser   │◄─────────────────►│  CUI Server  │
│   (React)   │                   │   (Express)  │
└─────────────┘                   └──────┬───────┘
                                         │
                                   spawn │ JSONL
                                         ▼
                                  ┌─────────────┐
                                  │  Claude CLI │
                                  │   Process   │
                                  └─────────────┘
```

### 实际技术栈

| 类别       | 技术         | 版本    | 备注                           |
| ---------- | ------------ | ------- | ------------------------------ |
| 运行时     | Node.js      | >=20.19 | 需要较新版本支持               |
| 后端框架   | Express      | 4.18.2  | 传统REST API                   |
| 前端框架   | React        | 18.2.0  | SPA应用                        |
| 样式       | TailwindCSS  | 4.1.11  | 原子化CSS                      |
| 构建工具   | Vite         | 7.0.6   | 快速构建                       |
| 语言       | TypeScript   | 5.3.3   | 强类型支持                     |
| 数据库     | SQLite       | 12.2.0  | better-sqlite3存储会话信息     |
| 测试       | Vitest       | 3.2.4   | 单元和集成测试                 |
| Claude SDK | claude-code  | 1.0.70  | Anthropic官方SDK               |

## 源码树和模块组织

### 项目结构（实际）

```text
cui/
├── src/
│   ├── services/           # 业务逻辑层
│   │   ├── claude-process-manager.ts  # 核心：Claude进程管理
│   │   ├── stream-manager.ts          # SSE流管理
│   │   ├── session-info-service.ts    # 会话信息存储
│   │   └── commands-service.ts        # 命令处理（未完全实现）
│   ├── routes/             # HTTP路由处理
│   │   ├── conversation.routes.ts     # 会话API
│   │   └── streaming.routes.ts        # SSE流端点
│   ├── web/                # 前端React应用
│   │   └── chat/
│   │       └── components/
│   │           └── Composer/          # 输入框组件（含slash自动完成）
│   ├── types/              # TypeScript类型定义
│   └── utils/              # 工具函数
├── tests/                  # 测试文件（60%覆盖率）
├── dist/                   # 构建输出
└── public/                 # 静态资源
```

### 核心模块及其用途

- **进程管理**: `claude-process-manager.ts` - 负责spawn Claude CLI进程，处理JSONL流
- **流管理**: `stream-manager.ts` - 管理多客户端SSE连接
- **会话服务**: `session-info-service.ts` - SQLite存储会话元数据
- **前端通信**: `Composer.tsx` - 处理用户输入，包含@文件和/命令自动完成

## 进程通信机制（核心关注点）

### Claude CLI进程生命周期

```
1. 启动会话
   └─> ClaudeProcessManager.startConversation()
       └─> buildStartArgs() 构建CLI参数
       └─> spawn() 创建子进程
       └─> 管道连接: stdin(inherit), stdout(pipe), stderr(pipe)

2. 消息流转
   Browser ──HTTP POST──> Express ──spawn──> Claude CLI
     ▲                                           │
     └──────────SSE Events──────────────────────┘

3. 数据格式
   - 输入: 命令行参数（初始提示）
   - 输出: JSONL流（JSON Lines格式）
   - 传输: Server-Sent Events (SSE)
```

### 实际实现细节

#### 进程创建（claude-process-manager.ts:791-795）

```typescript
const claudeProcess = spawn(executablePath, args, {
  cwd,
  env,
  stdio: ['inherit', 'pipe', 'pipe'] // 关键：stdin继承，stdout/stderr管道
});
```

**重要发现**：
- stdin设为'inherit'意味着**无法在运行时发送新消息**
- 所有输入必须通过命令行参数传递
- 这是当前架构的**主要限制**

#### JSONL解析流程（claude-process-manager.ts:856-865）

```typescript
process.stdout.pipe(parser); // JsonLinesParser
parser.on('data', (message) => {
  // 处理Claude输出的JSONL消息
  this.emit('claude-message', { streamingId, message });
});
```

### 前端slash命令检测（Composer.tsx:496-510）

```typescript
const detectSlashCommandAutocomplete = (value, cursorPosition) => {
  const beforeCursor = value.substring(0, cursorPosition);
  const lastSlashIndex = beforeCursor.lastIndexOf('/');
  // 检查slash是否在开头或空白后
  const beforeSlash = beforeCursor.substring(0, lastSlashIndex);
  if (beforeSlash.trim() !== '' && !beforeSlash.endsWith('\n')) return null;
  // 返回命令查询字符串
  return { triggerIndex: lastSlashIndex, query: afterSlash };
};
```

## Slash Command集成分析

### 当前状态

1. **前端支持**: ✅ 已实现slash自动完成UI
2. **命令检测**: ✅ 能检测/开头的输入
3. **命令传递**: ❌ 命令作为普通文本发送给Claude
4. **命令解析**: ❌ 无服务端slash命令处理
5. **命令执行**: ❌ 无法修改Claude行为

### 架构限制

**关键问题**: stdin设为'inherit'导致无法运行时通信

```
当前流程:
User输入 "/command" ──> 作为initialPrompt ──> Claude CLI参数
                                                    │
                                                    ▼
                                              Claude处理为普通文本

期望流程:
User输入 "/command" ──> 服务端解析 ──> 转换为Claude参数
                                          │
                                          ▼
                                    修改Claude行为/配置
```

### 实现方案建议

#### 方案A：参数转换（最小改动）

在`buildStartArgs`中解析slash命令：

```typescript
// claude-process-manager.ts:657-659
if (config.initialPrompt) {
  const { command, prompt } = parseSlashCommand(config.initialPrompt);
  if (command) {
    // 转换为相应的Claude CLI参数
    switch(command) {
      case '/plan': 
        args.push('--permission-mode', 'plan');
        break;
      case '/model':
        args.push('--model', extractModelName(prompt));
        break;
    }
    args.push(prompt); // 剩余文本作为提示
  } else {
    args.push(config.initialPrompt);
  }
}
```

#### 方案B：双向通信（需要重构）

修改stdio配置支持运行时消息：

```typescript
stdio: ['pipe', 'pipe', 'pipe'] // 全部使用管道
// 然后通过process.stdin.write()发送新消息
```

**注意**：这需要Claude CLI支持交互模式

## 技术债务和已知问题

### 关键技术债务

1. **进程通信限制**: stdin继承模式阻止运行时消息发送
2. **命令服务未完成**: `commands-service.ts`存在但未集成
3. **测试覆盖不足**: 仅60%单元测试覆盖率
4. **错误处理**: stderr输出总是记录为error级别

### 权宜之计

- **会话恢复**: 通过`--resume`参数实现，而非持久连接
- **权限模式**: 通过命令行参数传递，无法动态修改
- **模型切换**: 必须启动新会话，无法运行时切换

## 集成点和外部依赖

### 外部服务

| 服务        | 用途         | 集成类型    | 关键文件                      |
| ----------- | ------------ | ----------- | ----------------------------- |
| Claude CLI  | AI处理       | 子进程      | `claude-process-manager.ts`   |
| Claude Code | SDK功能      | NPM包       | `@anthropic-ai/claude-code`   |
| Gemini API  | 语音听写     | REST API    | `gemini-service.ts`           |
| Web Push    | 通知         | 服务        | `web-push-service.ts`         |

## 开发和部署

### 本地开发设置

```bash
npm install        # 安装依赖
npm run dev        # 启动开发服务器（后端）
npm run dev:web    # 启动Vite开发服务器（前端）
```

### 构建和部署

```bash
npm run build      # 构建生产版本
npm start          # 启动生产服务器
```

### 环境要求

- Node.js >= 20.19.0
- Claude CLI已安装（通过claude-code包）
- 可选：GOOGLE_API_KEY用于语音功能

## Slash Command增强 - 影响分析

### 需要修改的文件

基于需求"添加slash command能力"：

1. **新增slash命令解析服务**
   - `src/services/slash-command-parser.ts` (新建)
   - 解析命令语法，转换为Claude参数

2. **修改进程管理器**
   - `src/services/claude-process-manager.ts:647-710`
   - 在buildStartArgs中集成命令解析

3. **增强前端命令列表**
   - `src/web/chat/components/Composer/Composer.tsx`
   - 添加完整命令列表和说明

4. **更新路由处理**
   - `src/routes/conversation.routes.ts`
   - 预处理slash命令

### 集成考虑

- 必须遵循现有JSONL流格式
- 保持SSE事件结构兼容
- 命令解析不能阻塞主流程

## 附录 - 常用命令和脚本

### 常用命令

```bash
npm run dev         # 开发模式
npm test            # 运行测试
npm run lint        # 代码检查
npm run typecheck   # 类型检查
```

### 调试

- 日志：使用pino logger，查看`LOG_LEVEL`环境变量
- 调试模式：设置`NODE_ENV=development`
- Chrome DevTools：前端React组件调试

---

*文档生成于 2025-01-11 by Winston (Architect)*