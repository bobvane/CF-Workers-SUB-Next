# ⚡ CF-Workers-SUB-Next

> 新一代 Cloudflare Workers 订阅汇聚与规则生成工具

基于 Cloudflare Workers 的订阅管理面板，支持多订阅源聚合、规则集按需切换、多格式输出，自带 Web 管理界面。

---

## 功能

| 功能 | 说明 |
|------|------|
| 🔐 **Web 管理界面** | 密码登录（默认 `admin`），浏览器直接管理 |
| 📥 **订阅聚合** | 多个订阅链接、单节点链接合并为一个 |
| 🔌 **协议解析** | vmess / vless / trojan / ss / ssr / hysteria2 / tuic |
| 📦 **多格式输出** | Clash YAML / Base64 / Sing-box / Surge / Loon + 自适应 |
| 🎯 **规则集选择** | 从 147+ 个 ACL4SSR 规则集中按需勾选 |
| 🛡️ **安全锁定** | 国内直连、国内 IP 段、内网地址规则始终启用，不可关闭 |
| 🔗 **链接替换** | 替换规则集 URL 前缀（如 GitHub 镜像加速） |
| 💓 **节点检测** | TCP 连接检测节点可用性，自动去重 |
| 🔄 **升级检测** | 对比 GitHub Releases，有新版本提醒 |
| 👤 **用户管理** | 管理员可添加/删除用户，修改密码 |
| 🌓 **主题切换** | 暗色 / 亮色 / 跟随系统 |
| 🚀 **自动部署** | GitHub Actions 自动部署到 Cloudflare Workers |

## 订阅输出地址

部署完成后获取 6 种格式的订阅链接：

| 格式 | 链接 | 说明 |
|------|------|------|
| 🔄 **自适应** | `https://你的域名/sub?token=xxx` | 自动返回 Clash YAML |
| 🐱 **Clash** | `https://你的域名/sub?format=clash&token=xxx` | Clash / OpenClash 配置 |
| 📄 **Base64** | `https://你的域名/sub?format=base64&token=xxx` | 通用 Base64 节点列表 |
| 📦 **Sing-box** | `https://你的域名/sub?format=singbox&token=xxx` | Sing-box JSON 配置 |
| ⚡ **Surge** | `https://你的域名/sub?format=surge&token=xxx` | Surge 配置 |
| 🚀 **Loon** | `https://你的域名/sub?format=loon&token=xxx` | Loon 配置 |

如果不设置 `SUB_TOKEN`（留空），可以直接访问 `?token=` 参数。

## 部署步骤

### 第一步：克隆仓库

```bash
git clone https://github.com/bobvane/CF-Workers-SUB-Next.git
cd CF-Workers-SUB-Next
```

### 第二步：创建 KV 命名空间

1. 打开 [Cloudflare Dashboard](https://dash.cloudflare.com/)
2. Workers & Pages → KV → 创建命名空间
3. 名称：`SUB_NEXT_DATA`
4. 创建后复制 **命名空间 ID**

### 第三步：更新 wrangler.toml

编辑 `wrangler.toml`，将 KV 命名空间 ID 填入：

```toml
[[kv_namespaces]]
binding = "SUB_NEXT_DATA"
id = "你的命名空间 ID"
```

### 第四步：创建 Cloudflare API Token

1. [Cloudflare API Tokens](https://dash.cloudflare.com/profile/api-tokens) → **Create Token**
2. 选择 **Edit Cloudflare Workers** 模板
3. 权限：

| 资源 | 权限 |
|------|------|
| Account Resources → Workers R2 | Edit |
| Account Resources → Workers KV | Edit |

4. 创建后 **立即复制 Token**

### 第五步：配置 GitHub Secrets

进入你的 GitHub 仓库 → **Settings → Secrets and variables → Actions → Repository secrets**（不是 Environment secrets），添加：

| 名称 | 值 |
|------|------|
| `CLOUDFLARE_API_TOKEN` | 刚复制的 API Token |

### 第六步：推送触发部署

```bash
wrangler.toml 中 KV ID 已填好
git add .
git commit -m "配置 KV 命名空间"
git push origin main
```

GitHub Actions 会自动部署到 Cloudflare Workers。

部署完成后，打开 Cloudflare Dashboard → Workers & Pages → `sub-next` → 访问分配域名。

### 可选：配置 SUB_TOKEN

部署后如果不想公开订阅地址，可以在 `wrangler.toml` 中设置：

```toml
[vars]
SUB_TOKEN = "你的自定义Token"
```

重新部署后，访问 `/sub?token=你的自定义Token` 才能获取配置。

---

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

## 项目结构

```
CF-Workers-SUB-Next/
├── src/
│   ├── index.js      # Worker 入口 + 路由
│   ├── auth.js       # 登录 + Session 管理
│   ├── kv.js         # KV 读写封装
│   ├── utils.js      # 加密、Cookie、响应工具
│   ├── parser.js     # 节点解析器（6协议）
│   ├── formatter.js  # 多格式输出生成器
│   ├── health.js     # 节点健康检测
│   └── html.js       # 前端 HTML
├── static/
│   └── index.html    # 前端页面源码
├── scripts/
│   └── inline-html.js  # HTML → JS 构建脚本
├── .github/workflows/
│   └── deploy.yml    # GitHub Actions 自动部署
├── wrangler.toml
├── package.json
└── README.md
```

---

## 关于

作者：**Bob Vane**  
仓库：https://github.com/bobvane/CF-Workers-SUB-Next

如果觉得有用，欢迎 ⭐ Star 和 Fork！
