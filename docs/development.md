# 开发环境配置

## 本地开发

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
SESSION_SECRET=一段随机字符串
```

> `.dev.vars` 已被 `.gitignore` 排除，**绝不提交**。

### 3. 启动本地开发服务器

```bash
npm run dev
# 相当于 wrangler dev --local
```

访问 `http://localhost:8787`，`/api/health` 应返回 `{"status":"ok"}`。

### 4. 测试与构建

```bash
npm test          # 运行 Vitest（169 个测试）
npm run build     # 构建前端内联 + TypeScript 类型检查
npm run lint      # ESLint
```

---

## 生产部署

### Cloudflare KV 命名空间

1. 打开 [Cloudflare Dashboard](https://dash.cloudflare.com/) → **Workers & Pages** → **KV**
2. 点击 **Create namespace**，名称填 `DATABASE`，创建
3. 复制显示的 **Namespace ID**

### 生产环境环境变量

生产环境运行于 Cloudflare Workers，**不使用** `.dev.vars`，
而是通过 **GitHub Secrets** 配置（仓库 → Settings → Secrets and variables → Actions → New repository secret）：

| Secret | 说明 | 必填 |
|--------|------|------|
| `CLOUDFLARE_API_TOKEN` | Cloudflare API Token（Workers R2 Edit + KV Edit 权限） | ✅ |
| `KV_NAMESPACE_ID` | 上面创建的 KV 命名空间 ID | ✅ |
| `ADMIN_PASSWORD` | 管理界面登录密码 | ✅ |
| `SESSION_SECRET` | Session 签名/加密密钥 | ✅ |

配置完 Secrets 后，推送 `main` 分支触发 GitHub Actions 自动部署。

> 所有敏感信息存储于 Cloudflare Secrets，**绝不写入代码或 wrangler.toml**。