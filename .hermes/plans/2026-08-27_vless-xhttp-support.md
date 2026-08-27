# VLESS + XHTTP 传输层支持（开发计划）

> 写入日期：2026-08-27
> 触发：Bob 实测——把 CF 订阅节点的传输协议改成 XHTTP（节点协议仍为 VLESS），
> OpenClash（Mihomo 内核）能识别节点但全部不通。根因：本项目生成的 Mihomo
> 配置未识别/写出 `network: xhttp`，xhttp 节点退化为裸 TCP VLESS → 握手失败。

## 官方格式依据（MetaCubeX 文档，已核实）

来源：`https://wiki.metacubex.one/en/config/proxies/transport` + `.../proxies/vless`

```yaml
proxies:
- name: "xhttp-opts-example"
  type: vless
  server: server
  port: 443
  uuid: uuid
  udp: true
  tls: true
  network: xhttp
  alpn: [h2]   # 默认仅 h2；h3 需 alpn:[h3]；http/1.1 需 alpn:[http/1.1]
  servername: xxx.com
  client-fingerprint: chrome
  encryption: ""
  xhttp-opts:
    path: "/"
    host: xxx.com
    mode: "stream-one"   # 可选：auto | stream-one | stream-up | packet-up（默认 auto）
```

关键约束（文档原文）：
- **Only VLESS supports the xhttp transport layer. Do not use it with other protocols.**
- xhttp-opts 核心字段：`path` / `host` / `mode`；其余（x-padding / session / seq /
  uplink / reuse / download）为高级选项，订阅链接通常不携带，先不实现。
- xhttp 默认 alpn 为 h2（mihomo 自动补），无需显式写。

## 当前代码缺口（已定位）

| 文件 | 行 | 问题 |
|---|---|---|
| `src/models/node.ts` | 14 | `TransportType` 无 `'xhttp'`，缺 `mode?` 字段 |
| `src/parser/vless.parser.ts` | 49,54 | `type` 只映射 ws/grpc/tcp，xhttp 被丢成 tcp；未提取 `mode` 参数 |
| `src/parser/clash.ts` | 192-213 | `parseClashTransport` 只认 ws/grpc，xhttp 落回 tcp，未提取 xhttp-opts |
| `src/generator/mihomo.ts` | 150-185 | vless 分支只写 ws-opts/grpc-opts，xhttp 节点完全不写 network → 退化为裸 TCP |
| `src/generator/node-to-url.ts` | 39-48 | vless 回写只处理 ws/grpc，xhttp 退化成 tcp（破坏往返保真） |

## 修改方案（落地步骤）

1. **node.ts**
   - `TransportType` 增加 `'xhttp'`
   - `Transport` 接口增加 `mode?: string`（xhttp 的 mode 字段）

2. **vless.parser.ts**
   - `type` 映射增加 `type === 'xhttp' ? 'xhttp' : ...`
   - 提取 `const mode = params.get('mode') ?? undefined;`，写入 `transport.mode`
   - path/host 已有提取逻辑，xhttp 复用即可

3. **clash.ts** `parseClashTransport`
   - 增加 `if (network === 'xhttp' && proxy['xhttp-opts'])` 分支：
     `{ type: 'xhttp', path: proxy['xhttp-opts'].path, host: proxy['xhttp-opts'].host, mode: proxy['xhttp-opts'].mode }`

4. **mihomo.ts** vless 分支
   - 增加 `if (node.transport?.type === 'xhttp')`：
     ```ts
     base.network = 'xhttp';
     base['xhttp-opts'] = {
       path: node.transport.path,
       host: node.transport.host,
       mode: node.transport.mode,   // 可选，省略则用默认 auto
     };
     ```
   - 注意：xhttp 与 TLS/Reality/SNI 的既有逻辑（行 152-184）继续生效，不冲突。
   - 覆盖 Clash / Stash / OpenClash（三者共用 Mihomo 生成器，均 clash-meta 兼容）。

5. **node-to-url.ts** vless 回写
   - 增加 xhttp 分支：`params.set('type','xhttp')` + path/host/mode，保证订阅往返保真。

## 范围边界（本次不做）

- 其他客户端生成器（sing-box / Surge / Loon / QX / Shadowrocket）的 xhttp 支持：
  这些客户端的 xhttp 能力各异（sing-box 核心无 xhttp；其余需逐客户端核实），
  非本次 OpenClash 不通的根因。**本次只覆盖 Mihomo 系**。其他生成器对 xhttp
  节点暂维持现状（不崩溃，但可能不通），后续按需单独立项核实官方格式。
- xhttp-opts 高级字段（x-padding / session / reuse 等）暂不实现，订阅链接一般不携带。

## 验收

- 单元测试：构造 `vless://uuid@host:443?security=tls&type=xhttp&path=/&host=x.com&mode=stream-one#n`
  经 parse → generate(mihomo) 应产出含 `network: xhttp` + `xhttp-opts: {path,host,mode}` 的 YAML。
- 集成测试：xhttp 节点不被误判为 tcp/ws。
- Bob 实测：OpenClash 加载生成配置后，xhttp 节点可正常连通。
