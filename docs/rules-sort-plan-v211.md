# Rules Sort Plan v2.11.0 — v2.10.3→v2.11.0 开发计划

> 本文件记录 v2.11.0 规则排序重构 + XHTTP ECH 简化完整方案，已按用户确认拍板并实施完成（9648f48, CI #132 success, Release v2.11.0 已同步）。

## 背景

CF-Workers-SUB-Next 规则排序从 V3.1 升级到 V3.2（v2.11.0），同时简化 XHTTP 节点 ECH 配置。

---

## 决策确认清单（D1–D10，均已确认 ✅）

| # | 决策点 | 结论 |
|---|---|---|
| D1 | 国内直连组动作 | 7 条 GEOSITE 照常输出 DIRECT（方案 B），不改为 REJECT |
| D2 | 第④步是占位还是规则照常 | 规则照常输出 DIRECT |
| D3 | 内网防代理两条顺序 | `GEOIP,lan,DIRECT,no-resolve` 在前，`GEOSITE,private,DIRECT` 在后 |
| D4 | 组顺序调换 | ✅ 国外媒体提到游戏前，加密货币移至末尾 |
| D5 | 用户规则语义 | rules 列表内默认 DIRECT，OpenClash 面板可切换选择 |
| D6 | 用户规则「默认 DIRECT」实现 | 策略组 user 的 `default: 'DIRECT'`（保留 select 类型，面板可切换） |
| D7 | 国内直连组 GEOIP,CN 处理 | 从组内剥离，单独排 #13（GEOIP,CN 之后为 MATCH） |
| D8 | `MATCH,漏网之鱼` 收尾 | 保留，不变 |
| D9 | 组顺序调换（具体） | 国外媒体提到游戏前；加密货币移至末尾 |
| D10 | XHTTP ECH 简化 | 只保留 `ech-opts: enable: true`，去掉 `query-server-name` 和 `config` |

---

## 最终 14 步规则排序

```
 1. 用户规则（默认 DIRECT，面板可切换）
 2. GEOIP,lan,DIRECT,no-resolve           ← 内网防代理①
 3. GEOSITE,private,DIRECT               ← 内网防代理②
 4. CATEGORY-ADS-ALL → REJECT             ← 广告拦截
 5. GEOSITE,cn → DIRECT                  ← 国内直连①
 6. GEOSITE,apple-cn → DIRECT            ← 国内直连②
 7. GEOSITE,microsoft@cn → DIRECT        ← 国内直连③
 8. GEOSITE,steam@cn → DIRECT            ← 国内直连④
 9. GEOSITE,category-games@cn → DIRECT   ← 国内直连⑤
10. GEOSITE,onedrive → DIRECT            ← 国内直连⑥
11. GEOSITE,icloud@cn → DIRECT           ← 国内直连⑦
12. FCM/AI/社交/国外媒体/游戏/微软/苹果/加密货币 → DIRECT（按勾选生成）
13. GEOIP,CN,DIRECT                      ← 从中国直连组剥离
14. MATCH,漏网之鱼
```

### 策略组默认值（V3.2 全部 DIRECT）

| 策略组 | 旧 default | 新 default | 面板仍可切换 |
|---|---|---|---|
| AI 平台 | 节点选择 | **DIRECT** | ✅ |
| 社交 | 节点选择 | **DIRECT** | ✅ |
| 国外媒体 | 自动选择 | **DIRECT** | ✅ |
| 加密货币 | 节点选择 | **DIRECT** | ✅ |
| 用户规则 | 节点选择 | **DIRECT** | ✅ |

### 组顺序调整（UI & 配置输出联动）

```
旧顺序：user → ads → china-direct → google-fcm → ai → social → crypto → game → media → microsoft → apple
新顺序：user → ads → china-direct → google-fcm → ai → social → media → game → microsoft → apple → crypto
```

注意：
- `apple-music` 从「国外媒体」组移除，只保留在「苹果服务」组（DIRECT）
- 国内直连组 china-direct 从 RULE-SET 形式改为直接输出 7 条 GEOSITE 规则

---

## Bug 修复

| ID | 问题 | 修复 |
|---|---|---|
| B1 | `geoip,cn` id 带逗号非标准，导致 OpenClash 匹配失败 | 改为 `cn`（与 geosite 统一格式） |
| B2 | `apple-music` 同时存在于 media 组和 apple 组，输出两遍、行为矛盾 | 从 media 组移除，只留 apple 组 |
| B3 | ECH 硬编码 `query-server-name` + `config` 导致 XHTTP 节点 Clash 连接不上 | 只保留 `ech-opts: enable: true` |

---

## 实施步骤（已完成 9648f48）

1. **metacubex-rules.ts**：
   - china-direct 组删除 `geoip,cn` 条目
   - 组顺序调换（media 提前到 game 前，crypto 移到 apple 后）
   - 更新头部注释（V3.1→V3.2，14 步优先级描述）
   - apple-music 从 media 组移除

2. **rule-providers.ts buildRules**：
   - 内网两条硬编码置顶（lan 前 private 后）
   - 国内直连提前到业务分类之前（第⑤步位置）
   - GEOIP,CN,DIRECT 硬编码在 crypto 之后（第⑬步）
   - 注释同步更新

3. **mihomo.ts**：
   - groupDefaults `ai`/`social`/`crypto`/`user` 改 `DIRECT`
   - 国外媒体固化策略组 `default-selected` 改 `DIRECT`
   - XHTTP ECH 解析简化（只输出 `enable: true`）
   - 头部注释同步

4. **测试更新**：
   - `verify-v31.test.ts`：内网防代理两条顺序断言 + 自定义规则置顶位置
   - `rule-providers.test.ts`：buildRules 输出顺序断言（含 GEOIP,CN 剥离）
   - `config-rules.test.ts`：yaml 输出断言（GEOIP,lan + GEOSITE,private）
   - `mihomo.test.ts`：国外媒体 default-selected 断言
   - `fidelity.test.ts`：ECH 简化断言（只检查 enable:true）
   - `rule-order.test.ts`：apple-music 不再出现于 media 规则

5. **版本 & Changelog**：
   - `package.json` 2.10.3 → 2.11.0
   - `src/meta.ts` 2.10.3 → 2.11.0
   - `CHANGELOG.md` 新增 v2.11.0 条目

---

## 联动文件清单

| 文件 | 修改内容 |
|---|---|
| `src/data/metacubex-rules.ts` | RULE_GROUPS 顺序、china-direct items、apple-music 移除、注释 |
| `src/generator/rule-providers.ts` | buildRules 顺序、注释 |
| `src/generator/mihomo.ts` | groupDefaults、国外媒体固化组 default-selected、ECH 逻辑 |
| `src/html.js` | 无需改动（preset 用 Set 集合匹配，不依赖组顺序） |
| `tests/verify-v31.test.ts` | 内网防代理断言、自定义规则置顶断言 |
| `tests/generator/rule-providers.test.ts` | buildRules 顺序断言、GEOIP,CN 断言 |
| `tests/services/config-rules.test.ts` | yaml 输出 GEOIP,lan/GEOSITE,private 断言 |
| `tests/generator/mihomo.test.ts` | 国外媒体 default-selected 断言 |
| `tests/generator/fidelity.test.ts` | ECH 简化断言 |
| `tests/generator/rule-order.test.ts` | media 组 apple-music 不再出现 |
| `package.json` | version 2.10.3 → 2.11.0 |
| `src/meta.ts` | VERSION 2.10.3 → 2.11.0 |
| `CHANGELOG.md` | 新增 v2.11.0 条目 |

---

## 执行状态

- [x] 所有 D 项决策确认（D1–D10）
- [x] 代码修改（3 个源文件）
- [x] 测试更新（6 个测试文件）
- [x] 版本号升级（2.10.3 → 2.11.0）
- [x] build / typecheck / lint 全绿
- [x] 测试 374/374 全绿
- [x] git commit 9648f48
- [x] git push origin main
- [x] CI #132 success
- [x] GitHub Release v2.11.0 自动同步

---

*最后更新：2026-08-30，v2.11.0 已发布*
