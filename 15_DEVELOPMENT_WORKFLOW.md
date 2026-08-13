# CF-Workers-SUB-Next V2

# Development Workflow Specification

版本：V2.0

---

# 1. 文档目的

本文定义：

CF-Workers-SUB-Next V2 的开发流程。

适用于：

- AI Coding Agent
- Human Developer
- Maintainer


---

目标：

保证：

- 开发过程可控
- 架构稳定
- 修改可追踪
- 问题容易定位


---

# 2. 核心开发原则


## Principle 1

先设计，后编码。


禁止：

直接开始大量生成代码。


---

## Principle 2

小步提交。


每次修改：

必须：

可运行。


---

## Principle 3

测试驱动。


新增功能：

必须：

同时添加测试。


---

## Principle 4

文档优先。


代码变化：

必须同步更新文档。


---

# 3. Development Phase


整个项目分为：


```text id="sp4tqs"
Phase 0

Project Understanding


        ↓


Phase 1

Foundation


        ↓


Phase 2

Core Backend


        ↓


Phase 3

Parser


        ↓


Phase 4

Generator


        ↓


Phase 5

Frontend


        ↓


Phase 6

Security


        ↓


Phase 7

Testing


        ↓


Phase 8

Release

```

---

# 4. Phase 0 - Project Understanding


目标：

AI Agent 必须先理解项目。


必须阅读：


```text id="0qdzqv"
README

PRD

Architecture

API Spec

Data Model

Security

```

---

输出：

Project Understanding Report。


包含：

- 当前架构理解
- 模块关系
- 开发计划


---

禁止：

阅读几个文件后立即编码。


---

# 5. Phase 1 - Foundation


目标：

建立项目骨架。


任务：

创建：

```text id="o3hx3g"
src/

tests/

docs/

config/

```

---

完成：

- TypeScript 配置
- Wrangler 配置
- Test Framework


---

验收：

```text id="cmr6qh"
npm install

npm test

npm run build

```

必须成功。


---

# 6. Phase 2 - Core Backend


开发：

基础服务。


顺序：

```text id="u5dyq4"
Storage Layer

        ↓

Authentication

        ↓

API Router

        ↓

Service Layer

```

---

禁止：

Controller 直接访问 KV。


---

# 7. Phase 3 - Parser Development


严格按照：

08_PARSER_SPEC.md


开发。


顺序：

```text id="08k7x5"
Decoder

↓

Detector

↓

VMess

↓

VLESS

↓

Trojan

↓

Shadowsocks

↓

Normalizer

```

---

每完成一个 Parser：

必须：

添加测试。


---

# 8. Phase 4 - Generator Development


按照：

09_CONFIG_GENERATOR_SPEC.md


开发。


顺序：

```text id="s6nqjm"
Node Model

↓

Mihomo Generator

↓

Sing-box Generator

↓

Validator

```

---

必须：

使用真实客户端验证。


---

# 9. Phase 5 - Frontend Development


按照：

10_FRONTEND_SPEC.md


开发。


顺序：

```text id="1j4u6p"
Login

↓

Dashboard

↓

Subscription

↓

Nodes

↓

Output

```

---

禁止：

前端实现业务逻辑。


---

# 10. Phase 6 - Security Review


按照：

11_SECURITY.md


检查：


包括：

- SSRF
- XSS
- Authentication
- Secrets
- Rate Limit


---

输出：

Security Review Report。


---

# 11. Phase 7 - Testing


按照：

13_TEST_PLAN.md


执行：


```text id="j7nqax"
Unit Test

↓

Integration Test

↓

E2E Test

↓

Deployment Test

```

---

失败：

不得进入 Release。


---

# 12. Phase 8 - Release


发布前：

必须：


检查：

```text id="q2gihx"
Acceptance Checklist

```

---

生成：

Release Notes。


---

# 13. Git Workflow


采用：

GitHub Flow。


---

分支：


main：

生产代码。


---

feature：

功能开发。


例如：

```text id="e1m8ul"
feature/parser-vmess
```

---

fix：

Bug 修复。


例如：

```text id="q7kz9q"
fix/parser-error
```

---

# 14. Commit Convention


采用：

Conventional Commits。


格式：

```text id="7rkl47"
type(scope): message
```


---

类型：

|类型|用途|
|-|-|
|feat|新增功能|
|fix|Bug 修复|
|docs|文档|
|test|测试|
|refactor|重构|
|chore|维护|

---

示例：

```text id="gxg6mo"
feat(parser): add vless parser
```


---

# 15. Pull Request Rules


PR 必须包含：

- 修改说明
- 测试结果
- 影响范围


---

禁止：

大规模：

一次性提交全部代码。


---

# 16. AI Agent Coding Rules


Hermes 必须遵守：


## Rule 1


修改前：

说明计划。


---

## Rule 2


不要猜测。


遇到：

不明确需求：

提出问题。


---

## Rule 3


一次只修改：

一个模块。


---

## Rule 4


修改后：

运行测试。


---

## Rule 5


发现架构问题：

创建 ADR。


---

# 17. Architecture Decision Record


目录：

```text id="ynl2nr"
docs/adr/
```


格式：

```text id="mq2n4q"
ADR-001-title.md
```


---

包含：

```text id="psrjvz"
Context

Decision

Reason

Impact

```

---

# 18. Debug Workflow


遇到 Bug：


禁止：

立即修改代码。


流程：


```text id="c5qj5w"
Reproduce

↓

Collect Logs

↓

Find Root Cause

↓

Create Test

↓

Fix

↓

Verify

```

---

# 19. Documentation Update


任何：

API变化

数据变化

架构变化


必须更新：

对应 Markdown。


---

# 20. Completion Criteria


一个任务完成：

必须：

```text id="f5t9zv"
Code Complete

+

Test Complete

+

Documentation Complete

+

Review Complete

```

---

# END