# 开发计划：未识别国家码节点统计 + 手动触发重新检测

**状态**：已确认待开发（方案已评审定稿，v2.12.12 交付后唯一剩余漏洞）
**目标版本**：v2.12.13（末位递增，禁止跳号）
**待用户确认后开始编码**（用户已同意计划，写文档后即准备开发）

---

## 背景 / 问题
v2.12.12 已修复域名 DoH 解析 + 失败不缓存两类盲区，但存在两个体验缺口：
1. **无可视化统计**：节点列表页只有「总节点 / 重复 / 实际」三项，未识别国家码（落「其他」组）的节点数量没有显式展示，用户不知道有多少节点没定位成功。
2. **无手动重检入口**：节点未识别国家码后只能等定时 prewarm（每日）或重更新订阅，无法手动触发重新检测。

## 目标
① 在节点列表页 stats 栏与现有「总/重复/实际」同机制的第四项展示「未识别国家码 N 个」。
② 提供手动触发重新检测的入口，复用现有 `prewarmIpGeo` 批次 + 限流管线。

## 核心方案

### 一、展示：与「总/重复/实际」同机制的第四项统计
| 层 | 改动 |
|----|------|
| 后端 | 现有 `GET /api/nodes` 已返回 `stats: { original, duplicates, unique }`（routes.ts:284），在其上加 `geoUnlocated`：去重后未识别国家码的节点数。不新增端点。 |
| 口径 | 对去重后每个节点，读其 server 的 `ip_geo:{server}` KV 缓存，无有效值（无缓存 / 已过期 / 失败不缓存）即计为未识别。只读缓存，绝不在列表页触发外网 IP 查询（与生成器 `groupNodesByGeo` 归「其他」组的判定源一致，mihomo.ts）。 |
| 性能 | server 去重后批量读缓存再回算节点数，避免逐节点 N 次 KV get。 |
| 前端 | `src/html.js`（源 `public/index.html`）stats 栏加 `<span>🌐 未识别国家码 <b id="statsGeoUnlocated">0</b></span>`，`loadNodes()` 里 setStat 同步。完全复用现有渲染链路。 |

### 二、触发重检：新增 `POST /api/nodes/geo-redetect`（requireAuth）
1. **语义**：重检全部「未识别国家码」节点（默认 `scope: 'unlocated'`）；body 可选 `{ scope?: 'unlocated' }`。
2. **流程**：收集去重节点 server 集 → 读缓存过滤出未识别项 → 复用现有 `prewarmIpGeo()`（自带 ≤100 IP/批 + 15 次/分滑动窗口限流 + DoH 域名解析 + 成功写缓存/失败不写）→ 返回 `{ total, unlocatedBefore, queried, resolved, failed, unlocatedAfter }`。
3. **前端触发**：stats 栏或节点工具行加「🔄 重新检测国家码」按钮 → 调用端点 → 完成后 `loadNodes()` 刷新 `stats.geoUnlocated`。
4. **幂等并发**：KV 锁 `geo_redetect_lock`（TTL 60s），触发前检查，已有任务返回 409 `{ code: 'GEO_SCAN_IN_PROGRESS' }`；`prewarmIpGeo` 本身幂等（命中缓存跳过）。
5. **错误与节流**：ip-api 失败 → 仍返回 200 携带 `failed` 计数，前端提示「N 个重检失败可稍后重试」；近 1 分钟内已有订阅更新 prewarm 或重检 → 429「检测过于频繁」，避免打爆 15 次/分免费额度。

## 不改的
- 节点对象不新增 `country` 字段（列表页只读 cache 映射）
- 不建国家码统计表
- 不动生成器 `groupNodesByGeo` 分组逻辑（「其他」组仍是最终消费方）
- 统计与重检只读写 `ip_geo` 缓存，不新增数据模型

## 防护 / 关注点
- `geoUnlocated` 口径必须与「其他」组完全一致（同一 ip_geo 缓存判定），否则列表数字与客户端订阅「其他」组节点数对不上
- 「未识别」分两类：纯 IP 查询失败（可重检补救）vs 域名 DoH 解析失败（v2.12.12 起失败不缓存，会无限未识别）——提示里区分，避免误以为重检能修好域名型
- 列表页 per-node 读缓存有 N 次 KV get 开销：按 server 去重读一次再映射
- 重检同步执行，节点量大可能超 Workers 时长限制：单次重检 server 数上限（如 500），超量分批或部分失败

## 改动文件
1. `src/api/routes.ts` — ① `/api/nodes` stats 加 `geoUnlocated` ② 新增 `POST /api/nodes/geo-redetect` 端点
2. `src/services/ip-geo.service.ts` — 若需暴露「读 cache 回算未识别数」工具函数（可选，也可做在 routes 里）
3. `public/index.html` + `npm run build:html`（生成 `src/html.js`）— stats 栏第四项 + 重检按钮/事件
4. 测试 — 统计口径 + geo-redetect 幂等锁 / 节流 / 计数返回

## 完成后流程
- 全量验证：npm run lint + typecheck + test + build
- 版本号三处同步（package.json / src/meta.ts / CHANGELOG.md）→ v2.12.13
- 提交 + 推送（CI 自动打 release tag）