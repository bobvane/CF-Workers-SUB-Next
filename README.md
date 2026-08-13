# CF-Workers-SUB-Next V2

基于 Cloudflare Workers 的订阅管理与配置生成平台。

## 目录结构

```
src/
├── index.ts          # Worker 入口
├── api/              # Hono 路由 + 认证中间件
├── services/         # 业务服务层
├── engine/           # 处理引擎（fetcher/normalizer/rule-engine）
├── parser/           # 协议解析器（vmess/vless/trojan/ss）
├── generator/        # 配置生成器（mihomo/singbox）
├── models/           # 数据模型
├── storage/          # KV 仓储层
└── utils/            # 工具函数
public/               # 前端静态资源
tests/                # 测试
docs/                 # 文档
```

## 开发

```bash
npm install
npm run dev        # 本地 wrangler dev
npm test           # vitest
npm run build      # 类型检查 + 构建
```

## 部署

见 `docs/` 与 GitHub Actions 工作流。