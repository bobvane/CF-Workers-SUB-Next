# 国内直连组分流规则改造 Implementation Plan

> **For Hermes:** 本计划为【第一阶段】。用户要求：先记录开发计划，所有分组（广告拦截/国内直连/国内媒体/国外媒体/各业务组…）逐一商量完，**用户发出明确指令后**再一次性改项目代码。当前只落实"国内直连"组的方案，其余组待讨论后追加到本计划。

**Goal:** 按 Claude 建议重写"国内直连"分组规则，采用「私有/局域网 → 国内域名主力 → @cn 属性标签精修 → IP 兜底」四层结构，去除与 `geosite:cn` 重复的零散条目，并修正 @cn 属性标签的 provider URL 生成 bug。

**Architecture:** 国内直连组（`china-direct`）的勾选项在 `src/data/metacubex-rules.ts` 定义；生成器 `src/generator/rule-providers.ts` 把每个勾选项输出为 `RULE-SET,geosite-<id>,DIRECT` 行，并生成对应 http rule-provider。注意 `GEOSITE,cn` / `GEOIP,CN` / `GEOIP,private` 三层兜底已硬编码在 `rule-providers.ts` 末尾与开头，本次**不改动硬编码兜底**，只调整组内可选条目。

**Tech Stack:** TypeScript / Mihomo YAML / MetaCubeX geosite mrs (jsDelivr CDN)

---

## 当前状态（磁盘实测，2026-08-26）

`china-direct` 组现有 10 条（全 `geosite`，目标 `DIRECT`）：
`PRIVATE, CN, BAIDU, ALIBABA, TENCENT, JD, XIAOMI, BILIBILI, IQIYI, YOUKU`

`rule-providers.ts` 硬编码防线（已存在，本次不动）：
- 第142行：`GEOIP,private,DIRECT`（最前）
- 第202行：`GEOSITE,cn,DIRECT`
- 第203行：`GEOIP,CN,DIRECT`
- 第204行：`MATCH,漏网之鱼`

---

## 设计决策（Claude 方案，用户已确认按此修改）

### 四层结构

| 层 | 规则 | 说明 | 当前是否有 |
|----|------|------|-----------|
| ① | `GEOSITE,private,DIRECT` | 局域网/私有地址最前放行 | ✅ PRIVATE（组内已有，且硬编码最前） |
| ② | `GEOSITE,cn,DIRECT` | 国内域名主力（已覆盖 baidu/alibaba 等常见域名） | ✅ CN（组内已有，且硬编码兜底） |
| ③ | `GEOSITE,apple-cn,DIRECT` | 苹果国区服务（App Store 国区/iCloud 国区 CDN） | ❌ 需新增 |
| ③ | `GEOSITE,microsoft@cn,DIRECT` | 微软国内服务 | ❌ 需新增 |
| ③ | `GEOSITE,steam@cn,DIRECT` | Steam 国区/国内 CDN | ❌ 需新增（⚠️ 见下方坑） |
| ③ | `GEOSITE,category-games@cn,DIRECT` | 游戏类国内可直连部分 | ❌ 需新增 |
| ③ | `GEOSITE,onedrive,DIRECT` | OneDrive 国内相对通畅 | ❌ 需新增 |
| ④ | `GEOIP,CN,DIRECT` | IP 兜底（域名漏判时补） | ✅ 硬编码兜底（第203行） |

### Claude 明确不建议加的
- **删除** `BAIDU / ALIBABA / TENCENT / JD / XIAOMI / BILIBILI / IQIYI / YOUKU` 八条：已包含在 `geosite:cn` 中，属冗余，重复判断浪费匹配开销。
- **不要**把 `GEOIP,CN` 放到域名规则前面（IP 规则只做兜底）。
- **不要**给 @cn 标签再叠自定义域名。

### 最终 `china-direct` 组条目（落库值）

保留：`PRIVATE`、`CN`
新增（待策略决策，见下）：`APPLE-CN`、`MICROSOFT@CN`、`STEAM@CN`、`CATEGORY-GAMES@CN`、`ONEDRIVE`
删除：`BAIDU`、`ALIBABA`、`TENCENT`、`JD`、`XIAOMI`、`BILIBILI`、`IQIYI`、`YOUKU`

> ⚠️ **条目有效性分级（Claude 2026-08-26 核实 v2fly 官方文档后确认）**：
> - `APPLE-CN`：**真实独立列表**，有 `apple-cn.mrs` 真实文件 → 可直接走 `RULE-SET,geosite-apple-cn,DIRECT` ✅
> - `ONEDRIVE`：**真实独立列表** `onedrive.mrs` → 走 RULE-SET ✅
> - `MICROSOFT@CN` / `STEAM@CN` / `CATEGORY-GAMES@CN`：**属性过滤查询**，无对应 mrs 文件 → **不能**用 `RULE-SET,...@cn` 语法（无效）。必须二选一（见开放问题 Q1）。

---

## ⚠️ 关键技术坑（执行时必须处理，2026-08-26 修订）

**`@cn` 不是独立 mrs 文件，且 `RULE-SET` 语法不支持 `@attr` 过滤。**

Claude 核实 v2fly/domain-list-community 官方文档结论：
- `microsoft@cn` 是"microsoft 列表里被标了 cn 属性的子集"，查询语法 `geosite:microsoft@cn`，**底层没有 `microsoft@cn.mrs` 这种文件**。
- `RULE-SET,xxx,DIRECT` + rule-providers 走的是**预编译扁平 mrs 文件**，属性元数据在编译成 mrs 时已丢失，`RULE-SET` 无法做 `@attr` 二次过滤。
- `apple-cn` 例外：v2fly 里**独立维护的真实列表**，有 `apple-cn.mrs`，与其它 `@cn` 命名看着像但机制完全不同。

**两条路的本质区别：**
- 方式一 `GEOSITE,microsoft@cn,DIRECT`：要求客户端 `geodata-mode: true` + 加载完整 `geosite.dat`（大文件，运行时按属性现筛）。真属性过滤。
- 方式二 `RULE-SET,geosite-microsoft,DIRECT`：只加载 microsoft 全量 mrs，无 @cn 精度（降级，但架构简单、与本项目现有一致）。

**本项目当前架构是方式二**（rule-providers.ts 全部用 RULE-SET + mrs，无 geodata-mode）。因此 `MICROSOFT@CN`/`STEAM@CN`/`CATEGORY-GAMES@CN` 三条**不能原样实现属性过滤**，必须先在 Q1 决策。

> 本计划此前 Task 2 的"URL 去 @attr、RULE-SET 行留 @cn"写法已作废——RULE-SET 行带 @cn 无意义。

---

## Task 清单（待用户最终指令后执行）

### Task 1: 更新 `china-direct` 组条目
- Modify: `src/data/metacubex-rules.ts`（`china-direct` 的 `items` 数组，约76-110行）
- 删除 BAIDU…YOUKU 八条；新增 APPLE-CN / MICROSOFT@CN / STEAM@CN / CATEGORY-GAMES@CN / ONEDRIVE 五条（tag: 'geosite', target: 'DIRECT'）
- 保留 PRIVATE、CN

### Task 2: 修正 provider 生成支持 @attr
- Modify: `src/generator/rule-providers.ts`
- `providerName(id)`：基名 = `id.split('@')[0]`，输出 `geosite-<基名小写>`
- `providerUrl(id)`：`<META_DAT_BASE><基名小写>.mrs`
- `ruleSetLine` / buildRules 第⑤步：`RULE-SET,geosite-<id原始小写>,DIRECT`（保留 @attr）
- 同步修正兜底去重 `matchedIds` 解析（按基名匹配，避免重复）

### Task 3: 测试
- Modify/Add: `tests/generator/rule-providers.test.ts`
- 断言：china-direct 组勾选后输出含 `RULE-SET,geosite-apple-cn,DIRECT`、`RULE-SET,geosite-onedrive,DIRECT`
- 断言：方案A 下 `MICROSOFT` 输出 `RULE-SET,geosite-microsoft,DIRECT`（无 @cn，全量）
- 断言：方案B 下 `MICROSOFT@CN` 输出 `GEOSITE,microsoft@cn,DIRECT` 且 **不**生成对应 rule-provider
- 断言：普通 id（如 `CN`）行为不变
- 断言：已删的 BAIDU 等不再出现
- Run: `npm test` → 全绿

### Task 4: typecheck + build + lint
- Run: `npm run typecheck && npm run build && npm run lint`

### Task 5: 升级版本号 + 提交（用户指令后）
- 升 `package.json` + `src/meta.ts`（按逢十进位规则）
- 最终版本号以执行时为准（可能合并"所有组"讨论结果统一发布）

---

## 待讨论的其余分组（本计划后续追加）
- [ ] 广告拦截组（当前仅 `CATEGORY-ADS-ALL`，是否需 `CATEGORY-ADS` 细分）
- [ ] 国内媒体组（当前 BAIDU 等已迁走，组内剩什么；是否并入国内直连）
- [ ] 国外媒体组
- [ ] 各业务条件组（AI/开发/社交/云/加密货币/用户规则）的 target 与成员
- [ ] 地理分组（select 无测速）是否调整
- [ ] 策略组默认值（漏网之鱼默认 节点选择 vs 自动选择）

## 风险与开放问题
1. **【Q1 已决策·采纳 Claude 混合双轨方案】** `MICROSOFT@CN`/`STEAM@CN`/`CATEGORY-GAMES@CN` 三条用 `GEOSITE` 语法直出（不进 rule-providers，走内核加载的完整 geosite.dat 按 @attr 过滤）；`APPLE-CN`/`ONEDRIVE` 等真实 mrs 文件继续 `RULE-SET`。两者在同一 `rules:` 数组共存互不冲突。依据：Claude 核实 v2fly/meta-rules-dat —— `microsoft@cn` 是属性查询无独立 mrs 文件、`apple-cn` 是独立维护的真实列表有 mrs；Mihomo `GEOSITE` 是原生路由规则类型，新版已移除 `geodata-mode`（默认从 MetaCubeX CDN 拉 geosite.dat）。这优于原计划 Q1 的"A降级 / B大改"二选一。
2. **执行前 CDN 存在性验证**：`curl -I` 确认 `apple-cn.mrs` / `onedrive.mrs` / `microsoft.mrs` / `steam.mrs` / `category-games.mrs` 在 jsDelivr 200（避免生成失效 provider）。
3. **旧勾选失效**：用户此前若勾选 BAIDU 等旧 id，KV selectedRuleIds 仍存旧 id，生成器走兜底去重（孤儿 id），不会报错但旧勾选失效——变更说明需提示用户重新勾选。
4. `ONEDRIVE` 虽"国内相对通畅"，但严格说它是海外服务；是否放国内直连组还是放"微软服务"(DIRECT) 业务组，可再议（Claude 原方案放国内直连，先按此记录）。
5. **Task 2 改写**：`rule-providers.ts` 的 `buildRules` 需新增分支——遇到 `id` 含 `@` 的条目，输出 `GEOSITE,<id>,DIRECT`（不走 providerName 拼接），其余走原 `RULE-SET,${providerName(id)},<target>`。`buildRuleProviders` 对带 @条目的 id 跳过（不生成 provider）。`ruleSetLine` 同步支持两种输出。

## 项目硬性前提（公理，非风险提示）

**GeoSite 数据库可用性 = 本项目的运行公理**。OpenClash 及 Clash 系客户端均默认下载并启用 GeoSite 数据库（含自动更新）。本项目以 MetaCubeX 规则生成配置，**依赖此前提作为整个项目的基础假设**——不满足此前提的用户不在项目目标范围内，不为其做降级/兜底/缺失处理。

由此得出三条刚性结论（与上轮 Claude 讨论对接）：
- 本项目 `mihomo.ts` 生成器**不输出 `geox-url` / `geodata-mode`**（grep 全 src 零匹配，且依公理无需输出）：GEOSITE 规则直接依赖客户端默认已加载的完整 `geosite.dat`，内核按 `@attr` 现查现筛。
- `@cn` 属性过滤（`MICROSOFT@CN`/`STEAM@CN`/`CATEGORY-GAMES@CN`）**默认必然可用**，不视为"可能失效的风险"，无需在生成器里加缺失检测或回退分支。
- 变更说明里**不写**"请确保 GeoSite 已开启"这类免责提示——这是使用本项目的前提资格，不是可选项。文档可正面陈述"本项目依赖客户端默认启用的 MetaCubeX GeoSite 数据库"，但不作为需要满足的待办项罗列。

（上轮 Claude 关于「面板 GEO 数据库 vs yaml geox-url 重复下载」的讨论，经核查与本项目的代码无关：本项目从未输出 `geox-url`，GEOSITE 依赖客户端侧默认管理的 `geosite.dat`。其"不要手写 geox-url 以免与面板路径冲突"的建议，与我们"不输出 geox-url"的取向一致，记为确认项而非改动项。）

---

## ✅ 已落地（2026-08-27）

实际执行与计划初版有偏差（计划写于 08-26，之后代码被扩展过，china-direct 实际已有 14 条而非 10 条）：
- 删除 china-direct 组内 12 条被 `geosite:cn` 覆盖的冗余条目：BAIDU/ALIBABA/TENCENT/JD/XIAOMI/HUAWEI/UNIONPAY/MEITUAN/KUAISHOU/XIAOHONGSHU/SUNING/XUNLEI
- 保留 PRIVATE/CN
- 新增 4 条：`MICROSOFT@CN`/`STEAM@CN`/`CATEGORY-GAMES@CN`(走 GEOSITE 语法) + `APPLE-CN`(走 RULE-SET)
- **ONEDRIVE 未加进国内直连组**：它原本已归属「微软云盘」组(PROXY)，为避免重复归属冲突，保留原组，不在此重复添加（计划初版"新增 ONEDRIVE"调整为不重复）
- 生成器 `rule-providers.ts` 支持混合双轨：`@` 条目走 `GEOSITE,<id>,<target>` 且不生成 rule-provider；其余走 `RULE-SET,geosite-<基名>,<target>`。兜底去重 matchedIds 增加 GEOSITE 分支解析
- CDN 存在性已验证：apple-cn/onedrive/microsoft/steam/category-games .mrs 全 200
- 测试：rule-providers.test.ts 新增 6 例（@cn 走 GEOSITE、不生成 provider、APPLE-CN 走 RULE-SET、冗余条目已移除）；rules-data.test.ts 修正 catalog 断言支持 @attr 基名匹配
- 发布：v2.8.2（commit 后 push + tag + Release 同步）
- 变更说明要点（给用户）：旧勾选 BAIDU 等的用户，KV selectedRuleIds 仍存旧 id，生成器走兜底去重（孤儿 id），旧勾选失效，需重新勾选新国内直连组条目。

## ✅ 已修复（2026-08-27 续）：国内直连组面板不可见（v2.8.3）

用户实测：发布 v2.8.2 后在 OpenClash 面板看不到「国内直连」策略组。根因：原设计把国内直连/国内媒体规则直接写 `RULE-SET,xxx,DIRECT`（裸 DIRECT），不生成对应 proxy-group，面板策略组标签页自然不显示。自动生成工具不应让用户自己去配——必须生成可见、可切换的策略组。

修复（3 处源码 + 测试对齐）：
- `mihomo.ts generateProxyGroups`：新增固化策略组「国内直连」「国内媒体」（`select` 类型，默认 DIRECT，proxies 含 DIRECT/节点选择/手动切换/自动选择/地理组），仅当用户勾选对应组规则时生成（条件组，空规则不生成）；GLOBAL 顺序加入国内直连/国内媒体
- `rule-providers.ts ruleActionTarget`：国内直连/媒体规则从返回 `'DIRECT'` 改为返回组名（`国内直连`/`国内媒体`），规则行变为 `RULE-SET,geosite-cn,国内直连`
- `rule-providers.ts buildRules` 第⑤步：让 china-direct/china-media 的 rule-provider 正常生成（从 skipKeys 效果改回生成），真实 mrs 条目走 `RULE-SET,geosite-xxx,组名`；`@attr` 条目（MICROSOFT@CN 等）仍走 `GEOSITE,xxx,DIRECT`（无 provider，直连）
- 图标：国内直连用 `CN.png`（Orz-3 实测 200），国内媒体用 `Global.png`（兜底）
- 测试：新增回归用例验证勾选国内规则后策略组生成且默认 DIRECT；对齐旧断言（之前误以为国内组不应存在）
- 发布：v2.8.3（本修复属功能性补丁，升末位版本）

