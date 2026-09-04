# Changelog

本项目遵循 [Semantic Versioning](https://semver.org/)。

## [2.23.0] - 2026-09-04

### 安全加固（Perplexity 审查修复）

> 依据 Perplexity 对项目安全审查结论修复。测试基线：423 → **428**。

**SSRF IP 校验强化（核心）**
- `isBlockedIp` 从字符串前缀匹配改为**数值 CIDR 判断**，覆盖全部保留网段：
  - 新增 CGNAT `100.64.0.0/10`、基准测试 `198.18.0.0/15`、IETF PI `192.0.0.0/24`、TEST-NET-1/2/3、组播 `224.0.0.0/4`、保留 `240.0.0.0/4`
- 拦截**非标准 IPv4 写法**：段值 >255（如 `999.1.1.1`）、IPv4-mapped IPv6（`::ffff:127.0.0.1`、`::ffff:10.0.0.1`）
- IPv6 保留段用字符串前缀（`::`、`::1`、`fc00:`、`fd00:`、`fe80~feb`、`ff00:`）

**地理定位 isPureIP 补段值校验**
- `isPureIP` 现在每段需 ≤255，避免 `2130706433` 十进制 / `999.1.1.1` 等非标准 IP 被当作域名去真解析

**订阅更新接口加 KV 限流**
- `POST /api/subscriptions/:id/update` 复用敏感操作 KV 限流（5 次/分），防资源滥用

**订阅更新顺序微调**
- 先写节点缓存，再更新订阅状态为 active——避免「状态已 active 但节点写入失败」的中间态

**清洗规则输入长度限制**
- `pattern` ≤256 字符、`replacement` ≤512 字符，防规则过大造成 CPU 消耗/超大配置

**新增 SSRF 测试（5 个用例）**
- CGNAT / benchmark / test-net / 组播 / 保留段 / 段值非法 / IPv4-mapped IPv6

## [2.22.0] - 2026-09-04

### 安全加固 + KV 分页（Codex 审查修复）

> 依据 Codex 对项目安全审查结论修复。测试基线：404 → 407 → **423**。

**KV `list()` 分页（🔴 关键修复）**
- `KvAdapter.list()` 改用 cursor 循环拉全量，不再只读第一页（limit 1000）
- 修复 >1000 条节点/订阅/规则时静默漏数据的问题（直接导致「1000+ 节点后生成配置不全」）
- 影响：`nodes.getAll()`、`subscriptions.list()`、`sessions.listAll()` 等所有依赖 `list()` 的仓储

**登录/敏感接口限流切到 KV（跨实例共享）**
- 登录（10 次/分）、改密/改用户名（5 次/分）由单实例内存计数器改为 KV 限流
- `createKvRateLimit` 已存在但未启用，现在 `createApp` 注入 `storage` 后自动启用
- 未注入 storage（如测试）时自动回退到内存限流，保持测试简单
- 生产环境多实例并发下限流不再形同虚设

**订阅令牌恒定时间比较**
- `/sub/:format/:token` 的 `sub_key` 比较由 `===` 改为 `constantTimeEqual`（逐字节异或）
- 防时序侧信道（Cloudflare Workers 无 crypto.subtle，自实现）

**executionCtx 空值防御**
- 订阅更新后的 `c.executionCtx?.waitUntil(...)` 加空值防御，防 Hono 未传第三参时抛 `'This context has no ExecutionContext'` 致 update 502

**升级检测加缓存**
- `/api/meta/check-upgrade` 加 6h 内存缓存，避免每次请求外呼 GitHub API（无鉴权端点防被作匿名流量放大器）

**新增鉴权矩阵测试（16 个用例）**
- 未登录访问受保护端点（订阅/节点/规则/仪表盘/设置/密码/用户名）→ 应 401
- 公开端点（health/meta/login）→ 不应 401
- 正常登录后访问受保护端点 → 200
- /sub 订阅令牌校验正反用例

## [2.21.0] - 2026-09-04

### 安全：密码改密后会话吊销机制（passwordVersion）

**修复：** v2.21.0 之前的版本，修改管理密码后旧登录会话仍然有效（无法吊销）。

- **Session 模型**新增 `passwordVersion` 字段（签发时携带当前密码版本号）
- **`setting:password_version`** 新 KV 键：存储当前密码哈希的版本号，初始化为 `0`
- **`changePassword`** 行为：改密时递增版本号 + 主动删除所有旧 session，旧 token 立即失效
- **`validateSession`** 行为：检查 session 的 `passwordVersion` 是否与当前版本一致，不一致则自动清理并返回 false
- **向后兼容**：首次启动若 `setting:password_version` 不存在，自动写入 `0`，不破坏现有部署
- **测试**：新增 3 个测试用例验证密码版本失效逻辑；全部 407 测试通过

## [2.19.5] - 2026-09-03

### 修改：三组策略组 default-selected 调整

- **微软服务**：`default-selected` 从 `DIRECT` 改为 `自动选择`（用户需求：微软服务走自动选择）
- **漏网之鱼**：`default-selected` 从 `自动选择` 改为 `手动切换`（用户需求：兜底组用手动切换）
- **GLOBAL**：`default-selected` 从 `DIRECT` 改为 `自动选择`（用户需求：全局默认自动选择）
- 同步更新 `tests/verify-v31.test.ts`、`tests/generator/mihomo.test.ts` 断言为新值
- 404 测试全绿，lint/tsc/build 全绿

## [2.19.4] - 2026-09-03

### 修改：自动选择组 proxies 从扁平节点名改为国家地理组名

- `src/generator/mihomo.ts` 的「自动选择」策略组（url-test 类型）`proxies` 由 `allGeoNodes`（扁平节点名数组）改为 `geoGroupNames`（地理组名数组）
- 效果：url-test 测速对象从「具体节点」变为「有节点的国家地理组」——自动选择会按地理组（🇭🇰 香港 / 🇯🇵 日本 / 🇸🇬 新加坡 等）整体测速并选出最优地区，而不是在所有节点里挑最快单节点
- 兜底逻辑保留：无节点时 `proxies: ['DIRECT']`
- 不影响「节点选择」组（其 proxies 本来就是 `['自动选择', ...geoGroupNames, ...]`，已经按地理组划分）
- 现有 404 测试仅断言「自动选择」组存在性，未断言具体 proxies 内容，回归全绿，lint/tsc/build 全绿

## [2.19.3] - 2026-09-03

### 修改：Mihomo 配置输出 mixed-port 改 7893

- `src/generator/mihomo.ts` 硬编码段 `mixed-port` 由 7890 改为 7893，与旁路由（192.168.2.5）的 Mixed 端口对齐
- `port: 7890` / `socks-port: 7891` / `allow-lan: true` / `mode: Rule` / `log-level: info` 不变
- 现存 404 测试无相关 mixed-port 断言，回归测试全绿，lint/tsc/build 全绿

## [2.19.2] - 2026-09-03

### 移除：广告拦截组 geosite:tracker 规则

- `src/data/metacubex-rules.ts` 的 `ads` 组原本包含 2 条固定规则：`category-ads-all`（广告拦截通用合集）和 `tracker`（追踪器）。本次删除 `tracker`，仅保留 `category-ads-all` 一条
- 效果：
  - 分流规则页面的「广告拦截」组不再显示「追踪器(Tracker)」选项（前端从同一数据源渲染 `adsGroup.items`）
  - `ruleSetLine` 不再为 `tracker` 输出原生 `GEOSITE,tracker,广告拦截` 行（因为 `buildRules` 遍历 ads 组时该项已不存在）
  - Mihomo 配置 `rules` 段不再包含 `GEOSITE,tracker,广告拦截`
- 同步修正 `src/generator/rule-providers.ts` 的注释文案（去掉 "TRACKER" 字样，避免误导后续维护者）
- 测试 404 全绿，lint/tsc/build 全绿

## [2.19.1] - 2026-09-02

### 新增：未识别国家码自动重试 + 界面提示（替代手动反复点重新检测）

**背景**：部分节点首次查询国家码失败后成为「未识别」，此前只能等每日定时更新或手动点「重新检测」才重试。本次改为自动周期重试，识别率达到零残留前持续尝试。

**逻辑（完全按批量模式，不采用单 IP）**
- wrangler.toml 新增每分钟 Cron `* * * * *`，scheduled handler 进入 geo 重试分支
- 每分钟检查：取全量节点 server，`filterUnlocatedServers` 筛出未识别 IP（**所有未识别都在池子里，全量批量重查**）
- 重查复用 `prewarmIpGeo`/`batchQuery` 批量接口（每次最多 100 IP，batchQuery 内部 15 次/分钟限流兜底，分钟吞吐 1500 IP）
- **连续重试 10 次**：每次 cron 发现仍有未识别则计数 +1；某次查完清零则重置；计到 10 次仍未清空则停止自动重试
- 停止后剩余 IP 写入 KV `setting:geo_pending_result`，供前端展示

**界面提示**
- 节点列表页新增提示横幅（红色左边线）：连续重试 10 次后仍剩的未识别 IP 逐个列出，并提示「建议检查这些节点的 IP/域名是否正确」
- 新增接口 `GET /api/nodes/geo-pending`（需认证）返回 `{ retryCount, unlocatedServers[], lastRetryTs, resultTs }`，前端 `loadNodes` 时自动拉取显示
- 查完清零自动隐藏横幅，不打扰

### 测试
- 新增 `tests/integration/geo-pending-api.test.ts`（5 用例）：空状态 / 10次提示 / 重试中 / 未登录401 / 损坏KV降级
- 全量 404 测试通过，lint / tsc / build 全绿

## [2.19.0] - 2026-09-02

### 界面视觉整体升级（设计系统精修）

**色彩与阴影**
- 新增 `--accent-soft` / `--accent-soft-d` 语义色（悬停/hover 统一用主题色，去除硬编码 rgba）
- 阴影系统重做：双层阴影（1px 贴边 + 大范围柔和扩散），暗色主题独立调参
- 新增 `--radius` / `--radius-sm` / `--radius-lg` 圆角变量，全站组件统一引用

**组件精修**
- 侧边栏导航：激活态改实心主色胶囊 + 光晕阴影，悬停用语义色
- 删除 `.nav-tab` 重复定义块（旧样式覆盖问题）
- 按钮：`font-weight` 500、点击 `scale(0.97)` 按压反馈、缓动曲线统一 cubic-bezier(0.16,1,0.3,1)
- 卡片：hover 阴影加深过渡，标题字距收紧
- 表单：focus 光圈改 3px 主题语义色
- 表格行悬停改主题语义色
- 登录页：渐变角度 135°、光斑透明度调低更雅致、卡片加白色描边
- 弹窗：圆角升级 12px、阴影更柔
- 正文字号 19→18px、行高 1.5、字距收紧，更接近现代 SaaS 控制台

## [2.18.1] - 2026-09-02

### 修复：CF 请求统计卡片仅仪表盘显示 + 横向长条布局

- 统计区块 `cfUsageSection` 移入 `page-dashboard` 容器内 —— 之前放在 dashboard 外导致**所有页面都显示**，现仅仪表盘页显示（其他页面随 `.page` 隐藏）
- 卡片改为**横向长条**：左侧账户名 + 今日请求量 + 百分比，右侧进度条 + Pages/Workers 拆分，`flex-wrap` 自适应窄屏
- 进度条区域纵向（多账户时上下堆叠）与仪表盘小卡片左右对齐，宽度一致

## [2.18.0] - 2026-09-02

### 新增：Cloudflare 请求数统计（仪表盘显示今日请求量）

借鉴 cmliu/edgetunnel 的 `getCloudflareUsage`（CF GraphQL 取今日请求数）。

**功能**
- **设置页**新增「📊 Cloudflare 请求统计」卡片：可添加最多 **3** 个 CF 账户（自定义名 + Account ID + API Token），支持编辑/删除，Account ID 掩码显示
- **仪表盘**新增「📊 Cloudflare 请求数统计（今日）」区块：每个账户一张卡片，显示今日请求 `total/100000` + 百分比 + 进度条 + Pages/Workers 拆分；>80% 变红、>90% 深红警示
- 未配置任何账户时仪表盘隐藏该区块，显示跳转「前往设置」链接

**统计口径**
- 周期：今日 0 点（UTC = 北京时间 8 点）→ 当前
- 上限：100000（CF Workers 免费额度）
- 只支持 API Token 认证（不用 Global API Key）

**安全**
- API Token 仅存 KV、仅服务端调 CF GraphQL 时使用
- `GET /api/cf-usage` 与 `/cf-usage/accounts` **不回传 token**，前端只见自定义名 + 掩码 Account ID
- 新增时必填 token；编辑时 token 留空 = 保留原值

**后端接口**
- `GET /api/cf-usage`（鉴权）：逐账户并发调 CF GraphQL，返回今日请求数数组
- `GET/POST /api/cf-usage/accounts`、`DELETE /api/cf-usage/accounts/:id`：账户 CRUD
- `POST /api/cf-usage/test`：测试单账户连接（验证 token/accountId）
- 新增 `src/services/cf-usage.service.ts`：`fetchCfUsage` 封装 GraphQL query + 账户持久化

**测试**：新增 8 用例（fetchCfUsage 解析/空/HTTP错/GraphQL错 + config CRUD/上限3/编辑保留token/删除），399 全过。

## [2.17.0] - 2026-09-02

### 修复：订阅更新返回 502 "This context has no ExecutionContext"

- **根因**：v2.16.0 把 IP 地理预填充移到 `c.executionCtx.waitUntil()`，但 `index.ts` 的 `app.fetch(request, env)` 只传了两个参数——Hono v4 需要第三参 `executionCtx` 才会填充 `c.executionCtx`。未传时 `waitUntil` 抛 "This context has no ExecutionContext"，导致整个 update 接口 502，前端弹「更新失败」。
- **修复**：`index.ts` fetch 签名加第三参 `executionCtx: ExecutionContext` 并透传给 `app.fetch(request, env, executionCtx)`。
- 说明：用户反馈「国家检测成功但订阅更新还是提示」——geo-redetect 接口未用 executionCtx 所以正常；update 用了所以报错。本修复解决 update。

### 新增：大刷新/拉取操作居中进度条（订阅更新 / 重新检测国家码）

- 新增居中进度弹窗：标题 + 进度条 + 状态文字 + 计时（`00:00 / 02:00`）
- 非确定进度从 10% 缓慢爬升至 95%，示意「仍在跑」；真实完成时跳 100%
- **120s 长时限**（`c.executionCtx` 修复后 update 即时返回；进度条覆盖等待期）
- 硬性超时（120s+) → 进度条红色置满 + 显示「操作超时，请稍后重试」
- 请求侧 `AbortError` → 中文「请求超时，请重试」（替代英文原生 message）
- `updateSub` 与 `redetectGeo` 均接入，按钮带 loading 态防重复点

## [2.16.0] - 2026-09-02

### 性能修复：节点列表与订阅更新超时（实测根因）

**问题一：`GET /api/nodes` 实测 22.9s » 前端 15s 超时 → 弹「加载节点失败」/节点列表空白**
- 根因：`filterUnlocatedServers`（供 `/nodes` 统计 `geoUnlocated`）对每个节点 server **逐条串行**读 KV，节点数百个时轻松拖到 20s+
- 修复：改为分批并发（每批 20 个 `Promise.all`），逻辑不变，`/nodes` 预计降到 <1s

**问题二：`POST /api/subscriptions/:id/update` 实测 >40s » 15s 超时 → 弹「更新失败: signal is aborted without reason」**
- 根因：订阅更新后**同步**执行 `prewarmIpGeo`（逐批查 ip-api + 15次/min 限流），Edgetunnel 108 节点叠加拖超 40s；前端 AbortController 掐断后 catch 直接弹浏览器原生英文 message
- 修复①：`prewarmIpGeo` 移到 `c.executionCtx.waitUntil()` 后台执行，update 立即返回（逻辑不变，仅异步化）
- 修复②：前端 `api()` 捕获 `AbortError` 转友好中文「请求超时，请重试」
- 修复③：`api()` 支持 per-call `timeout`；订阅更新给 90s 预算（此时只等订阅本体抓取+解析，后台 prewarm 已异步）

**体验改善（前端）**
- 订阅更新按钮加 loading 态（⏳ 更新中 + 禁用）防重复点击
- `loadNodes()` 在途合并：同一时刻只允许一个 `/nodes` 请求在飞，避免切页/刷新连点并发打爆 KV

### 说明

- 未改变任何分流/策略组/规则逻辑，仅优化 KV 读取并发度与请求时序
- `filterUnlocatedServers` 分批并发是纯实现细节，行为与口径完全一致（已有测试覆盖，391 pass）

## [2.15.1] - 2026-09-02

### 修复：用户自定义规则删除按钮排版

- 垃圾桶 `🗑` 移到规则名字右边同一行（原在名字下方，因 `.rules-item` 是 2 列网格、删除 span 是第 3 个子项被换行）
- 修复：删除按钮移入 `.rule-label` 内，`.rule-label` 改 flex 行布局（主文字 + 删除按钮同行），删除按钮 `flex:none` 不收缩

## [2.15.0] - 2026-09-02

### 新增：Google服务 分流组（用户 2026-09-02 拍板）

- 分流规则页新增「Google服务」组，位置在「国外媒体」之后
- 组内 7 条规则（全部原生 GEOSITE/GEOIP 输出，默认在预设勾选、可取消）：
  - geosite: `google` / `google-gemini` / `google-deepmind` / `google-play` / `google-scholar` / `google-trust-services`
  - geoip: `google`（内部 id `google-geoip` 避开与 geosite:google 同名冲突）
- 该组加入全部 6 个快速预设（极简 / 极简+加密 / 标准 / 标准+加密 / 完全体 / 完全+加密）

### Mihomo 输出

- 新增「Google服务」固定策略组，放在国外媒体之后，`default-selected: 手动切换`
- `rules:` 段落：6 条 `GEOSITE,google*` 就近输出在国外媒体（⑧）之后；`geoip:google` 单独放 `GEOIP,CN,DIRECT`（⑬）之后作 IP 兜底（⑬b）
- `buildRules` step⑤ 跳过 geoip 项；orphan 去重跳过 geoip 项，避免用错误 id（google-geoip）重复输出

### UI

- 用户添加规则删除按钮：`✕` → 垃圾桶 `🗑`，位置移到规则标签后面（排版更整洁）

## [2.14.0] - 2026-09-02

### 变更：策略组默认出口（用户 2026-09-02 拍板）

- **手动切换** default-selected 取「美国」组第一个节点（本订阅为 `美国bob-bob@gmail.com`），无美国组则回退第一个地理节点
- **国外媒体** default-selected → `自动选择`（原 DIRECT）
- **AI 平台** default-selected → `手动切换`（原 DIRECT）
- **社交** default-selected → `自动选择`（原 DIRECT）
- **加密货币** default-selected → `🇹🇼 台湾`（原 DIRECT）
- **GLOBAL** 删除 `url: https://cp.cloudflare.com/generate_204`（GLOBAL 为 select，不需要测速）

### 调整：url-test 地理组参数排版（用户 2026-09-02 拍板）

- 自动生成的地理组（url-test）的 `url` / `interval` / `tolerance` 三个参数移到 `type: url-test` 正下方、`proxies` 之前，排版更清晰

### 调整：rules 段落用户规则顺序（用户 2026-09-02 拍板）

- 用户规则从「最前」移到 `- GEOSITE,private,DIRECT` 之后、广告拦截之前
- 优先级：① 内网防代理（lan + private）→ ② 用户规则 → ③ 广告拦截 …

## [2.13.1] - 2026-09-02

### 修复：用户规则组输出逻辑

- **用户规则组 default-selected 改为「手动切换」**（之前硬编码 `DIRECT`，用户添加规则后默认应能手动切换节点）
- **用户自定义规则统一走 GEOSITE 原生输出**（不再用 `RULE-SET` + `rule-providers` 方式），与 native 规则输出方式一致
- **修复自定义规则重复输出问题**：orphan 去重步骤现在跳过 custom 规则（已在 step ① 置顶输出），且 `matchedIds` 统一用小写匹配，避免大小写不一致导致重复

### 技术细节

- `ruleSetLine()`: `rule.native || rule.custom` → GEOSITE/GEOIP 原生输出
- `buildRuleProviders()`: 跳过 `rule.custom`，不生成 provider
- `buildRules()` orphan 步骤：`!r.custom && !matchedIds.has(r.id.toLowerCase())` 双重过滤
- `generateMihomoConfig()`: `nonNativeRules` 过滤加上 `!r.custom`

## [2.13.0] - 2026-09-01

### 新增：mihomo 配置输出恢复必要头部

- 在 `proxies:` 前硬编码输出 `port: 7890` / `socks-port: 7891` / `allow-lan: true` / `mode: Rule` / `log-level: info`，与硬编码规则集一起构成 Mihomo 完整可运行配置（v2.12.3 曾去除全部硬编码头字段，本次按用户指令恢复 5 行必要头部；`dns:` / `sniffer:` / `profile:` 三段仍保持去除状态）

### 变更：url-test 组参数整理

- **砍掉 `lazy: false`**（v2.12.9 引入，本次移除）
- **参数顺序调整**：`url` / `interval` / `tolerance` 移到 `type` 下方，便于阅读
- **测速地址统一**：`https://cp.cloudflare.com/generate_204` → `http://www.gstatic.com/generate_204`（与 v2.12.10+ geo 预填充阶段保持一致）
- **interval 统一为 300**（v2.12.8 之前 自动选择=1800、地理=300；v2.12.8 统一为 600；本次改回 300）
- **修复 GLOBAL / 手动切换 误带 `url` 问题**：这两类 select 组被错误地纳入 `urlTestGeoGroupNames`，加了 url 字段。Mihomo 校验拒绝 url-test 专属字段出现在 select 组。修复：剔除 GLOBAL 和 手动切换，只保留六国地理 url-test 组

### 测试

- `tests/generator/mihomo.test.ts`：4 处断言反向更新（旧断言验 v2.12.2 移除头部，现改为验 v2.13.0 恢复头部；旧断言验 v2.12.2 移 DNS/sniffer，现改为验 v2.13.0 仍无 DNS/sniffer + 有 5 行头部）
- `tests/verify-v31.test.ts`：1 处注释更新
- 新增 1 个参考文档 `references/mihomo-hardcode-rules.md` 记录 v2.13.0 完整规范与历史对比表
- **测试基线保持 390 tests**
- 不新增 `mixed-port` / `external-controller` / `secret` / `ipv6` / `profile` / `dns` / `sniffer` 字段（仍按 v2.12.2 保持精简）

### 变更：自动选择 + 自动测速地理组的 url-test 参数

- 移除 `lazy: false` 参数
- 将 `url` / `interval` / `tolerance` 三个参数移到 `type` 行之后（视觉顺序更直观）
- 测速地址全部统一为 `http://www.gstatic.com/generate_204`（与 v2.12.10+ 预填充 geo 阶段保持一致）

### 修复：GLOBAL select 组误加 url 字段

- GLOBAL（最终组）和手动切换组类型均为 `select`，不应有 `url`；本次修复从 `urlTestGeoGroupNames` 中剔除 `GLOBAL` 和 `手动切换`，避免 Mihomo 校验拒绝
- 测试断言同步更新，验证上述四组变更

## [2.12.17] - 2026-09-01

### 修复：__NULL__ 负缓存卡死——batchQuery 命中 __NULL__ 仍无条件 continue 跳过重查

- **根因**：`batchQuery` 缓存命中 `__NULL__` 后，无论是否有效都执行 `continue`，
  `__NULL__` 永远不会被加入 uncached，导致 ip-api 请求永远发不出去，节点国家
  码永久卡死在「未识别」状态
- **修复**：`batchQuery` 命中 `__NULL__` 时不再写入 result，但 push 到 uncached
  重新查询；`prewarmIpGeo` 同步修复——`__NULL__` 不写入 ipToCountry、不计
  cached，落入 uncached 由 batchQuery 重查
- **测试**：新增 batchQuery `__NULL__` 重查并写入有效缓存、prewarmIpGeo
  `__NULL__` 重查后 resolved=2 两用例；全套 390 通过
- 顺带：`.gitignore` 排除 PROJECT_CONTEXT.md / CURRENT_TASK.md（本地会话固化
  文档不入库）

## [2.12.16] - 2026-09-01

### 增强：geo-redetect 响应携带未识别节点列表，一键诊断 14 个"死活查不出"的节点

- **根因分析**：剩余 14 个节点反复重检仍无法识别，大概率是「ip-api 返回 fail（保
 留段/内网 IP）」或「国家码不在映射表 → countryDisplayName 返回 null → 不写缓存
 → 每次重检重复查询、永远失败」
- **诊断手段**：geo-redetect 响应新增 `unlocatedServers` 字段（前 50 个未识别
  server），前端 toast 同步展示，部署后点一次重检就能看到 14 个节点的原始
  server 字符串（域名？IP？保留段？），无需猜测
- 后端 `routes.ts` 重检后调用 `getUnlocatedServers` 获取列表，slice(0,50)
- 前端 `redetectGeo` toast 追加「：server1, server2 …」行

## [2.12.15] - 2026-09-01

### 修复：域名节点反复重检仍无法识别国家码（缓存 key 口径不一致）

- **根因**：`prewarmIpGeo` 写缓存用的是「解析后的 IP」（`ip_geo:{IP}`），而统计/重检筛选 `hasGeoCountry` 用的是「原始 server」（`ip_geo:{域名}`）。域名节点每次重检都写入成功，但统计侧永远查不到对应 key → 死循环，表现为「反复检测、死活剩 16 个节点识别不出来」
- **修复**：`prewarmIpGeo` 批量查询后**同时回写 `ip_geo:{server}` 缓存**（与统计口径 key 一致），域名节点即被统计侧识别为已识别
- 存量修复前只写了 IP key 的节点，重检时也会自动补上 server key（统一回写路径）
- 纯 IP 节点（server = IP）行为不变

## [2.12.14] - 2026-09-01

### 优化：重新检测国家码的分批逻辑

- `prewarmIpGeo` 批量查询改为**按 ≤100 IP/批 循环分包**，单次最多 5 批（500 个 IP），不再降级为逐条单查
- 101-200 个未识别 IP 打 2 包、201-300 打 3 包、301-400 打 4 包、401-500 打 5 包；超过 500 的部分保持未识别，等下次触发重检
- 每批前检查 15 次/分钟滑动窗口限流，超限即停止后续批次（剩余等下次）
- 本批请求失败跳过该批，不阻塞后续批次，失败结果不写缓存允许重试

## [2.12.13] - 2026-09-01

### 新增：节点未识别国家码统计与手动重检

- 节点列表统计栏新增「未识别国家码 N 个」，口径与生成器归「其他」组判定严格一致（查 ip_geo 缓存，TTL 内且非 `__NULL__` 才算已识别）
- 新增手动触发重新检测 IP 国家码按钮（`POST /api/nodes/geo-redetect`），复用 prewarmIpGeo 批次+限流管线
- 默认仅重检未识别项（省 ip-api 免费额度），全量重检为次级选项
- KV 锁保证并发幂等（60s TTL），冲突返回 409

## [2.12.12] - 2026-09-01

### 修复节点落「其他」组两类盲区

**A. 域名 server 支持 DoH 解析成 IP**（`src/services/ip-geo.service.ts`）
- 新增 `resolveDomainToIP(server)`：用 Google/Cloudflare DoH 端点解析域名→IPv4，单域名独立请求（5s 超时），解析失败跳过该 server 不阻塞整体
- `prewarmIpGeo` 在批量查询前先对全部 server 做 DNS 解析，域名节点现在可正确归入地理组

**B. 失败结果不缓存，存量 `__NULL__` 视为过期重查**（`src/services/ip-geo.service.ts`）
- 移除所有写 `__NULL__` 的缓存写入点：ip-api 限流回退、批量请求失败、单个查询失败、无 countryCode 均不写缓存
- 存量旧格式 `__NULL__` 缓存（无时间戳版本）也视为无效，下次 resolver 触发时自动重查
- 根因：之前失败结果写 30 天 `__NULL__` 缓存后永久锁死在「其他」组，任何重试机制均被绕过

### 测试
- 新增 3 个测试：`__NULL__` 重查、失败不写缓存、仅成功结果写缓存（共 8 个 ip-geo 测试，全量 381 个测试 ✅）

## [2.12.11] - 2026-09-01

### Mihomo 所有 url-test 测速组 interval 调整为 300
- 「自动选择」url-test 组 `interval: 600` → `interval: 300`
- 地理 url-test 组（美国/马来西亚/日本/新加坡/台湾/韩国）`interval: 600` → `interval: 300`

## [2.12.10] - 2026-09-01

### IP 地理定位主动预填充（批量合并查询）
- 新增 `prewarmIpGeo(servers, cache)`：全量 server 先查 KV 缓存，未命中合并为单次 batch 查询，写回 KV（TTL 30 天固定）
- 3 处触发点：① `src/index.ts` scheduled() 每日订阅自动更新后 ② `src/api/routes.ts` POST /api/subscriptions/:id/update ③ `src/api/routes.ts` POST /api/subscriptions
- 查询与配置生成解耦：配置生成时不再惰性查 IP，改为订阅更新时批量预填充，根治 ip-api 15 次/分钟限流导致「其他」组异常

### Mihomo 所有 url-test 测速组显式加入 lazy: false
- 「自动选择」url-test 组加入 `lazy: false`
- 地理 url-test 组（美国/马来西亚/日本/新加坡/台湾/韩国）加入 `lazy: false`

## [2.12.9] - 2026-09-01

### Mihomo 所有 url-test 测速组加入 lazy: false
- 「自动选择」url-test 组加入 `lazy: false`
- 地理 url-test 组（美国/马来西亚/日本/新加坡/台湾/韩国）加入 `lazy: false`
- 所有 url-test 组显式声明 `lazy: false`（不惰性启动测速）
- 测试基线 378 ✅

## [2.12.8] - 2026-09-01

### Mihomo 所有测速组 interval 统一为 600
- 「自动选择」url-test 组 `interval: 1800` 改为 `interval: 600`
- 至此所有 url-test 测速组（自动选择 + 地理组）interval 均为 600
- 测试基线 378 ✅

---

## [2.12.7] - 2026-09-01

### 退出重登后默认进入仪表盘页
- 修复：退出登录后再登入，仍停留在上一次查看的页面
- 登录成功后调用 `switchPage('dashboard')`，始终默认进入仪表盘页
- 测试基线 378 ✅

---

## [2.12.6] - 2026-09-01

### Mihomo 测速部分去掉 lazy 参数
- 地理测速组（美国/马来西亚/日本/新加坡/台湾/韩国）去掉 `lazy: true`
- 至此测速组仅保留：url / interval:600 / tolerance
- 测试基线 378 ✅

---

## [2.12.5] - 2026-09-01

### Mihomo 测速部分彻底去掉 timeout 参数
- 地理测速组（美国/马来西亚/日本/新加坡/台湾/韩国）去掉 `timeout: 5000`
- 至此所有 url-test 测速组的 `timeout` 参数全部移除（自动选择组的 `timeout: 3000` 已在 v2.12.4 去掉）
- 测速组保留：url / interval:600 / tolerance / lazy
- 测试基线 378 ✅

---

## [2.12.4] - 2026-09-01

### Mihomo 测速参数调整
- 去除「自动选择」url-test 组的 `timeout: 3000` 参数
- 地理测速组（美国/马来西亚/日本/新加坡/台湾/韩国）`interval: 300` 改为 `interval: 600`
- 测试基线 378 ✅

---

## [2.12.3] - 2026-09-01

### Mihomo 配置输出硬编码精简（去除 profile/dns/sniffer 及全部头字段）
- 按用户指令去除 mihomo 配置输出的全部硬编码内容，配置仅输出 `proxies` / `proxy-groups` / `rules` 三段
- 去除 `profile:` 段（store-selected）
- 去除 `dns:` 段（fake-ip / DoH / nameserver-policy / 国内DNS分流等，含 `DEFAULT_DNS_CONFIG`）
- 去除 `sniffer:` 段（含 `DEFAULT_SNIFFER_CONFIG`）
- 去除 `profile:` 之上的头字段：mixed-port / allow-lan / mode / log-level / ipv6 / external-controller / secret / unified-delay / tcp-concurrent / geodata-mode / geodata-loader / geosite-matcher / geo-auto-update / geo-update-interval
- 删除死代码：`MihomoTemplate` 接口、`DEFAULT_MIHOMO_TEMPLATE`、`DEFAULT_DNS_CONFIG`、`DEFAULT_SNIFFER_CONFIG`
- `generateMihomoConfig` 签名由 5 参数精简为 4 参数（移除 `template`），`config.service.ts` 调用点同步更新
- 测试同步：`mihomo.test.ts` / `verify-v31.test.ts` 相关断言改为断言已移除字段不出现
- 测试基线 378 ✅

---

## [2.12.2] - 2026-09-01

### 分流规则精简（删除指定 geosite 规则，保留分组结构）
- 按用户指令从 8 个分组中删除点名的 67 条 geosite 规则，**不删除组本身**
- 国内直连：删 apple-cn / microsoft@cn / steam@cn / category-games@cn / onedrive / icloud@cn，保留 `cn`
- AI 平台：删 openai / anthropic / google-gemini / github-copilot / perplexity / poe / bytedance-ai-!cn / jetbrains-ai，保留 `category-ai-!cn` / `category-ai-chat-!cn`
- 社交：删 telegram / discord / twitter / x / meta / facebook / instagram / tiktok / reddit / line / whatsapp / signal / linkedin / pinterest，保留 `category-communication` / `category-social-media-!cn`
- 国外媒体：删 youtube / netflix / biliintl / bahamut / pixiv / abema / spotify / disney / ehentai，保留 `category-media`
- 游戏平台：删 steam / epicgames / ea / origin / ubisoft / gog / blizzard / riot / xbox / playstation / nintendo，保留 `category-games-!cn`
- 微软服务：删 azure / bing / msn，保留 `microsoft` / `microsoft-dev` / `microsoft-pki`
- 苹果服务：删 apple-podcasts / apple-tvplus / apple-intelligence / icloud / itunes，保留 `apple` / `apple-music` / `apple-dev` / `apple-update` / `apple-pki`
- 加密货币：删 binance / okx / bybit / gateio / kraken / kucoin / huobi / onekey / trustwallet / deribit / safepal，保留 `category-cryptocurrency`
- 谷歌 FCM 组未点名，完整保留
- 测试同步：`rule-providers.test.ts` / `rules-data.test.ts` / `rule-order.test.ts` / `mihomo.test.ts` / `verify-v31.test.ts` 中引用已删规则的断言改为仍存在的规则（category-ai-!cn 等）
- 测试基线 378 ✅

---

## [2.12.1] - 2026-08-31

### 纯IP地理定位重构
- **detectGeo 简化**：去掉所有域名识别层（emoji旗标/IATA三字码/二字码/中文名），直接使用 IP 定位器
- **groupNodesByGeo 批量化**：从逐节点调用改为收集所有 server → 去重 → batchIpToGeoBatch 批量查询 → 组织输出
- **ip-geo.service.ts**：更新文件头注释为「纯 IP 批量」定位服务
- **测试同步**：`verify-v31.test.ts`、`mihomo.test.ts`、`ip-geo.service.test.ts`、`subscription.test.ts` 均适配新逻辑

### 测试基线
- 378 ✅（不变）

---

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