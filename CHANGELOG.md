# Changelog

本项目遵循 [Semantic Versioning](https://semver.org/)。

## [0.1.0] - 2026-08-13

### 新增
- **项目基础**：Cloudflare Worker 骨架、TypeScript strict 配置、Wrangler 配置
- **测试框架**：Vitest + 169 个测试用例
- **CI/CD**：GitHub Actions 自动测试 + 部署到 Cloudflare Workers
- **后端核心**：Repository Pattern KV 仓储、PBKDF2 认证 + Session、Hono API 路由
- **订阅系统**：创建/删除/更新订阅，Fetch→Parse→Normalize→Cache 完整管线
- **Parser 引擎**：VMess / VLESS / Trojan / Shadowsocks 四协议解析 + 去重 + 规则引擎
- **配置生成**：Mihomo YAML + Sing-box JSON 双格式输出
- **订阅端点**：`/sub/mihomo/:token`、`/sub/singbox/:token`
- **前端 SPA**：仪表盘 / 订阅管理 / 节点列表 / 输出配置 / 设置
- **安全加固**：SSRF 防护、XSS 转义、登录限流、Secrets 管理

### 安全
- 密码使用 PBKDF2-SHA256（10 万次迭代）+ 随机盐
- Session Cookie 设置 HttpOnly / Secure / SameSite=Strict
- 订阅抓取做 SSRF 防护（拒绝内网/私有 IP）
- 登录接口限流 10 次/分钟/IP