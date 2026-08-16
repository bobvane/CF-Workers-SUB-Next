# CF-Workers-SUB-Next V2

> 基于 Cloudflare Workers 的订阅管理与配置生成平台
> 无需 VPS / Docker / 本地数据库，Fork 即用

[![CI/CD](https://github.com/bobvane/CF-Workers-SUB-Next/actions/workflows/ci-cd.yml/badge.svg)](https://github.com/bobvane/CF-Workers-SUB-Next/actions/workflows/ci-cd.yml)

---

## ✨ 功能特性

| 功能 | 说明 |
|------|------|
| 🔐 **管理员登录** | 密码认证 + HttpOnly Cookie Session 管理 |
| 📥 **订阅管理** | 添加 / 删除 / 手动更新订阅 URL |
| 🔗 **节点解析** | VMess / VLESS / Trojan / Shadowsocks 四协议 |
| 🧹 **节点去重** | 自动去重 + 关键字过滤 + 节点指纹 |
| 🚀 **Mihomo 配置生成** | 完整 YAML 输出（rule-providers + 有序 rules） |
| 🌐 **分流规则系统** | 预置 10 大类 80+ 规则 + 自定义规则库（全量 1546 分类） |
| 🛡️ **安全防护** | SSRF 防护 / XSS 转义 / 登录限流 / PBKDF2 密码哈希 |
| 📊 **Web 管理面板** | 仪表盘 / 订阅管理 / 节点列表 / 分流规则 / 输出配置 / 设置 |
| 📚 **规则库扩展** | 从 1546 个 MetaCubeX 分类中搜索挑选，自定义加入分流规则 |
| 🔔 **升级检测** | 自动检查 GitHub Releases 新版本，页面内提示 |
| 🌙 **暗色/亮色主题** | 跟随系统主题，自适应 |
| 🚀 **自动部署** | GitHub Actions 一键部署到 Cloudflare Workers |

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
| `ADMIN_PASSWORD` | 管理界面登录密码 | ✅ |
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
使用 `ADMIN_PASSWORD` 设置的密码登录。

---

## 📖 使用指南

### 基本流程

1. **添加订阅** → 订阅管理页面，填入名称和订阅 URL
2. **查看节点** → 节点列表页面，勾选/取消勾选需要输出的节点
3. **配置规则** → 分流规则页面，勾选需要的分流规则（默认无规则，需手动选择）
4. **输出配置** → 选择格式（Mihomo YAML），下载后导入客户端

### 规则系统

规则页面预置了 10 个大类分组，按优先级（自上而下）覆盖日常使用场景：

| 分组 | 包含规则 |
|------|---------|
| 🔥 广告拦截 | 广告拦截通用合集（REJECT） |
| 🇨🇳 国内直连 | 私有地址、中国直连域名、百度/阿里/腾讯/京东、Bilibili/爱奇艺/优酷（DIRECT） |
| 🎬 国外媒体 | Netflix、YouTube、Disney+、HBO、Spotify、TikTok 等 |
| 🪙 加密货币 | Binance、Coinbase、Uniswap 等 |
| 🤖 AI 服务 | OpenAI、Anthropic、Gemini 等 |
| 💬 社交 | Telegram、Twitter、Instagram、Discord 等 |
| 🎮 游戏 | Steam、Epic、PlayStation、Xbox 等 |
| 🏢 云服务 | Cloudflare、AWS、Google Cloud、Azure 等 |
| 💻 开发 | GitHub、GitLab、NPMJS、Docker 等 |
| 👑 用户规则 | Adobe、Apple、Zoom 等 + 用户自定义兜底 |

**规则库扩展**：设置页内置规则库扫描功能，可搜索 1546 个 MetaCubeX 全量分类，挑选加入任意分组，支持自定义显示名称和目标策略（代理/直连/拦截）。

### 输出格式

| 格式 | 说明 | 分流规则 |
|------|------|:--------:|
| **Mihomo YAML** | Clash Meta 内核配置（推荐） | ✅ 完整规则 |
| Sing-box JSON | 新版通用代理内核 | ❌ 未实现 |
| Surge | Apple 生态代理工具 | ❌ 未实现 |

---

## 📚 API 参考

| 方法 | 路径 | 说明 | 认证 |
|------|------|------|:----:|
| GET | `/api/meta` | 项目信息（名称、版本、仓库） | ❌ |
| GET | `/api/meta/check-upgrade` | 升级检测 | ❌ |
| GET | `/api/health` | 健康检查 | ❌ |
| POST | `/api/auth/login` | 登录 | ❌ |
| POST | `/api/auth/logout` | 登出 | ❌ |
| GET | `/api/auth/session` | 会话检查 | ❌ |
| GET | `/api/dashboard` | 仪表盘统计 | ✅ |
| GET | `/api/subscriptions` | 订阅列表 | ✅ |
| POST | `/api/subscriptions` | 创建订阅 | ✅ |
| DELETE | `/api/subscriptions/:id` | 删除订阅 | ✅ |
| POST | `/api/subscriptions/:id/update` | 更新订阅 | ✅ |
| GET | `/api/nodes` | 节点列表 | ✅ |
| PUT | `/api/nodes/disabled` | 设置禁用节点 | ✅ |
| **分流规则** | | | |
| GET | `/api/rules/groups` | 规则分组（含自定义） | ✅ |
| GET | `/api/rules/catalog` | 全量分类目录（1546） | ✅ |
| GET | `/api/rules/selection` | 已勾选规则 ID | ✅ |
| PUT | `/api/rules/selection` | 保存勾选规则 | ✅ |
| GET | `/api/rules/custom` | 自定义规则列表 | ✅ |
| POST | `/api/rules/custom` | 添加/更新自定义规则 | ✅ |
| DELETE | `/api/rules/custom/:id` | 删除自定义规则 | ✅ |
| **配置输出** | | | |
| GET | `/api/output/mihomo` | 下载 Mihomo YAML 配置 | ✅ |
| POST | `/api/output/mihomo` | 生成并返回配置内容 | ✅ |
| **设置** | | | |
| GET | `/api/settings` | 获取设置 | ✅ |
| PUT | `/api/settings` | 保存设置 | ✅ |

---

## 🧩 项目结构

```
src/
├── index.ts           # Worker 入口 + 依赖装配
├── meta.ts            # 项目元信息（版本、仓库、作者）
├── api/
│   ├── routes.ts      # Hono 路由（所有 API 端点）
│   ├── middleware.ts   # 认证 / 错误处理 / 请求解析
│   └── rate-limit.ts  # 登录限流
├── services/
│   ├── auth.service.ts       # 认证服务（PBKDF2 Session）
│   ├── config.service.ts     # 配置服务（规则选择 + 自定义规则）
│   └── subscription.service.ts  # 订阅服务
├── engine/
│   ├── fetcher.ts     # 订阅内容获取（SSRF 防护）
│   └── parser.ts      # 内容解析调度
├── parser/            # 协议解析器（vmess/vless/trojan/ss）
├── generator/
│   ├── mihomo.ts      # Mihomo YAML 生成器
│   ├── rule-providers.ts  # 分流规则提供者生成
│   └── yaml-serializer.ts # YAML 序列化
├── models/
│   └── node.ts        # 节点数据模型
├── data/
│   ├── metacubex-rules.ts   # 预定义规则分组（10 大类 80+ 规则）
│   └── metacubex-catalog.json  # 全量 1546 分类目录
├── storage/
│   └── kv.ts          # KV 仓储层（Repository Pattern）
├── html.js            # 构建生成的前端内嵌模块
public/
└── index.html         # 前端 SPA（构建时内嵌）
tests/
├── unit/              # 单元测试
├── integration/       # 集成测试（使用 MemoryKvAdapter）
├── generator/         # 生成器测试
├── data/              # 数据层测试
└── services/          # 服务层测试
```

---

## 🔐 安全设计

- **SSRF 防护**：拒绝 localhost / 私有 IP / 内网地址，重定向二次校验
- **密码安全**：PBKDF2-SHA256 哈希 + 随机盐
- **Session 管理**：HttpOnly + Secure + SameSite=Strict Cookie，7 天过期
- **XSS 防护**：前端所有用户输入在插入 DOM 前转义
- **登录限流**：10 次/分钟/IP，防暴力破解
- **Secrets 管理**：全部存 Cloudflare Secrets，代码零敏感信息

---

## 🧪 测试

```bash
npm test         # 运行所有测试
npm run lint     # ESLint 检查
npm run build    # 类型检查 + 前端构建
```

当前测试覆盖：244 项测试（单元 + 集成 + 生成器 + 数据层）

---

## 📄 License

MIT

## 👤 作者

[Bob Vane](https://github.com/bobvane)