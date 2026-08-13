# CF-Workers-SUB-Next V2

# 技术规格说明书（Technical Specification）

版本：V2.0

---

# 1. 技术目标

本文档定义 CF-Workers-SUB-Next V2 的具体技术实现标准。

所有开发必须遵守：

- 技术栈要求
- 目录规范
- 数据规范
- API 规范
- 测试规范

任何重大技术变化必须创建 ADR。

---

# 2. 技术栈

## 2.1 Runtime

平台：

Cloudflare Workers

---

## 2.2 编程语言

必须：

TypeScript


原因：

- 类型安全
- 易维护
- 适合大型项目
- 提升 AI 编程准确率


---

## 2.3 Web Framework

使用：

Hono


版本：

保持最新稳定版本。


原因：

- 原生支持 Cloudflare Workers
- 轻量
- API 清晰


---

## 2.4 Package Manager

推荐：

npm


---

## 2.5 Frontend

使用：

- HTML5
- CSS3
- Vanilla JavaScript


禁止：

第一版禁止：

- React
- Vue
- Angular


原因：

降低复杂度。


---

# 3. 项目目录规范

最终结构：

```text
CF-Workers-SUB-Next/

├── src/

│   ├── index.ts


│   ├── api/

│   │   ├── routes.ts
│   │   ├── auth.ts
│   │   └── middleware.ts


│   ├── services/

│   │   ├── subscription.service.ts
│   │   ├── node.service.ts
│   │   └── config.service.ts


│   ├── engine/

│   │   ├── fetcher.ts
│   │   ├── normalizer.ts
│   │   └── rule-engine.ts


│   ├── parser/

│   │   ├── index.ts
│   │   ├── vmess.ts
│   │   ├── vless.ts
│   │   ├── trojan.ts
│   │   └── shadowsocks.ts


│   ├── generator/

│   │   ├── mihomo.ts
│   │   └── singbox.ts


│   ├── models/

│   │   ├── node.ts
│   │   ├── subscription.ts
│   │   └── config.ts


│   ├── storage/

│   │   └── kv.ts


│   └── utils/


├── public/

│   ├── index.html
│   ├── app.js
│   └── style.css


├── tests/


├── docs/


├── wrangler.toml

├── package.json

├── tsconfig.json

└── README.md
```

---

# 4. Cloudflare 配置

## wrangler.toml

必须包含：

```toml
name = "cf-workers-sub-next"

compatibility_date = "2026-01-01"

main = "src/index.ts"
```

---

KV：

例如：

```toml
[[kv_namespaces]]

binding = "DATABASE"

id = "xxxx"
```

---

# 5. 环境变量设计

禁止：

代码中硬编码。

---

使用：

Cloudflare Secrets。


---

必须支持：

```text
ADMIN_PASSWORD

SESSION_SECRET
```

---

后续：

可扩展：

```text
CUSTOM_DOMAIN

DEFAULT_TEMPLATE
```

---

# 6. KV 数据设计

KV Namespace:

DATABASE


---

## Subscription

Key:

```text
subscription:{id}
```

Value:

JSON


例如：

```json
{
"id":"sub001",
"name":"my-sub",
"url":"https://example.com/sub",
"createdAt":123456
}
```

---

## Node Cache

Key:

```text
nodes:{subscriptionId}
```

---

## Settings

Key:

```text
settings:{name}
```

---

# 7. 数据模型规范


## Node

TypeScript:

```typescript
interface Node {

id:string;

name:string;

server:string;

port:number;

protocol:string;

tls?:boolean;

transport?:string;

metadata?:Record<string,unknown>;

}
```

---

# 8. API 设计

统一：

REST API


Base:

```text
/api
```


---

# Authentication

## 登录

POST

```text
/api/auth/login
```

---

## 登出

POST

```text
/api/auth/logout
```


---

# Subscription API


## 获取订阅

GET

```text
/api/subscriptions
```


---

## 添加订阅

POST

```text
/api/subscriptions
```


---

## 删除订阅

DELETE

```text
/api/subscriptions/:id
```


---

## 更新订阅

POST

```text
/api/subscriptions/:id/update
```


---

# Node API


GET:

```text
/api/nodes
```

返回标准节点。


---

# Config API


## Mihomo

GET:

```text
/api/output/mihomo
```


---

## Sing-box

GET:

```text
/api/output/singbox
```


---

# 9. Fetcher 规范

Fetcher 必须：

支持：

HTTP GET


要求：

- timeout
- error handling
- content validation


---

禁止：

无限请求。


---

# 10. Parser 规范


Parser Interface:

```typescript
interface Parser {

parse(input:string):Node[];

}
```


---

每个协议：

独立文件。


---

例如：

```text
parser/vmess.ts
```

只负责：

VMess。


---

禁止：

Parser 之间互相调用。


---

# 11. Normalizer 规范


输入：

各种协议 Node


输出：

统一 Node。


---

目标：

Generator 不关心来源。


---

# 12. Generator 规范


Generator Interface:


```typescript
interface Generator {

generate(nodes:Node[]):string;

}
```


---

Mihomo：

输出 YAML


Sing-box：

输出 JSON


---

# 13. 错误规范


统一：

```typescript
class AppError extends Error {

code:string;

status:number;

}
```


---

错误返回：

```json
{
"success":false,
"error":"message"
}
```

---

# 14. 日志规范


允许：

结构化日志。


例如：

```text
[Parser]
parsed nodes:100
```


禁止：

输出：

- 密码
- Token
- 订阅 URL


---

# 15. 测试技术


必须：

Vitest


---

测试目录：

```text
tests/

parser/

generator/

api/

services/
```


---

最低要求：

Parser:

每协议 >= 10 测试


Generator:

格式验证测试


API:

主要接口测试


---

# 16. GitHub Actions


必须包含：

CI 流程：


步骤：

```text
npm install

npm run lint

npm run test

npm run build
```


---

# 17. Code Quality


必须：

- ESLint
- Prettier
- TypeScript strict mode


---

# 18. 安全要求


必须防护：


## SSRF

禁止：

访问：

- localhost
- 私有 IP
- 内网地址


---

## 输入验证

所有 API 参数必须验证。


---

## Secrets

禁止：

提交：

.env


---

# 19. 开发原则


Hermes 必须：

先设计。

再编码。

先测试。

再合并。


---

# 20. 完成定义


一个功能只有满足：

```text
代码完成

+

测试通过

+

文档更新

+

Git Commit

+

无明显安全问题
```

才算完成。


---

# END