# Changelog

本项目遵循 [Semantic Versioning](https://semver.org/)。

## [2.11.0] - 2026-08-30

### 规则排序重构（V3.2 冻结版）
- **14 步优先级定稿**：用户规则 → 内网防代理 → 广告拦截 → 国内直连 → FCM → AI → 社交 → 国外媒体 → 游戏 → 微软 → 苹果 → 加密货币 → GEOIP,CN,DIRECT → MATCH。
- **内网防代理拆两条**：`GEOIP,lan,DIRECT,no-resolve` + `GEOSITE,private,DIRECT`（lan 在前、private 在后，替代原单一 `GEOIP,private,DIRECT`）。
- **国内直连拆分**：china-direct 组输出 7 条 GEOSITE（cn/apple-cn/microsoft@cn/steam@cn/category-games@cn/onedrive/icloud@cn）→ DIRECT；`GEOIP,CN,DIRECT` 从组内剥离，排到 crypto 之后、MATCH 之前。
- **组顺序调换**：国外媒体提前到游戏前；加密货币移至苹果服务之后（末尾）。
- **apple-music 归属**：从国外媒体组移除，只保留在苹果服务组（DIRECT）。
- **策略组默认值全部 DIRECT**：AI/社交/加密货币/用户规则 从「节点选择」改「DIRECT」，国外媒体从「自动选择」改「DIRECT」（面板仍可切换）。

### XHTTP ECH 简化
- `ech-opts` 只保留 `enable: true`，去掉 `query-server-name` / `config`（XHTTP 节点 Clash 连接不上，简化后重试）。

### 其他
- 版本号 v2.10.3 → v2.11.0。

## [2.0.2] - 2026-08-21

### 修复与优化
- **规则库分类筛选（方案 A）**：设置页规则库新增「全部 / 🎯 聚合 / 🌐 站点 / 🌍 顶级域」分类 chips，按类型缩小范围再挑，避免平铺几千条。
- **后端 type 过滤**：`/api/rules/catalog?type=` 支持按 `aggregate`/`site`/`tld` 过滤，并返回各类型计数。
- **默认计数展示**：chips 上直接显示各分类数量（聚合 118 / 站点 1424 / 顶级域 4），用户一眼知道从哪入手。
- **补充测试**：覆盖 catalog 按 type 过滤与类型计数返回。

## [2.0.1] - 2026-08-21

### 修复与优化
- **Mihomo P0 策略组重构**：补齐节点选择、手动切换、自动选择、广告拦截、应用净化、国内媒体、国外媒体、漏网之鱼与 GLOBAL。
- **显式默认策略**：使用 Mihomo 官方 `default-selected` 字段，确保节点选择默认自动选择、广告/应用净化默认 REJECT、国内媒体与 GLOBAL 默认 DIRECT、国外媒体默认自动选择。
- **MetaCubeX 规则分工**：`CATEGORY-ADS-ALL` 路由到广告拦截，`CATEGORY-ADS` 路由到应用净化。
- **补充测试**：覆盖策略组存在性、默认策略和规则出口映射。

## [2.0.0] - 2026-08-17

### 🎉 V2.0.0 - 规则库扩展版

### 新增
- **规则库（动态目录）**：从 MetaCubeX 分类中搜索挑选（全量同步，支持 GitHub Token 防 403、分步拉取避免截断）
- **自定义规则**：一键加入分流规则，自动根据分组决定目标策略（广告→REJECT / 国内→DIRECT / 其余→PROXY）
- **自定义规则删除**：分流规则页支持移除已添加的规则
- **输出配置联动**：自定义规则直接写入 Mihomo YAML / Sing-box JSON 输出
- **CI/CD 自动注入**：`WORKER_GITHUB_TOKEN` → Cloudflare Secrets，简化部署

### 优化
- 加入规则弹窗移除「目标策略」下拉，用户无需手动选策略
- 规则库状态展示（正常/过期/未同步）+ 立即刷新按钮

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