# CF-Workers-SUB-Next V2

# Config Generator Specification

版本：V2.0

---

# 1. Generator Engine 目标

Config Generator 负责：

将系统内部统一 Node 模型转换为不同客户端配置格式。

输入：

```text id="8x8c3t"
Normalized Node[]
```

输出：

```text id="rm9x1p"
Client Configuration
```

---

# 2. Generator 职责边界

Generator 负责：

✅ 节点转换

✅ 配置模板渲染

✅ 输出格式生成

✅ 配置结构验证


---

Generator 不负责：

❌ 节点解析

❌ 节点抓取

❌ 节点测速

❌ 节点过滤


---

# 3. Generator Pipeline


流程：

```text id="q5z5zr"
Normalized Node

        |

        v

Generator Adapter

        |

        v

Template Renderer

        |

        v

Config Validator

        |

        v

Final Output

```

---

# 4. Generator 架构


目录：

```text id="vm7l5w"
src/generator/


├── index.ts


├── mihomo/

│   ├── generator.ts

│   ├── template.ts

│   └── validator.ts


└── singbox/

    ├── generator.ts

    ├── template.ts

    └── validator.ts

```

---

# 5. Generator Interface


所有 Generator：

必须实现：

```typescript id="w7udgj"
interface ConfigGenerator {


format:string;


generate(nodes:Node[]):string;


validate(output:string):ValidationResult;


}
```

---

# 6. 支持输出格式


V1 必须支持：

|格式|输出|
|-|-|
|Mihomo|YAML|
|Sing-box|JSON|


---

# 7. Mihomo Generator Specification


## 7.1 输出目标


兼容：

- Mihomo
- Clash Meta
- OpenClash


---

## 7.2 输出结构


标准：

```yaml id="hx6w5b"
mixed-port: 7890

allow-lan: false

mode: rule

proxies:

proxy-groups:

rules:
```

---

# 7.3 安全默认值


必须：

默认：

```yaml id="rcxk7f"
allow-lan: false
```

---

禁止：

默认：

```yaml id="x7w5x1"
allow-lan: true
```

---

禁止：

默认开放：

```yaml id="vazgqj"
external-controller: 0.0.0.0
```

---

# 7.4 Proxy 映射


Node：

转换为：

Mihomo Proxy。


---

示例：

VLESS：

```yaml id="s1cz5c"
- name: node-name

  type: vless

  server: example.com

  port: 443

  uuid: xxx

  tls: true
```

---

# 7.5 Proxy Group


默认生成：

## 节点选择组


```yaml id="xw6d5s"
proxy-groups:

- name: PROXY

  type: select

  proxies:

```

---

## 自动选择


可选：

```yaml id="8p3r4p"
url-test
```

---

注意：

V1 不执行真实测速。

因此：

默认不生成：

url-test


---

# 7.6 Rule


默认：

生成基础规则。


例如：

```yaml id="rf0j2a"
rules:

- MATCH,PROXY
```

---

高级规则：

后续 Rule Engine 提供。


---

# 8. Sing-box Generator Specification


## 8.1 输出目标


生成：

Sing-box JSON。


---

# 8.2 基础结构


包含：

```json id="h5q2um"
{
"log": {},
"outbounds": [],
"route": {}
}
```

---

# 8.3 Outbound 映射


Node:

转换为：

Sing-box outbound。


---

VLESS 示例：

```json id="i6d4ws"
{
"type":"vless",

"server":"example.com",

"server_port":443,

"uuid":"xxx"
}
```

---

# 9. Template System


Generator 必须支持模板。


原因：

未来：

用户自定义输出。


---

结构：

```text id="9e4o3b"
templates/

mihomo/

default.yaml


singbox/

default.json
```

---

# 10. Template 原则


模板：

只负责：

结构。


代码：

负责：

数据。


---

禁止：

大量：

字符串拼接。


错误：

```typescript
output += "proxy..."
```

---

正确：

对象模型：

↓

Serializer

↓

Output


---

# 11. 输出订阅模式


支持：

## Mihomo Subscription


路径：

```text id="5gq6gm"
/sub/mihomo/{token}
```


Content-Type:

```text id="49n4vl"
text/yaml
```

---

## Sing-box Subscription


路径：

```text id="m7pxhg"
/sub/singbox/{token}
```


Content-Type:

```text id="0jtyh8"
application/json
```

---

# 12. Config Validation


生成后：

必须验证。


---

Mihomo:

检查：

- YAML 可解析
- proxies 存在
- proxy-groups 存在


---

Sing-box:

检查：

- JSON 合法
- outbounds 存在


---

# 13. 空节点处理


如果：

Node[]:

为空。


必须：

返回：

明确错误。


禁止：

生成空配置。


---

错误：

```json id="7w2v7d"
{
"error":"NO_NODES"
}
```

---

# 14. 节点名称处理


Generator 不修改名称。


名称处理：

属于 Normalizer。


---

# 15. Generator 测试要求


必须包含：

## Mihomo

测试：

- 单节点
- 多节点
- 不同协议


---

## Sing-box

测试：

- JSON 合法性
- 字段完整性


---

# 16. 兼容性测试


必须使用：

真实客户端验证。


最低：

Mihomo:

- 配置加载成功


Sing-box:

- 配置检查通过


---

# 17. 安全要求


禁止：

输出：

- 管理密码
- Session Token
- Secret


---

# 18. Generator 扩展规则


新增格式：

必须：

创建：

```text
generator/new-format/
```

包含：

- Generator
- Template
- Validator
- Tests


---

# 19. 完成标准


Generator 完成：

必须：

```text id="2x2qwf"
支持目标格式

+

自动测试通过

+

真实客户端验证

+

错误处理完整

+

文档更新
```

---

# END