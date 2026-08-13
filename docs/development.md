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
# 相当于 wrangler dev
```

访问 `http://localhost:8788`，`/api/health` 应返回 `{"status":"ok"}`。

### 4. 测试与构建

```bash
npm test          # 运行 Vitest
npm run build     # TypeScript 类型检查
npm run lint      # ESLint
```

---

## 生产环境环境变量

生产环境运行于 Cloudflare Workers，**不使用** `.dev.vars`，
而是通过 Cloudflare Secrets 配置：

```bash
# 需要先在 Cloudflare 上部署 Worker（见 README / CI 文档）
wrangler secret put ADMIN_PASSWORD
wrangler secret put SESSION_SECRET
```

| 变量 | 用途 | 必填 |
|------|------|------|
| `ADMIN_PASSWORD` | 管理界面登录密码 | ✅ |
| `SESSION_SECRET` | Session 签名/加密密钥 | ✅ |

所有敏感信息存储于 Cloudflare Secrets，**绝不写入代码或 wrangler.toml**。

---

## Cloudflare KV

应用使用 KV 绑定 `DATABASE` 作为数据存储。

本地开发 wrangler 会自动模拟 KV；生产环境需先创建命名空间并绑定：

```bash
wrangler kv namespace create DATABASE
# 将输出的 id 填入 wrangler.toml 的 [[kv_namespaces]]
```