# CF-Workers-SUB-Next V2

# 数据模型设计文档（Data Model Specification）

版本：V2.0

---

# 1. 数据模型设计目标

本文件定义：

CF-Workers-SUB-Next V2 的核心数据结构。

目标：

- 稳定
- 可扩展
- Cloudflare KV 兼容
- 易维护
- 支持未来版本升级

---

# 2. 数据存储方案

## 存储引擎

使用：

Cloudflare KV


---

## Namespace

默认：

```text
DATABASE
```

---

## 数据格式

统一：

JSON


---

## Key 命名规范

格式：

```text
{entity}:{id}
```

例如：

```text
subscription:abc123
```

---

# 3. 核心实体关系

系统核心关系：

```text
User

 |

 |

Subscription

 |

 |

Node

 |

 |

Config

```


规则：

```text
Subscription
     |
     |
    Node[]

Node
     |
     |
 Config Generator
```

---

# 4. Subscription 模型

## 定义

表示一个订阅来源。

例如：

机场订阅、自建订阅。


---

## KV Key

```text
subscription:{id}
```

---

## 数据结构

```typescript
interface Subscription {

id:string;


name:string;


url:string;


enabled:boolean;


createdAt:number;


updatedAt:number;


lastFetchAt?:number;


nodeCount?:number;


status:
"active"
|
"error"
|
"disabled";


errorMessage?:string;

}
```

---

# 字段说明


## id

唯一 ID。

生成：

UUID。


---

## name

用户显示名称。


例如：

```text
My Airport
```

---

## url

订阅地址。


安全要求：

禁止日志输出。


---

## enabled

是否启用。


---

## status

状态：

active:

正常。


error:

更新失败。


disabled:

关闭。


---

# 5. Node 模型

## 定义

系统内部统一节点对象。


重点：

Parser 输出 Node。

Generator 输入 Node。


---

## KV Key

缓存：

```text
nodes:{subscriptionId}
```

---

## 数据结构

```typescript
interface Node {


id:string;


name:string;


protocol:
"vmess"
|
"vless"
|
"trojan"
|
"ss"
|
"hysteria2"
|
"tuic";


server:string;


port:number;


username?:string;


password?:string;


uuid?:string;


tls?:boolean;


transport?:Transport;


metadata:NodeMetadata;


}
```

---

# 6. Transport 模型


```typescript
interface Transport {


type:

"tcp"
|
"ws"
|
"grpc"
|
"h2";


path?:string;


host?:string;


}
```

---

# 7. Node Metadata


用于扩展信息。


```typescript
interface NodeMetadata {


country?:string;


region?:string;


source:string;


originalName:string;


tags:string[];


}
```

---

# 设计原则

metadata：

允许扩展。

禁止：

修改核心字段。


---

# 8. Rule 模型


## 定义

节点处理规则。


---

## KV Key

```text
rule:{id}
```

---

## 数据结构

```typescript
interface Rule {


id:string;


name:string;


type:

"include"

|

"exclude"

|

"replace";


pattern:string;


enabled:boolean;


createdAt:number;


}
```

---

# 示例

过滤：

香港节点：

```json
{
"type":"include",
"pattern":"香港"
}
```

---

# 9. Config 模型


## 定义

生成配置记录。


---

## KV Key

```text
config:{id}
```

---

## 数据结构


```typescript
interface Config {


id:string;


format:

"mihomo"

|

"singbox";


name:string;


subscriptionIds:string[];


createdAt:number;


updatedAt:number;


}
```

---

# 10. Session 模型


用于用户登录。


---

## KV Key

```text
session:{id}
```


---

## 数据结构


```typescript
interface Session {


id:string;


createdAt:number;


expiresAt:number;


}
```

---

# 11. 系统设置模型


## KV Key

```text
setting:{key}
```

---

例如：

```text
setting:app_name
```


---

# 12. 数据生命周期


## Subscription

流程：

```text
Create

 ↓

Fetch

 ↓

Parse

 ↓

Normalize

 ↓

Cache Nodes

 ↓

Generate Config

```

---

# 13. 数据缓存策略


## Subscription

长期保存。


---

## Nodes

缓存。


原因：

避免每次生成配置都重新抓取。


---

## Config

可重新生成。


不作为唯一数据来源。


---

# 14. 数据一致性规则


规则：

Subscription 是主数据。


Node 是派生数据。


Config 是输出数据。


关系：

```text
Subscription
       |
       v
Node Cache
       |
       v
Config
```

---

# 15. 数据删除策略


删除 Subscription：


必须：

同时删除：

```text
subscription:id

nodes:id
```


---

禁止：

留下孤儿数据。


---

# 16. 数据版本控制


所有主要数据：

必须支持：

```typescript
version:number
```

字段。


---

例如：

```json
{
"version":1
}
```


---

原因：

未来：

V1

升级

V2

迁移。


---

# 17. 数据迁移策略


原则：

不要运行时大量兼容旧结构。


升级：

采用：

Migration Script。


---

禁止：

长期保留：

```typescript
if(oldFormat)
{
 convert()
}
```

---

# 18. 安全要求


禁止保存：

- 明文密码
- Token
- Secret


订阅 URL：

只允许：

授权用户访问。


---

# 19. 数据验证


所有写入 KV 前：

必须：

Schema Validate。


推荐：

Zod。


---

流程：

```text
Input

 ↓

Validate

 ↓

Transform

 ↓

Save
```

---

# 20. 数据模型冻结规则


开发开始后：

如果需要修改：

Subscription

Node

Rule

Config


必须：

创建：

```text
docs/adr/xxx-data-change.md
```


说明：

- 为什么修改
- 影响范围
- 迁移方案


---

# END