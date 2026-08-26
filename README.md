# CF-Workers-SUB-Next V2

> 基于 Cloudflare Workers 的订阅管理与多客户端配置生成平台
> 无需 VPS / Docker / 本地数据库，Fork 即用

[![CI/CD](https://github.com/bobvane/CF-Workers-SUB-Next/actions/workflows/ci-cd.yml/badge.svg)](https://github.com/bobvane/CF-Workers-SUB-Next/actions/workflows/ci-cd.yml)
![Version](https://img.shields.io/badge/version-2.8.0-533afd)

---

## ✨ 功能特性

| 功能 | 说明 |
|------|------|
| 🔐 **用户名 + 密码登录** | 双因子凭据认证，HttpOnly Cookie Session，可在设置页修改用户名/密码 |
| 📥 **订阅管理** | 添加 / 删除 / 手动更新订阅 URL；显示订阅链接；**每日自动更新**（更新时间可配置，北京时间） |
| 🔗 **节点解析** | VMess / VLESS / Trojan / Shadowsocks 四协议 |
| 🧹 **节点去重** | 按 `server:port:protocol` 三项指纹去重（节点列表页与输出生成层统一） |
| ✅ **节点启用管理** | 勾选/取消节点控制是否输出；订阅更新后新节点默认全部启用 |
| 🧼 **节点名清洗规则集** | 保存多条清洗规则（删除片段 / 替换 / 正则），**每次订阅更新后自动按序应用**；删除规则自动还原 |
| 🚀 **9 种客户端配置输出** | Mihomo / sing-box / v2ray / v2rayN / NekoBox / Shadowrocket / Loon / Surge / Quantumult X |
| 🌐 **分流规则系统** | 预置分组 + 六个预设按钮（极简/标准/完全体 ± 加密货币），双栏布局 + 1546 分类 MetaCubeX 规则库搜索 |
| 🛡️ **安全防护** | SSRF 防护 / XSS 转义 / 登录限流 / PBKDF2 密码哈希 |
| ⏱️ **定时任务** | 每小时 Cron 触发，命中设定小时执行订阅自动更新；规则目录每月同步一次 |
| 📊 **Web 管理面板** | Stripe 设计风格：仪表盘 / 订阅管理 / 节点列表 / 分流规则 / 输出配置 / 设置 |
| 🔔 **升级检测** | 自动检查 GitHub Releases 新版本，页面内提示 |
| 🌙 **暗色/亮色主题** | 手动切换 + localStorage 持久化 |

---

## 🚀 快速部署

### 前提条件

- Cloudflare 账号
- GitHub 账号

### 第一步：Fork 仓库

Fork [bobvane/CF-Workers-SUB-Next](https://github.com/bobvane/CF-Workers-SUB-Next) 到你自己的 GitHub 账号。

### 第二步：创建 KV 命名空间

1. 打开 [Cloudflare Dashboard](https://dash.cloudflare.com/) → **Workers & Pages** → **KV**
2. 点击 **Create namespace**，名称填 `DATABASE`，创建
3. 创建后复制 **Namespace ID**（一串字母数字）

### 第三步：配置 GitHub Secrets

进入你 Fork 的仓库 → **Settings** → **Secrets and variables** → **Actions** → **New repository secret**，添加：

| Secret | 说明 | 必填 |
|--------|------|------|
| `CLOUDFLARE_API_TOKEN` | Cloudflare API Token（权限：Workers R2 Edit + KV Edit） | ✅ |
| `KV_NAMESPACE_ID` | 上一步创建的 KV 命名空间 ID | ✅ |
| `ADMIN_PASSWORD` | 管理界面初始密码 | ✅ |
| `SESSION_SECRET` | Session 加密密钥（可用 `openssl rand -hex 32` 生成） | ✅ |
| `WORKER_GITHUB_TOKEN` | GitHub Personal Access Token（规则目录同步用，避免 403 限流） | ❌ |

> **WORKER_GITHUB_TOKEN 说明**（可选，推荐设置）
>
> 规则库的「立即刷新」按钮会调用 GitHub API 拉取 MetaCubeX 规则分类清单。未认证的 GitHub API 每小时限 60 次，
> 多人使用或频繁刷新容易触发 403 错误。设置此 Token 可将限流提升至 5000 次/小时。
>
> **申请步骤：**
> 1. 登录 GitHub → 右上角头像 → **Settings** → **Developer settings** → **Personal access tokens** → **Fine-grained tokens**
> 2. 点击 **Generate new token**
> 3. 设置：
>    - Token name: `CF-Workers-SUB-Next`
>    - Expiration: 选 **No expiration**（长期有效）
>    - Repository access: **Public repositories (read-only)**
>    - Permissions: 不需要额外权限（只读公开仓库，无需勾选）
> 4. 点击 **Generate token**，复制生成的 token
> 5. 在仓库 **Settings → Secrets and variables → Actions** 中新增 `WORKER_GITHUB_TOKEN`，填入复制的 token
> 6. 后续每次部署时，CI/CD 会自动将此 token 注入 Cloudflare Worker 的 Secrets，无需手动配置 Worker

### 第四步：启用 GitHub Actions

1. 进入仓库 **Actions** 页面
2. 如果看到 `"Workflows are disabled"`，点击 **"I understand my workflows, go ahead and enable them"**
3. 推送任意修改到 `main` 分支，或点击 **Actions** → **CI/CD** → **Run workflow**

### 第五步：访问

部署完成后访问：

```
https://cf-workers-sub-next.<你的子域名>.workers.dev
```

默认用户名 `admin`，密码为 `ADMIN_PASSWORD` 设置的值（登录后可在设置页修改）。

---

## 📖 使用指南

### 基本流程

1. **添加订阅** → 订阅管理页面，填入名称和订阅 URL
2. **查看节点** → 节点列表页面，勾选/取消勾选需要输出的节点
3. **保存清洗规则** → 节点页输入匹配内容（可正则、可替换），保存后立即生效且此后每次订阅更新自动应用
4. **配置规则** → 分流规则页面勾选分流规则，或直接点击预设按钮一键套用
5. **输出配置** → 选择客户端格式下载，或在客户端中填入订阅链接自动拉取

### 订阅链接与自动更新

- 订阅管理页面显示每个订阅的专属链接，可直接导入 OpenClash / Clash Mi 等客户端
- 客户端拉取 `/sub/{format}/{token}` 时**实时读取最新节点并生成配置**——不需要手动重新导出
- **每日自动更新**：设置页可配置更新时间（0-23 整数，北京时间，默认 07:00），到点自动拉取全部上游订阅并刷新节点

### 节点名清洗

节点列表页支持持久化清洗规则集，解决"订阅每天更新把原始乱名拉回来"的问题：

- **匹配内容**：要删除或匹配的片段（勾选"正则"则按正则表达式处理）
- **替换为**：留空 = 删除该片段；填写内容 = 替换（如 `香港` → `🇭🇰`）
- 保存后**立即应用到存量节点**，此后每次订阅更新完成自动按序应用
- 已保存规则可随时启停/删除；删除规则后其效果自动还原（应用时始终从原始节点名出发重放）
- "⚡ 立即应用已保存规则"按钮可对当前全部节点手动执行一遍

### 分流规则系统

规则页面采用双栏布局（左侧规则树 + 右侧规则库），顶部六个预设按钮：

| 预设 | 包含分组 |
|------|----------|
| 极简 | 广告拦截、国内直连、国内媒体、网易音乐、国外媒体、AI平台 |
| 极简+加密 | 极简 + 加密货币 |
| 标准 | 极简 + 谷歌FCM、微软Bing、微软云盘、微软服务、苹果服务、游戏平台 |
| 标准+加密 | 标准 + 加密货币 |
| 完全体 | 除加密货币外的全部 16 组 |
| 完全+加密 | 全部组 |

- 预设高亮仅在当前勾选状态与预设完全一致时显示；手动增删任何规则后即为自定义状态
- 细分业务组（AI平台/开发工具/社交等）排在宽泛厂商组之前——例如 GitHub 归"开发工具"而非"微软服务"，避免误直连
- 规则库扩展：可搜索 1546 个 MetaCubeX 全量分类加入任意分组，支持自定义显示名称和目标策略

### 核心策略组关系

| 策略组 | 类型 | 默认策略 |
|--------|------|----------|
| 节点选择 | select | 自动选择 |
| 手动切换 | select | 第一个节点 |
| 自动选择 | url-test | interval 1800s + tolerance 50（低频测速省流量） |
| 地理分组（香港/日本/美国…） | select | 手动选，零自动测速 |
| 广告拦截 | select | REJECT |
| 国内媒体 | select | DIRECT |
| 国外媒体 | select | 自动选择 |
| 漏网之鱼 | select | 节点选择 |

DNS 采用 `nameserver-policy` 单轮分流：国内域名走国内 DoH，国外域名走国外 DoH 并经代理隧道发出（`#节点选择` 后缀）；Sniffer 自动嗅探 TLS/HTTP/QUIC。

### 输出格式

九种格式均从同一份去重后的节点实时生成：

| 格式 | 说明 |
|------|------|
| **Mihomo YAML** | Clash Meta 内核（推荐，完整分流规则 + rule-providers） |
| sing-box JSON | 1.11+ 新写法（action: reject / hijack-dns），含 DNS/TUN/urltest |
| v2ray / v2rayN | Base64 节点链接 |
| NekoBox / Shadowrocket | 节点链接 |
| Loon | 原生语法（VLESS/Reality 完整支持） |
| Surge | 不支持 VLESS 的协议自动跳过，不伪造兼容行 |
| Quantumult X | vmess 补全 ws transport；VLESS 跳过 |

---

## 🧾 API 参考

| 方法 | 路径 | 说明 | 认证 |
|------|------|------|:----:|
| GET | `/api/meta` | 项目信息（名称、版本、仓库） | ❌ |
| GET | `/api/meta/check-upgrade` | 升级检测 | ❌ |
| GET | `/api/health` | 健康检查 | ❌ |
| POST | `/api/auth/login` | 登录（用户名+密码） | ❌ |
| POST | `/api/auth/logout` | 登出 | ❌ |
| GET | `/api/auth/session` | 会话检查 | ❌ |
| PUT | `/api/auth/password` | 修改密码 | ✅ |
| PUT | `/api/auth/username` | 修改用户名 | ✅ |
| GET | `/api/dashboard` | 仪表盘统计 | ✅ |
| GET | `/api/subscriptions` | 订阅列表 | ✅ |
| POST | `/api/subscriptions` | 创建订阅 | ✅ |
| DELETE | `/api/subscriptions/:id` | 删除订阅 | ✅ |
| POST | `/api/subscriptions/:id/update` | 更新订阅 | ✅ |
| GET | `/sub/:format/:token` | 订阅链接输出（客户端用） | ❌* |
| GET | `/api/nodes` | 节点列表（已去重，含启用状态） | ✅ |
| PUT | `/api/nodes/disabled` | 设置禁用节点 | ✅ |
| GET | `/api/nodes/clean-rules` | 清洗规则列表 | ✅ |
| POST | `/api/nodes/clean-rules` | 新增清洗规则 | ✅ |
| DELETE | `/api/nodes/clean-rules/:id` | 删除清洗规则 | ✅ |
| PUT | `/api/nodes/clean-rules/:id/toggle` | 启停清洗规则 | ✅ |
| POST | `/api/nodes/clean-rules/apply` | 立即应用全部规则 | ✅ |
| GET | `/api/rules/groups` | 规则分组（含自定义） | ✅ |
| GET | `/api/rules/catalog` | 全量分类目录（1546） | ✅ |
| GET/PUT | `/api/rules/selection` | 已勾选规则读写 | ✅ |
| GET/POST/DELETE | `/api/rules/custom[...]` | 自定义规则管理 | ✅ |
| GET | `/api/output/:format` | 下载配置（9 种格式） | ✅ |
| GET/PUT | `/api/settings` | 系统设置（名称/更新时间/密码等） | ✅ |

> *`/sub/:format/:token` 使用长随机 token 鉴权，请勿泄露。

---

## ⏰ 定时任务一览

| 任务 | 触发 | 说明 |
|------|------|------|
| 订阅自动更新 | 每小时 Cron 触发，命中设定小时才执行 | 默认每天北京 07:00，设置页可调 |
| 规则目录同步 | 每月 1 号 03:00 UTC | 同步 MetaCubeX 最新分类清单 |
| 清洗规则自动应用 | 每次订阅更新完成后 | 无独立定时，跟随更新 |
| 客户端侧 | Mihomo rule-providers 86400s / url-test 1800s | 输出配置内建，非 Worker 定时 |

无人访问时项目仅消耗每小时 1 次 Cron 触发（约 24 次/天），远低于 Cloudflare 免费额度。

---

## 🧩 项目结构

```
src/
├── index.ts           # Worker 入口 + scheduled handler + 依赖装配
├── meta.ts            # 项目元信息（版本、仓库、作者）
├── api/
│   ├── routes.ts      # Hono 路由（所有 API 端点）
│   ├── middleware.ts  # 认证 / 错误处理 / 请求解析
│   └── rate-limit.ts  # 登录限流
├── services/
│   ├── auth.service.ts          # 认证服务（用户名+密码, PBKDF2 Session）
│   ├── config.service.ts        # 配置服务（规则选择/自定义规则/清洗规则/输出生成）
│   ├── subscription.service.ts  # 订阅服务（更新后自动应用清洗规则）
│   └── ip-geo.service.ts        # IP 归属地查询（30 天 KV 缓存）
├── engine/
│   └── fetcher.ts     # 订阅内容获取（SSRF 防护）
├── parser/            # 协议解析器（vmess/vless/trojan/ss/clash/base64）
├── generator/
│   ├── mihomo.ts      # Mihomo YAML 生成器（策略组/DNS/Sniffer/rule-providers）
│   ├── singbox.ts     # sing-box 1.11+ 生成器
│   ├── loon.ts / surge.ts / quantumultx.ts / shadowrocket.ts
│   ├── base64-generator.ts / node-to-url.ts
│   ├── rule-providers.ts  # 分流规则提供者生成
│   └── yaml-serializer.ts # YAML 序列化
├── models/
│   ├── node.ts        # 节点数据模型（含 metadata.originalName）
│   └── clean-rule.ts  # 节点名清洗规则模型
├── data/
│   ├── metacubex-rules.ts       # 预定义规则分组（细分优先排序）
│   └── metacubex-catalog.json   # 全量 1546 分类目录
├── storage/
│   └── kv.ts          # KV 仓储层（Repository Pattern）
├── html.js            # 构建生成的前端内嵌模块
public/
└── index.html         # 前端 SPA（Stripe 风格，构建时内嵌）
tests/
├── api/ integration/ engine/ generator/ data/ services/ storage/
```

---

## 🔐 安全设计

- **SSRF 防护**：拒绝 localhost / 私有 IP / 内网地址，重定向二次校验
- **密码安全**：PBKDF2-SHA256 哈希 + 随机盐；改密码需验证旧密码
- **Session 管理**：HttpOnly + Secure + SameSite=Strict Cookie，7 天过期
- **XSS 防护**：前端所有用户输入在插入 DOM 前转义
- **登录限流**：10 次/分钟/IP，防暴力破解
- **Secrets 管理**：全部存 Cloudflare Secrets，代码零敏感信息

---

## 🧪 测试

```bash
npm test         # 运行所有测试（299 项）
npm run lint     # ESLint 检查
npm run typecheck # TypeScript 类型检查
npm run build    # 构建（含前端内嵌）
```

---

## 📄 License

MIT

## 👤 作者

[Bob Vane](https://github.com/bobvane)
