# v2.11.0 规则排序重构 — 历史归档

> 本文档是 **v2.11.0 规则排序重构** 的开发计划与决策记录。  
> 该版本已于 2026-08-30 完成并发布（commit `9648f48`，Release `v2.11.0`），内容已过时，仅作历史归档保留。  
> 当前最新的规则顺序请参考 [proxy-group-hierarchy.md](./proxy-group-hierarchy.md)。

## 📋 目录

- [背景](#-背景)
- [决策确认清单](#-决策确认清单)
- [Bug 修复](#-bug-修复)

---

## 🎯 背景

CF-Workers-SUB-Next 规则排序从 V3.1 升级到 V3.2（v2.11.0），同时简化 XHTTP 节点 ECH 配置。

---

## ✅ 决策确认清单（D1–D10，均已确认）

| # | 决策点 | 结论 |
|---|--------|------|
| D1 | 国内直连组动作 | 7 条 GEOSITE 照常输出 DIRECT（方案 B） |
| D2 | 第④步是占位还是规则照常 | 规则照常输出 DIRECT |
| D3 | 内网防代理两条顺序 | `GEOIP,lan,DIRECT,no-resolve` 在前，`GEOSITE,private,DIRECT` 在后 |
| D4 | 组顺序调换 | ✅ 国外媒体提到游戏前，加密货币移至末尾 |
| D5 | 用户规则语义 | rules 列表内默认 DIRECT，OpenClash 面板可切换选择 |
| D6 | 用户规则「默认 DIRECT」实现 | 策略组 user 的 `default: 'DIRECT'` |
| D7 | 国内直连组 GEOIP,CN 处理 | 从组内剥离，单独排 #13（GEOIP,CN 之后为 MATCH） |
| D8 | `MATCH,漏网之鱼` 收尾 | 保留，不变 |
| D9 | 组顺序调换（具体） | 国外媒体提到游戏前；加密货币移至末尾 |
| D10 | XHTTP ECH 简化 | 只保留 `ech-opts: enable: true`，去掉 `query-server-name` 和 `config` |

> ⚠️ **后续版本变更**：
> - v2.11.6（2026-08-30）：GLOBAL 默认改 DIRECT；漏网之鱼默认改自动选择
> - v2.11.7（2026-08-30）：GLOBAL 组精简为四项
> - v2.19.5（2026-09-03）：GLOBAL 默认改自动选择；漏网之鱼默认改手动切换；微软服务默认改自动选择

---

## 🐛 Bug 修复

| ID | 问题 | 修复 |
|----|------|------|
| B1 | `geoip,cn` id 带逗号非标准，导致 OpenClash 匹配失败 | 改为 `cn`（与 geosite 统一格式） |
| B2 | `apple-music` 同时存在于 media 组和 apple 组，输出两遍 | 从 media 组移除，只留 apple 组 |
| B3 | ECH 硬编码 `query-server-name` + `config` 导致 XHTTP 节点连接不上 | 只保留 `ech-opts: enable: true` |

---

## 📌 历史信息

- **实施版本**：v2.11.0
- **完成日期**：2026-08-30
- **Commit**：9648f48
- **CI**：#132 success
- **Release**：v2.11.0 已自动同步
- **测试基线**：374 → 376 → 378
