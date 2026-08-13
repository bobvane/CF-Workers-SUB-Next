# CF-Workers-SUB-Next V2

# Security Specification

版本：V2.0

---

# 1. 安全目标

本文档定义：

CF-Workers-SUB-Next V2 的安全设计标准。

目标：

- 防止未授权访问
- 防止恶意输入
- 防止资源滥用
- 防止敏感数据泄露
- 保证 Cloudflare Workers 安全运行

---

# 2. 威胁模型

系统主要攻击面：

```text
User Input

    |

    |

API Layer

    |

    |

Fetcher

    |

    |

External Internet


Storage

    |

    |

KV Database
```

---

# 3. 安全原则


## Principle 1

所有外部输入：

默认不可信。


包括：

- URL
- 节点名称
- 配置参数
- API 参数


---

## Principle 2

最小权限。


系统只保存：

运行必须数据。


---

## Principle 3

失败安全。


异常情况下：

默认拒绝。

---

# 4. SSRF 防护


## 4.1 风险说明


用户输入：

```text
https://example.com/sub
```


Worker:

```text
fetch(url)
```


攻击者可能提交：

```text
http://localhost
```

或者：

```text
http://192.168.x.x
```


导致：

内部资源访问。


---

# 4.2 URL 验证


所有订阅 URL：

必须经过：

```text
URL Validator
```

流程：

```text
Input URL

↓

Parse URL

↓

Validate Protocol

↓

Validate Host

↓

Fetch
```

---

# 4.3 协议限制


允许：

```text
https
```

可选：

```text
http
```

---

禁止：

```text
file://

ftp://

gopher://
```

---

# 4.4 IP 地址限制


禁止访问：

## IPv4 私有地址


```text
10.0.0.0/8

172.16.0.0/12

192.168.0.0/16
```


---

## 本地地址


```text
127.0.0.0/8
```


---

## Link Local


```text
169.254.0.0/16
```


---

## IPv6 Local


```text
::1

fc00::

fe80::
```

---

# 4.5 DNS Rebinding 防护


不能：

只检查域名。


必须：

解析后检查 IP。


---

# 5. Fetcher 安全规范


Fetcher 必须限制：

---

## Timeout


最大：

```text
10 seconds
```

---

## Response Size


最大：

例如：

```text
5 MB
```

---

## Redirect


限制：

最多：

```text
3 redirects
```

---

## Content Type


验证：

允许：

- text/plain
- text/html
- application/json


---

# 6. Parser 安全


Parser 处理：

外部不可信数据。


必须：

---

## 输入长度限制


禁止：

超大订阅。


---

## Base64 安全


所有 Decode：

必须：

try/catch。


---

## JSON 安全


禁止：

直接：

```javascript
eval()
```

---

# 7. API 安全


# 7.1 Authentication


所有管理 API：

必须：

需要认证。


---

包括：

- Subscription
- Node
- Rule
- Settings


---

# 7.2 Session


Session 必须：

包含：

```text
id

createdAt

expiresAt
```

---

必须：

过期删除。


---

# 7.3 Cookie


推荐：

HttpOnly。


设置：

```text
HttpOnly

Secure

SameSite=Strict
```

---

# 8. Password 安全


管理员密码：

禁止：

明文保存。


---

必须：

使用：

Hash。


推荐：

PBKDF2 / bcrypt / Argon2。


---

# 9. Secrets 管理


禁止：

提交：

```text
.env
```

---

禁止：

代码：

```typescript
const password="123456"
```

---

使用：

Cloudflare Secrets。


---

# 10. KV 安全


KV 不允许保存：

- 管理密码
- Secret Key
- API Token


---

KV 中：

只保存业务数据。


---

# 11. XSS 防护


风险：

节点名称：

可能包含：

```html
<script>
```


---

要求：

所有输出：

HTML Escape。


---

禁止：

```javascript
element.innerHTML=userInput
```

---

推荐：

```javascript
textContent
```

---

# 12. CSRF 防护


如果使用 Cookie：

必须：

考虑 CSRF。


措施：

- SameSite Cookie
- CSRF Token


---

# 13. Rate Limit


必须限制：

## 登录


接口：

```text
/api/auth/login
```


---

防止：

暴力破解。


---

## Subscription Fetch


防止：

资源消耗攻击。


---

# 14. 日志安全


禁止记录：

- 密码
- Token
- Subscription URL
- UUID
- 节点密码


---

允许：

记录：

```text
Fetch failed

Parser error

Request id
```

---

# 15. 错误返回安全


禁止：

返回：

内部异常。


错误：

错误：

```json
{
"error":
"KV_PASSWORD_SECRET_ERROR"
}
```


---

正确：

```json
{
"error":
"Internal Server Error"
}
```

---

# 16. Dependency Security


依赖：

必须：

定期检查。


推荐：

npm audit


---

禁止：

引入：

长期无人维护包。


---

# 17. Security Headers


必须支持：

```text
Content-Security-Policy

X-Content-Type-Options

X-Frame-Options

Referrer-Policy
```

---

# 18. Deployment Security


生产环境：

必须：

关闭 Debug。


---

禁止：

暴露：

开发接口。


---

# 19. Security Testing


必须测试：

## SSRF

测试：

- localhost
- private IP


---

## Authentication

测试：

- 未登录访问


---

## Input

测试：

- 超长输入
- 特殊字符


---

## XSS

测试：

节点名称注入。


---

# 20. Security Review Checklist


上线前：

必须确认：

```text
[ ] SSRF 防护完成

[ ] Authentication 完成

[ ] Secret 未提交

[ ] KV 无敏感数据

[ ] Rate Limit 完成

[ ] XSS 防护完成

[ ] Error 不泄露信息

[ ] Dependency 检查完成
```

---

# 21. 安全变更规则


任何安全相关修改：

必须记录：

```text
docs/adr/security-change.md
```

包含：

- 风险
- 修改方案
- 影响范围

---

# END