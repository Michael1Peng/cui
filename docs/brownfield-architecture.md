# CUI (Common Agent UI) 完整系统架构文档

## 简介

本文档记录CUI代码库的**完整系统架构现状**，包括所有组件、服务、技术栈、架构决策和实际实现模式。CUI是基于Claude Code的Web UI Agent平台，为AI对话提供浏览器界面和增强功能。

### 文档范围

完整系统架构文档，覆盖前端、后端、服务层、集成点和开发工具链。

### 变更日志

| 日期       | 版本 | 描述                     | 作者     |
| ---------- | ---- | ------------------------ | -------- |
| 2025-01-11 | 2.0  | 完整系统架构文档         | Winston  |
| 2025-01-11 | 1.0  | 初始slash command分析    | Winston  |

## 快速参考 - 核心文件和入口点

### 理解系统的关键文件

- **后端主入口**: `src/server.ts` - Express服务器启动
- **核心服务类**: `src/cui-server.ts` - CUI服务器主类（26KB，726行）
- **进程管理器**: `src/services/claude-process-manager.ts` - Claude CLI进程管理（核心）
- **流管理器**: `src/services/stream-manager.ts` - SSE流连接管理
- **前端入口**: `src/web/main.tsx` - React应用挂载点
- **聊天应用**: `src/web/chat/ChatApp.tsx` - 主聊天界面组件
- **消息输入**: `src/web/chat/components/Composer/Composer.tsx` - 输入组件（含slash/at命令）
- **配置管理**: `src/services/config-service.ts` - 配置持久化
- **会话存储**: `src/services/session-info-service.ts` - SQLite会话元数据

## 高层架构

### 系统架构概览

```
┌─────────────────────────────────────────────────────┐
│                    浏览器层                          │
│  ┌─────────────┐  ┌─────────────┐  ┌──────────┐   │
│  │  React SPA  │  │   PWA支持    │  │ 通知API  │   │
│  └──────┬──────┘  └──────┬──────┘  └────┬─────┘   │
│         │                 │               │         │
└─────────┼─────────────────┼───────────────┼─────────┘
          │                 │               │
     HTTP/SSE          Service Worker   Web Push
          │                 │               │
┌─────────┼─────────────────┼───────────────┼─────────┐
│         ▼                 ▼               ▼         │
│  ┌──────────────────────────────────────────────┐  │
│  │            Express服务器 (端口9000)            │  │
│  ├──────────────────────────────────────────────┤  │
│  │  路由层: /api/*, /streaming/*, /mcp/*        │  │
│  ├──────────────────────────────────────────────┤  │
│  │  中间件: Auth, CORS, Logger, Error Handler   │  │
│  └──────────────┬──────────────────────┬────────┘  │
│                  │                      │           │
│         服务层架构                MCP Server        │
│                  │                      │           │
│  ┌───────────────▼──────────────────────▼────────┐  │
│  │  ┌─────────────────┐  ┌──────────────────┐   │  │
│  │  │ ProcessManager  │  │  StreamManager   │   │  │
│  │  └────────┬────────┘  └────────┬─────────┘   │  │
│  │           │                     │             │  │
│  │  ┌────────▼────────┐  ┌────────▼─────────┐   │  │
│  │  │ SessionService  │  │ StatusManager    │   │  │
│  │  └────────┬────────┘  └────────┬─────────┘   │  │
│  │           │                     │             │  │
│  │  ┌────────▼────────────────────▼─────────┐   │  │
│  │  │        SQLite Database                 │   │  │
│  │  │   (~/.cui/session-info.db)            │   │  │
│  │  └────────────────────────────────────────┘   │  │
│  └───────────────────────────────────────────────┘  │
│                          │                           │
│                     子进程通信                        │
│                          │                           │
└──────────────────────────┼───────────────────────────┘
                          ▼
              ┌─────────────────────┐
              │    Claude CLI        │
              │  (claude-code包)     │
              └─────────────────────┘
```

### 实际技术栈（从package.json）

| 类别         | 技术              | 版本      | 用途说明                        |
| ------------ | ----------------- | --------- | ------------------------------- |
| **运行时**   | Node.js           | >=20.19   | 服务器运行环境                  |
| **后端框架** | Express           | 4.18.2    | HTTP服务器和路由                |
| **前端框架** | React             | 18.2.0    | 用户界面组件化                  |
| **样式**     | TailwindCSS       | 4.1.11    | 原子化CSS框架                   |
| **UI组件**   | Radix UI          | 多个组件  | 无样式可访问组件库              |
| **构建工具** | Vite              | 7.0.6     | 前端快速构建和HMR               |
| **语言**     | TypeScript        | 5.3.3     | 类型安全                        |
| **数据库**   | better-sqlite3    | 12.2.0    | 本地会话信息存储                |
| **测试**     | Vitest            | 3.2.4     | 单元和集成测试框架              |
| **AI SDK**   | @anthropic-ai/sdk | 0.54.0    | Anthropic API交互               |
| **Claude**   | claude-code       | 1.0.70    | Claude CLI包装                  |
| **MCP**      | @mcp/sdk          | 1.17.0    | Model Context Protocol支持      |
| **语音**     | @google/genai     | 1.11.0    | Gemini语音转文字                |
| **通知**     | web-push          | 3.6.7     | 浏览器推送通知                  |
| **进程通信** | Node child_process| 内置      | 与Claude CLI通信                |
| **日志**     | pino              | 8.17.1    | 结构化日志                      |
| **代码高亮** | prismjs           | 1.30.0    | 语法高亮显示                    |

## 源码树和模块组织

### 项目结构（实际）

```text
cui/
├── src/                      # 源代码根目录
│   ├── services/             # 核心业务逻辑服务（23个服务）
│   │   ├── claude-process-manager.ts    # Claude进程生命周期管理
│   │   ├── stream-manager.ts            # SSE流多客户端管理
│   │   ├── session-info-service.ts      # SQLite会话持久化
│   │   ├── config-service.ts            # 配置文件管理
│   │   ├── claude-history-reader.ts     # 历史记录读取
│   │   ├── conversation-status-manager.ts # 会话状态跟踪
│   │   ├── permission-tracker.ts        # 权限请求处理
│   │   ├── notification-service.ts      # 通知发送（ntfy/web-push）
│   │   ├── gemini-service.ts            # 语音转文字
│   │   ├── file-system-service.ts       # 文件系统操作
│   │   ├── working-directories-service.ts # 工作目录管理
│   │   ├── ToolMetricsService.ts        # 工具使用统计
│   │   ├── mcp-config-generator.ts      # MCP配置生成
│   │   ├── claude-router-service.ts     # Claude路由器模式
│   │   ├── conversation-cache.ts        # 会话缓存
│   │   ├── json-lines-parser.ts         # JSONL解析器
│   │   ├── log-formatter.ts             # 日志格式化
│   │   ├── log-stream-buffer.ts         # 日志流缓冲
│   │   ├── logger.ts                    # Pino日志封装
│   │   ├── message-filter.ts            # 消息过滤器
│   │   ├── web-push-service.ts          # Web推送实现
│   │   └── commands-service.ts          # 命令处理（未完成）
│   ├── routes/               # HTTP路由定义（11个路由模块）
│   │   ├── conversation.routes.ts       # 会话管理API
│   │   ├── streaming.routes.ts          # SSE流端点
│   │   ├── config.routes.ts             # 配置管理API
│   │   ├── permission.routes.ts         # 权限处理API
│   │   ├── filesystem.routes.ts         # 文件系统API
│   │   ├── system.routes.ts             # 系统信息API
│   │   ├── log.routes.ts                # 日志查看API
│   │   ├── notifications.routes.ts      # 通知设置API
│   │   ├── gemini.routes.ts             # 语音API
│   │   └── working-directories.routes.ts # 工作目录API
│   ├── middleware/           # Express中间件
│   │   ├── auth.ts                      # Token认证
│   │   ├── cors-setup.ts                # CORS配置
│   │   ├── error-handler.ts             # 错误处理
│   │   ├── query-parser.ts              # 查询参数解析
│   │   └── request-logger.ts            # 请求日志
│   ├── web/                  # 前端React应用
│   │   ├── chat/             # 聊天界面
│   │   │   ├── components/   # React组件
│   │   │   │   ├── Composer/            # 输入框（含slash/at命令）
│   │   │   │   ├── MessageList/         # 消息列表
│   │   │   │   ├── ConversationView/    # 会话视图
│   │   │   │   ├── ToolRendering/       # 工具渲染器
│   │   │   │   ├── PermissionDialog/    # 权限对话框
│   │   │   │   ├── PreferencesModal/    # 偏好设置
│   │   │   │   └── ui/                  # Radix UI组件封装
│   │   │   ├── hooks/        # React Hooks
│   │   │   ├── contexts/     # React Contexts
│   │   │   ├── services/     # 前端服务
│   │   │   └── utils/        # 工具函数
│   │   ├── inspector/        # 日志检查器应用
│   │   └── components/       # 共享组件
│   ├── mcp-server/          # MCP服务器实现
│   ├── types/               # TypeScript类型定义
│   ├── utils/               # 通用工具函数
│   ├── cui-server.ts        # 服务器主类
│   ├── server.ts            # 入口文件
│   └── cli-parser.ts        # 命令行解析
├── tests/                   # 测试文件
│   ├── unit/                # 单元测试（31个测试文件）
│   ├── integration/         # 集成测试（4个测试文件）
│   ├── __mocks__/           # Mock Claude CLI
│   └── setup.ts             # 测试配置
├── config/                  # 配置文件
├── public/                  # 静态资源
├── dist/                    # 构建输出
└── scripts/                 # 脚本文件
```

### 核心模块详解

#### 1. 进程管理层（ClaudeProcessManager）

**文件**: `src/services/claude-process-manager.ts`
**职责**: 管理Claude CLI子进程的完整生命周期
**关键功能**:
- `startConversation()`: 启动新会话，spawn Claude进程
- `buildStartArgs()`: 构建CLI命令行参数
- `handleStreamMessage()`: 处理JSONL流消息
- `resumeConversation()`: 恢复历史会话
- `stopConversation()`: 终止进程

**技术债务**: 
- stdin设为'inherit'，无法运行时发送消息
- 所有输入必须通过命令行参数传递

#### 2. 流管理层（StreamManager）

**文件**: `src/services/stream-manager.ts`
**职责**: 管理多客户端SSE连接
**关键功能**:
- 维护客户端连接池（Map<streamingId, Set<Response>>）
- 广播消息到所有连接客户端
- 心跳机制（30秒间隔）
- 连接生命周期管理

#### 3. 会话持久化（SessionInfoService）

**文件**: `src/services/session-info-service.ts`
**职责**: SQLite数据库管理会话元数据
**数据库路径**: `~/.cui/session-info.db`
**表结构**:
- sessions表：存储会话信息
- metadata表：存储键值对元数据
**关键功能**:
- CRUD操作的预编译语句
- WAL模式优化并发
- 会话归档和固定功能

#### 4. 配置管理（ConfigService）

**文件**: `src/services/config-service.ts`
**配置路径**: `~/.cui/config.json`
**配置结构**:
```json
{
  "machine_id": "生成的机器ID",
  "interface": {
    "colorScheme": "light|dark|auto",
    "language": "en|zh",
    "notifications": {
      "enabled": true,
      "ntfyUrl": "https://ntfy.sh"
    }
  },
  "router": {
    "enabled": false,
    "model": "claude-3-5-sonnet-20241022"
  }
}
```

## 数据流和通信机制

### 1. 会话启动流程

```
用户输入 ──POST /api/conversation/start──> Express服务器
                                              │
                                              ▼
                                    ClaudeProcessManager
                                              │
                                    ┌─────────┴─────────┐
                                    ▼                   ▼
                              buildStartArgs()    spawn(claude)
                                    │                   │
                                    ▼                   ▼
                              CLI参数构建          子进程创建
                                                        │
                                                        ▼
                                                  JSONL输出流
                                                        │
                                                        ▼
                                              JsonLinesParser
                                                        │
                                                        ▼
                                              StreamManager
                                                        │
                                                        ▼
                                                   SSE广播
                                                        │
                                                        ▼
                                                    浏览器
```

### 2. 消息类型和格式

#### JSONL流消息类型
- `system:init`: 初始化信息（工具、模型、权限模式）
- `assistant`: AI响应消息
- `user`: 用户输入消息
- `result`: 会话结果（成功/错误）

#### SSE事件格式
```javascript
data: {
  "type": "assistant",
  "message": { /* Anthropic.Message */ },
  "session_id": "xxx",
  "streaming_id": "yyy"
}
```

### 3. 权限处理流程

```
Claude请求工具使用 ──> PermissionTracker检测
                            │
                            ▼
                    创建PermissionRequest
                            │
                    ┌───────┴───────┐
                    ▼               ▼
              发送通知        显示权限对话框
                    │               │
                    ▼               ▼
              ntfy/web-push    用户批准/拒绝
                                    │
                                    ▼
                            更新请求状态
```

## 前端架构

### React组件层次

```
App.tsx
└── ChatApp.tsx
    ├── ConversationView.tsx
    │   ├── ConversationHeader.tsx
    │   ├── MessageList.tsx
    │   │   └── MessageItem.tsx
    │   │       └── ToolUseRenderer.tsx
    │   └── Composer.tsx
    │       ├── 文本输入区
    │       ├── @文件选择器
    │       └── /命令自动完成
    └── PreferencesModal.tsx
        ├── 通知设置
        └── 模型选择
```

### 状态管理

- **PreferencesContext**: 用户偏好设置（主题、语言、通知）
- **ConversationsContext**: 会话列表和当前会话
- **StreamStatusContext**: 流连接状态
- **localStorage**: 持久化用户设置

### 关键Hooks

- `useStreaming`: SSE流连接管理
- `useConversationMessages`: 消息列表管理
- `useAudioRecording`: 语音录制功能
- `useTheme`: 主题切换
- `usePreferences`: 偏好设置

## API端点详解

### 会话管理

| 端点                           | 方法   | 功能                |
| ------------------------------ | ------ | ------------------- |
| `/api/conversation/start`      | POST   | 启动新会话          |
| `/api/conversation/resume`     | POST   | 恢复会话            |
| `/api/conversation/stop`       | POST   | 停止会话            |
| `/api/conversation/list`       | GET    | 列出会话            |
| `/api/conversation/:id`        | GET    | 获取会话详情        |
| `/api/conversation/:id`        | PUT    | 更新会话信息        |
| `/api/conversation/:id`        | DELETE | 删除会话            |

### 流式传输

| 端点                      | 方法 | 功能           |
| ------------------------- | ---- | -------------- |
| `/streaming/:streamingId` | GET  | SSE事件流连接  |

### 系统和配置

| 端点                     | 方法    | 功能           |
| ------------------------ | ------- | -------------- |
| `/api/system/info`       | GET     | 系统信息       |
| `/api/config`            | GET/PUT | 配置管理       |
| `/api/config/interface`  | GET/PUT | 界面配置       |

## 技术债务和已知问题

### 关键技术债务

1. **进程通信限制**
   - 位置：`claude-process-manager.ts:791-795`
   - 问题：stdin设为'inherit'，无法运行时发送消息
   - 影响：无法实现交互式功能，如动态slash命令

2. **命令服务未完成**
   - 位置：`commands-service.ts`
   - 问题：服务存在但未集成到系统
   - 影响：slash命令功能不完整

3. **配置系统复杂**
   - 位置：配置管理分散
   - 问题：配置和偏好设置分离（见CONFIG_SIMPLIFICATION_TODO.md）
   - 计划：合并为单一配置文件

4. **测试覆盖不足**
   - 当前：约60%单元测试覆盖率
   - 缺失：E2E测试，集成测试较少

### 架构限制

1. **单向通信**：只能通过命令行参数传递输入
2. **会话隔离**：每个会话独立进程，无法共享上下文
3. **权限模式固定**：启动后无法修改权限设置
4. **模型切换需重启**：更换模型需要新会话

### 性能考虑

1. **进程开销**：每个会话spawn新进程
2. **内存使用**：长会话可能累积大量消息
3. **SQLite限制**：单机数据库，无法分布式
4. **SSE连接**：长连接可能超时，需要心跳维持

## 集成点和外部依赖

### 外部服务集成

| 服务         | 用途         | 集成方式      | 关键文件                     |
| ------------ | ------------ | ------------- | ---------------------------- |
| Claude CLI   | AI处理       | 子进程        | `claude-process-manager.ts`  |
| Claude API   | 路由器模式   | HTTP API      | `claude-router-service.ts`   |
| Gemini API   | 语音转文字   | REST API      | `gemini-service.ts`          |
| ntfy.sh      | 推送通知     | HTTP POST     | `notification-service.ts`    |
| Web Push API | 浏览器通知   | Service Worker| `web-push-service.ts`        |

### MCP（Model Context Protocol）支持

- **MCP服务器**: `src/mcp-server/index.ts`
- **配置生成**: `mcp-config-generator.ts`
- **工具发现**: 动态检测可用MCP工具
- **权限控制**: 集成到权限系统

## 开发和部署

### 本地开发设置

```bash
# 安装依赖
npm install

# 开发模式（后端）
npm run dev

# 开发模式（前端）
npm run dev:web

# 运行测试
npm test

# 类型检查
npm run typecheck

# 代码检查
npm run lint
```

### 构建流程

```bash
# 生产构建
npm run build
# 执行步骤：
# 1. 清理dist目录
# 2. Vite构建前端
# 3. TypeScript编译
# 4. 路径别名解析
# 5. 设置MCP权限

# 启动生产服务器
npm start
```

### 环境变量

| 变量              | 说明              | 默认值       |
| ----------------- | ----------------- | ------------ |
| NODE_ENV          | 运行环境          | production   |
| PORT              | 服务器端口        | 9000         |
| HOST              | 绑定地址          | localhost    |
| LOG_LEVEL         | 日志级别          | info         |
| GOOGLE_API_KEY    | Gemini API密钥    | （可选）     |
| AUTH_TOKEN        | 认证令牌          | （可选）     |

### 部署注意事项

1. **Node版本**: 需要>=20.19.0
2. **Claude CLI**: 必须安装claude-code包
3. **权限**: 需要文件系统读写权限
4. **端口**: 默认9000，可通过环境变量修改
5. **数据持久化**: SQLite数据库在`~/.cui/`

## 安全考虑

### 认证机制

- **Token认证**: 可选的Bearer token认证
- **中间件**: `src/middleware/auth.ts`
- **配置**: 通过AUTH_TOKEN环境变量或配置文件

### 权限控制

- **工具权限**: 控制Claude可用工具
- **文件访问**: 限制工作目录访问
- **权限模式**: plan/bypassPermissions/acceptEdits/default

### 数据安全

- **本地存储**: 所有数据本地存储
- **会话隔离**: 会话间数据隔离
- **敏感信息**: API密钥等不记录日志

## 监控和调试

### 日志系统

- **框架**: Pino结构化日志
- **级别**: trace/debug/info/warn/error/fatal
- **格式**: JSON格式，支持pretty打印
- **查看**: `/api/logs`端点或Inspector应用

### 调试工具

1. **Inspector应用**: `/inspector`路径，实时日志查看
2. **Chrome DevTools**: React组件调试
3. **环境变量**: LOG_LEVEL=debug详细日志
4. **测试模式**: NODE_ENV=test禁用日志

### 性能监控

- **工具使用统计**: ToolMetricsService跟踪
- **会话时长**: SessionInfo记录
- **Token使用**: 结果消息包含使用量

## 未来改进方向

### 短期改进

1. 完成slash命令集成
2. 简化配置系统（合并配置文件）
3. 提高测试覆盖率到80%+
4. 优化错误处理和恢复

### 中期目标

1. 实现双向进程通信
2. 添加会话导出/导入功能
3. 支持多模型并行对话
4. 增强MCP工具集成

### 长期愿景

1. 分布式架构支持
2. 插件系统架构
3. 多用户协作功能
4. AI agent编排能力

## 附录

### 常用命令

```bash
# 开发
npm run dev              # 后端开发服务器
npm run dev:web          # 前端开发服务器

# 测试
npm test                 # 运行所有测试
npm run unit-tests       # 仅单元测试
npm run integration-tests # 仅集成测试
npm run test:coverage    # 覆盖率报告

# 构建
npm run build            # 生产构建
npm run typecheck        # 类型检查
npm run lint             # 代码检查

# 生产
npm start                # 启动生产服务器
```

### 项目统计

- **服务模块**: 23个
- **路由模块**: 11个
- **React组件**: 50+个
- **测试文件**: 35个
- **代码行数**: ~15,000行（不含node_modules）
- **依赖包**: 96个（含dev依赖）

### 相关文档

- [CONFIG_SIMPLIFICATION_TODO.md](../CONFIG_SIMPLIFICATION_TODO.md) - 配置简化计划
- [CLAUDE.md](../CLAUDE.md) - 测试架构说明
- [贡献指南](CONTRIBUTING.md)
- [行为准则](CODE_OF_CONDUCT.md)

---

*文档生成于 2025-01-11 by Winston (System Architect)*
*版本 2.0 - 完整系统架构文档*
