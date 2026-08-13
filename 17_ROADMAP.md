# CF-Workers-SUB-Next V2

# Project Roadmap

版本：V2.0

---

# 1. Roadmap Purpose

本文档定义：

CF-Workers-SUB-Next V2 的开发路线。

目标：

控制项目范围。

确保：

先完成核心价值。

再逐步扩展。


---

# 2. Product Vision


CF-Workers-SUB-Next 的目标：

成为一个：

轻量、可靠、Cloudflare Native 的订阅转换管理工具。


核心能力：

```text id="7pw1m7"
Subscription

↓

Parse

↓

Manage

↓

Generate

↓

Deploy

```

---

# 3. Development Philosophy


遵循：

MVP First。


原则：

> 完成 80% 用户最需要的功能，比开发 200% 不稳定功能更重要。


---

# 4. Phase Overview


项目分为：

```text id="kl8q7s"
Phase 1

MVP Core


↓

Phase 2

Usability Enhancement


↓

Phase 3

Advanced Features


↓

Phase 4

Open Source Ecosystem

```

---

# Phase 1 - MVP Core

目标：

完成基础可用版本。


---

## 4.1 Project Foundation


完成：

- Cloudflare Worker
- KV Storage
- Wrangler
- Basic CI


---

## 4.2 Authentication


完成：

- Admin Login
- Session
- Logout


---

## 4.3 Subscription Management


完成：

支持：

- 添加订阅
- 删除订阅
- 更新订阅


---

## 4.4 Parser Engine


必须支持：


协议：

|协议|状态|
|-|-|
|VMess|必须|
|VLESS|必须|
|Trojan|必须|
|Shadowsocks|必须|


---

## 4.5 Config Generator


必须支持：


输出：

- Mihomo YAML
- Sing-box JSON


---

## 4.6 Basic Web UI


页面：

必须：

```text id="5c5g4q"
Login

Dashboard

Subscriptions

Nodes

Output

```

---

# Phase 1 完成标准


达到：

用户可以：

```text id="w3y2xq"
登录

↓

添加机场订阅

↓

解析节点

↓

生成配置

↓

导入客户端使用

```

---

# Phase 2 - Usability Enhancement


目标：

提升使用体验。


---

# 5.1 Better Dashboard


增加：

- 更多统计
- 更新时间
- 错误状态


---

# 5.2 Rule Management


增加：

用户规则。


例如：

包含：

```text id="2b1h4w"
香港

日本

美国
```


排除：

```text id="m6w4e4"
过期

测试
```

---

# 5.3 Template System


支持：

用户自定义：

Mihomo 模板。


---

# 5.4 Subscription History


保存：

历史版本。


支持：

回滚。


---

# 5.5 Better Error Reporting


增加：

详细错误：

- Fetch失败
- Parse失败
- Generate失败


---

# Phase 3 - Advanced Features


目标：

高级能力。


---

# 6.1 Node Health Analysis


增加：

节点分析。


例如：

- 延迟
- 可用性
- 地区


---

注意：

不是 MVP。


---

# 6.2 Automatic Node Ranking


根据：

- 延迟
- 稳定性
- 用户规则


生成推荐。


---

# 6.3 Multiple User Support


支持：

多个管理员。


---

注意：

需要重新设计：

权限模型。


---

# 6.4 API Access


提供：

开放 API。


---

# Phase 4 - Open Source Ecosystem


目标：

成为成熟开源项目。


---

# 7.1 Plugin System


允许：

扩展：

Parser。


例如：

新增：

Hysteria2。


---

# 7.2 Community Templates


支持：

共享：

配置模板。


---

# 7.3 Documentation Website


建立：

项目官网。


包含：

- Installation
- Configuration
- FAQ


---

# 8. Features Explicitly NOT Planned


以下功能：

当前不做。


---

# 8.1 Built-in VPN


不开发：

代理客户端。


原因：

不是项目目标。


---

# 8.2 Commercial Subscription Platform


不开发：

- 支付
- 用户充值
- 商业套餐


---

# 8.3 Full Network Monitoring


不开发：

大型监控平台。


---

# 8.4 AI Auto Trading Style Recommendation


不开发：

复杂 AI 决策系统。


---

# 9. Priority Matrix


|功能|优先级|
|-|-|
|Subscription Parse|P0|
|Config Generate|P0|
|Cloudflare Deploy|P0|
|Authentication|P0|
|Web UI|P0|
|Rule Engine|P1|
|Template System|P1|
|Node Analysis|P2|
|Multi User|P3|
|Plugin System|P3|


---

# 10. Release Version Plan


## v2.0.0


MVP Release。


包含：

- Parser
- Generator
- UI
- Deployment


---

## v2.1.0


体验优化。


包含：

- Rules
- Templates
- Better Dashboard


---

## v2.2.0


高级能力。


包含：

- Node Analysis
- Ranking


---

## v3.0.0


生态版本。


包含：

- Plugin
- API
- Community


---

# 11. AI Agent Scope Control Rules


开发过程中：

AI Agent 必须遵守：


如果需求：

不属于当前 Phase。


必须：

记录：

```text id="9n5n4g"
Future Feature
```

不要立即开发。


---

# 12. Roadmap Review


每个版本：

重新评估：

- 用户需求
- 技术成本
- 维护成本


---

# 13. Final Goal


最终目标：

建立：

```text id="6tx6d7"
Reliable

+

Simple

+

Cloudflare Native

+

Open Source

Subscription Management Platform

```

---

# END