# 开发计划：IP 地理定位 Pre-warm 批量合并查询

**状态**：已确认待开发（方案已评审定稿，TTL 固定 30 天）
**当前版本**：v2.12.8
**待用户处理完另一个问题后回来开发，无需用户再次提醒**

---

## 背景 / 问题
`groupNodesByGeo` 逐节点惰性查 IP，每个节点发 1 次 batch HTTP 请求
（`src/generator/mihomo.ts:258` → `src/services/ip-geo.service.ts:246`）。
ip-api 免费版 15 次/分钟限流 → 超出部分全部落「其他」组（mihomo.ts:283-286）。
缓存逻辑本身已正确（KV 30 天 TTL + 查询前先查缓存），只是被逐 IP 惰性调用架空。

## 目标
根治「其他」组：把「查询」与「配置生成」解耦，改为主动预填充（Pre-warm）。
配置生成时 resolver 全部命中 KV 缓存，不再触发任何 HTTP。

## 核心改动
新增 `prewarmIpGeo(servers, cache)`：
1. 全部 server 先查 KV 缓存，命中且未过期（30 天）跳过
2. 未命中项合并成单次 batch（`batchQuery` 已支持 ≤100/IP/次，复用），逐 IP 写回 KV
3. 返回本次查询数/失败数

## 触发点（3 处主动调 prewarm）
| # | 触发点 | 位置 |
|---|---|---|
| ① | 每日定时自动更新订阅 | `src/index.ts` `scheduled()`，`subs.update` 循环之后，取所有节点 server 去重 → prewarm |
| ② | 手动更新单个订阅 | `src/api/routes.ts` `POST /api/subscriptions/:id/update`，成功后对该订阅节点 → prewarm |
| ③ | 新增订阅 | `src/api/routes.ts` `POST /api/subscriptions`，创建后对新订阅节点 → prewarm |

## 缓存策略（沿用现有，固定 TTL 30 天）
- KV key `ip_geo:{server}` = `{ts}|{国家名}`，TTL 30 天（`IP_GEO_CACHE_MS`，已实现保留）
- 查询失败/无归属写 `__NULL__` 也缓存，防反复查同一失败 IP（已实现）
- prewarm 批量查询前先剔除缓存命中项

## 防护
- batch 按 `BATCH_LIMIT=100` 自动分批，prewarm 一次最多 `ceil(未命中/100)` 次请求，远低于 15/min
- 失败 IP 不写缓存，下次触发再补
- 保留 `singleQuery` 单 IP 兜底，仅 batch 整体失败时用

## 改动文件
1. `src/services/ip-geo.service.ts` — 新增 `prewarmIpGeo()`
2. `src/index.ts` `scheduled()` — ① hook
3. `src/api/routes.ts` — ②③ hook
4. 测试 — prewarm 缓存命中跳过 + batch 合并查询

## 完成后流程
- 全量验证：npm run lint + typecheck + test + build
- 版本号三处同步（package.json / src/meta.ts / CHANGELOG.md）→ 2.12.9
- 提交 + 推送（CI 自动打 release tag）