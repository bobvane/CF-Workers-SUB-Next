# 开发环境配置

## 📋 目录

- [本地开发](#-本地开发)
- [生产部署](#-生产部署)
- [测试与构建](#-测试与构建)

---

## 💻 本地开发

### 1. 安装依赖

```bash
npm install
```

> **注意**：本项目依赖 `workerd`（wrangler 本地运行 Cloudflare Worker 的二进制）。
> 安装时若 npm 限制了 postinstall 脚本，需要先批准：
> ```bash
> npm approve-scripts workerd esbuild
> ```

### 2. 配置本地环境变量

复制模板并填入真实值：

```bash
cp .dev.vars.example .dev.vars
```

`.dev.vars` 内容：

```text
ADMIN_PASSWORD=你的管理员密码
SESSION_SECRET=一段随机字符串（openssl rand -hex 32）
```

> ⚠️ `.dev.vars` 已被 `.gitignore` 排除，**绝不提交**。

### 3. 启动本地开发服务器

```bash
npm run dev
# 相当于 wrangler dev --local
```

访问 `http://localhost:8787`，`/api/health` 应返回 `{"status":"ok"}`。

### 4. 测试与构建

```bash
npm test          # 运行 Vitest（404 个测试）
npm run build     # 构建前端内联 + TypeScript 类型检查
npm run lint      # ESLint
npx tsc --noEmit  # 单独类型检查
```

---

## 🚀 生产部署

### Cloudflare KV 命名空间

1. 打开 [Cloudflare Dashboard](https://dash.cloudflare.com/) → **Workers & Pages** → **KV**
2. 点击 **Create namespace**，名称填 `DATABASE`，创建
3. 复制显示的 **Namespace ID**

### 生产环境变量

生产环境运行于 Cloudflare Workers，**不使用** `.dev.vars`，
而是通过 **GitHub Secrets** 配置（仓库 → Settings → Secrets and variables → Actions → New repository secret）：

| Secret | 说明 | 必填 |
|--------|------|------|
| `CLOUDFLARE_API_TOKEN` | Cloudflare API Token（Workers Scripts Edit + KV Edit + Account Settings Read 权限） | ✅ |
| `KV_NAMESPACE_ID` | 上面创建的 KV 命名空间 ID | ✅ |
| `ADMIN_PASSWORD` | 管理界面登录密码 | ✅ |
| `SESSION_SECRET` | Session 签名/加密密钥 | ✅ |
| `WORKER_GITHUB_TOKEN` | GitHub Token（防 API 限流，可选） | ❌ |

配置完 Secrets 后，推送 `main` 分支触发 GitHub Actions 自动部署。

> ⚠️ 所有敏感信息存储于 Cloudflare Secrets，**绝不写入代码或 wrangler.toml**。

---

## 📁 项目结构

```
CF-Workers-SUB-Next/
├── src/                    # 源码
│   ├── index.ts           # Worker 入口 + scheduled handler
│   ├── meta.ts            # 项目元信息
│   ├── api/               # HTTP 路由（Hono）
│   ├── services/          # 业务逻辑
│   ├── parser/            # 协议解析器
│   ├── generator/         # 配置生成器（9 种格式）
│   ├── data/              # 静态规则数据
│   ├── storage/           # KV 仓储
│   ├── models/            # 数据模型
│   └── engine/            # 订阅抓取
├── public/                # 前端静态资源
├── tests/                 # 测试代码（404 项）
├── docs/                  # 项目文档
│   └── archive/           # 历史开发文档归档
├── scripts/               # 工具脚本
├── wrangler.toml          # Cloudflare Workers 配置
├── package.json           # 项目元数据
└── tsconfig.json          # TypeScript 配置
```
