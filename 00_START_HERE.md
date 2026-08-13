# CF-Workers-SUB-Next V2

## 项目入口文档

版本：V2.0  
项目类型：开源 Cloudflare Workers 应用  
开发模式：Spec-Driven Development（规格驱动开发）

---

# 1. 项目简介

CF-Workers-SUB-Next V2 是一个运行于 Cloudflare Workers 平台上的开源代理订阅管理与配置生成系统。

项目目标：

让用户可以通过简单的 Web 管理界面：

- 添加代理订阅
- 管理节点
- 处理节点信息
- 应用过滤规则
- 自动生成代理客户端配置

支持：

- Mihomo
- OpenClash
- Clash Meta
- Sing-box

最终生成标准化订阅链接。

---

# 2. 项目定位

本项目不是：

- 单纯订阅转换脚本
- 节点测速工具
- 机场管理平台
- VPN 服务

本项目定位：

> 一个运行在 Cloudflare Edge 网络上的代理配置管理和转换平台。

---

# 3. 目标用户

目标：

公开开源项目。

用户包括：

## 普通用户

需求：

- 不懂代码
- 不懂服务器
- 希望快速生成配置

## 高级用户

需求：

- 自定义规则
- 自定义过滤
- 自定义配置模板

## 开发者

需求：

- 二次开发
- 提交 Issue
- 提交 Pull Request

---

# 4. 核心设计原则

## 原则 1：Cloudflare First

项目必须运行于：

- Cloudflare Workers
- Cloudflare KV
- Cloudflare Secrets

不支持：

- Docker 部署
- VPS 后端
- 本地数据库

---

## 原则 2：Edge Compatible

代码必须符合 Cloudflare Workers Runtime。

禁止依赖：

- Node.js filesystem
- TCP socket
- 长时间进程
- 本地缓存文件

---

## 原则 3：模块化设计

系统必须拆分：

```
Fetcher
    ↓
Parser
    ↓
Normalizer
    ↓
Rule Engine
    ↓
Generator
    ↓
API
    ↓
Web UI
```

每个模块：

- 独立
- 可测试
- 可替换

---

# 5. Hermes 开发流程

Hermes Agent 开发本项目时必须遵守：

## 阶段 1：理解

必须先阅读：

```
00_START_HERE.md
01_PRD.md
02_SCOPE.md
04_ARCHITECTURE.md
05_TECHNICAL_SPECIFICATION.md
```

禁止立即编码。

---

## 阶段 2：设计

必须输出：

- Architecture Review
- Implementation Plan
- Task Breakdown
- Risk Analysis

等待确认后进入开发。

---

## 阶段 3：实现

采用：

```
Milestone
    ↓
Task
    ↓
Implementation
    ↓
Test
    ↓
Review
    ↓
Commit
```

---

## 阶段 4：验证

每个功能必须：

- 有测试
- 有验收标准
- 有 Git Commit

---

# 6. 项目主要功能范围

## 第一版本必须实现

### 订阅管理

支持：

- 添加订阅 URL
- 删除订阅
- 更新订阅
- 查看状态


---

### 节点解析

支持：

- VMess
- VLESS
- Trojan
- Shadowsocks


---

### 节点标准化

所有节点转换为统一内部模型：

```
Node
 ├── name
 ├── server
 ├── port
 ├── protocol
 ├── tls
 ├── transport
 └── metadata
```

---

### 配置生成

输出：

- Mihomo YAML
- Sing-box JSON


---

### Web 管理界面

提供：

- 登录
- 订阅管理
- 节点查看
- 配置生成


---

# 7. 明确不属于 V1 的功能

以下功能暂不开发：

- 节点真实测速
- 自动选择最快节点
- AI 推荐节点
- 支付系统
- 用户商城
- 多租户 SaaS
- 节点共享平台


---

# 8. 项目文件阅读顺序

Hermes 必须按照：

```
00_START_HERE.md
        ↓
01_PRD.md
        ↓
02_SCOPE.md
        ↓
03_USER_STORIES.md
        ↓
04_ARCHITECTURE.md
        ↓
05_TECHNICAL_SPECIFICATION.md
        ↓
06_DATA_MODEL.md
        ↓
07_API_SPECIFICATION.md
        ↓
08_PARSER_SPEC.md
        ↓
09_CONFIG_GENERATOR.md
        ↓
10_FRONTEND_SPEC.md
        ↓
11_SECURITY.md
        ↓
12_CLOUDFLARE.md
        ↓
13_TEST_PLAN.md
        ↓
14_ACCEPTANCE.md
        ↓
15_MILESTONES.md
        ↓
16_CODING_RULES.md
        ↓
17_AI_RULES.md
        ↓
18_GIT_WORKFLOW.md
```

---

# 9. 成功标准

项目完成标准：

不是：

“代码可以运行。”

而是：

```
需求满足
+
架构合理
+
测试通过
+
文档完整
+
部署成功
+
新用户可以使用
```

---

# 10. Hermes 最终角色

Hermes 在本项目中的角色：

不是：

“代码生成工具”。

而是：

> 项目技术负责人（Lead Developer）。

职责：

- 理解需求
- 设计架构
- 编写代码
- 编写测试
- 修复问题
- 维护文档
- 保证质量

任何重大架构变化必须先提出：

Architecture Change Proposal。

未经确认，不允许直接修改核心设计。

---

# END