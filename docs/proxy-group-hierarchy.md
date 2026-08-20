# Mihomo 代理分组层级设计

## 层级关系（自上而下）

规则优先级（顶层代理组的 proxies 引用顺序 = GLOBAL 组顺序，参考 ACL4SSR_Online_Full.ini）：

```
GLOBAL (select, 默认: DIRECT)
├── 节点选择               ← 手动选节点
├── 手动切换               ← 逐节点选
├── 自动选择               ← url-test 测速
├── 广告拦截               ← REJECT
├── 应用净化               ← REJECT（CATEGORY-ADS）
├── 国内媒体               ← DIRECT（私有/CN域名/CN IP/国内网站/国内流媒体）
├── 国外媒体               ← 国外流媒体
├── [规则分类组]            ← AI服务/加密货币/游戏/社交/云服务/开发/用户规则
├── 漏网之鱼               ← MATCH 兜底
├── DIRECT                 ← 内置
└── [地理组]               ← 🇭🇰 香港/🇯🇵 日本/...

漏网之鱼 (select, 默认: 节点选择)
├── 节点选择, 手动切换, 自动选择, DIRECT

节点选择 (select, 默认: 自动选择)
├── 自动选择, 🇭🇰 香港, 🇯🇵 日本, ..., DIRECT

手动切换 (select, 默认: 第一个节点)
├── [所有节点扁平列表]

自动选择 (url-test, 默认: 自动测速)
├── [所有节点]

广告拦截 (select, 默认: REJECT)
├── REJECT, DIRECT, 节点选择, 手动切换, 自动选择, 地理组...

应用净化 (select, 默认: REJECT)
├── REJECT, DIRECT, 节点选择, 手动切换, 自动选择, 地理组...

国内媒体 (select, 默认: DIRECT)
├── DIRECT, 节点选择, 地理组..., 手动切换, 自动选择

国外媒体 (select, 默认: 自动选择)
├── 自动选择, 节点选择, 手动切换, 地理组..., DIRECT

[规则分类组] (select, 默认: 节点选择)
├── 节点选择, 手动切换, 自动选择, 地理组..., DIRECT

[地理组] (url-test, 默认: 自动测速)
├── 节点1, 节点2, ...
```

## 规则路由逻辑

每条规则的出口目标由 `ruleActionTarget()` 计算：

| 规则目标 | 所属规则分组 | → 路由目标 |
|----------|-------------|-----------|
| REJECT | ads（广告拦截） | `广告拦截` |
| REJECT | app-clean（应用净化） | `应用净化` |
| DIRECT | china-direct（国内直连规则） | `国内媒体` |
| PROXY | media（国外媒体） | `国外媒体` |
| PROXY | user（用户规则） | `用户规则` |
| PROXY | 其他分类组（AI/加密/游戏/社交等） | `[分类组名]` |
| — | 硬编码 GEOIP,private/GEOSITE,cn/GEOIP,CN | `DIRECT` |
| — | MATCH | `漏网之鱼` |

## 生成规则

1. **始终生成**（无论规则选择）：GLOBAL, 漏网之鱼, 节点选择, 手动切换, 自动选择, 广告拦截, 应用净化, 国内媒体, 国外媒体, 地理组
2. **条件生成**（仅当该大类有规则被勾选时）：AI 服务, 加密货币, 游戏平台, 社交, 云服务, 开发工具, 用户规则
3. **不生成独立组**（有固化策略组承接）：ads→广告拦截, app-clean→应用净化, media→国外媒体, china-direct→国内媒体
4. **默认策略由 `default-selected` 显式声明**，不依赖客户端按第一项推断。

## 规则输出顺序（buildRules）

按 RULE_GROUPS 数组顺序输出，即：**广告拦截 → 应用净化 → 国内直连规则 → 国外媒体 → 分类组 → 硬编码兜底(GEOIP,private/GEOSITE,cn/GEOIP,CN) → MATCH**