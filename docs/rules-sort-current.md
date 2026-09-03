# 当前版本规则排序 & 分流策略 (v2.19.5)

> **生效版本**：v2.19.5 (2026-09-03)  
> **对应历史计划**：`docs/rules-sort-plan-v211.md`（v2.11.0 历史文档）

---

## 当前 16 步规则排序（buildRules 输出顺序）

```
 1. GEOIP,lan,DIRECT,no-resolve              ← 内网防代理①
 2. GEOSITE,private,DIRECT                   ← 内网防代理②
 3. 用户规则（默认手动切换，面板可切）        ← 置顶位置
 4. GEOSITE,category-ads-all,REJECT          ← 广告拦截
 5. GEOSITE,cn → DIRECT                      ← 国内直连①
 6. GEOSITE,apple-cn → DIRECT                ← 国内直连②
 7. GEOSITE,microsoft@cn → DIRECT            ← 国内直连③
 8. GEOSITE,steam@cn → DIRECT                ← 国内直连④
 9. GEOSITE,category-games@cn → DIRECT       ← 国内直连⑤
10. GEOSITE,onedrive → DIRECT                ← 国内直连⑥
11. GEOSITE,icloud@cn → DIRECT               ← 国内直连⑦
12. 国外媒体规则 → 国外媒体组
13. Google服务规则 → Google服务组
14. 业务分类组（微软/苹果/游戏/AI/社交/加密/用户规则，仅勾选时生成）
15. GEOIP,CN,DIRECT                          ← 兜底直连
16. MATCH,漏网之鱼
```

---

## 当前策略组默认值（v2.19.5 生效值）

| 策略组 | 类型 | default-selected | 备注 |
|---|---|---|---|
| **GLOBAL** | select | **自动选择** | v2.19.5 从 DIRECT 改为自动选择 |
| **节点选择** | select | 自动选择 | 手动选地区入口 |
| **手动切换** | select | 第一个节点 | 优先「美国」组首节点，回退第一个地理节点 |
| **自动选择** | url-test | 自动测速 | interval 300s + tolerance 50，**测速对象为国家地理组** |
| **国外媒体** | select | **自动选择** | v2.14.0 从 DIRECT 改为自动选择 |
| **Google服务** | select | 手动切换 | v2.15.0 新增 |
| **广告拦截** | select | REJECT | 仅含 REJECT/DIRECT |
| **微软服务** | select | **自动选择** | v2.19.5 从 DIRECT 改为自动选择 |
| **苹果服务** | select | DIRECT | |
| **游戏平台** | select | DIRECT | |
| **AI 平台** | select | 手动切换 | v2.14.0 从 DIRECT 改为手动切换 |
| **社交** | select | **自动选择** | v2.14.0 从 DIRECT 改为自动选择 |
| **加密货币** | select | 🇹🇼 台湾 | v2.14.0 从 DIRECT 改为台湾 |
| **用户规则** | select | 手动切换 | v2.13.1 从 DIRECT 改为手动切换 |
| **漏网之鱼** | select | **手动切换** | v2.19.5 从自动选择改为手动切换 |
| **地理组（6 国）** | url-test | 自动测速 | 美/马/日/新/台/韩 |
| **地理组（其他）** | select | 手动选择 | 无自动测速 |

---

## 当前组顺序（UI & GLOBAL proxies 顺序）

```
节点选择 → 手动切换 → 自动选择 → 国外媒体 → Google服务 → 广告拦截 →
微软服务 → 苹果服务 → 游戏平台 → AI 平台 → 社交 → 加密货币 → 用户规则 →
漏网之鱼 → DIRECT → [地理组: 🇭🇰 香港 / 🇯🇵 日本 / 🇺🇸 美国 / 🇸🇬 新加坡 / 🇹🇼 台湾 / 🇰🇷 韩国 / ...]
```

---

## 广告拦截组规则（v2.19.2 变更）

**仅保留 1 条**：
- `GEOSITE,category-ads-all,广告拦截` （广告拦截通用合集）

**已移除**：
- ~~`GEOSITE,tracker,广告拦截`~~ （追踪器 Tracker，v2.19.2 删除）

---

## 国内直连组规则（固定 7 条 GEOSITE）

1. `GEOSITE,cn,DIRECT`
2. `GEOSITE,apple-cn,DIRECT`
3. `GEOSITE,microsoft@cn,DIRECT`
4. `GEOSITE,steam@cn,DIRECT`
5. `GEOSITE,category-games@cn,DIRECT`
6. `GEOSITE,onedrive,DIRECT`
7. `GEOSITE,icloud@cn,DIRECT`

**+ 硬编码兜底**：
- `GEOIP,lan,DIRECT,no-resolve`（内网防代理，最前）
- `GEOSITE,private,DIRECT`（私有地址，第二）
- `GEOIP,CN,DIRECT`（中国 IP 兜底，倒数第二，MATCH 之前）

---

## Google服务组规则（v2.15.0 新增，固定 7 条）

1. `GEOSITE,google,Google服务`
2. `GEOSITE,google-gemini,Google服务`
3. `GEOSITE,google-deepmind,Google服务`
4. `GEOSITE,google-play,Google服务`
5. `GEOSITE,google-scholar,Google服务`
6. `GEOSITE,google-trust-services,Google服务`
7. `GEOIP,google,Google服务`

---

## 业务分类组规则（按需生成，仅勾选时输出）

| 分组 | 包含规则示例 | default-selected |
|---|---|---|
| 微软服务 | microsoft / microsoft-dev / microsoft-pki | **自动选择** |
| 苹果服务 | apple / apple-music / apple-dev / apple-update / apple-pki | DIRECT |
| 游戏平台 | category-games-!cn | DIRECT |
| AI 平台 | category-ai-!cn / category-ai-chat-!cn | 手动切换 |
| 社交 | category-communication / category-social-media-!cn | **自动选择** |
| 加密货币 | category-cryptocurrency | 🇹🇼 台湾 |
| 用户规则 | 自定义规则（GEOSITE 原生输出） | 手动切换 |

---

## 地理分组策略（v2.19.4 关键变更）

**6 国 url-test 自动测速（有节点才生成）**：
- 🇺🇸 美国、🇲🇾 马来西亚、🇯🇵 日本、🇸🇬 新加坡、🇹🇼 台湾、🇰🇷 韩国

**其他国家 select 手动选择**：
- 仅在有节点时生成，无自动测速

**自动选择组测速逻辑（v2.19.4）**：
- **测速对象 = 国家地理组**（geoGroupNames），而非扁平节点名
- 效果：按地区整体测速选最优地区，而非在所有节点里挑最快单节点

---

## 规则输出技术细节

### 固化策略组（始终生成）
- GLOBAL、节点选择、手动切换、自动选择、国外媒体、Google服务、广告拦截、漏网之鱼、地理组

### 条件策略组（仅勾选该大类规则时生成）
- 微软服务、苹果服务、游戏平台、AI 平台、社交、加密货币、用户规则

### 不生成独立组（有固化策略组承接）
- ads → 广告拦截
- media → 国外媒体
- google-fcm → Google服务
- china-direct 规则直接输出到 rules 段（不生成独立策略组）

### 原生 GEOSITE 输出规则
- `native: true` 的规则直接输出 `GEOSITE,<id>,<组名>`，不走 rule-providers
- 当前原生输出：广告拦截(category-ads-all)、国内直连 7 条、Google服务 7 条、Google FCM

---

## 与 v2.11.0 主要差异对比

| 维度 | v2.11.0 | v2.19.5 (当前) |
|---|---|---|
| **GLOBAL default** | DIRECT | **自动选择** |
| **国外媒体 default** | DIRECT | **自动选择** |
| **微软服务 default** | DIRECT | **自动选择** |
| **社交 default** | DIRECT | **自动选择** |
| **漏网之鱼 default** | (不存在) | **手动切换** |
| **广告拦截规则** | category-ads-all + tracker | **仅 category-ads-all** |
| **Google服务组** | 无 | **新增（7 条规则）** |
| **自动选择测速对象** | 扁平节点名 | **国家地理组名** |
| **mixed-port** | 7890 | **7893** |

---

## 面板显示顺序

zashboard / metacubexd 面板的策略组显示顺序 = **GLOBAL 组 proxies 引用顺序**。

GLOBAL proxies：`['节点选择', '手动切换', '自动选择', 'DIRECT']` → 面板前 4 个分组固定为此顺序。

---

## 输出配置说明

| 格式 | 包含分流规则 | 说明 |
|---|---|---|
| **Mihomo YAML** | ✅ 完整 | proxies + proxy-groups + rules + rule-providers |
| **sing-box JSON** | ✅ 完整 | 1.11+ 格式，含 DNS/TUN/urltest |
| v2ray / v2rayN / NekoBox / Shadowrocket / Loon / Surge / Quantumult X | ❌ 仅节点链接 | Base64/原生链接，无分流规则 |

---

*生成时间：2026-09-03 | 版本 v2.19.5*