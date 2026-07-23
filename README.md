# ⚡ CF-Workers-SUB-Next

> 新一代 Cloudflare Workers 订阅汇聚与规则生成工具

基于 Cloudflare Workers 的订阅管理面板，支持多订阅源聚合、规则集按需切换、多格式输出，自带 Web 管理界面。

---

## 功能

| 功能 | 说明 |
|------|------|
| 🔐 **Web 管理界面** | 密码登录，浏览器直接管理 |
| 🔗 **多订阅聚合** | 多个订阅链接合并为一个，自动去重 |
| 🧩 **规则集管理** | 147 个 ACL4SSR 规则集，勾选即用 |
| 🛡️ **安全规则锁定** | 国内直连、内网地址始终启用，防止断网 |
| 📤 **多格式输出** | Clash / Base64 / Sing-box / Surge / Loon 自适应 |
| 🔄 **自动更新** | 规则集每 24 小时自动拉取最新版 |
| 🖥️ **管理后台** | 修改密码、规则链接替换（国内镜像加速） |
| ⬆️ **升级检测** | 自动检测 GitHub 新版本，提示更新 |
| 🚀 **一键部署** | GitHub Actions 自动部署到 Cloudflare Workers |

---

## 快速部署

### 前提条件

1. 一个 **Cloudflare 账号**（免费即可）
2. 一个 **GitHub 账号**

### 第一步：创建 KV 命名空间

1. 登录 [Cloudflare Dashboard](https://dash.cloudflare.com/)
2. 进入 **Workers & Pages → KV**
3. 点击 **创建命名空间**
4. 命名空间名称：`SUB_NEXT_DATA`
5. 创建后，复制 **命名空间 ID**

### 第二步：创建 API Token

1. Cloudflare Dashboard → **右上角头像 → My Profile → API Tokens**
2. 点击 **Create Token**
3. 选择 **Edit Cloudflare Workers** 模板
4. 权限配置：

| 资源 | 权限 |
|------|------|
| Account Resources → Workers R2 | Edit |
| Account Resources → Workers KV | Edit |

5. 点击 **Continue to summary → Create Token**
6. **立即复制 Token**（关闭页面后不再显示）

### 第三步：Fork 并配置仓库

1. Fork 本仓库到你的 GitHub 账号
2. 进入你的仓库 → **Settings → Secrets and variables → Actions**
3. 点击 **New repository secret**
4. 添加 Secret：

| 名称 | 值 |
|------|-----|
| `CLOUDFLARE_API_TOKEN` | 上一步复制的 Token |

### 第四步：配置 KV 绑定

1. 在你的仓库中打开 **wrangler.toml** 文件
2. 找到 `[[kv_namespaces]]` 段
3. 将 `id = ""` 改为你第一步复制的命名空间 ID

```toml
[[kv_namespaces]]
binding = "SUB_NEXT_DATA"
id = "你的命名空间ID"
```

4. 提交并推送，GitHub Actions 会自动部署

### 第五步：访问你的项目

1. 部署完成后，在 Cloudflare Dashboard → **Workers & Pages** 中找到 `sub-next`
2. 点击域名即可访问
3. 默认登录密码：`admin`

---

## 使用指南

### 登录

首次访问使用密码 `admin` 登录，登录后可在右上角管理后台修改密码。

### 添加订阅

1. 进入 **订阅管理** 页面
2. 输入你的机场订阅链接或单节点链接
3. 点击 **添加**
4. 支持同时添加多个订阅，自动合并所有节点

### 选择规则

1. 进入 **规则管理** 页面
2. 勾选你需要的规则集
3. 默认显示常用规则，点击 **显示全部 147 个规则集** 查看完整列表
4. 点击 **保存配置**

### 获取订阅地址

1. 进入 **输出配置** 页面
2. 复制订阅地址
3. 在 OpenClash 或其他客户端中使用

**输出格式说明：**

| 格式 | 参数 | 示例 |
|------|------|------|
| 自动适配 | （不指定） | `https://你的域名.workers.dev/sub` |
| Clash | `format=clash` | `https://你的域名.workers.dev/sub?format=clash` |
| Base64 | `format=base64` | `https://你的域名.workers.dev/sub?format=base64` |
| Sing-box | `format=singbox` | `https://你的域名.workers.dev/sub?format=singbox` |
| Surge | `format=surge` | `https://你的域名.workers.dev/sub?format=surge` |
| Loon | `format=loon` | `https://你的域名.workers.dev/sub?format=loon` |

---

## 管理后台

点击右上角用户名 → **管理后台**，可进行以下设置：

### 修改密码
1. 进入 **系统设置** 选项卡
2. 输入新密码
3. 点击保存

### 规则链接替换
如果你的服务器无法直接访问 GitHub raw，可设置镜像加速：

| 设置 | 示例 |
|------|------|
| 原始前缀 | `https://raw.githubusercontent.com/` |
| 替换为 | `https://ghproxy.net/https://raw.githubusercontent.com/` |

### 订阅 Token
如果希望订阅地址有访问保护，可在 `wrangler.toml` 中设置：

```toml
[vars]
SUB_TOKEN = "你的自定义Token"
```

设置后，访问订阅地址需要加上 `?token=xxx` 参数，否则返回 403。

---

## 项目结构

```
CF-Workers-SUB-Next/
├── src/
│   ├── index.js        # Worker 入口 + 路由
│   ├── auth.js         # 登录认证
│   ├── kv.js           # KV 存储
│   ├── utils.js        # 工具函数
│   └── html.js         # 前端页面（自动生成）
├── static/
│   └── index.html      # 前端源码
├── scripts/
│   └── inline-html.js  # 构建脚本
├── .github/workflows/
│   └── deploy.yml      # 自动部署
├── wrangler.toml       # Workers 配置
└── package.json
```

---

## 规则集来源

规则集来自 [ACL4SSR/ACL4SSR](https://github.com/ACL4SSR/ACL4SSR) 项目，共 147 个 YAML 规则文件，按分类整理：

- 🛑 广告过滤
- 🎬 流媒体（Netflix、YouTube、Disney+、TikTok 等）
- 🔍 Google 服务
- 🤖 AI 服务（OpenAI、Claude、Gemini 等）
- 🎮 游戏（Steam、Epic、Blizzard 等）
- 🌐 社交网络（Twitter、Discord、Telegram 等）
- ⚙️ 系统服务（Apple、Microsoft、国内直连等）

更新方式：人工维护规则集清单，发布新版本。

---

## 安全提醒

- ⚠️ **API Token 请妥善保管**，仅存储在 GitHub Secrets 中
- ⚠️ 如 Token 泄露，请立即在 Cloudflare Dashboard 吊销并重新生成
- ⚠️ 不要将 API Token 提交到代码仓库

---

## 升级检测

本项目的升级检测机制：

1. 前端页面加载时自动对比 GitHub Releases 版本号
2. 如有新版本，右上角显示提示
3. 点击链接跳转到 Releases 页面查看更新内容

**如果你 fork 了本项目：**
请在 `src/index.js` 顶部修改 `GITHUB_REPO` 变量为你的仓库地址，升级检测会自动对比你的 Releases。

---

## License

MIT

---

## 作者

**Bob Vane** · [GitHub](https://github.com/BobVane)