# CF-Workers-SUB-Next V2

# API Specification

版本：V2.0

---

# 1. API 设计原则

本项目采用：

REST API


基础路径：

```
/api
```

数据格式：

```
JSON
```

字符编码：

```
UTF-8
```

---

# 2. 通用响应格式

所有 API 必须统一返回：

## 成功

```json
{
  "success": true,
  "data": {}
}
```

---

## 失败

```json
{
  "success": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "Readable message"
  }
}
```

---

# 3. HTTP 状态码规范


|状态码|用途|
|-|-|
|200|成功|
|201|创建成功|
|400|参数错误|
|401|未认证|
|403|权限不足|
|404|资源不存在|
|429|请求过多|
|500|服务器错误|

---

# 4. Authentication API

---

# 4.1 登录

## Endpoint

```
POST /api/auth/login
```

---

## Request

```json
{
  "password":"your-password"
}
```

---

## Success Response

```json
{
  "success":true,
  "data":{
    "token":"session-token"
  }
}
```

---

## Failure

```json
{
  "success":false,
  "error":{
    "code":"INVALID_PASSWORD",
    "message":"Invalid password"
  }
}
```

---

# 4.2 登出


```
POST /api/auth/logout
```

---

Response:

```json
{
 "success":true
}
```

---

# 4.3 获取 Session 状态


```
GET /api/auth/session
```


Response:

```json
{
 "success":true,
 "data":{
   "authenticated":true
 }
}
```

---

# 5. Subscription API

---

# 5.1 获取订阅列表


## Endpoint

```
GET /api/subscriptions
```


---

## Response

```json
{
 "success":true,
 "data":[
   {
    "id":"sub001",
    "name":"Example",
    "status":"active",
    "nodeCount":50
   }
 ]
}
```

---

# 5.2 创建订阅


## Endpoint

```
POST /api/subscriptions
```

---

## Request

```json
{
 "name":"My Airport",
 "url":"https://example.com/sub"
}
```

---

## Response

HTTP:

```
201
```

```json
{
 "success":true,
 "data":{
   "id":"sub001"
 }
}
```

---

# 5.3 获取单个订阅


```
GET /api/subscriptions/:id
```

---

Response:

```json
{
 "success":true,
 "data":{
   "id":"sub001",
   "name":"xxx"
 }
}
```

---

# 5.4 删除订阅


```
DELETE /api/subscriptions/:id
```

---

删除：

必须同时删除：

- subscription 数据
- node cache


---

Response:

```json
{
 "success":true
}
```

---

# 5.5 更新订阅


## Endpoint

```
POST /api/subscriptions/:id/update
```


功能：

执行：

```
Fetch

↓

Parse

↓

Normalize

↓

Cache
```

---

Response:

```json
{
 "success":true,
 "data":{
   "nodeCount":100
 }
}
```

---

# 6. Node API

---

# 6.1 获取节点列表


```
GET /api/nodes
```

---

Query:

```
subscriptionId
```

---

Example:

```
/api/nodes?subscriptionId=sub001
```

---

Response:

```json
{
 "success":true,
 "data":[
   {
    "name":"JP Node",
    "protocol":"vless",
    "server":"example.com",
    "port":443
   }
 ]
}
```

---

# 7. Rule API

---

# 7.1 获取规则


```
GET /api/rules
```

---

Response:

```json
{
 "success":true,
 "data":[]
}
```

---

# 7.2 创建规则


```
POST /api/rules
```

---

Request:

```json
{
"name":"Japan Only",
"type":"include",
"pattern":"日本"
}
```

---

# 7.3 删除规则


```
DELETE /api/rules/:id
```

---

# 8. Configuration Output API

---

# 8.1 生成 Mihomo 配置


## Endpoint

```
GET /api/output/mihomo
```


---

Response:

Content-Type:

```
text/yaml
```

---

输出：

```
mihomo.yaml
```

---

# 8.2 生成 Sing-box 配置


## Endpoint

```
GET /api/output/singbox
```


---

Response:

Content-Type:

```
application/json
```

---

输出：

```
config.json
```

---

# 8.3 订阅链接模式


支持：

```
/sub/mihomo/:token
```

以及：

```
/sub/singbox/:token
```

---

用途：

直接给客户端添加订阅。

---

# 9. Dashboard API


## 获取统计信息


```
GET /api/dashboard
```


Response:

```json
{
 "success":true,
 "data":{
   "subscriptions":3,
   "nodes":200
 }
}
```

---

# 10. Health API


## Worker 健康检查


```
GET /api/health
```


Response:

```json
{
 "status":"ok"
}
```

---

# 11. API Middleware

所有受保护 API：

必须经过：

```
Authentication Middleware
```

---

流程：

```
Request

↓

Auth Check

↓

Validation

↓

Controller

↓

Service

↓

Response
```

---

# 12. API 输入验证

所有输入：

必须验证。


推荐：

```
Zod
```

---

禁止：

直接：

```typescript
JSON.parse()

↓

KV.save()
```

---

# 13. API 错误码规范


统一：

```
AUTH_REQUIRED

INVALID_PARAMETER

SUBSCRIPTION_NOT_FOUND

FETCH_FAILED

PARSE_FAILED

GENERATION_FAILED

STORAGE_ERROR

RATE_LIMITED
```

---

# 14. Rate Limit


必须限制：

登录接口：

```
/api/auth/login
```


防止：

暴力破解。


---

订阅抓取：

必须限制：

防止：

资源滥用。


---

# 15. API 安全要求


禁止：

API 返回：

- 用户密码
- Session Secret
- 完整订阅 URL（非必要）


---

# 16. API 版本策略


当前：

```
/api
```


未来：

如果出现不兼容变化：

升级：

```
/api/v2
```


---

# 17. API 测试要求


每个 API 必须有测试：

至少覆盖：

- 正常请求
- 参数错误
- 未认证
- 异常情况


---

# 18. API 设计冻结规则


API 一旦进入开发阶段：

禁止随意修改。


任何修改必须：

创建 ADR：

```
docs/adr/api-change-xxx.md
```


包含：

- 修改原因
- 影响范围
- 前后兼容方案


---

# END