对于 CF-Workers-SUB-Next 这种项目（Cloudflare Workers + TypeScript + Web + GitHub）
# Hermes 开发 CF-Workers-SUB-Next 必装 Skills 与配置清单

版本：V1.0

---

# 一、核心 Skill（必须）

## 1. GitHub Skill ⭐⭐⭐⭐⭐

优先级：

★★★★★ 必装

用途：

让 Hermes 具备真实软件开发流程：

* 创建仓库
* 创建分支
* Commit
* Pull Request
* Issue 管理
* Code Review

对应项目：

所有阶段。

必须能力：

```
Repository Management

Branch Management

Commit

Pull Request

Review

Issue Tracking
```

建议：

安装官方 GitHub Skill。

---

## 2. Git Skill ⭐⭐⭐⭐⭐

优先级：

★★★★★

虽然 GitHub Skill 管理远程仓库，但是本地开发仍然需要 Git。

必须支持：

```bash
git status

git diff

git add

git commit

git branch

git log
```

原因：

AI 最大的问题之一：

修改失控。

Git 可以让 Hermes：

* 小步提交
* 回滚
* 比较变化

---

# 3. Cloudflare Skill ⭐⭐⭐⭐⭐

优先级：

★★★★★

这是本项目最关键。

Hermes 必须懂：

## Workers

包括：

* wrangler
* deploy
* dev

## KV

包括：

* namespace
* binding
* migration

## Secrets

包括：

* secret put
* secret list

## Pages（如果未来使用）

---

需要能力：

```bash
wrangler dev

wrangler deploy

wrangler kv namespace create

wrangler secret put

```

---

如果 Hermes 没有 Cloudflare Skill：

很容易出现：

“代码完成，但是部署不了”。

---

# 4. TypeScript Skill ⭐⭐⭐⭐⭐

优先级：

★★★★★

项目核心语言。

必须支持：

* TypeScript strict
* Types
* Interface
* Generics
* Async
* Error Handling

重点：

让 Hermes 不写：

```typescript
any
```

大量垃圾代码。

---

# 5. Testing Skill ⭐⭐⭐⭐⭐

优先级：

★★★★★

必须。

对应：

13_TEST_PLAN.md

需要：

Vitest

能力：

```text
Create Test

Run Test

Analyze Failure

Improve Coverage

```

---

要求 Hermes 每次：

代码变化：

自动：

```
修改代码

↓

增加测试

↓

运行测试

↓

修复

```

---

# 二、强烈推荐 Skill

---

# 6. Cloudflare Security Skill ⭐⭐⭐⭐

优先级：

★★★★

因为这个项目有：

用户输入 URL。

最大风险：

SSRF。

需要：

安全审查能力。

覆盖：

## SSRF

例如：

禁止：

```
http://127.0.0.1

http://192.168.x.x
```

---

## XSS

检查：

节点名称。

---

## Secrets

检查：

API Key。

---

# 7. Web Security Skill ⭐⭐⭐⭐

用途：

Web 安全。

包括：

* Authentication
* Session
* Cookie
* CSRF
* Input Validation

对应：

11_SECURITY.md

---

# 8. YAML / JSON Skill ⭐⭐⭐⭐

非常重要。

因为项目输出：

Mihomo YAML

Sing-box JSON

Hermes 必须：

理解：

YAML Schema

JSON Schema

并能验证：

```yaml
是否合法
```

---

# 9. Frontend Skill ⭐⭐⭐⭐

如果 Hermes 开发 UI。

需要：

React / Vue / Svelte 之一。

建议：

如果没有特殊要求：

推荐：

```
React + TypeScript
```

能力：

* Components
* State
* API Client
* Form Validation

---

# 10. Documentation Skill ⭐⭐⭐⭐

很重要。

因为你的测试目标是：

看 Hermes 是否像工程团队。

需要：

自动维护：

```
README.md

CHANGELOG.md

ADR

API Docs

```

---

# 三、项目管理 Skill

---

# 11. Project Planner Skill ⭐⭐⭐⭐⭐

优先级：

★★★★★

非常推荐。

作用：

读取：

18_PROJECT_TASK_BREAKDOWN.md

自动：

拆任务。

输出：

```
Task

Estimate

Dependency

Status

```

---

# 12. Code Review Skill ⭐⭐⭐⭐⭐

优先级：

★★★★★

让 Hermes 自己审查。

检查：

* 架构
* 安全
* 性能
* 重复代码

---

# 四、MCP 工具建议

如果 Hermes 支持 MCP：

推荐配置：

---

# 必装 MCP

## 1. GitHub MCP

用途：

仓库管理。

---

## 2. Filesystem MCP

用途：

访问：

```
src

docs

tests

```

---

## 3. Shell MCP

用途：

执行：

```
npm

git

wrangler

```

---

## 4. Browser MCP

用途：

测试：

Web UI。

例如：

登录：

Dashboard。

---

# 五、开发环境安装清单

Hermes 所在环境：

建议：

安装：

## Node.js

版本：

推荐：

```
Node.js 22 LTS
```

---

## npm

确认：

```bash
npm -v
```

---

## Git

确认：

```bash
git --version
```

---

## Wrangler

安装：

```bash
npm install -g wrangler
```

确认：

```bash
wrangler --version
```

---

## TypeScript

```bash
npm install -g typescript
```

---

# 六、推荐项目依赖

Hermes 初始化项目时：

建议：

安装：

---

## Framework

推荐：

```
Hono
```

原因：

Cloudflare Workers 原生友好。

---

## Testing

```
Vitest
```

---

## Validation

推荐：

```
Zod
```

用途：

API 输入验证。

---

## YAML

推荐：

```
yaml
```

用途：

Mihomo 配置生成。

---

## UUID

推荐：

```
uuid
```

---

## Security

推荐：

```
validator
```

---

# 七、Hermes 模型配置建议

如果 Hermes 支持多个模型角色：

建议：

---

## Main Coding Model

要求：

强代码能力。

推荐：

```
Claude Sonnet

GPT-5 系列

DeepSeek Coder

Qwen Coder

```

---

## Planning Model

要求：

长上下文。

用于：

阅读文档。

推荐：

```
Claude

Gemini

GPT
```

---

## Review Model

要求：

找 Bug。

推荐：

```
DeepSeek

Qwen

Claude
```

---

# 八、Hermes 工作模式建议

不要：

让 Hermes 一次执行：

```
Build entire project
```

应该：

使用：

## Sprint 模式

例如：

Sprint 1：

```
TASK 1.1

TASK 1.2

TASK 1.3
```

完成：

测试。

再进入：

Sprint 2。

---

# 九、推荐 Hermes 初始 System Prompt

给 Hermes：

```
You are the Lead Software Engineer.

You must follow all documents under /docs.

Do not generate code before understanding the architecture.

Execute tasks sequentially from 18_PROJECT_TASK_BREAKDOWN.md.

After every task:
1. Run tests.
2. Update documentation.
3. Report changes.

Never claim completion without verification.
```

---

# 十、最终 Hermes 能力矩阵

| 能力               | 重要程度  |
| ---------------- | ----- |
| GitHub           | ★★★★★ |
| Git              | ★★★★★ |
| Cloudflare       | ★★★★★ |
| TypeScript       | ★★★★★ |
| Testing          | ★★★★★ |
| Security         | ★★★★  |
| Frontend         | ★★★★  |
| Documentation    | ★★★★  |
| Project Planning | ★★★★★ |
| Code Review      | ★★★★★ |
| Browser Testing  | ★★★   |
| Database         | ★★    |


