# CF-Workers-SUB-Next V2

# 系统架构设计文档（Architecture Design）

版本：V2.0

---

# 1. 架构目标

CF-Workers-SUB-Next V2 采用：

> Edge-Native Modular Architecture（边缘原生模块化架构）

设计目标：

- 运行于 Cloudflare Workers
- 无服务器
- 高可维护性
- 可测试
- 可扩展
- 适合开源协作

---

# 2. 总体架构

系统整体：

```text
                    User Browser
                         |
                         |
                    Web Frontend
                         |
                         |
                    API Gateway
                         |
        --------------------------------
        |              |               |
        |              |               |
 Subscription     Processing       Config
 Management       Engine          Generator
        |              |               |
        |              |               |
        --------------------------------
                         |
                         |
                   Cloudflare KV
                         |
                         |
                 Cloudflare Workers
```

---

# 3. 核心分层

系统分为 7 层：

```text
Layer 7
Frontend Layer

Layer 6
API Layer

Layer 5
Application Service Layer

Layer 4
Processing Engine Layer

Layer 3
Domain Model Layer

Layer 2
Storage Layer

Layer 1
Runtime Layer
```

---

# 4. Runtime Layer

## 技术

运行环境：

- Cloudflare Workers Runtime

---

## 约束

禁止：

- Node.js filesystem
- TCP socket
- child_process
- 本地文件存储


---

# 5. Storage Layer

## 存储方案

Cloudflare KV


---

## KV 职责

保存：

- 用户配置
- 订阅信息
- 系统设置
- 规则配置


---

## 不保存

禁止：

长期保存：

- 原始节点密码
- 敏感订阅内容
- 临时处理数据


---

# 6. Domain Model Layer

核心对象：

---

## Subscription

表示一个订阅来源。

结构：

```text
Subscription

id

name

url

createdAt

updatedAt

status
```

---

## Node

系统内部统一节点模型。

结构：

```text
Node

id

name

server

port

protocol

tls

transport

security

metadata
```

---

## Rule

过滤规则。

结构：

```text
Rule

id

type

pattern

enabled
```

---

## Config

输出配置。

结构：

```text
Config

format

template

generatedAt
```

---

# 7. Application Service Layer

负责业务流程。

包含：

---

## Subscription Service

职责：

- 创建订阅
- 删除订阅
- 更新订阅
- 获取订阅


---

## Node Service

职责：

- 节点管理
- 去重
- 标准化


---

## Config Service

职责：

- 生成配置
- 输出链接


---

# 8. Processing Engine Layer

这是项目核心。

数据处理流程：

```text
Subscription URL

        |
        v

Fetcher

        |
        v

Raw Content

        |
        v

Parser

        |
        v

Raw Nodes

        |
        v

Normalizer

        |
        v

Standard Nodes

        |
        v

Rule Engine

        |
        v

Filtered Nodes

        |
        v

Generator

        |
        v

Client Config
```

---

# 9. Fetcher 模块

职责：

从订阅地址获取内容。

输入：

```text
URL
```

输出：

```text
Raw Subscription Data
```

---

要求：

必须：

- HTTPS 优先
- 超时控制
- 错误处理
- SSRF 防护


---

# 10. Parser 模块

职责：

解析不同协议。

输入：

```text
Subscription Content
```

输出：

```text
Node[]
```

---

V1 支持：

必须：

```text
VMess

VLESS

Trojan

Shadowsocks
```

---

Parser 设计原则：

每种协议：

独立 Parser。

例如：

```text
parser/

 vmess.ts

 vless.ts

 trojan.ts

 shadowsocks.ts
```

---

禁止：

所有协议写入：

```text
parser.ts
```

---

# 11. Normalizer 模块

职责：

把不同协议转换成统一结构。


输入：

```text
Parsed Node
```

输出：

```text
Normalized Node
```

---

目标：

Generator 不关心：

节点来自什么协议。

---

# 12. Rule Engine

职责：

处理节点筛选。

例如：

关键词：

```text
香港
日本
美国
```

过滤：

```text
过期节点
广告节点
重复节点
```

---

设计：

规则独立。

禁止：

把规则硬编码到 Parser。

---

# 13. Generator Layer

负责生成客户端配置。

结构：

```text
generator/

 mihomo/

 singbox/
```

---

## Mihomo Generator

输出：

```yaml
```

---

## Sing-box Generator

输出：

```json
```

---

要求：

模板化。

禁止：

大量字符串拼接。

---

# 14. API Layer

API 负责：

- HTTP 请求
- 参数验证
- 调用 Service


---

禁止：

API 内直接：

- 解析节点
- 操作 KV
- 生成配置


---

示例：

错误：

```text
/api/sub

里面:

fetch

parse

save

generate
```

---

正确：

```text
API

 ↓

SubscriptionService

 ↓

ProcessingEngine

 ↓

Storage
```

---

# 15. Frontend Layer

前端：

HTML

CSS

JavaScript


---

页面：

```text
Dashboard

Subscriptions

Nodes

Output

Settings
```

---

要求：

前端：

不包含业务逻辑。

---

# 16. 推荐目录结构

Hermes 必须参考：

```text
src/

├── index.ts

├── api/

│   ├── routes.ts

│   └── middleware.ts


├── services/

│   ├── subscription.ts

│   ├── node.ts

│   └── config.ts


├── engine/

│   ├── fetcher.ts
│   ├── normalizer.ts
│   ├── rules.ts


├── parser/

│   ├── vmess.ts
│   ├── vless.ts
│   ├── trojan.ts
│   └── shadowsocks.ts


├── generator/

│   ├── mihomo.ts
│   └── singbox.ts


├── models/

│   └── node.ts


├── storage/

│   └── kv.ts


└── utils/
```

---

# 17. 错误处理原则

所有模块：

必须返回：

```typescript
Result<T>
```

或者：

统一 Error 类型。

---

禁止：

大量：

```javascript
try {

}
catch {

}
```

吞掉错误。


---

# 18. 测试原则

每个核心模块必须可测试。

最低要求：

Parser：

单元测试


Generator：

输出验证测试


API：

接口测试


---

# 19. 架构禁止事项

Hermes 不允许：

## 1

把所有代码写入：

```text
index.ts
```

---

## 2

为了快速完成跳过测试。

---

## 3

改变核心架构而不记录 ADR。

---

## 4

引入大型框架。

---

## 5

依赖 Cloudflare Worker 不支持的 Node API。

---

# 20. 架构演进规则

任何重大修改：

必须创建：

```text
docs/adr/
```

记录：

- 问题
- 方案
- 选择原因
- 影响


---

# END