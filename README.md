# CF-Workers-SUB-Next

Cloudflare Native 订阅管理与配置生成平台的 V2 实现（v2.28.4）。

把机场订阅聚合、清洗、解析，并按 mihomo / sing-box / shadowrocket 等格式在线生成客户端可用的配置。运行在 Cloudflare Workers 上，免费额度内零成本运营，无需 VPS / Docker / 本地数据库。

[![CI workflow](https://img.shields.io/badge/CI-通过-green)]()
![Version](https://img.shields.io/badge/版本-2.28.4-blue)
![Tests](https://img.shields.io/badge/测试-475%20passed-green)
![License](https://img.shields.io/badge/License-MIT-green)

---

## 工作流程（用户视角）

```
添加订阅 URL
  ↓
每日自动抓取（默认北京 07:00，设置页可调）
  ↓
按 12 种协议解析节点  →  节点去重 + 清洗 + 启用管理
  ↓
识别节点国家归属（GeoIP）→ 按国家/协议生成策略组
  ↓
输出 mihomo / sing-box / shadowrocket / v2ray 等配置
  ↓
/sub/:format/:token 供客户端直接订阅
```

## 快速部署

1. Fork / 克隆仓库，创建 KV 命名空间（绑定到 `DATABASE`）
2. 配置环境变量：`ADMIN_PASSWORD`（必配）、`SESSION_SECRET`、`GITHUB_TOKEN`（可选）
3. 部署：`npm install && npm run deploy`

```bash
git clone https://github.com/bobvane/CF-Workers-SUB-Next
cd CF-Workers-SUB-Next
wrangler kv:namespace create DATABASE    # 把返回的 id 填进 wrangler.toml
wrangler secret put ADMIN_PASSWORD       # 管理后台登录密码
npm install && npm run deploy
```

部署后访问 Worker 域名，用 `admin` + `ADMIN_PASSWORD` 登录。完整说明见 [11 部署](./docs/11_DEPLOYMENT.md)。

## 功能特性

- **多订阅聚合**：添加 / 删除 / 手动更新任意数量订阅，定时自动重抓
- **节点解析**：内置 12 种协议解析器，自动识别 vmess / vless / trojan / ss / ssr / hysteria2 / tuic / wireguard / anytls，兼容 Clash YAML
- **节点清洗**：按 `server:port:protocol` 去重；清洗规则集（删除 / 替换 / 正则）；节点启用管理
- **分流规则引擎**：13 组固定策略组（全部原生 GEOSITE）+ 动态规则目录（MetaCubeX 分类）+ 自定义规则，Web 面板可切换
- **IP 归属识别**：自动解析节点 IP → GeoIP → 国家归属；后台自动重试未识别 IP
- **多格式输出**：mihomo / sing-box / shadowrocket / v2ray / v2rayN / nekoray，不支持的协议自动跳过
- **DNS 防泄露**：生成配置内置「国内域名→国内 DoH / 国外域名→国外 DoH」分流 + fake-ip 全接管 + 严格路由；若经 OpenClash 导入，请在面板关闭「自定义上游 DNS 服务器」以免覆盖订阅 DNS 段
- **内置管理后台**：仪表盘 / 订阅 / 节点 / 规则 / 输出 / 设置，自带鉴权
- **CF 用量统计**：绑定最多 3 个 Cloudflare 账户，仪表盘显示今日请求量

## 支持的协议

`vmess` · `vless`（含 Reality/XTLS）· `trojan` · `ss` · `ssr` · `hysteria2` · `tuic` · `wireguard` · `anytls`，以及 Clash YAML 订阅的整包解析。

## API

完整端点清单见 [03 API 规范](./docs/03_API_SPEC.md)。核心：

| 方法 | 路径 | 说明 | 鉴权 |
|---|---|---|---|
| GET | `/api/meta` | 项目信息 | ❌ |
| POST | `/api/auth/login` | 登录 | ❌ |
| GET | `/api/dashboard` | 仪表盘统计 | ✅ |
| GET/POST/DELETE | `/api/subscriptions` | 订阅管理 | ✅ |
| GET | `/api/nodes` | 节点列表 | ✅ |
| GET | `/api/rules/*` | 分流规则 | ✅ |
| GET | `/sub/:format/:token` | 客户端订阅链接 | Token* |

\* `/sub` 使用长随机 token 鉴权，等价于密码，请勿泄露。

## 定时任务

| 任务 | 触发 | 说明 |
|---|---|---|
| 订阅自动更新 | 每小时 Cron（默认北京 07:00） | 拉取全部订阅并预填充 IP 地理缓存 |
| 规则目录同步 | 每月 1 日 03:00 UTC | 同步 MetaCubeX 最新分类清单 |
| Geo 重试 | 每分钟 Cron | 批量重查未识别 IP，10 次上限后停止 |

详见 [07 定时任务](./docs/07_SCHEDULER.md)。

## 项目结构

```
src/
├── index.ts            # Worker 入口（fetch + scheduled）
├── api/                # Hono 路由 / 中间件 / 限流
├── services/           # 业务服务（auth/订阅/配置/IP地理/CF用量/规则目录）
├── parser/             # 12 种协议解析 + 订阅格式检测
├── generator/          # mihomo/singbox/shadowrocket/base64 + 序列化
├── data/               # 策略组定义 / 国家码 / 格式映射
├── storage/kv.ts       # KV 仓储层（统一键管理）
├── models/             # 数据模型
└── html.js             # 构建生成的前端内嵌（勿手改）
public/index.html       # 前端单文件源码
tests/                  # vitest 测试
docs/                   # 技术文档（见下）
```

## 文档

[00 快速上手](./docs/00_START_HERE.md) → [架构](./docs/01_ARCHITECTURE.md) → [数据模型](./docs/02_DATA_MODEL.md) → [API](./docs/03_API_SPEC.md) → [解析器](./docs/04_PARSER_SPEC.md) → [生成器](./docs/05_GENERATOR_SPEC.md) → [分流规则](./docs/06_RULES_SYSTEM.md) → [定时任务](./docs/07_SCHEDULER.md) → [IP 归属](./docs/08_IP_GEO.md) → [CF 用量](./docs/09_CF_USAGE.md) → [测试](./docs/10_TESTING.md) → [部署](./docs/11_DEPLOYMENT.md) → [安全](./docs/12_SECURITY.md) → [前端](./docs/13_FRONTEND.md) → [路线图](./docs/14_ROADMAP.md)

## 开发文档

>`docs/00–14` 是**内部开发文档**（架构/数据模型/API/解析器/生成器/规则/定时/IP 归属/CF 用量/测试/部署/安全/前端/路线图），按项目约定仅保留在本地工作目录、**不上传 GitHub**。公开读者以本 README 为准。

本 README 已内嵌了供外部使用的最小集：快速部署、功能特性、API 摘要、结构、定时任务、开发命令。

## 开发与测试

```bash
npm install
npm run typecheck   # tsc --noEmit
npm run lint        # eslint
npm test            # vitest run（475 项）
npm run build       # build:html + typecheck
npm run deploy      # build + wrangler deploy
```

## License

[MIT](./LICENSE) · 作者 [Bob Vane](https://github.com/bobvane)
