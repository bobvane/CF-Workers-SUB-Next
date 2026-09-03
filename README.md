# CF-Workers-SUB-Next V2

> 基于 Cloudflare Workers 的订阅管理与多客户端配置生成平台
> 无需 VPS / Docker / 本地数据库 —— Fork 即用

[![CI/CD](https://github.com/bobvane/CF-Workers-SUB-Next/actions/workflows/ci-cd.yml/badge.svg)](https://github.com/bobvane/CF-Workers-SUB-Next/actions/workflows/ci-cd.yml)
![Version](https://img.shields.io/badge/version-2.19.5-533afd)

---

## 🎯 什么是这个项目？

**CF-Workers-SUB-Next** 是一个部署在 Cloudflare Workers 上的订阅管理 + 配置生成器。它解决了「机场订阅里节点乱码 / 重复 / 没国家标签」、「想切换客户端却要一个个手动导」等痛点。

**工作流程（用户视角）：**

```
添加订阅 URL
    ↓
每日 07:00 (北京) 自动抓取
    ↓
解析 VMess / VLESS / Trojan / SS / Hysteria2 / TUIC / WireGuard / AnyTLS
    ↓
按 server:port:protocol 去重 + 节点名清洗
    ↓
自动识别节点国家归属 → 按地区生成策略组
    ↓
输出 9 种客户端配置
    ↓
订阅链接 /sub/... 供 Clash / Mihomo / Loon / Shadowrocket 等直接订阅
```

📦 部署在 Cloudflare Workers，0 成本（免费额度内），每日自动更新。

---

## 🚀 5 分钟部署教程

### 前提条件

- Cloudflare 账号（ Workers 免费额度即可 ）
- GitHub 账号

### 第一步：Fork 仓库

点击 [bobvane/CF-Workers-SUB-Next](https://github.com/bobvane/CF-Workers-SUB-Next/generate) →「Use this template」→ 创建新仓库。

### 第二步：创建 KV 命名空间

1. 打开 [Cloudflare Dashboard](https://dash.cloudflare.com/) → **Workers & Pages** → **KV**
2. 点击 **Create namespace**，名称填 `DATABASE`，创建
3. 复制 **Namespace ID**

### 第三步：配置 GitHub Secrets

进入你的仓库 → **Settings** → **Secrets and variables → Actions** → **New repository secret**：

| Secret | 说明 | 必填 |
|--------|------|------|
| `CLOUDFLARE_API_TOKEN` | Cloudflare API Token（权限：Workers Scripts Edit + KV Edit） | ✅ |
| `KV_NAMESPACE_ID` | 上一步创建的 KV ID | ✅ |
| `ADMIN_PASSWORD` | 登录密码 | ✅ |
| `SESSION_SECRET` | Session 密钥（`openssl rand -hex 32` 生成） | ✅ |
| `WORKER_GITHUB_TOKEN` | GitHub Token 防 API 限流（可选，推荐） | ❌ |

### 第四步：触发部署

1. 进入仓库 **Actions** 页面
2. 如果显示 **"Workflows are disabled"**，点击启用
3. 推送任意修改到 `main` 分支，或点击 **Run workflow** 手动触发

CI 会自动：安装依赖 → 跑测试 → 构建 → 部署到 Cloudflare Workers → 创建 Release。

### 第五步：访问

部署完成后访问：

```
https://cf-workers-sub-next.<你的子域名>.workers.dev
```

默认用户名 `admin`，密码为 `ADMIN_PASSWORD` 设置的值（登录后在设置页可修改）。

---

## 🔧 功能特性

### 订阅管理
- **多订阅**：添加 / 删除 / 手动更新任意数量订阅 URL
- **每日自动更新**：默认北京时间 07:00，设置页可调

### 节点解析 & 清洗
- **9 种协议支持**：VMess / VLESS(TCP+Reality+XTLS) / Trojan / SS / Hysteria2 / TUIC / WireGuard / AnyTLS
- **去重**：按 `server:port:protocol` 三项指纹去重
- **节点名清洗规则集**：删除片段 / 替换 / 正则；订阅更新后自动按序应用；删除规则即时还原
- **节点启用管理**：勾选 / 取消控制是否输出；订阅更新后新节点默认全部启用

### 智能分流
- **11 组固定分流**（全部原生 GEOSITE 输出）：广告拦截 / 国内直连 / 谷歌FCM / AI平台 / 社交 / 国外媒体 / Google服务 / 游戏平台 / 微软服务 / 苹果服务 / 加密货币
- **6 个快速预设按钮**：极简 / 极简+加密 / 标准 / 标准+加密 / 完全体 / 完全+加密
- **自定义规则**：从 1546 个 MetaCubeX 分类中搜索添加到任意分组
- **国家归属识别**：自动解析节点 IP → 查询地理归属 → 按国家生成策略组

### 多客户端输出
- **9 种格式**：Mihomo YAML / sing-box JSON / v2ray / v2rayN / NekoBox / Shadowrocket / Loon / Surge / Quantumult X
- **智能跳过**：不支持的协议自动跳过（如 Surge 不支持 VLESS）

### 安全防护
- **SSRF 防护**：拒绝 localhost / 私有 IP / 内网地址，重定向二次校验
- **密码安全**：PBKDF2-SHA256 哈希 + 随机盐，改密码需验证旧密码
- **Session 管理**：HttpOnly + Secure + SameSite=Strict Cookie，7 天过期
- **XSS 防护**：前端所有用户输入插入 DOM 前转义
- **登录限流**：10 次/分钟/IP，防暴力破解
- **Secrets 管理**：全部存 Cloudflare Secrets，代码零敏感信息

### 界面 & 体验
- **Stripe 风格设计**：仪表盘 / 订阅管理 / 节点列表 / 分流规则 / 输出配置 / 设置
- **暗色 / 亮色主题**：手动切换 + localStorage 持久化
- **进度提示**：订阅更新 / 国家检测带居中进度条 + 120s 超时

### 后台服务
- **Cloudflare 请求统计（v2.18.0）**：仪表盘显示今日 Workers 请求量，最多绑定 3 个 CF 账户
- **未识别节点自动重试（v2.19.1）**：后台每分钟批量重查未识别 IP，10 次仍未识别时界面提示

---

## 📲 支持的客户端 (9 种)

| 格式 | 支持协议 | 说明 |
|------|---------|------|
| **Mihomo YAML** | 全部 | Clash Meta 内核，完整分流规则 + rule-providers |
| **sing-box JSON** | 全部 | 1.11+ 新格式，含 DNS/TUN/urltest |
| **v2ray** | 全部 | Base64 节点链接 |
| **v2rayN** | 全部 | Base64 节点链接，兼容 v2rayN 系 |
| **NekoBox / nekoray** | 全部 | Base64 节点链接 |
| **Shadowrocket** | 全部 | 原生语法，VLESS/Reality 完整支持 |
| **Loon** | 全部 | 原生 Loon 配置文件 |
| **Surge** | 部分 | 不支持 VLESS 的协议自动跳过 |
| **Quantumult X** | 部分 | VLESS 跳过，Vmess 补全 ws transport |

> ⚠️ **客户端兼容性**：sing-box ≥ 1.11；Mihomo/Clash.Meta ≥ v1.12；Shadowrocket ≥ 2.2.0；Loon ≥ 2.0；Surge ≥ 4.9.0；QX ≥ 1.3。

---

## 🌟 项目特色

### 1. 零成本地部署
纯 Cloudflare Workers，无需 VPS、Docker、本地数据库，Fork 后 5 分钟上线。

### 2. 自动清洗节点名
订阅更新后，**自动** 应用你的清洗规则集 —— 删除乱码、统一命名、批量替换。

### 3. 智能国家归属识别
系统自动解析节点 IP 地址 → 查询 IP 地理归属 → **自动生成国家策略组**，自动选择组在有节点的国家地理组间测速。

### 4. 原生 GEOSITE 分流
所有分流规则均使用**原生 `GEOSITE,xxx,DIRECT`** 输出（无 rule-providers 下载开销），依赖 Mihomo/Clash 内核自带的 GeoSite 数据库。

### 5. 自动选择组按地区测速 (v2.19.4)
「自动选择」组（url-test）的测速对象从「单个节点」改为「有节点的国家地理组」，选出最优地区而非单节点，更稳定。

### 6. 节点启用 / 过滤
在节点列表页勾选 / 取消节点，仅选中的节点会出现在输出配置中。

### 7. 每日自动更新
订阅每日北京 07:00 (UTC+8) 自动抓取；规则库每月 1 号同步一次。

### 8. 仪表盘统计 (v2.18.0)
仪表盘显示今日 Cloudflare Workers 请求量（Pages + Workers 拆分），最多绑定 3 个 CF 账户，>80% 红色警示。

### 9. 未识别节点自动重试 (v2.19.1)
后台每分钟批量重查未识别 IP，连续 10 次仍未识别时在界面提示具体 IP 列表，建议检查节点。

### 10. 三组默认策略可定制
微软服务 / 漏网之鱼 / GLOBAL 的 `default-selected` 可在生成的 Mihomo 配置中定制。

---

## ⚙️ 管理面板

| 页面 | 功能 |
|------|------|
| **📊 仪表盘** | 节点总数 / 订阅数 / CF 请求统计 |
| **📥 订阅管理** | 添加 / 删除 / 更新订阅 URL；显示专属订阅链接 |
| **🔗 节点列表** | 查看 / 启用 / 禁用节点；设置清洗规则；国家归属 |
| **🌐 分流规则** | 勾选规则 / 自定义规则；六个预设按钮 |
| **📦 输出配置** | 下载 9 种格式；手动刷新订阅 |
| **⚙️ 设置** | 修改用户名/密码；配置自动更新时间；CF 统计账户 |

---

## ⏰ 定时任务

| 任务 | 触发 | 说明 |
|------|------|------|
| **订阅自动更新** | 每小时 Cron（默认北京 07:00） | 拉取全部订阅并刷新节点 |
| **规则目录同步** | 每月 1 号 03:00 UTC | 同步 MetaCubeX 最新分类清单 |
| **Geo 重试 (后台)** | 每分钟 Cron | 批量重查未识别 IP，10 次上限 |
| **客户端侧** | Mihomo url-test 300s | 输出配置内建，非 Worker 定时 |

---

## 🛡️ 安全设计

- **SSRF 防护**：拒绝 localhost / 私有 IP / 内网地址，重定向二次校验
- **密码安全**：PBKDF2-SHA256 哈希 + 随机盐，改密码需验证旧密码
- **Session 管理**：HttpOnly + Secure + SameSite=Strict Cookie，7 天过期
- **XSS 防护**：前端所有用户输入插入 DOM 前转义
- **登录限流**：10 次/分钟/IP，防暴力破解
- **Secrets 管理**：全部存 Cloudflare Secrets，代码零敏感信息

---

## 📡 API 接口

| 方法 | 路径 | 说明 | 认证 |
|------|------|------|------|
| GET | `/api/meta` | 项目信息 | ❌ |
| GET | `/api/meta/check-upgrade` | 升级检测 | ❌ |
| GET | `/api/health` | 健康检查 | ❌ |
| POST | `/api/auth/login` | 登录 | ❌ |
| POST | `/api/auth/logout` | 登出 | ❌ |
| GET | `/api/auth/session` | 会话检查 | ❌ |
| PUT | `/api/auth/password` | 修改密码 | ✅ |
| PUT | `/api/auth/username` | 修改用户名 | ✅ |
| GET | `/api/dashboard` | 仪表盘统计 | ✅ |
| GET | `/api/subscriptions` | 订阅列表 | ✅ |
| POST | `/api/subscriptions` | 创建订阅 | ✅ |
| DELETE | `/api/subscriptions/:id` | 删除订阅 | ✅ |
| POST | `/api/subscriptions/:id/update` | 更新订阅 | ✅ |
| GET | `/sub/:format/:token` | 客户端订阅链接 | ❌* |
| GET | `/api/nodes` | 节点列表 | ✅ |
| GET | `/api/nodes/geo-pending` | 未识别节点重试状态 | ✅ |
| PUT | `/api/nodes/disabled` | 设置禁用节点 | ✅ |
| GET | `/api/nodes/clean-rules` | 清洗规则列表 | ✅ |
| POST | `/api/nodes/clean-rules` | 新增清洗规则 | ✅ |
| DELETE | `/api/nodes/clean-rules/:id` | 删除清洗规则 | ✅ |
| PUT | `/api/nodes/clean-rules/:id/toggle` | 启停清洗规则 | ✅ |
| POST | `/api/nodes/clean-rules/apply` | 立即应用全部规则 | ✅ |
| GET | `/api/rules/groups` | 规则分组 | ✅ |
| GET | `/api/rules/catalog` | 全量分类目录 | ✅ |
| GET/PUT | `/api/rules/selection` | 已勾选规则 | ✅ |
| GET/POST/DELETE | `/api/rules/custom` | 自定义规则 | ✅ |
| GET | `/api/output/:format` | 下载配置 | ✅ |
| GET/PUT | `/api/settings` | 系统设置 | ✅ |
| GET/POST/DELETE | `/api/cf-usage/accounts` | CF 统计账户 CRUD | ✅ |
| GET | `/api/cf-usage` | CF 请求统计 | ✅ |

> *`/sub/:format/:token` 使用长随机 token 鉴权，请勿泄露。

---

## 🧪 测试

```bash
npm test         # 运行所有测试（404 项）
npm run lint     # ESLint 检查
npx tsc --noEmit # TypeScript 类型检查
npm run build    # 构建（含前端内嵌）
```

---

## 📁 项目结构

```
CF-Workers-SUB-Next/
├── src/
│   ├── index.ts              # Worker 入口 + scheduled handler
│   ├── meta.ts               # 项目元信息
│   ├── api/
│   │   ├── routes.ts         # Hono 路由（所有 API 端点）
│   │   ├── middleware.ts     # 认证 / 错误处理
│   │   └── rate-limit.ts     # 登录限流
│   ├── services/
│   │   ├── config.service.ts # 配置服务（规则/节点/清洗）
│   │   ├── subscription.service.ts
│   ├── parser/               # 协议解析 (VMess/VLESS/Trojan/SS/...)
│   ├── generator/
│   │   ├── mihomo.ts         # Mihomo YAML 生成
│   │   ├── singbox.ts
│   │   ├── loon.ts / surge.ts / quantumultx.ts / shadowrocket.ts
│   │   ├── base64-generator.ts
│   │   ├── rule-providers.ts
│   │   └── yaml-serializer.ts
│   ├── data/
│   │   ├── metacubex-rules.ts  # 11 组分流规则定义
│   │   └── metacubex-catalog.json
│   ├── storage/kv.ts         # KV 仓储层
│   └── html.js               # 构建生成的前端内嵌
├── public/index.html         # 前端 SPA
├── tests/                    # 404 测试
├── docs/                     # 文档
├── wrangler.toml
├── package.json
└── CHANGELOG.md
```

---

## 📄 License

MIT

## 👤 作者

[Bob Vane](https://github.com/bobvane)
