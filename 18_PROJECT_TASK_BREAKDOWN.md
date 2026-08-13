# CF-Workers-SUB-Next V2

# Project Task Breakdown

版本：V2.0

---

# 1. Purpose

本文档定义：

CF-Workers-SUB-Next V2 的实际开发任务拆解。

目标：

将项目拆分为：

- Epic
- Milestone
- Task
- Sub Task


供：

- AI Agent
- Developer
- Maintainer

执行。

---

# 2. Development Rules


执行规则：

## Rule 1

必须按照顺序开发。


---

## Rule 2

前置任务未完成：

禁止开始后续任务。


---

## Rule 3

每个 Task 必须：

包含：

- Implementation
- Test
- Documentation


---

# 3. Project Timeline Overview


```text
Phase 1 Foundation

        ↓

Phase 2 Backend Core

        ↓

Phase 3 Parser Engine

        ↓

Phase 4 Generator

        ↓

Phase 5 Frontend

        ↓

Phase 6 Security

        ↓

Phase 7 Testing

        ↓

Phase 8 Release

```

---

# EPIC 1

# Project Foundation


目标：

建立基础工程。


---

## TASK 1.1

## Initialize Cloudflare Worker Project


工作：

创建：

```text
src/

package.json

wrangler.toml

tsconfig.json
```


---

验收：

```bash
npm install

npm run build
```

成功。


---

测试：

Build Test。


---

---

## TASK 1.2

## Configure Development Environment


工作：

配置：

- Wrangler
- Local Dev
- Environment Variables


---

验收：

本地：

```bash
wrangler dev
```

运行。


---

---

## TASK 1.3

## Setup Testing Framework


安装：

- Vitest


创建：

```text
tests/
```


---

验收：

测试：

```bash
npm test
```

运行。


---

---

## TASK 1.4

## Setup CI Pipeline


创建：

```text
.github/workflows/
```


包含：

- install
- test
- build


---

验收：

GitHub Actions 成功。


---

# EPIC 2

# Backend Core Architecture


目标：

建立后端基础。


---

# TASK 2.1

## Create Application Structure


创建：


```text
src/

├── api/

├── services/

├── repository/

├── models/

├── utils/

```

---

验收：

目录符合：

Architecture Spec。


---

# TASK 2.2

## Implement KV Storage Layer


实现：

Repository Pattern。


接口：

```typescript
get()

put()

delete()

```

---

验收：

KV 测试通过。


---

# TASK 2.3

## Implement Authentication


实现：

- Login
- Session
- Logout


---

验收：

未登录不能访问管理 API。


---

# TASK 2.4

## Implement API Router


建立：

```text
/api
```


---

完成：

Health API。


测试：

```text
GET /api/health
```


---

# EPIC 3

# Subscription System


目标：

管理订阅。


---

# TASK 3.1

## Subscription Model


创建：

Subscription Entity。


---

字段：

- id
- name
- url
- createdAt
- updatedAt


---

# TASK 3.2

## Subscription CRUD API


实现：

- Create
- Read
- Update
- Delete


---

测试：

API Test。


---

# TASK 3.3

## External Fetch Service


实现：

订阅抓取。


必须：

包含：

- Timeout
- Size Limit
- SSRF Check


---

# EPIC 4

# Parser Engine


目标：

解析节点。


---

# TASK 4.1

## Implement Decoder


支持：

- Base64
- URL Decode


---

测试：

Decoder Test。


---

# TASK 4.2

## Implement Protocol Detector


识别：

- VMess
- VLESS
- Trojan
- SS


---

# TASK 4.3

## Implement VMess Parser


完成：

字段：

- server
- port
- uuid
- tls
- transport


---

测试：

10 cases。


---

# TASK 4.4

## Implement VLESS Parser


支持：

- UUID
- TLS
- Reality
- WS
- gRPC


---

# TASK 4.5

## Implement Trojan Parser


支持：

- Password
- TLS
- SNI


---

# TASK 4.6

## Implement Shadowsocks Parser


支持：

- Method
- Password
- Plugin


---

# TASK 4.7

## Implement Normalizer


统一：

Node Model。


---

# EPIC 5

# Configuration Generator


目标：

输出客户端配置。


---

# TASK 5.1

## Mihomo Generator


生成：

YAML。


---

验证：

Mihomo 加载。


---

# TASK 5.2

## Sing-box Generator


生成：

JSON。


---

验证：

Sing-box Check。


---

# TASK 5.3

## Subscription Endpoint


实现：

```text
/sub/mihomo/token

/sub/singbox/token
```

---

# EPIC 6

# Frontend


目标：

用户界面。


---

# TASK 6.1

## Login Page


完成：

登录流程。


---

# TASK 6.2

## Dashboard


显示：

系统状态。


---

# TASK 6.3

## Subscription UI


完成：

- 添加
- 更新
- 删除


---

# TASK 6.4

## Node UI


显示节点。


---

# TASK 6.5

## Output UI


生成：

订阅链接。


---

# EPIC 7

# Security Hardening


目标：

安全上线。


---

# TASK 7.1

## SSRF Protection


测试：

- localhost
- private IP


---

# TASK 7.2

## XSS Protection


测试：

恶意节点名称。


---

# TASK 7.3

## Secret Management


检查：

无敏感信息提交。


---

# TASK 7.4

## Rate Limit


保护：

Login API。


---

# EPIC 8

# Testing


目标：

全面验证。


---

# TASK 8.1

## Unit Test


覆盖：

核心模块。


---

# TASK 8.2

## Integration Test


测试：

完整流程。


---

# TASK 8.3

## E2E Test


模拟用户。


---

# TASK 8.4

## Deployment Test


验证：

Cloudflare Production。


---

# EPIC 9

# Release


目标：

正式发布。


---

# TASK 9.1

## Documentation Review


检查：

所有 Markdown。


---

# TASK 9.2

## Release Build


执行：

```bash
npm run build
```


---

# TASK 9.3

## Production Deploy


执行：

```bash
wrangler deploy
```


---

# TASK 9.4

## Release Notes


生成：

CHANGELOG。


---

# 4. Task Status Format


每个任务：

使用：

```text
TODO

IN_PROGRESS

DONE

BLOCKED

```

---

# 5. AI Agent Execution Rules


Hermes 执行时：

必须：

1. 当前 Task 完成
2. 测试通过
3. 更新文档
4. 汇报结果

才进入下一 Task。


---

# 6. Final Project Completion


所有 Epic：

必须：

状态：

```text
DONE
```

---

最终：

满足：

```text
PRD

+

Architecture

+

Tests

+

Security

+

Deployment

```

---

# END