# CF-Workers-SUB-Next V2

> 基于 Cloudflare Workers 的订阅管理与配置生成平台
> 无需 VPS / Docker / 本地数据库，部署即用

---

## ✨ 功能特性

| 功能 | 说明 |
|------|------|
| 🔐 **管理员登录** | 密码认证 + Session 管理（HttpOnly Cookie） |
| 📥 **订阅管理** | 添加 / 删除 / 更新订阅 URL |
| 🔗 **节点解析** | VMess / VLESS / Trojan / Shadowsocks 四协议 |
| 🧹 **节点处理** | 自动去重 + 关键字过滤 + 规则引擎 |
| 📦 **配置生成** | Mihomo YAML + Sing-box JSON 双格式输出 |
| 🔒 **安全防护** | SSRF 防护 / XSS 转义 / 登录限流 / PBKDF2 密码哈希 |
| 📊 **Web 管理** | 仪表盘 / 订阅 / 节点 / 输出 / 设置 五大页面 |
| 🎨 **界面** | 暗色/亮色主题切换，响应式移动端适配 |
| 🚀 **自动部署** | GitHub Actions 一键部署到 Cloudflare Workers |

---

## 🚀 快速部署

### 前提条件

1. Cloudflare 账号
2. GitHub 账号
3. Node.js 20+（本地开发用）

### 第一步：创建 KV 命名空间

1. 打开 [Cloudflare Dashboard](https://dash.cloudflare.com/) → **Workers & Pages** → **KV**
2. 点击 **Create namespace**，名称填 `DATABASE`，创建
3. 创建后页面会显示一个 **Namespace ID**（一串字母数字），**复制它**

### 第二步：配置 GitHub Secrets

进入仓库 `Settings → Secrets and variables → Actions → New repository secret`，添加：

| Secret | 说明 | 必填 |
|--------|------|------|
| `CLOUDFLARE_API_TOKEN` | Cloudflare API Token（Workers R2 Edit + KV Edit） | ✅ |
| `KV_NAMESPACE_ID` | 上一步创建的 KV 命名空间 ID | ✅ |
| `ADMIN_PASSWORD` | 管理界面登录密码 | ✅ |
| `SESSION_SECRET` | Session 加密密钥（随机字符串） | ✅ |

### 第四步：推送代码触发部署

推送 `main` 分支，GitHub Actions 自动构建并部署。

部署完成后访问：
```
https://<你的-worker名>.<子域>.workers.dev
```
使用 `ADMIN_PASSWORD` 设置的密码登录。

---

## 💻 本地开发

```bash
npm install
cp .dev.vars.example .dev.vars   # 填入 ADMIN_PASSWORD / SESSION_SECRET
npm run dev                       # wrangler dev --local
```

访问 `http://localhost:8787`。

### 常用命令

| 命令 | 说明 |
|------|------|
| `npm run dev` | 本地开发服务器 |
| `npm test` | 运行测试（Vitest） |
| `npm run build` | 构建（内联 HTML + 类型检查） |
| `npm run deploy` | 部署到 Cloudflare Workers |

---

## 📚 API 概览

| 方法 | 路径 | 说明 | 认证 |
|------|------|------|------|
| POST | `/api/auth/login` | 登录 | ❌ |
| POST | `/api/auth/logout` | 登出 | ❌ |
| GET | `/api/auth/session` | 会话检查 | ❌ |
| GET | `/api/dashboard` | 仪表盘统计 | ✅ |
| GET | `/api/subscriptions` | 订阅列表 | ✅ |
| POST | `/api/subscriptions` | 创建订阅 | ✅ |
| GET | `/api/subscriptions/:id` | 单个订阅 | ✅ |
| DELETE | `/api/subscriptions/:id` | 删除订阅 | ✅ |
| POST | `/api/subscriptions/:id/update` | 更新订阅 | ✅ |
| GET | `/api/nodes` | 节点列表 | ✅ |
| GET | `/api/rules` | 规则列表 | ✅ |
| POST | `/api/rules` | 创建规则 | ✅ |
| DELETE | `/api/rules/:id` | 删除规则 | ✅ |
| GET | `/api/output/mihomo` | 下载 Mihomo 配置 | ✅ |
| GET | `/api/output/singbox` | 下载 Sing-box 配置 | ✅ |
| GET | `/sub/mihomo/:token` | 订阅链接（客户端用） | Token |
| GET | `/sub/singbox/:token` | 订阅链接（客户端用） | Token |

---

## 🧩 项目结构

```
src/
├── index.ts          # Worker 入口 + 依赖装配
├── api/              # Hono 路由 + 认证中间件 + 限流
├── services/         # 业务服务（订阅/认证/配置）
├── engine/           # 处理引擎（fetcher/SSRF 防护）
├── parser/           # 协议解析器（vmess/vless/trojan/ss）
├── generator/        # 配置生成器（mihomo/singbox）
├── models/           # 数据模型
├── storage/          # KV 仓储层（Repository Pattern）
└── html.js           # 构建生成的前端内嵌模块
public/index.html     # 前端 SPA（构建时内嵌）
tests/                # 单元 + 集成测试
```

---

## 🔐 安全设计

- **SSRF 防护**：拒绝 localhost / 私有 IP / 内网地址，重定向二次校验
- **密码安全**：PBKDF2-SHA256 哈希 + 随机盐
- **Session**：HttpOnly + Secure + SameSite=Strict Cookie，7 天过期
- **XSS 防护**：前端所有用户输入在插入 DOM 前转义
- **登录限流**：10 次/分钟/IP，防暴力破解
- **Secrets**：全部存 Cloudflare Secrets，代码零敏感信息

---

## 📄 License

MIT

## 👥 贡献

欢迎提交 Issue 和 Pull Request。参见 `CONTRIBUTING.md`。