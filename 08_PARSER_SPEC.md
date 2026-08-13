# CF-Workers-SUB-Next V2

# Parser Engine Specification

版本：V2.0

---

# 1. Parser Engine 目标

Parser Engine 负责：

将各种代理订阅格式转换为系统统一节点模型。

输入：

```text
Subscription Content
```

输出：

```text
Normalized Node[]
```

---

# 2. Parser 职责边界

Parser 负责：

✅ 协议识别

✅ URL 解码

✅ Base64 解码

✅ 协议字段解析

✅ 原始节点转换


---

Parser 不负责：

❌ 节点测速

❌ 节点质量判断

❌ 国家定位

❌ 节点过滤

❌ 配置生成


这些属于其他模块。

---

# 3. Parser Pipeline


完整流程：

```text
Subscription Content

        |
        v

Content Decoder

        |
        v

Protocol Detector

        |
        v

Protocol Parser

        |
        v

Raw Node

        |
        v

Normalizer

        |
        v

Node Model
```

---

# 4. Parser 模块结构


目录：

```text
src/parser/


├── index.ts


├── detector.ts


├── decoder.ts


├── vmess.parser.ts


├── vless.parser.ts


├── trojan.parser.ts


└── shadowsocks.parser.ts

```

---

# 5. Parser Interface


所有 Parser 必须实现：

```typescript
interface Parser {


protocol:string;


canParse(input:string):boolean;


parse(input:string):ParserResult;


}
```

---

# 6. ParserResult


统一返回：

```typescript
interface ParserResult {


success:boolean;


node?:Node;


error?:ParserError;


}
```

---

# 7. Protocol Detector


职责：

判断输入协议。


输入：

例如：

```text
vmess://xxxx

vless://xxxx

trojan://xxxx

ss://xxxx
```


输出：

```text
vmess

vless

trojan

ss
```

---

Detector 不解析字段。


---

# 8. 支持协议范围


## V1 必须支持


|协议|状态|
|-|-|
|VMess|必须|
|VLESS|必须|
|Trojan|必须|
|Shadowsocks|必须|


---

## V2 扩展


|协议|
|-|
|Hysteria2|
|TUIC|


---

# 9. VMess Parser


输入：

```text
vmess://base64
```


---

解析步骤：

```text
Base64 Decode

↓

JSON Parse

↓

Field Mapping

↓

Node Output
```

---

必须支持字段：

```json
{
"add":"",
"port":"",
"id":"",
"aid":"",
"net":"",
"path":"",
"tls":"",
"host":""
}
```

---

字段映射：


|VMess字段|Node字段|
|-|-|
|add|server|
|port|port|
|id|uuid|
|net|transport|
|tls|tls|
|host|metadata.host|
|path|transport.path|

---

异常：

缺少：

- server
- port
- id

必须失败。

---

# 10. VLESS Parser


输入：

```text
vless://uuid@server:port
```


---

必须支持：


## 基础

- UUID
- Server
- Port


---

## TLS


支持：

- security=tls


---

## Reality


支持：

- flow
- pbk
- sid
- sni


---

## Transport


支持：

- tcp
- ws
- grpc


---

字段：

```text
uuid

server

port

tls

transport

metadata
```

---

# 11. Trojan Parser


输入：

```text
trojan://password@server:port
```


---

必须解析：

- password
- server
- port


---

支持：

TLS 参数：

- sni
- allowInsecure


---

缺少：

password

必须失败。

---

# 12. Shadowsocks Parser


输入：

```text
ss://
```


---

支持：

加密方式：

```text
method
```

密码：

```text
password
```

服务器：

```text
server
```

端口：

```text
port
```

---

支持：

plugin 参数。

例如：

```text
plugin=v2ray-plugin
```

---

# 13. Base64 Decoder


必须支持：

标准 Base64：

```text
AAAA
```


URL Safe Base64：

```text
AAAA-_==
```


---

处理：

自动补齐：

padding。


---

失败：

返回：

DecoderError。


---

# 14. URL Decode


所有 URL：

必须：

第一步：

URL Decode。


例如：

```text
%3A
```

转换：

```text
:
```

---

# 15. Node Name 处理


节点名称来源：

优先：

```text
remarks
```

其次：

```text
name
```

最后：

```text
server
```


---

禁止：

自动大量修改名称。

---

允许：

基础清理：

删除：

- 控制字符
- 空白字符


---

# 16. Normalization


Parser 输出后：

必须经过：

Normalizer。


目的：

统一不同协议。


---

例如：

VMess:

```text
add
```

VLESS:

```text
server
```

最终：

```text
Node.server
```

---

# 17. Parser 错误规范


统一错误：


```typescript
enum ParserErrorCode {


INVALID_FORMAT,


UNSUPPORTED_PROTOCOL,


INVALID_FIELD,


DECODE_FAILED,


MISSING_REQUIRED_FIELD


}
```

---

# 18. Parser 安全要求


必须防止：

## 超大输入

限制：

订阅大小。


---

## 恶意 Base64

必须：

try/catch。


---

## 无限解析

禁止：

递归无界解析。


---

# 19. 测试要求


每个 Parser：

必须测试：

---

## 正常案例

例如：

有效节点。


---

## 边界案例

例如：

缺字段。


---

## 错误案例

例如：

非法 URL。


---

最低：

每协议：

10 个测试。


---

# 20. Parser 扩展规则


新增协议：

必须：

创建：

```text
xxx.parser.ts
```

并提交：

- Parser
- Tests
- Documentation


---

禁止：

修改已有 Parser：

影响其他协议。


---

# 21. Parser 完成标准


Parser 模块完成：

必须满足：

```text
代码完成

+

测试通过

+

支持协议验证

+

错误处理完整

+

文档更新

```

---

# END