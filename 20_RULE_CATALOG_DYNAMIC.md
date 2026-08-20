# 20 - 动态规则目录（Rule Catalog 定时扫描入库）

版本：V2.0  |  状态：评审通过（2026-08-16）  |  日期：2026-08-16

---

## 1. 背景与动机

### 1.1 当前痛点

项目预设的规则分组（`RULE_GROUPS`）和全量分类目录（`metacubex-catalog.json`）都是**静态数据**：

- `src/data/metacubex-catalog.json`：2026-08-15 手动抓取的 MetaCubeX 全量清单（1546 分类），**不会自动更新**。
- `RULE_GROUPS`（代码硬编码）：预置 11 个分组、几十条常用规则，id 全部写死。

### 1.2 静态数据的风险

MetaCubeX/meta-rules-dat 是持续更新的开源库，会**新增/改名/删除/合并**分类。

- 若某分类被 MetaCubeX 删除或改名，我们硬编码的 `geosite-xxx.mrs` 会指向 404 → 客户端启动拉取失败 → 报错/跳过。
- 新增分类（如新 AI 平台）不会自动出现，用户要等我们发新版。

### 1.3 目标

> **规则数据不靠人工维护**。由 Worker 定时扫描 MetaCubeX 仓库，整理入库（KV）；输出配置生成时**直接读取数据库**，只生成真实存在的规则。

---

## 2. 方案设计（评审通过）

### 2.1 核心决策（Bob 拍板）

| 决策点 | 结论 | 理由 |
|--------|------|------|
| 扫描频率 | **每月 1 次**（cron `0 3 1 * *`） | 规则内容更新快，但**分类更换很慢**，月更足够 |
| 手动刷新 | **有**（设置页"立即刷新规则库"按钮） | 用户可主动触发 |
| 失效规则 | **后台标记删除，后续不再显示** | 不残留无效条目，前端不显示 |
| 功能位置 | **设置页**（替换现有静态"规则库"区块） | **分流规则页面完全不动、结构不变** |
| 全量展示 UI | **B 两级导航 + C 搜索索引**（聚合类分组 / A-Z 索引 / 搜索） | 1546 条需要导航结构，不做自建说明表（避免人工维护负担） |

### 2.2 架构总览

```
┌──────────────────────────────┐
│  MetaCubeX/meta-rules-dat    │  规则源头（持续更新，每月变动小）
└──────────────┬───────────────┘
               │ 定时扫描（Worker Cron：每月1号 03:00）
               │ 或 设置页手动"立即刷新"
               ▼
┌──────────────────────────────┐
│  规则目录服务 (Catalog Sync)  │  新增 service
│  → 拉取 meta 分支 geosite 清单 │
│  → 校验 mrs 文件可达性          │
│  → 整理结构化数据 + 差异对比     │
└──────────────┬───────────────┘
               │ 写入 KV
               ▼
┌──────────────────────────────┐
│  KV: rule-catalog            │ 全量规则目录快照（当前有效）
│  KV: rule-catalog-removed    │ 已失效分类黑名单（标记删除）
│  KV: rule-catalog-meta       │ 版本/更新时间/扫描状态
└──────────────┬───────────────┘
               │ 读取
               ▼
┌──────────────────────────────┐
│  设置页：规则库管理           │  展示目录/刷新/删除标记
│  分流规则页：添加规则搜索     │  /api/rules/catalog（读 KV，动态）
│  输出配置生成                 │  只生成库中存在的规则
└──────────────────────────────┘
```

### 2.3 功能边界（明确不做）

- ❌ 不自己维护规则内容（规则内容仍全部来自 MetaCubeX）
- ❌ 不做"热门分类说明表"（会产生人工更新负担）
- ❌ 不改动分流规则页面结构、不改 RULE_GROUPS 分组层级
- ❌ 不做 DNS/IPv6 增强（另立任务）

---

## 3. 数据模型（KV）

### 3.1 Key 设计（扩展 `KV_KEYS`）

```
rule-catalog            全量目录 JSON（当前有效分类）
rule-catalog-removed    已失效分类黑名单（{ id, removedAt, reason }[]）
rule-catalog-meta       { version, fetchedAt, total, removedCount, status, lastError? }
```

### 3.2 目录条目结构（兼容现有 CatalogEntry）

```typescript
interface RuleCatalogEntry {
  id: string;              // 分类 id（大写，如 NETFLIX）
  type: 'aggregate' | 'site' | 'tld';
  mrsUrl: string;          // 对应 mrs 下载地址
  verifiedAt: number;      // 校验时间
}
```

### 3.3 失效处理流程

```
扫描时：
  新清单 vs 旧库（KV rule-catalog）
  ├─ 新增分类 → 校验 mrs → 加入库
  ├─ 依旧存在 → 保留
  └─ 旧库有、新清单没有 → 移入 rule-catalog-removed（标记删除）
       · 若该分类在用户 selection 中 → 从 selection 移除（后台清理）
       · 前端/生成时不再展示
```

---

## 4. 改造点清单

| # | 模块 | 改动 | 工作量 |
|---|------|------|--------|
| 1 | `wrangler.toml` | 加 `[triggers]` cron：`0 3 1 * *` | 小 |
| 2 | `src/index.ts` | `export default` 增加 `scheduled(controller, env)` | 小 |
| 3 | `src/services/catalog-sync.ts`（新）| 扫描+校验+入库+差异对比服务 | 中 |
| 4 | `src/storage/kv.ts` | `RuleCatalogRepository`（get/set/removed/meta）| 小 |
| 5 | `src/models/config.ts` | KV_KEYS 增加 3 个前缀 | 小 |
| 6 | `src/api/routes.ts` | `/api/rules/catalog` 改读 KV（KV 空 fallback 静态 JSON）| 小 |
| 7 | `src/api/routes.ts` | 新增 `/api/rules/catalog/refresh`（POST，需登录）| 小 |
| 8 | `src/services/config.service.ts` | `getSelectedRules` 生成前剔除失效 id | 中 |
| 9 | `public/index.html` | 设置页改"规则库管理"（更新时间/总量/立即刷新/删除标记）| 中 |
| 10 | `public/index.html` | 分流规则页"添加规则"搜索改为读 KV 动态目录 + 聚合分组/索引 | 中 |
| 11 | 测试 | catalog-sync 单测 + routes + refresh 鉴权 + 失效清理 | 中 |

---

## 5. 扫描服务实现要点（catalog-sync.ts）

### 5.1 扫描流程

```
1. 拉取 meta 分支 geo/geosite 目录清单（GitHub API，分页）
2. 过滤 *.mrs 文件 → 分类 id 列表
3. 差异对比（新清单 vs KV 旧库）
   - 新增/变化 → HEAD 校验 mrs URL（cdn.jsdelivr.net），200 才入库
   - 已失效 → 移入 rule-catalog-removed + 清理 selection
4. 写 meta（版本/时间/统计）
5. 返回统计结果
```

### 5.2 失败兜底

- GitHub/jsDelivr 不可达 → 保留旧库，meta.status='stale'，页面提示
- KV 首次为空 → seed 内置 `metacubex-catalog.json`（开箱即用）

### 5.3 并发防护

- `refresh` 接口：全局互斥标记（`refreshing` 标志），进行中重复请求直接返回"已在进行"
- Cron 与手动刷新共享同一服务，天然互斥

---

## 6. 前端 UI 设计

### 6.1 设置页（替换现有"规则库"区块）

```
── 规则库管理 ──────────────────────────────
  状态:  正常（上次更新: 2026-08-16 03:00）   [🔄 立即刷新]
  分类总数: 1546    已失效移除: 3
  （失效历史可展开查看：分类名 + 移除时间）
───────────────────────────────────────────
```

### 6.2 分流规则页"添加规则"（数据源改为动态目录）

现有搜索框继续用，但下半部分（显示全部规则集）改为：

- **聚合类分组索引**：`CATEGORY-*` 开头分类归为"聚合类"，按前缀分组展示（如 CATEGORY-AI-* / CATEGORY-MEDIA-*）
- **A-Z 首字母索引条**：点击跳转到对应字母区
- **搜索框**：实时过滤（id 或 label 包含）
- 每行：分类名 + 类型徽标（聚合/站点/顶级域）+ 勾选框
- 已失效分类不再显示（被移入黑名单）

---

## 7. 边界情况

| 场景 | 行为 |
|------|------|
| MetaCubeX 新增分类 | 下次扫描入库，设置页可看到新总数 |
| MetaCubeX 删除分类 | 扫描后标记删除，移入黑名单，前端不再显示 |
| 用户勾选了失效规则 | 扫描时自动从 selection 移除（后台清理）|
| 扫描 API 不可达 | 保留旧库，meta.status='stale'，页面提示 |
| 首次部署（KV 空）| seed 内置 catalog.json，立即可用 |
| 手动刷新并发 | 互斥，重复点击提示"已在进行" |
| CF 免费 Cron | 每月 1 次，远低于 10min 限制 |

---

## 8. 实施顺序

1. 数据层：KV_KEYS + RuleCatalogRepository + 测试
2. 扫描服务：catalog-sync.ts + 单测
3. API：catalog 读 KV / refresh 接口 + 鉴权
4. Scheduled handler + wrangler cron
5. 前端：设置页规则库管理 + 分流规则页动态目录
6. 全量测试 + 部署

---

## 9. 验收标准

- [ ] 设置页能看到规则库状态，手动刷新可用
- [ ] 分流规则页添加规则能看到目录（含聚合分组 + 索引 + 搜索）
- [ ] 模拟 MetaCubeX 删除分类 → 扫描后该分类从库中消失且不再显示
- [ ] 用户勾选失效规则 → 扫描后 selection 自动清理
- [ ] cron 每月触发（部署后人工验证 scheduled handler 可调用）
- [ ] 输出配置只生成库中存在的规则