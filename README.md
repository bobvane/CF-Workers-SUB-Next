# CF-Workers-SUB-Next 技术规格书

> 基于 UI 原型 v0.2 的设计决策编写
> 对应项目规划：第二阶段 → 技术方案设计

---

## 一、项目文件结构

```
CF-Workers-SUB-Next/
├── src/
│   ├── index.js              # Worker 入口 + 路由分发 + 核心逻辑
│   ├── auth.js               # 密码登录 + Session 管理
│   ├── kv.js                 # KV 读写封装
│   ├── utils.js              # 工具函数（加密、hash、token 生成、Cookie 解析）
│   ├── parser.js             # 节点协议解析器（vmess/vless/trojan/ss/ssr/hysteria2/tuic）
│   ├── formatter.js          # 多格式输出生成器
│   ├── health.js             # 节点健康检测
│   └── html.js               # 前端 HTML 编译输出（构建时生成）
├── static/
│   └── index.html            # 前端单页应用源码（UI 原型）
├── scripts/
│   └── inline-html.js        # HTML → JS 模块构建脚本
├── .github/
│   └── workflows/
│       └── deploy.yml        # GitHub Actions 自动部署
├── wrangler.toml             # Cloudflare Workers 配置
├── package.json
├── 项目规划.md               # 项目规划文档
├── 技术规格书.md              # 本文档
└── README.md                 # 项目说明（含部署指南、API Token 设置方法）
```

---

## 二、Cloudflare KV 数据结构

KV 是整个项目的持久化存储，遵循最小化原则，只存必要数据。

### 2.1 KV 命名空间

| 命名空间 | 用途 | 备注 |
|---------|------|------|
| `SUB_NEXT_DATA` | 存储所有用户数据 | Workers 绑定名 |

### 2.2 Key 设计（用户隔离版）

| Key | 存储内容 | 格式 | 说明 |
|-----|---------|------|------|
| `admin:hash` | 管理密码的哈希 | `{hash: "<sha256>", salt: "<uuid>"}` | 登录验证 |
| `sessions:<token>` | 登录会话 | `{username: "admin", expires: 1234567890}` | token 随机生成，有过期时间 |
| `subscriptions:{user}` | 用户订阅链接列表 | `[{url, remark}, ...]` | 对象数组，含备注，支持旧数据迁移 |
| `rules:enabled:{user}` | 用户启用的规则集 ID 列表 | `["BanAD", "Netflix", "Google", ...]` | 仅存 ID |
| `link_replace:from` | 规则链接替换 - 原始前缀 | 字符串 | 如 `https://raw.githubusercontent.com/` |
| `link_replace:to` | 规则链接替换 - 替换后前缀 | 字符串 | 如 `https://ghproxy.net/...` |
| `health_check_result` | 最近一次健康检测结果 | JSON 对象 | 含时间、总数、有效数、无效数 |

### 2.3 KV 读写策略

| 操作 | KV 操作 | 频率 | 说明 |
|------|---------|------|------|
| 登录验证 | GET `admin:hash` | 每次登录 | 读密集型 |
| 创建会话 | PUT `sessions:<token>` | 每次登录 | 7 天过期 |
| 获取规则状态 | GET `rules:enabled:{user}` | 每次页面加载 | 缓存可考虑 |
| 保存规则状态 | PUT `rules:enabled:{user}` | 点击保存/切换开关 | 低频 |
| 订阅列表 | GET/PUT `subscriptions:{user}` | 增删改时 | 低频 |
| 链接替换配置 | GET/PUT `link_replace:*` | 管理后台设置 | 极少变动 |
| 旧数据迁移 | 迁移 `subscriptions` → `subscriptions:admin` | 部署后首次访问 | 一次性 |

---

## 三、API 接口设计

### 3.1 接口总览

所有 API 响应格式统一为：
```json
{ "ok": true, "data": {...} }
// 或
{ "ok": false, "error": "错误信息" }
```

### 3.2 认证相关

| 方法 | 路径 | 说明 | 认证 |
|------|------|------|------|
| POST | `/api/login` | 密码登录 | ❌ |
| POST | `/api/logout` | 登出 | ✅ Session |
| GET | `/api/session` | 检查当前会话是否有效 | ✅ Session |

### 3.3 规则管理

| 方法 | 路径 | 说明 | 认证 |
|------|------|------|------|
| GET | `/api/rules/list` | 获取全部规则集清单（147个） | ✅ Session |
| GET | `/api/rules/enabled` | 获取当前启用规则集 ID 列表 | ✅ Session |
| PUT | `/api/rules/enabled` | 保存当前启用规则集 ID 列表 | ✅ Session |

### 3.4 订阅管理

| 方法 | 路径 | 说明 | 认证 |
|------|------|------|------|
| GET | `/api/subscriptions` | 获取订阅链接列表（含备注） | ✅ Session |
| POST | `/api/subscriptions` | 添加订阅链接（可选备注） | ✅ Session |
| DELETE | `/api/subscriptions` | 删除订阅链接 | ✅ Session |

### 3.5 配置输出

| 方法 | 路径 | 说明 | 认证 |
|------|------|------|------|
| GET | `/api/config/preview` | 预览生成的 YAML 配置 | ✅ Session |
| GET | `/sub?token=xxx&user=xxx` | 自动适配（返回 Clash YAML） | ❌ Query token |
| GET | `/sub?format=clash&token=xxx&user=xxx` | Clash Meta / Mihomo 格式 | ❌ Query token |
| GET | `/sub?format=base64&token=xxx&user=xxx` | Base64 编码的节点列表 | ❌ Query token |
| GET | `/sub?format=singbox&token=xxx&user=xxx` | Sing-box JSON 格式 | ❌ Query token |
| GET | `/sub?format=surge&token=xxx&user=xxx` | Surge 格式 | ❌ Query token |
| GET | `/sub?format=loon&token=xxx&user=xxx` | Loon 格式 | ❌ Query token |

**订阅地址说明：**
- 支持 `user` 参数指定用户（默认 admin）
- 访问 `/sub` 不带 token 也可使用（但建议加上 token 防止被他人滥用）
- 设置了 SUB_TOKEN 时，必须带 `?token=xxx&user=xxx` 才能访问
- 每种格式生成的订阅文件都包含：**所有节点信息 + 完整的 rule-providers + 策略组 + 规则**

### 3.6 节点管理

| 方法 | 路径 | 说明 | 认证 |
|------|------|------|------|
| GET | `/api/nodes/list` | 获取当前所有节点列表（含去重后总数） | ✅ Session |
| POST | `/api/nodes/health-check` | 触发节点健康检测 | ✅ 管理员 |
| GET | `/api/nodes/health-check` | 获取最近一次健康检测结果 | ✅ Session |

### 3.6 管理后台（仅管理员）

| 方法 | 路径 | 说明 | 认证 |
|------|------|------|------|
| GET | `/api/admin/users` | 获取用户列表 | ✅ 管理员 |
| POST | `/api/admin/users` | 添加用户 | ✅ 管理员 |
| DELETE | `/api/admin/users` | 删除用户 | ✅ 管理员 |
| PUT | `/api/admin/password` | 修改管理密码 | ✅ 管理员 |
| GET | `/api/admin/link-replace` | 获取链接替换配置 | ✅ 管理员 |
| PUT | `/api/admin/link-replace` | 保存链接替换配置 | ✅ 管理员 |

### 3.7 系统

| 方法 | 路径 | 说明 | 认证 |
|------|------|------|------|
| GET | `/api/version` | 获取当前版本（用于升级检测） | ❌ |

---

## 四、前端页面路由与交互

单页应用（SPA），所有页面都在 `index.html` 中，由前端 JS 控制显示隐藏。

| 路由 | 对应页面 | 说明 |
|------|---------|------|
| `#/subscribe` | 订阅管理 | **默认首页**，管理订阅链接（带备注） |
| `#/output` | 输出配置 | 预览 YAML、复制订阅地址、二维码、刷新节点数 |
| `#/rules` | 规则管理 | 147个规则集分组展示、折叠、编辑/删除、开关 |
| `#/help` | 使用说明 | 静态内容、项目链接、升级检测 |

**页面加载流程：**
```
访问任意路径
    ↓
Worker 返回 index.html
    ↓
前端检查 Cookie 中是否有 Session
    ↓
   ├─ 有 → GET /api/session 验证有效 → 进入主界面（默认订阅管理页）
   └─ 无 → 显示登录页
    ↓
（验证或登录后，根据 Hash 路由显示对应页面）
```

---

## 五、核心功能实现细节

### 5.1 节点协议解析 (`src/parser.js`)

支持协议：`vmess` / `vless` / `trojan` / `ss` / `ssr` / `hysteria2` / `tuic`

```javascript
// 统一节点对象格式
{
  protocol: 'vless',
  server: 'example.com',
  port: 443,
  uuid: '...',
  flow: '',
  encryption: 'none',
  network: 'ws',
  tls: true,
  security: 'tls',
  name: '节点名称',
  path: '/',
  host: 'example.com',
  sni: 'example.com',
  fingerprint: 'chrome',
  alpn: 'h3',
  pbk: '',
  sid: ''
}
```

### 5.2 订阅聚合与去重

```javascript
// 1. 抓取所有订阅链接
// 2. 解析所有节点
// 3. 按 server:port 去重（保留第一个）
// 4. 返回唯一节点列表
```

### 5.3 多格式输出 (`src/formatter.js`)

| 格式 | 参数 | 输出内容 |
|------|------|----------|
| Clash YAML | `format=auto` 或 `clash` | 完整配置：proxy-providers + rule-providers + proxy-groups + rules |
| Base64 | `format=base64` | 标准节点列表 Base64 编码 |
| Sing-box | `format=singbox` | Sing-box JSON 配置 |
| Surge | `format=surge` | Surge 配置文件 |
| Loon | `format=loon` | Loon 配置文件 |
| 自适应 | `format=auto` | 默认 Clash YAML |

### 5.4 Clash YAML 输出结构

1. **proxy-providers** — 从用户订阅生成
2. **rule-providers** — 从用户勾选的规则集生成（含链接替换）
3. **proxy-groups** — 策略组（节点选择、自动选择、直连、拒绝、漏网之鱼）
4. **rules** — 规则引用顺序（内置安全规则优先 + 用户勾选规则 + GEOIP,CN + MATCH）

### 5.5 规则优先级

```
1. 🛑 全球拦截（REJECT）      — 广告/恶意域名
2. 🚀 代理规则               — 用户勾选的代理规则
3. 🎯 国内直连               — 国内域名 / 国内 IP / 内网 IP
4. 🐟 漏网之鱼               — 未匹配流量（走节点选择）
```

### 5.6 链接替换逻辑

管理后台可设置链接替换，用于国内网络访问 GitHub raw 慢的场景：

```
原始前缀: https://raw.githubusercontent.com/
替换为:   https://ghproxy.net/https://raw.githubusercontent.com/

生成 rule-provider 时:
  url: "https://ghproxy.net/https://raw.githubusercontent.com/ACL4SSR/ACL4SSR/master/Clash/Providers/BanAD.yaml"
```

---

## 六、规则集清单管理 (`src/index.js` 内嵌 `getRulesetList()`)

### 6.1 清单结构（147 个规则集）

```javascript
{
  id: 'BanAD',
  name: '全球拦截',
  desc: '拦截常见广告、跟踪器、挖矿域名',
  group: 'ad',
  url: 'https://raw.githubusercontent.com/ACL4SSR/ACL4SSR/master/Clash/Providers/BanAD.yaml',
  builtin: false,
  common: true
}
```

**分组：** `ad` (广告) | `media` (流媒体) | `google` (Google) | `ai` (AI) | `game` (游戏) | `system` (系统) | `domestic` (国内/内置)

### 6.2 内置安全规则（始终启用，不可关闭，显示红色锁定）

| ID | 名称 | 说明 |
|----|------|------|
| ChinaDomain | 国内直连 | 国内域名列表 |
| ChinaCompanyIp | 国内 IP 段 | 国内 IP 地址段 |
| LocalAreaNetwork | 内网地址 | 局域网/私有地址 |

---

## 七、前端交互功能 (`static/index.html`)

### 7.1 页面结构

1. **登录页** — 密码输入、默认密码提示、GitHub 链接、作者信息
2. **订阅管理** — 备注输入框、链接输入框、添加按钮、列表显示（✓/✗ 状态、删除按钮）
3. **输出配置** — 6 种格式订阅地址、点击行显示二维码、复制链接、刷新节点数
4. **规则管理** — 规则组折叠、规则开关（绿色/红色）、编辑链接、删除确认、滚动按钮、显示全部
5. **使用说明** — 步骤说明、项目链接、升级检测

### 7.2 核心交互

| 功能 | 实现方式 |
|------|---------|
| 规则组折叠 | 点击分组标题 `.rule-group-title` 切换 `.collapsed` class |
| 规则开关颜色 | `input:checked + .slider { background: var(--green) }` / `input:disabled + .slider { background: var(--red) }` |
| 滚动按钮 | 固定右下角 `position: fixed; bottom: 20px; right: 20px` |
| 二维码生成 | `api.qrserver.com/v1/create-qr-code/?size=240x240&data=` |
| 二维码复制 | 点击二维码图片/按钮 → `navigator.clipboard.writeText()` |
| 开关自动保存 | `change` 事件监听 → `api('/rules/enabled', {method: 'PUT', body: JSON.stringify({ids})})` |
| 旧数据迁移 | 页面加载时检查新键为空 → 从旧键迁移并清理 |

### 7.3 主题切换

三档循环：`dark` → `light` → `auto`（跟随系统）

---

## 八、多用户数据隔离

### 8.1 KV 键前缀设计

```javascript
// 当前用户识别
const currentSession = await getSession(kv, request);
const currentUser = currentSession.valid && currentSession.user
  ? currentSession.user.username : 'admin';

// KV 键生成器
const userKey = (key) => `${key}:${currentUser}`;

// 使用示例
await kvGet(kv, userKey('subscriptions'));      // subscriptions:admin
await kvPut(kv, userKey('rules:enabled'), ids); // rules:enabled:admin
```

### 8.2 订阅输出用户隔离

```
GET /sub?token=xxx&user=admin    → admin 的配置
GET /sub?token=xxx&user=user2    → user2 的配置
```

---

## 九、节点健康检测 (`src/health.js`)

### 9.1 检测流程

```javascript
// 1. 抓取所有订阅
// 2. 解析节点 → 去重
// 3. 简化版检测（返回 ok: true，后续可增强 TCP 检测）
// 4. 返回 { all, valid, invalid }
// 4. 缓存结果到 KV: health_check_result
```

### 9.2 API 端点

- `POST /api/nodes/health-check` — 触发检测（管理员）
- `GET /api/nodes/health-check` — 获取最近检测结果

---

## 十、安全架构

### 10.1 全局 SUB_TOKEN 保护

```
所有请求进入 Worker
    ↓
检查 env.SUB_TOKEN 是否设置
    ↓
若设置：
  ├─ 白名单路径：/api/login, /api/logout, /api/session, /sub
  │   直接放行（它们有自己的认证机制）
  ├─ API 请求：需 ?token=xxx
  └─ 页面请求：需 ?token=xxx → 否则返回「访问受限」页面
```

### 10.2 密码与 Session

- 密码：PBKDF2 + SHA-256 + 随机盐（100000 次迭代）
- Session Token：`crypto.randomUUID()`
- Cookie：`HttpOnly; Secure; SameSite=Lax; Max-Age=604800` (7天)

### 10.3 密钥管理

| 敏感信息 | 存储位置 | 注入方式 |
|---------|---------|---------|
| `CLOUDFLARE_API_TOKEN` | GitHub Repository Secrets | CI `env` 传入 |
| `KV_NAMESPACE_ID` | GitHub Repository Secrets | `sed` 写入 `wrangler.toml` |
| `SUB_TOKEN` | GitHub Repository Secrets | `wrangler secret put` 注入 Worker |

> `wrangler.toml` **不包含任何敏感信息**，仓库可放心公开。

---

## 十、GitHub Actions 自动部署

### 10.1 `.github/workflows/deploy.yml`

```yaml
name: Deploy to Cloudflare Workers

on:
  push:
    branches: [main]
  workflow_dispatch:

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - run: npm ci
      - run: npm run build
      - name: Update wrangler.toml with KV namespace ID
        run: sed -i 's/id = ""/id = "${{ secrets.KV_NAMESPACE_ID }}"/' wrangler.toml
      - name: Deploy to Cloudflare Workers
        run: npx wrangler deploy
        env:
          CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}
      - name: Set SUB_TOKEN secret (if configured)
        if: env.SUB_TOKEN != '' && env.SUB_TOKEN != 'none'
        run: printf '%s' "${SUB_TOKEN}" | npx wrangler secret put SUB_TOKEN
        env:
          CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}
          SUB_TOKEN: ${{ secrets.SUB_TOKEN || '' }}
```

### 部署流程

```
git push → GitHub Actions
  ├─ npm ci + npm run build
  ├─ sed 写入 KV_NAMESPACE_ID 到 wrangler.toml
  ├─ wrangler deploy（部署 Worker）
  └─ wrangler secret put SUB_TOKEN（如设置）
       ↓
   CF Workers 上线
       ↓
Worker 运行时：env.SUB_TOKEN 读取 Worker Secret
      ↓
 /sub?token=xxx&user=xxx 校验
```

---

## 十一、升级检测机制

### 11.1 检测原理

```
前端页面加载
    ↓
GET /api/version  →  获取当前 Worker 版本号
    ↓
对比 GitHub Releases 最新版本
  fetch("https://api.github.com/repos/BobVane/CF-Workers-SUB-Next/releases/latest")
    ↓
  ├─ 一致 → ✅ 已是最新版本
  └─ 不一致 → 🆕 发现新版本（显示 Release 链接）
```

### Fork 用户适配

fork 后修改 `src/index.js` 顶部的 `GITHUB_REPO` 变量为自己的仓库地址，升级检测会自动对比自己的 GitHub Releases。

---

## 十一、README.md 部署指南（完整版）

```markdown
# ⚡ CF-Workers-SUB-Next

> 新一代 Cloudflare Workers 订阅汇聚与规则生成工具

## 功能

| 功能 | 说明 |
|------|------|
| 🔐 Web 管理界面 | 密码登录（默认 `admin`），浏览器直接管理 |
| 📥 订阅聚合 | 多个订阅链接、单节点链接合并为一个 |
| 🔌 协议解析 | vmess / vless / trojan / ss / ssr / hysteria2 / tuic |
| 📦 多格式输出 | Clash YAML / Base64 / Sing-box / Surge / Loon + 自适应 |
| 🎯 规则集选择 | 从 147+ 个 ACL4SSR 规则集中按需勾选 |
| 🛡️ 安全锁定 | 国内直连、国内 IP 段、内网地址规则始终启用，不可关闭 |
| 🔗 链接替换 | 替换规则集 URL 前缀（如 GitHub 镜像加速） |
| 💓 节点检测 | TCP 连接检测节点可用性，自动去重 |
| 🔄 升级检测 | 对比 GitHub Releases，有新版本提醒 |
| 👤 用户管理 | 管理员可添加/删除用户，修改密码 |
| 🌓 主题切换 | 暗色 / 亮色 / 跟随系统 |
| 🚀 自动部署 | GitHub Actions 自动部署到 Cloudflare Workers |

## 订阅输出地址

| 格式 | 链接 | 说明 |
|------|------|------|
| 🔄 自适应 | `https://你的域名/sub?token=xxx&user=xxx` | 自动返回 Clash YAML |
| 🐱 Clash | `https://你的域名/sub?format=clash&token=xxx&user=xxx` | Clash / OpenClash 配置 |
| 📄 Base64 | `https://你的域名/sub?format=base64&token=xxx&user=xxx` | 通用 Base64 节点列表 |
| 📦 Sing-box | `https://你的域名/sub?format=singbox&token=xxx&user=xxx` | Sing-box JSON 配置 |
| ⚡ Surge | `https://你的域名/sub?format=surge&token=xxx&user=xxx` | Surge 配置 |
| 🚀 Loon | `https://你的域名/sub?format=loon&token=xxx&user=xxx` | Loon 配置 |

如果不设置 `SUB_TOKEN`，可直接访问无需 token。

## 部署步骤

### 第一步：创建 KV 命名空间

1. 打开 [Cloudflare Dashboard](https://dash.cloudflare.com/)
2. Workers & Pages → KV → 创建命名空间
3. 名称：`SUB_NEXT_DATA`
4. 创建后复制 **命名空间 ID**

### 第二步：创建 Cloudflare API Token

1. [Cloudflare API Tokens](https://dash.cloudflare.com/profile/api-tokens) → **Create Token**
2. 选择 **Edit Cloudflare Workers** 模板
3. 创建后 **立即复制 Token**

### 第三步：Fork 并配置仓库

1. Fork 本仓库到你的 GitHub 账号
2. 进入你的仓库 → **Settings → Secrets and variables → Actions → Repository secrets**（不是 Environment secrets）
3. 添加以下三个 Secrets：

| Secret 名称 | 值 | 说明 |
|------------|-----|------|
| `CLOUDFLARE_API_TOKEN` | 刚复制的 API Token | 必填，用于部署 Worker |
| `KV_NAMESPACE_ID` | 第一步复制的 KV 命名空间 ID | 必填，CI 自动写入 wrangler.toml |
| `SUB_TOKEN` | 自定义字符串 | 可选，设置后订阅地址需带此 token 才能访问 |

### 第四步：推送触发部署

```bash
git add .
git commit -m "配置项目"
git push origin main
```

GitHub Actions 会自动：
1. 将 `KV_NAMESPACE_ID` 写入 `wrangler.toml`
2. 用 `wrangler deploy` 部署 Worker
3. 用 `wrangler secret put` 注入 `SUB_TOKEN`（如果设置了）

部署完成后，打开 Cloudflare Dashboard → Workers & Pages → `sub-next` → 访问分配域名。

### 可选：配置 SUB_TOKEN

部署后如果不想公开订阅地址，在 GitHub 仓库中设置 `SUB_TOKEN` Secret：
1. 仓库 **Settings → Secrets and variables → Actions → Repository secrets**
2. 添加 `SUB_TOKEN`，值填你想要的自定义 Token
3. 重新推送代码或手动触发 Actions 部署

部署完成后，订阅地址需要带 `?token=你的自定义Token&user=admin` 参数才能访问。

**安全说明：**
- `CLOUDFLARE_API_TOKEN` 和 `SUB_TOKEN` 都存储在 GitHub Secrets 中，不会暴露在代码里
- `wrangler.toml` 中的 KV 命名空间 ID 是 CF 资源标识符，不是敏感信息，可放心保留
- 订阅链接支持 `user` 参数指定用户：`/sub?token=xxx&user=用户名`

## 本地开发

```bash
# 安装依赖
npm install

# 构建前端
npm run build

# 本地调试
npm run dev
```

需要先配置 Cloudflare 认证：
```bash
npx wrangler login
```

---

## 关于

作者：**Bob Vane**  
仓库：https://github.com/bobvane/CF-Workers-SUB-Next

如果觉得有用，欢迎 ⭐ Star 和 Fork！