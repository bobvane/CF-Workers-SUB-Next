# CF-Workers-SUB-Next — rules 规则逻辑排序重构（开发计划 v2.11.0）

> 状态：**讨论中**（2026-08-30）— 尚未开始写代码
> 目标版本：v2.11.0（规则排序重构 + Bug 修复）

---

## 一、最终规则排序方案（已与 Bob 逐条确认）

```
 1. 用户规则            → 默认 DIRECT（OpenClash 面板可切换）
 2. 内网防代理          → GEOIP,lan,DIRECT,no-resolve
                         GEOSITE,private,DIRECT
 3. 广告拦截            → REJECT
 4. 国内直连            → DIRECT（仅 GEOSITE 系列，GEOIP,CN 已拿走）
 5. 谷歌FCM             → DIRECT
 6. AI平台              → DIRECT
 7. 社交                → DIRECT
 8. 国外媒体            → DIRECT
 9. 游戏平台            → DIRECT
10. 微软服务            → DIRECT
11. 苹果服务            → DIRECT
12. 加密货币            → DIRECT
13. GEOIP,CN,DIRECT     ← 从国内直连组移出，单独排这里
14. MATCH,漏网之鱼      ← 兜底收尾
```

## 二、已确认的关键决策

| # | 决策 | 状态 |
|---|------|:---:|
| D1 | 内网防代理拆为两条：`GEOIP,lan,DIRECT,no-resolve` + `GEOSITE,private,DIRECT`（替代原单一 `GEOIP,private,DIRECT`），顺序 lan 在前、private 在后 | ✅ 已确认 |
| D2 | 两条规则均官方合法：lan 是 mihomo 内置伪分类（源码 isLan 硬编码，不依赖 geoip.dat）；private 是 geosite 官方分类（v2fly data/private） | ✅ 已核实 |
| D3 | 国内直连组默认动作 = **DIRECT**（Bob 纠正：REJECT 是写错） | ✅ 已确认 |
| D4 | 国内直连组放第 4 位，其规则照常输出 DIRECT；但 `GEOIP,CN` 单独拿走排到 #13 | ✅ 已确认 |
| D5 | 组顺序调换：国外媒体提到游戏前、加密货币挪到最末（微软/苹果之后） | ✅ 已确认 |
| D6 | 用户规则组语义：当前为空；后续用户添加规则后，rules 里默认 DIRECT，但 OpenClash 面板可切换（即 user 策略组 default 从「节点选择」改「DIRECT」，仍为 select 可切换） | ✅ 已确认 |
| D7 | 广告拦截默认 REJECT、FCM/AI/社交/媒体/游戏/微软/苹果/加密货币默认 DIRECT | ✅ 已确认 |
| D8 | `MATCH,漏网之鱼` 收尾保留 | ✅ 已确认 |
| D9 | 组顺序确认调换（第②点） | ✅ 已确认 |
| D10 | XHTTP 节点 ECH 简化：`ech-opts` 只保留 `enable: true`，去掉 `query-server-name` 和 `config` 两个参数（Bob 与多个 AI 讨论后决定，回头实测 XHTTP 是否连通） | ✅ 已确认 |

## 三、顺带修复的 3 个 Bug（实跑 rules 输出发现）

| Bug | 描述 | 修复方案 |
|-----|------|---------|
| B1 | `GEOIP,geoip,cn,DIRECT` 格式非法 + 重复：china-direct 组 id 写成 `geoip,cn`（含逗号），tag=geoip 时输出 `GEOIP,geoip,cn` 非合法国家码；且去重指纹按逗号切分解析成 `geoip` 匹配不到，被当孤儿重复输出 | id 改为标准 `cn`（输出 `GEOIP,CN,DIRECT`），随 #13 移出国内直连组 |
| B2 | `GEOSITE,apple-music` 输出两遍：同时存在于国外媒体组（PROXY）和苹果服务组（DIRECT），ruleActionTarget 按顺序先找到媒体组，两处都路由成国外媒体 | **归属待 Bob 拍板**（A 只留媒体 / B 只留苹果 / C 两组都留但苹果强制 DIRECT） |
| B3 | 去重指纹对含逗号 id 解析错位 | 与 B1 关联，B1 修复后自然解决 |

## 四、待 Bob 拍板/补充

- [ ] **待确认①（用户规则 default）**：user 策略组 default 从「节点选择」改「DIRECT」（OpenClash 面板仍可切换）——已按此理解记录，Bob 未反对
- [ ] **待拍板②（apple-music 归属 B2）**：A 只留媒体组 / B 只留苹果组 / C 两组都留但苹果强制 DIRECT
- [ ] **待补充③**：Bob 说「我还有一点要提，提完开始修改」——等待 Bob 提完最后一点
- [ ] **内网防代理两条的插入位置**：第①步（用户规则之后、广告拦截之前）硬编码输出，不随勾选变化

## 五、实施步骤（讨论完成、Bob 确认「开始修改」后执行）

1. **metacubex-rules.ts**：
   - china-direct 组 id `geoip,cn` → `cn`（B1 修复）
   - 组顺序调整：media（国外媒体）提到 game（游戏平台）前、crypto（加密货币）挪到最后
   - apple-music 归属按 B2 拍板结果处理
2. **rule-providers.ts**（buildRules）：
   - 内网防代理两条硬编码置顶（`GEOIP,lan,DIRECT,no-resolve` + `GEOSITE,private,DIRECT`）
   - `GEOIP,CN,DIRECT` 从国内直连组输出中剥离，单独排到 #13（加密货币之后、MATCH 之前）
   - 第④步国内直连只输出 7 条 GEOSITE → DIRECT
   - 组顺序按新方案遍历
3. **mihomo.ts**：
   - user 策略组 default 改「DIRECT」
   - XHTTP ECH 简化（mihomo.ts:202-217）：`ech-opts` 只输出 `enable: true`，删除 `query-server-name`/`config` 解析写入逻辑（D10）
4. **测试更新**：规则顺序锁定测试 + 修复涉及组顺序/输出的既有断言（verify-v31、rule-order、rule-providers、mihomo）
5. **版本号**：v2.10.3 → v2.11.0（package.json + src/meta.ts）
6. **验证**：build / typecheck / lint / tests 全绿 → 提交推送 → CI → Release 自动同步

## 六、风险与备注

- GEOIP,CN 移出国内直连组后，国内直连组只剩 7 条 GEOSITE；`cn` 仍是灰色固定（不可取消），GEOIP,CN 作为 #13 独立固定行输出
- 用户规则组为空时不输出任何规则（现状不变），default 仅影响策略组定义
- 内网防代理两条不随勾选变化，属承重墙固定行
