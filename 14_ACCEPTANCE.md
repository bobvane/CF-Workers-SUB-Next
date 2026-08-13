# CF-Workers-SUB-Next V2

# Project Acceptance Specification

版本：V2.0

---

# 1. 验收目标

本文档定义：

CF-Workers-SUB-Next V2 的最终验收标准。

项目只有满足所有关键条件：

才能认为完成。


---

# 2. Definition of Done


项目完成必须同时满足：

```text
功能完成

+

代码质量达标

+

测试通过

+

安全要求满足

+

部署成功

+

文档完整

```

---

# 3. Product Acceptance


# 3.1 用户登录


必须支持：

- 管理员登录
- Session 创建
- Session 过期
- 登出


验收：

```text
输入正确密码

↓

登录成功

↓

进入 Dashboard

```

---

# 3.2 Dashboard


必须显示：

- 订阅数量
- 节点数量
- 系统状态
- 更新时间


---

# 3.3 Subscription 管理


必须支持：


## 创建订阅


用户可以：

输入：

- 名称
- URL


创建成功。


---

## 更新订阅


系统必须：

执行：

```text
Fetch

↓

Decode

↓

Parse

↓

Normalize

↓

Store
```


---

## 删除订阅


删除：

必须同时删除：

- Subscription 数据
- Node 数据


---

# 3.4 Node 管理


必须：

显示：

- 节点名称
- 协议
- Server
- Port


---

支持：

搜索。


---

# 3.5 配置生成


必须支持：


## Mihomo


生成：

有效 YAML。


---

## Sing-box


生成：

有效 JSON。


---

# 3.6 Subscription Link


必须支持：

生成：

```text
/sub/mihomo/token
```

以及：

```text
/sub/singbox/token
```

---

# 4. Parser Acceptance


Parser 必须支持：


|协议|状态|
|-|-|
|VMess|必须|
|VLESS|必须|
|Trojan|必须|
|Shadowsocks|必须|


---

必须：

正确解析：

- Server
- Port
- Authentication
- TLS
- Transport


---

异常输入：

必须返回错误。


---

# 5. Generator Acceptance


# Mihomo


必须：

通过：

- YAML Parser


并且：

Mihomo 可以加载。


---

# Sing-box


必须：

通过：

- JSON Parser


并且：

Sing-box Check 通过。


---

# 6. API Acceptance


所有 API：

必须满足：

## 返回格式统一


成功：

```json
{
"success":true
}
```


失败：

```json
{
"success":false
}
```


---

# HTTP 状态码


必须正确：

|情况|状态|
|-|-|
|成功|200|
|创建|201|
|参数错误|400|
|未认证|401|
|不存在|404|
|服务器错误|500|


---

# 7. Frontend Acceptance


页面必须：

支持：

Desktop。


支持：

Mobile。


---

必须存在页面：

```text
Login

Dashboard

Subscriptions

Nodes

Output

Settings
```


---

UI 必须：

具备：

- Loading
- Error
- Success 提示


---

# 8. Security Acceptance


必须确认：


## Authentication


未登录：

无法访问管理 API。


---

## SSRF


以下地址：

必须拒绝：


```text
127.0.0.1

localhost

10.x.x.x

192.168.x.x

172.16.x.x
```


---

## XSS


输入：

```html
<script>alert(1)</script>
```


不能执行。


---

## Secrets


代码仓库：

不得包含：

- Password
- API Key
- Token


---

# 9. Cloudflare Acceptance


必须：

成功部署：

Cloudflare Workers。


---

验证：


## Worker


访问：

```text
/
```


正常。


---

## Health


访问：

```text
/api/health
```


返回：

```json
{
"status":"ok"
}
```

---

## KV


验证：

- Read
- Write
- Delete


---

# 10. Testing Acceptance


必须：

所有测试通过。


---

最低要求：


```text
Unit Test

Integration Test

API Test

Security Test

Build Test
```


---

Coverage：

核心模块：

>=80%


---

# 11. Code Quality Acceptance


必须：

TypeScript：

开启：

```text
strict mode
```


---

禁止：

大量：

any


---

必须：

代码结构符合：

Architecture Specification。


---

# 12. Documentation Acceptance


必须包含：


```text
README.md

ARCHITECTURE.md

API_SPECIFICATION.md

SECURITY.md

DEPLOYMENT.md

TEST_PLAN.md

```

---

README 必须包含：

- 项目介绍
- 安装
- 配置
- 部署
- 使用方法


---

# 13. Git Repository Acceptance


仓库必须：


包含：

```text
src/

tests/

docs/

.github/

README.md

package.json

wrangler.toml
```


---

禁止提交：

```text
node_modules/

.env

.dev.vars

secret files
```


---

# 14. Release Checklist


发布前：

必须完成：


```text
[x] Feature Complete

[x] Tests Passed

[x] Security Reviewed

[x] Documentation Complete

[x] Cloudflare Deploy Success

[x] Client Compatibility Verified

```

---

# 15. Failure Conditions


以下情况：

不能认为完成。


---

## Case 1


代码能运行：

但是：

没有测试。


结果：

❌ 未完成


---

## Case 2


本地运行：

但是：

无法部署 Cloudflare。


结果：

❌ 未完成


---

## Case 3


可以生成配置：

但是：

客户端无法加载。


结果：

❌ 未完成


---

## Case 4


功能正常：

但是：

存在安全漏洞。


结果：

❌ 未完成


---

# 16. Final Acceptance Statement


项目负责人确认：

```text
CF-Workers-SUB-Next V2

满足产品需求

满足技术规范

满足安全要求

满足部署要求

满足测试要求

可以交付使用
```

---

# END