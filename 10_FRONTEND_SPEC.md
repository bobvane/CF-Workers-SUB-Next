# CF-Workers-SUB-Next V2

# Frontend Specification

版本：V2.0

---

# 1. 前端目标

Frontend 负责：

提供用户管理 CF-Workers-SUB-Next 的 Web 界面。

用户通过浏览器完成：

- 登录
- 添加订阅
- 管理订阅
- 查看节点
- 生成配置
- 获取订阅链接

---

# 2. 前端技术约束

## 技术栈

V1 使用：

- HTML5
- CSS3
- JavaScript ES Module


---

禁止：

V1 不使用：

- React
- Vue
- Angular
- Next.js


原因：

- 降低复杂度
- 减少构建链
- 更适合 Cloudflare Workers


---

# 3. 前端目录


```text
public/


├── index.html


├── app.js


├── api.js


├── auth.js


├── components/


│   ├── navbar.js

│   ├── modal.js

│   └── table.js


├── pages/


│   ├── dashboard.js

│   ├── subscriptions.js

│   ├── nodes.js

│   ├── output.js

│   └── settings.js


└── style.css

```

---

# 4. 页面结构


整体：

```text
Login

 |

Dashboard

 |

--------------------------------

Dashboard

Subscriptions

Nodes

Output

Settings

--------------------------------
```

---

# 5. Login 页面


## 功能

用户输入：

管理员密码。


流程：

```text
Input Password

        |

        v

POST /api/auth/login

        |

        v

Save Session Token

        |

        v

Dashboard

```

---

# 6. Dashboard 页面


目标：

快速了解系统状态。


显示：


## 统计卡片


包括：

- Subscription 数量
- Node 数量
- 最近更新时间


---

数据来源：

```text
GET /api/dashboard
```

---

# 7. Subscription 页面


核心页面。


功能：

## 查看订阅


显示：

|字段|说明|
|-|-|
|名称|用户名称|
|状态|active/error|
|节点数量|解析数量|
|更新时间|最后更新|


---

## 添加订阅


表单：

字段：

```text
Name

URL

```

---

提交：

```text
POST /api/subscriptions
```

---

## 更新订阅


按钮：

Update


调用：

```text
POST /api/subscriptions/:id/update
```

---

## 删除订阅


删除前：

必须确认。


---

# 8. Nodes 页面


展示：

标准化后的 Node。


---

显示：

字段：

- 名称
- 协议
- Server
- Port
- TLS


---

支持：

搜索：

关键词。


---

注意：

前端搜索：

只负责显示。


过滤逻辑：

属于后端 Rule Engine。


---

# 9. Output 页面


用于生成客户端配置。


---

显示：

## Mihomo


按钮：

Generate


结果：

```text
/sub/mihomo/token
```


提供：

- 复制链接
- 下载 YAML


---

## Sing-box


按钮：

Generate


结果：

```text
/sub/singbox/token
```


---

# 10. Settings 页面


V1：

简单设置。


包括：

- 系统名称
- 默认模板


---

不包含：

高级系统管理。


---

# 11. 前端 API 调用规范


所有请求：

统一通过：

```text
api.js
```

---

示例：

```javascript
api.get('/subscriptions')
```

---

禁止：

页面文件直接：

```javascript
fetch('/api/xxx')
```

---

原因：

统一：

- Token
- 错误处理
- 请求配置


---

# 12. Authentication Handling


Token 保存：

推荐：

Session Cookie。


---

禁止：

长期保存：

LocalStorage Token。


原因：

安全风险。


---

# 13. 状态管理


V1：

不引入状态框架。


使用：

简单模块状态。


例如：

```javascript
const state = {

user:null,

subscriptions:[]

}
```

---

# 14. UI 设计原则


要求：

## 简洁


避免：

复杂动画。


---

## 响应式


支持：

- Desktop
- Tablet
- Mobile


---

## 可访问性


支持：

- 清晰文字
- 合理颜色
- 键盘操作


---

# 15. 错误提示规范


统一：

Toast。


类型：

```text
Success

Warning

Error
```

---

示例：

成功：

```text
Subscription updated
```

失败：

```text
Failed to fetch subscription
```

---

# 16. Loading 状态


所有异步操作：

必须显示：

Loading。


例如：

Update Subscription：

```text
Updating...

↓

Completed
```

---

禁止：

用户点击后无反馈。


---

# 17. 空状态设计


例如：

没有订阅：

显示：

```text
No subscriptions yet

Add your first subscription
```

---

禁止：

空白页面。


---

# 18. 前端安全


必须：

防止：

XSS。


---

禁止：

直接：

```javascript
innerHTML=userInput
```

---

用户输入：

必须转义。


---

# 19. 浏览器兼容


支持：

- Chrome
- Edge
- Safari
- Firefox


---

# 20. 前端测试要求


最低：

测试：

- 登录流程
- 添加订阅
- 删除订阅
- 输出链接生成


---

# 21. 前端完成标准


完成：

必须满足：


```text
页面可访问

+

API调用正常

+

错误提示完整

+

移动端可用

+

无明显安全问题

```

---

# END