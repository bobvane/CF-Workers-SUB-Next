# CF-Workers-SUB-Next V2

# Test Plan

版本：V2.0

---

# 1. 测试目标

本文档定义：

CF-Workers-SUB-Next V2 的测试策略。

目标：

确保：

- 功能正确
- 数据可靠
- API 稳定
- Parser 准确
- Generator 可用
- 部署可靠


---

# 2. 测试原则


## 原则 1

所有核心功能必须自动化测试。


---

## 原则 2

测试必须覆盖：

正常流程。

异常流程。

边界情况。


---

## 原则 3

禁止：

只通过人工点击验证。


---

# 3. 测试分层


项目测试分为：

```
Unit Test

      ↓

Integration Test

      ↓

API Test

      ↓

E2E Test

      ↓

Deployment Test
```

---

# 4. 测试技术栈


使用：

## Unit Test

Vitest


---

## API Test

Vitest + Hono Test Client


---

## Type Test

TypeScript strict mode


---

## CI

GitHub Actions


---

# 5. 测试目录结构


```
tests/


├── unit/


│
├── parser/


├── generator/


├── services/


├── storage/


├── api/


├── integration/


└── e2e/

```

---

# 6. Unit Test


## 目标

验证单个模块。


---

# 6.1 Parser Test


每个协议：

必须测试。


---

## VMess


测试：

### 正常

- Base64 VMess
- JSON VMess


### 异常

- Base64 错误
- JSON 错误
- 缺少 UUID
- 缺少 Server


---

最低：

10 个测试案例。


---

## VLESS


必须测试：

- UUID
- Server
- Port
- TLS
- Reality
- WS
- gRPC


---

## Trojan


测试：

- Password
- Server
- TLS
- SNI


---

## Shadowsocks


测试：

- Method
- Password
- Plugin
- URL Decode


---

# 6.2 Decoder Test


测试：

Base64：

```
标准 Base64

URL Safe Base64

非法 Base64

空输入

超长输入
```


---

# 6.3 Normalizer Test


测试：

输入：

不同协议节点。


输出：

统一 Node。


---

检查：

- 字段完整
- 默认值
- 名称处理


---

# 6.4 Rule Engine Test


测试：

包含规则：

```
香港
日本
美国
```


排除规则：

```
过期
测试
```

---

# 7. Generator Test


## Mihomo Generator


必须测试：

---

### 单节点


输入：

1 Node


检查：

YAML 有：

```
proxies
```


---

### 多节点


检查：

多个 Proxy。


---

### 协议兼容


测试：

- VMess
- VLESS
- Trojan
- SS


---

### YAML Validation


必须：

成功解析。


---

# Sing-box Generator


测试：

JSON：

- 格式正确
- outbounds 存在
- 字段完整


---

# 8. Service Test


测试：

## Subscription Service


包括：

创建：

```
Create
```

删除：

```
Delete
```

更新：

```
Update
```


---

检查：

KV 数据一致。


---

# 9. Storage Test


测试：

KV Adapter。


包括：

写入：

```
put
```


读取：

```
get
```


删除：

```
delete
```


---

测试异常：

- KV unavailable
- invalid JSON


---

# 10. API Test


所有 API：

必须测试。


---

# Authentication


测试：

## 正常

登录成功。


## 异常

错误密码。


## 未授权

访问保护 API。


---

# Subscription API


测试：

```
GET

POST

DELETE

UPDATE
```


---

检查：

返回：

正确 HTTP Code。


---

# Node API


测试：

- 查询节点
- 空节点
- 不存在订阅


---

# Output API


测试：

Mihomo：

返回 YAML。


Sing-box：

返回 JSON。


---

# 11. Integration Test


模拟完整流程：

```
Create Subscription

        ↓

Fetch

        ↓

Parse

        ↓

Normalize

        ↓

Store Nodes

        ↓

Generate Config

```

---

必须验证：

最终配置可用。


---

# 12. E2E Test


模拟真实用户。


流程：

```
打开网页

↓

登录

↓

添加订阅

↓

更新节点

↓

查看节点

↓

生成配置

```

---

# 13. Security Test


必须包含：


---

# SSRF Test


输入：

```
http://localhost
```

必须拒绝。


---

测试：

```
127.0.0.1

192.168.x.x

10.x.x.x

```

---

# XSS Test


节点名称：

输入：

```html
<script>alert(1)</script>
```


必须：

安全显示。


---

# Authentication Test


验证：

未登录：

不能访问管理接口。


---

# Rate Limit Test


验证：

连续登录：

触发限制。


---

# 14. Performance Test


目标：

Cloudflare Worker：

正常请求：

<3 秒。


---

测试：

- 大订阅
- 多节点
- 多规则


---

# 15. Compatibility Test


必须验证：

## Mihomo


配置：

成功加载。


---

## OpenClash


配置：

成功导入。


---

## Sing-box


配置：

成功检查。


---

# 16. CI 流程


每次 Pull Request：

自动执行：


```
npm install

↓

npm run lint

↓

npm run typecheck

↓

npm test

↓

npm run build
```


---

失败：

禁止合并。


---

# 17. Coverage 要求


目标：

核心模块：

>=80%


---

必须覆盖：

Parser

Generator

Services


---

# 18. Test Data 管理


测试数据：

存放：

```
tests/fixtures/
```


---

包含：

```
vmess.sample

vless.sample

trojan.sample

ss.sample
```


---

禁止：

测试文件包含：

真实密码。

真实订阅。


---

# 19. Bug 修复流程


发现 Bug：


必须：

1. 创建测试案例

2. 修复代码

3. 测试通过


---

禁止：

只修改代码。

---

# 20. Release 验收


发布前：

必须：

```
[ ] Unit Test Pass

[ ] Integration Test Pass

[ ] Security Test Pass

[ ] Build Pass

[ ] Deployment Pass

[ ] Client Compatibility Pass

```

---

# END