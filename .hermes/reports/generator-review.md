```json
{
  "findings": [
    {
      "severity": "P0",
      "location": "src/generator/loon.ts:91-107",
      "issue": "vmess 行生成时,transport.host / transport.path / sni / password 等字段在 parts.push(`host=${node.transport.host}`) 等处直接拼接到逗号分隔行,无任何转义;若 host='a,b.com' 或 path='/p,1' 会被切段,导致 Loon 解析错位、整行失效。",
      "impact": "实际环境常见:CDN 节点 host 多值(cdn.example.com,cdn2.example.com)或 path 含逗号,会使 Loon 客户端无法解析整行 proxy 段,节点被跳过;若全部节点中招则 PROXY 组空。",
      "suggestion": "对所有用户/CDN 可注入的字段(transport.host、transport.path、sni、password)统一用 escapeValue 转义后再 join;现 escapeValue 仅在 nodeToLoonProxy 入口对 name 生效,字段值未受保护。"
    },
    {
      "severity": "P0",
      "location": "src/generator/loon.ts:108-131",
      "issue": "vless 行同样存在 transport.path / transport.host / sni / sid / pbk 字段无转义直接拼接。Reality 节点 pbk/sid 一般不会含逗号,但 transport.host/path 是订阅方/CDN 配置内容,可能在极个别场景下含逗号或等号。",
      "impact": "与 vmess 同 P0,边界 case 但需加固。",
      "suggestion": "对 pbk/sid 也加 escapeValue 包裹(尤其 short-id 解析最严格)。"
    },
    {
      "severity": "P0",
      "location": "src/generator/loon.ts:58",
      "issue": "[Proxy Group] 段 `PROXY = select, ${nodeNames}` 中,nodeNames 是 uniqueNodes.map(n => n.name).join(', ') —— name 未做单节点 escapeValue 处理;若节点名含逗号(部分机场命名形如 '香港,美国 双地区'),直接切断 PROXY 组定义,整组解析失败。",
      "impact": "节点名注入逗号会让所有 Loon 用户 PROXY 策略组死引用,流量全部走直连。",
      "suggestion": "对每个 name 单走 escapeValue 再 join:`uniqueNodes.map(n => escapeValue(n.name)).join(', ')`。"
    },
    {
      "severity": "P0",
      "location": "src/generator/mihomo.ts:134-151 (vmess sni 兜底缺失)",
      "issue": "vmess 分支 mihomo.ts:137 只在 `if (node.sni) base.tls = true;`,servername 完全不输出(无 vless 那种 host 兜底)。vmess+ws+tls+sni 缺失 + transport.host 是域名时,Cloudflare 会用 IP 当 SNI 拒握。",
      "impact": "vmess+ws+tls 节点无显式 sni 时全挂,与 vless/trojan 行为不一致。",
      "suggestion": "vmess 分支加 servername 兜底:`if (node.sni) base.servername = node.sni; else if (node.tls && node.transport?.type === 'ws' && node.transport.host) base.servername = node.transport.host;`。"
    },
    {
      "severity": "P0",
      "location": "src/generator/loon.ts:108-130 + src/generator/surge.ts:51-55 + src/generator/quantumultx.ts:60-63",
      "issue": "vless+grpc 节点在 nodeToLoonProxy vless 分支(transport !== 'ws' → 默认 tcp)grpc transport 字段被丢弃,实际连不上;nodeToSurgeProxy vless 返回 ''(surge 官方不支持 vless,合理);nodeToQXServer vless 返回 ''(QX 不支持,合理)。但 Loon 端 vless+grpc 输出 tcp fallback 是隐式连不上,group PROXY 仍引用该节点 → 死引用。",
      "impact": "Loon 用户订阅 vless+grpc 节点时 PROXY 组有死引用,触发 Loon 启动警告或整组拒绝解析。",
      "suggestion": "nodeToLoonProxy vless 分支检测 grpc/h2 显式返回 '',生成器在调用前 filter 掉,或保持现状但在 [Proxy Group] 段之前 filter uniqueNodes(已对 ssr filter,但 grpc/h2 未 filter)。"
    },
    {
      "severity": "P0",
      "location": "src/generator/loon.ts:31-34 + src/generator/surge.ts + src/generator/quantumultx.ts",
      "issue": "ssr/hysteria2/tuic/wireguard/anytls 协议在 Loon/Surge/QX 三个生成器的 nodeTo* 函数 default 分支返回 '',节点被静默丢弃,但 PROXY 策略组仍引用节点名 → 死引用。Surge/QX 在 PROXY 段前未做协议 filter,直接生成 group 引用了不存在的 proxy name。",
      "impact": "用户用 Loon 订阅 hysteria2/wireguard 节点时,PROXY 组含 5+ 死引用,客户端面板显示节点但实际连不上;Stash 严格模式下可能拒载。",
      "suggestion": "在 generateLoonConfig/generateSurgeConfig/generateQuantumultXConfig 的 uniqueNodes 链上 filter 掉不支持的协议(同 ssr 的 filter 模式),确保 PROXY 组引用与 [Proxy] 段 1:1 对应。"
    },
    {
      "severity": "P1",
      "location": "src/generator/rule-providers.ts:155-237 + src/generator/mihomo.ts:687-688",
      "issue": "selectedRules=[] 时,mihomo.ts:687 'rules: [MATCH,漏网之鱼]' 直接生效,未注入 'GEOIP,lan,DIRECT,no-resolve'/'GEOSITE,private,DIRECT'/'GEOIP,CN,DIRECT' 三条承重墙;但 buildRules 内部这三行是硬编码(line 170-171、213)。结果:用户不勾任何规则时,内网/私域/CN 流量全部走 MATCH 兜底 → 漏网之鱼 → 节点选择(默认自动选择,空 geo 组)→ DIRECT → 全部直连。",
      "impact": "订阅加载但未勾规则的边缘用户,内网/国内流量也会被代理(可能回环),或全部直连(实际行为取决于节点选择内部 fallback)。",
      "suggestion": "mihomo.ts:687 改为 `rules: buildRules([], ruleGroups)`(默认空 selected 也走 buildRules)或显式补三条承重墙后再 MATCH。"
    },
    {
      "severity": "P1",
      "location": "src/generator/mihomo.ts:524-533",
      "issue": "自动选择 url-test 间隔 1800 秒(30 分钟),与 zashboard 推荐 300 秒(5 分钟)、同文件地理组 url-test 也用 300 秒不一致;首次启动 30 分钟内 url-test 未跑完,'自动选择' 用上次缓存或默认选第一个节点,可能命中失效节点。",
      "impact": "新订阅用户启动后 30 分钟内可能出现首节点挂了但未切换,导致首次访问失败。",
      "suggestion": "interval 改 300;或加 lazy=true(首次用时测速)配合 interval=86400。"
    },
    {
      "severity": "P1",
      "location": "src/generator/singbox.ts:226-234",
      "issue": "mapTargetToOutbound 把所有非 DIRECT/国内直连 的目标统一映射为 'proxy' selector,包括 AI 平台、加密货币、漏网之鱼、微软服务等业务分组。Singbox 端没有这些策略组概念,所有非 direct 流量只能走 proxy 顶层。",
      "impact": "设计妥协,但用户在 Mihomo 端精心配置的面板分组对 Singbox 客户端完全无效,体验割裂;用户切换'AI 平台'或'漏网之鱼' 实际无差异。",
      "suggestion": "在 dashboard 提示 'Singbox 客户端仅支持 proxy/direct 切换,业务分组为 Mihomo/Stash 专用';或将 singbox 改造为支持多 selector 组(urltest 分流)。"
    },
    {
      "severity": "P1",
      "location": "src/generator/singbox.ts:51,74,88 (server_name 兜底)",
      "issue": "vmess/vless/trojan 在 tls 下 server_name 兜底用 node.server;若 server 是 IP(CDN 后)则 SNI=IP,Cloudflare 拒握。Mihomo 端对 vless/trojan 有 transport.host 兜底逻辑(mihomo.ts:162,208),Singbox 端无对应兜底,行为不对称。",
      "impact": "Singbox 用户用 IP-as-server 的节点时全部连接失败,与 Mihomo 端表现不一致。",
      "suggestion": "Singbox 端 vmess/vless/trojan 也加 transport.host 兜底,或两者统一兜底策略。"
    },
    {
      "severity": "P1",
      "location": "src/generator/loon.ts:50-53",
      "issue": "[Rule] 段硬编码仅 'GEOIP,CN,DIRECT' + 'FINAL,PROXY',未输出 'GEOIP,lan,DIRECT,no-resolve' + 'GEOSITE,private,DIRECT' 两条内网防代理规则;但 [Remote Rule] 引用 blackmatrix7 规则(也可能含 private)。Loon 规则匹配顺序为 [Remote Rule] → [Rule],若 [Remote Rule] 缺内网规则,内网 192.168.x 走 FINAL,PROXY → 走代理 → 失联。",
      "impact": "Loon 用户接入内网/私域服务时可能回环,需 [Rule] 段补内网防代理两行。",
      "suggestion": "在 [Rule] 段开头加 'GEOIP,lan,DIRECT' + 'GEOSITE,private,DIRECT'(与 mihomo buildRules line 170-171 一致)。"
    },
    {
      "severity": "P1",
      "location": "src/generator/rule-providers.ts:64",
      "issue": "ruleActionTarget 用 `rule.id.toLowerCase()` 在 RULE_GROUPS.items 里查找归属分组;若 rule.id 含 @属性后缀(如 'microsoft@cn')而 items.id='microsoft',小写后仍无法精确匹配,会落到无分组(漏网之鱼)兜底。china-direct 组的 fixed 规则走 line 187-193 单独处理(已测试通过),但 PROXY 侧带 @属性 的规则不在 fixed 列表里会错位。",
      "impact": "理论上 'microsoft@cn' 不会作为 PROXY 规则存在(实际场景中 'microsoft' 是主规则,'@cn' 是属性后缀),但若数据源误用,可能导致路由到错分组。",
      "suggestion": "groupItems 查找时按 `items.id === baseId(rule.id)`(剥离 @/!)匹配,或维护独立的 groupKeyMap。"
    },
    {
      "severity": "P1",
      "location": "src/generator/singbox.ts:117-121",
      "issue": "formatPluginOpts 返回字符串形式 'k=v;k=v',但 sing-box 1.11+ 文档明确建议 plugin_opts 为对象 `{mode: 'tls', host: 'x'}`;旧版本(sing-box 1.8-)可能不接受对象。",
      "impact": "实测 sing-box 1.11+ 仍接受字符串形式(宽松解析),但未来版本可能严格化导致 SS 节点失效。",
      "suggestion": "改对象形式输出:`outbound.plugin_opts = { ...opts }`,并加单测覆盖 sing-box 版本。"
    },
    {
      "severity": "P1",
      "location": "src/generator/mihomo.ts:299-310 (anytls)",
      "issue": "Mihomo 端 anytls 类型输出含 idle-session-check-interval / min-idle-session / client-metadata 字段,这些字段名需 Mihomo 1.19+ 才支持(2025+ 实验性);老版本 Mihomo/Clash Meta 不识别,可能拒载或警告。",
      "impact": "线上任何 tls 节点在老 Mihomo 客户端报错;需在 dashboard 提示最低版本。",
      "suggestion": "文档化最低 Mihomo 版本(>= 1.19.0),或对老版本降级为 ss/trojan。"
    },
    {
      "severity": "P1",
      "location": "src/generator/mihomo.ts:38-40 + 51 (allow-lan + secret 默认空)",
      "issue": "DEFAULT_MIHOMO_TEMPLATE 同时 allow-lan=true + secret='',允许局域网设备 0 鉴权访问 9090 控制 API;若用户部署在公网或开放 LAN,任何人都能控制代理、读取流量。",
      "impact": "安全风险:Cloudflare Workers 部署默认 LAN=公网,恶意用户可调 /proxies 改路由、读取 /traffic。",
      "suggestion": "secret 强制随机生成(部署时由 worker 配 SECRET),或在 allow-lan=true 时必填 secret;在 dashboard 强提示。"
    },
    {
      "severity": "P1",
      "location": "src/generator/mihomo.ts:516-522 (手动切换默认 selected)",
      "issue": "手动切换 default-selected=第一个具体节点(allGeoNodes[0]),不是'节点选择'。首节点失效时手动切换默认选失效节点,用户首次切换即踩雷。",
      "impact": "新订阅用户切换手动切换组时默认指向第一个节点,可能命中失效节点,需手动再切。",
      "suggestion": "默认改为 '节点选择' 或 '自动选择'(同 GLOBAL/漏网之鱼兜底)。"
    },
    {
      "severity": "P2",
      "location": "src/generator/mihomo.ts:614-622 (GLOBAL proxies)",
      "issue": "GLOBAL proxies=['节点选择','手动切换','自动选择','DIRECT'] 不含 geoGroupNames,与同文件 line 488 注释 'GLOBAL 必须显式、完整地按期望顺序引用所有策略组' 不一致(用户 2026-08-30 拍板缩减为 4 项,设计 OK 但注释未更新)。",
      "impact": "zashboard 面板 GLOBAL 切换不显示地理组;读源码的人会困惑。",
      "suggestion": "更新注释,或恢复 geoGroupNames(产品决策)。"
    },
    {
      "severity": "P2",
      "location": "src/generator/rule-providers.ts:216-231 (孤儿规则检测)",
      "issue": "matchedIds 用字符串 split 切片收集,line 222 'matchedIds.add(parts[0])' 对 IP/GEOSITE 行把 'GEOIP'/'GEOSITE' 当 ID 加入 validGroupIds 检查,实际 GEOIP 不在 group.items 里,误判为孤儿。",
      "impact": "无功能影响(空 matchedIds 触发兜底无效路径),可读性差。",
      "suggestion": "重构成按 ID 集合去重:`const emittedRuleIds = new Set([...])`,而非按行 split。"
    },
    {
      "severity": "P2",
      "location": "src/generator/mihomo.ts:706-712 (validateMihomo)",
      "issue": "validateMihomo 只验证 proxies 是数组,不验证 server/port/uuid 非空、group proxies 引用真实节点、节点名唯一。",
      "impact": "完全错的 YAML 也能 validate 通过,无可靠兜底。",
      "suggestion": "加引用完整性检查:节点名唯一、group.proxies 全部可解析、必填字段非空。"
    },
    {
      "severity": "P2",
      "location": "src/generator/singbox.ts:240-246 (validateSingbox)",
      "issue": "validateSingbox 同 mihomo,只验证 outbounds 数组存在。",
      "impact": "同 P2 mihomo。",
      "suggestion": "增加 outbounds.tag 唯一性、route.rule_set tag 引用有效性检查。"
    },
    {
      "severity": "P2",
      "location": "src/generator/loon.ts:147-149 (validateLoon)",
      "issue": "validateLoon 仅检查 '[Proxy]' 和 '[Rule]' 字符串存在,无任何结构验证。",
      "impact": "PROXY 组死引用也 validate 通过。",
      "suggestion": "增加 PROXY 组 nodeNames 全部出现在 [Proxy] 段的引用完整性检查。"
    },
    {
      "severity": "P2",
      "location": "src/generator/mihomo.ts:376-420 (detectGeo IP 兜底串行 await)",
      "issue": "detectGeo 对每个未识别节点串行 await ipGeoResolver(server),真实 HTTP 请求时数百节点会阻塞 Workers CPU 时限(30s 软限,30s 硬限);实测 ipGeoResolver=undefined 时不阻塞,但若用户接入 IP-API 等第三方,会直接超时。",
      "impact": "未分组节点过多时 timeout 风险;Workers 上 50+ 节点即可触发。",
      "suggestion": "改成 Promise.all 并行 + 限流(每批 50);或对 IP 兜底加超时(2s/节点)。"
    },
    {
      "severity": "P2",
      "location": "src/generator/node-to-url.ts:79-92 (vmess URL JSON 字段)",
      "issue": "vmess URL JSON 字段 aid 硬编码 '0'、scy 硬编码 'auto'、type 硬编码 'none' —— 若原链接 aid≠0(老 VMess 节点)或 scy 自定义(如 'chacha20-ietf-poly1305'),无 originalUrl 时(从 Clash YAML 转换)会丢字段。scy 可从 metadata.tags[0] 读(aid 无法从 Node 模型拿)。",
      "impact": "无 originalUrl 的 VMess 节点字段丢失,客户端用错协议版本。",
      "suggestion": "scy 优先用 metadata.tags[0](已实现),aid 留硬编码 0(VMess 已弃 alterId,主流节点都是 0)。"
    },
    {
      "severity": "P2",
      "location": "src/generator/node-to-url.ts:198 (wireguard URL private-key 未 encode)",
      "issue": "wireguard:// 链接中 `node.wgPrivateKey@` 拼接时 private-key 未做 encodeURIComponent;其它字段经 URLSearchParams 处理;WG key 是 base64 字符但若含 +/= URL 保留字符,客户端解析可能错位。",
      "impact": "罕见,需验证客户端严格性。",
      "suggestion": "encodeURIComponent(node.wgPrivateKey) 包裹。"
    },
    {
      "severity": "P2",
      "location": "src/generator/node-to-url.ts:242-244 (urlSafeBase64Encode)",
      "issue": "urlSafeBase64Encode 把 btoa 输出做 +/-/= 替换;但 base64.ts safeBase64Encode 失败时 catch 直接 `btoa(input)`(latin1 编码),UTF-8 字符错位。SSR obfsparam/protoparam 可能含中文,会错误编码。",
      "impact": "SSR 节点含中文 obfsparam 时客户端解析失败。",
      "suggestion": "catch 分支也要 UTF-8 编码:`const bytes = new TextEncoder().encode(input); btoa(String.fromCharCode(...bytes))`。"
    },
    {
      "severity": "P2",
      "location": "src/generator/loon.ts:121 (short-id 转义)",
      "issue": "vless Reality 短 ID 在 `parts.push(\`short-id=${node.sid}\`)` 无引号包裹;Loon 解析器对十六进制 OK,但若 sid 形如 'abc,def' 会被切段(可能性极低)。",
      "impact": "边角。",
      "suggestion": "escapeValue(sid) 包裹。"
    },
    {
      "severity": "P2",
      "location": "src/generator/mihomo.ts:506-513 (default-selected 字段兼容性)",
      "issue": "Mihomo 用 'default-selected'(连字符)非 'default_selected'(下划线);老版 Clash Premium/Mihomo < 1.16 不识别此字段,启动报错或忽略默认选。",
      "impact": "需验证 Mihomo 1.18+ 兼容性。",
      "suggestion": "无,主要面向最新版。"
    },
    {
      "severity": "P2",
      "location": "src/generator/loon.ts:108-112 (vless h2 transport 降级)",
      "issue": "vless 节点 transport.type='h2' 时,nodeToLoonProxy vless 分支 transport=tcp(默认)fall-through,h2 opts 丢弃,实际连不上。",
      "impact": "h2 节点在 Loon 永远失败。",
      "suggestion": "filter h2 节点后再生成 Loon。"
    },
    {
      "severity": "P2",
      "location": "src/generator/mihomo.ts:96-97 (nameserver-policy#节点选择)",
      "issue": "nameserver-policy 包含 'https://1.1.1.1/dns-query#节点选择' —— 用 # 注释替代 policy-server 引用,Mihomo 1.14+ 支持,Clash Premium 无此特性会报错。",
      "impact": "Clash Premium 兼容性。",
      "suggestion": "无,目标用户是 Mihomo。"
    },
    {
      "severity": "P2",
      "location": "src/generator/mihomo.ts:622 (GLOBAL)",
      "issue": "GLOBAL url 字段 'https://cp.cloudflare.com/generate_204' 与同文件 529 行 url-test 组的 'http://www.gstatic.com/generate_204' 不一致(GLOBAL 用 https,其他用 http),不同 URL 测速结果不可比。",
      "impact": "GLOBAL 测速基准与 自动选择/地理组 不可比,可能误判。",
      "suggestion": "统一 URL(建议 http://www.gstatic.com/generate_204)。"
    }
  ],
  "conclusions": [
    "1. 整体健壮性良好 —— 测试覆盖率高(375/375 通过),核心协议(Mihomo VLESS+WS+Reality/VMess/Trojan/SS)字段映射正确,validateMihomo/validateSingbox/validateLoon 基础验证到位;YAML/JSON 在含中文/特殊字符(emoji、#、,、:)的节点名测试中正确转义,无 YAML 语法错误风险。",
    "2. 显著线上风险点集中在 Loon 生成器 —— 多处 user-controlled 字段(sni/transport.host/path/password/sid/pbk)未做转义直接拼接进 proxy/group 行(loon.ts P0 三处),以及不支持的协议(grpc/h2/ssr/hysteria2/tuic/wireguard/anytls)被静默丢弃但 group 仍引用节点名(P0 第六条),会形成死引用导致整个 PROXY 组解析失败;这与项目已知事故①(白屏/HTML 缺测试)同根:本地测试只检 '[Proxy]/[Rule] 字符串存在',未做 group→proxy 引用完整性校验,线上才暴露。",
    "3. 中等风险在策略默认值不对称与版本兼容性 —— Mihomo 端 mihomo.ts:687 'rules:[MATCH,漏网之鱼]' 在 selectedRules=[] 时无 CN 兜底承重墙(P1),Singbox 端 mapTargetToOutbound 把所有非 DIRECT 目标统一映射为 'proxy' selector(P1,设计妥协),anytls/WireGuard 协议对老 Mihomo(<1.19/1.18)兼容性需文档化(P1);建议 P1 全部加上单测覆盖(目前 formats.test.ts/rule-providers.test.ts/fidelity.test.ts 测了主要协议,但 buildRules([]) 边界、singbox 业务分组映射、loon 死引用三个场景均无测试)。"
  ]
}
```