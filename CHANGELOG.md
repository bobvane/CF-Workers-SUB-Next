# Changelog

本项目遵循 [Semantic Versioning](https://semver.org/)。

## [2.12.0] - 2026-08-31

### Mihomo DNS 配置精调（fake-ip 模式）
- `proxy-server-nameserver` 由 DoH 改为纯 IP 引导（`223.5.5.5` / `119.29.29.29`），解析节点服务器域名更快更稳、防污染
- 移除 `fake-ip-filter` 块（STUN/Apple 推送等条目），按用户指定精简 DNS 硬编码
- 其余保持：`nameserver` 国内 DoH（223.5.5.5/doh.pub）、`nameserver-policy` 国内 cn/private 走国内 DoH、国外 geolocation-!cn 走 `1.1.1.1`/`8.8.8.8#节点选择`
- 同步更新 `tests/verify-v31.test.ts` DNS 断言（去掉 fake-ip-filter 断言，新增 proxy-server-nameserver 纯 IP 断言）
- 测试基线 378 ✅

## [2.11.9] - 2026-08-31

### 安全测试空壳修复（⑥）
- `tests/security/security.test.ts` 不再测 escHtml 的复制副本，改为直接从真源 `public/index.html` 提取前端实际运行的 escHtml 实例化测试
- 新增产物接线校验：断言 `src/html.js`（已生成的前端代码）在 `renderRulesTree` 中确实把 `escHtml` 接进 `it.id`/`it.label`，且不得出现未转义直接内插的 `${it.id}`/`${it.label}`（防回归）
- 测试基线 378 ✅（+2）

## [2.11.8] - 2026-08-31

### 稳定/安全补丁（对抗式审查产出）
- **白屏根因修复（事故①同类问题）**：`api()` 新增 `fetchWithTimeout`（15s AbortController 超时），杜绝网络黑洞导致 `checkSession()` 永不返回；Init 处新增 5 秒 `Promise.race` 硬性兜底，保证 `switchPage` 5s 内必执行 → 永不白屏
- **自定义规则 ID 防注入（XSS + 配置损坏）**：后端 `POST /api/rules/custom` 校验 id 字符集（`[A-Z0-9][A-Z0-9_-]{0,63}`）；前端 `renderRulesTree` 对 `id/label/tag` 统一 `escHtml` 转义（对照 catalog 渲染）
- **测速地址统一为国内可达**：`cp.cloudflare.com/generate_204`（自动选择/六国地理组/singbox auto），并给自动选择组加 `timeout: 3000`；清理 `DEFAULT_SNIFFER_CONFIG['skip-domain']` 中无意义的 `'Mijia Cloud'` 行
- 测试同步：verify-v31 六国 URL 断言、新增非法 id 400 用例；测试基线 376 ✅

## [2.11.7] - 2026-08-30

### GLOBAL 组精简为四组（用户 2026-08-30 拍板）
- GLOBAL proxies 从全量列表（含广告拦截/国外媒体/业务组/漏网之鱼/地理组）精简为仅四项：节点选择、手动切换、自动选择、DIRECT
- 移除 `globalOrder` 常量，GLOBAL 直接内联四项 proxies

## [2.11.6] - 2026-08-30

### 四项策略组/规则修正（用户 2026-08-30 拍板）
- 六国 url-test 地理组单节点自动降级为 select（`geo.nodes.length > 1` 才启用 url-test 测速，单节点测速无意义）
- 广告拦截组 proxies 精简为 `['REJECT', 'DIRECT']`（去掉子组引用）
- 漏网之鱼默认改为「自动选择」；GLOBAL 组默认改为「DIRECT」
- GLOBAL 组新增国内可达测速 URL `https://cp.cloudflare.com/generate_204`——修复 OpenClash 面板 DIRECT 测速无反馈（原默认 gstatic generate_204 国内直连不通）
- google-fcm 规则改原生 GEOSITE：`metacubex-rules.ts` googlefcm 条目加 `native: true`，输出 `GEOSITE,googlefcm,谷歌FCM`，不再生成 rule-provider 硬编码段（用户前提：Mihomo 客户端已有全面 GeoIP/GeoSite 数据库）
- 测试同步：verify-v31 / mihomo / config-rules 断言更新
- 测试基线：375 ✅

## [2.11.5] - 2026-08-30

### 地理组自动测速 — 美国/马来西亚/日本/新加坡/台湾/韩国 六组 url-test
- 用户指定六国/地区地理组启用 url-test 自动测速（2026-08-30）
- 测速参数：`url: https://www.gstatic.com/generate_204`、`interval: 300`、`tolerance: 50`、`lazy: true`、`timeout: 5000`
- 其余地理组（含"全部/其他"）保持 select 手动选择
- verify-v31.test.ts 六国断言补全（马来西亚/台湾/韩国），DNS 测试过时 `interval: 300` 断言移除
- 测试基线：375 ✅

## [2.11.4] - 2026-08-30

### XHTTP 支持暂停 — 降级为普通 VLESS 输出
- 用户决定暂停 XHTTP 支持（2026-08-30），Mihomo 生成器不再输出 XHTTP 特有配置
- `network: xhttp` + `xhttp-opts` 整块移除：XHTTP 节点降级为普通 VLESS TLS 输出
- XHTTP 缺省 alpn `[h2]` 默认逻辑移除（链接带 alpn 参数仍保留输出）
- ECH(encrypted-client-hello)，x-padding-* 等 XHTTP 配套字段一并移除
- 解析器/协议显示/node-to-url/前端标签保留 XHTTP 识别与展示（节点列表仍可见）
- 测试基线：375 ✅

## [2.11.3] - 2026-08-30

### XHTTP alpn 支持 — HTTP/2 握手必需
- VLESS 解析器新增 `alpn` 参数读取（逗号分隔转数组，如 `alpn=h2,http/1.1`），不再落入 extra
- Mihomo 生成器 VLESS 段输出 alpn：链接带 `alpn` 参数时原样输出；XHTTP 缺省时默认 `[h2]`
- 依据 Mihomo 官方文档：alpn 为 TLS 握手 ALPN 列表，位于代理顶层（`tls: true` 同层）

## [2.11.2] - 2026-08-30

### XHTTP x-padding 参数解析修复（3X-UI/v2rayN 封装格式）
- **根因**：3X-UI/v2rayN 链接把 x-padding 参数封装在 `extra=JSON`(camelCase 键) 中，生成器只读顶层 kebab-case 键，导致整个 x-padding 块丢失。
- **修复**：生成器解析 `extra` JSON，camelCase → kebab-case 映射到 xhttp-opts（x-padding-obfs-mode/method/placement/header/key/bytes）；顶层同名参数优先覆盖。

## [2.11.1] - 2026-08-30

### VLESS 输出补全（XHTTP 节点连接排查）
- **强制输出 `udp: true` + `encryption: none`**：所有 VLESS 节点固定输出，不再依赖链接参数。
- **client-fingerprint 默认 chrome**：非 Reality 的 TLS VLESS 节点即使链接不带 `fp` 也默认输出 `chrome`（链接带 `fp` 时以链接为准）。
- **ECH query-server-name 恢复**：从链接 `ech=域名+DoH` 参数拆分读取（取 `+` 前域名），`config` DoH 不输出。

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