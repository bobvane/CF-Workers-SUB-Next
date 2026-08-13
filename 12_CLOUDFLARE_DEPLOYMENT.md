# CF-Workers-SUB-Next V2

# Cloudflare Deployment Specification

版本：V2.0

---

# 1. 部署目标

本项目运行环境：

必须：

Cloudflare Workers


---

支持：

- Cloudflare KV
- Cloudflare Secrets
- Cloudflare Dashboard
- Wrangler CLI


---

禁止：

- VPS 部署
- Docker 部署
- Node.js Server
- 独立后端


---

# 2. 部署架构


生产架构：

```text id="y4k8rv"
User Browser

      |

      v

Cloudflare Worker

      |

      +------------+

      |            |

      v            v

Cloudflare KV   External Subscription

```

---

# 3. 环境划分


项目包含：

两个环境。


---

# Development


用途：

本地开发。


特点：

- 本地 Wrangler
- 测试 KV


---

# Production


用途：

真实用户使用。


特点：

- Cloudflare Workers
- 正式 KV
- Secrets


---

# 4. 必需工具


开发者需要：

## Node.js


推荐：

LTS


---

## npm


用于：

依赖管理。


---

## Wrangler


Cloudflare 官方 CLI。


安装：

```bash
npm install -g wrangler
```

---

登录：

```bash
wrangler login
```

---

# 5. 项目初始化


安装依赖：

```bash
npm install
```


---

本地启动：

```bash
npm run dev
```

---

生产构建：

```bash
npm run build
```

---

# 6. Wrangler 配置


文件：

```text id="yw4ezl"
wrangler.toml
```


---

基础：

```toml
name = "cf-workers-sub-next"

main = "src/index.ts"

compatibility_date = "2026-01-01"
```

---

# 7. KV 配置


创建 KV：

```bash
wrangler kv namespace create DATABASE
```

---

生成：

```text id="8u5j0y"
namespace id
```


---

绑定：

```toml
[[kv_namespaces]]

binding="DATABASE"

id="xxxxxxxx"
```

---

# 8. Secrets 配置


禁止：

写入：

wrangler.toml


---

使用：

```bash
wrangler secret put SECRET_NAME
```

---

必须配置：


## ADMIN_PASSWORD


管理员密码。


---

## SESSION_SECRET


Session 加密。


---

查看：

```bash
wrangler secret list
```

---

# 9. 本地环境变量


本地：

允许：

```text id="09x6j1"
.dev.vars
```


示例：

```text
ADMIN_PASSWORD=test

SESSION_SECRET=test-secret
```


---

禁止提交：

```text
.dev.vars
```

---

# 10. 本地开发流程


流程：


```text id="zq0q3q"
Clone Repository

        |

npm install

        |

Configure dev vars

        |

wrangler dev

        |

Browser Test

```

---

# 11. Production 发布流程


流程：

```text id="x7a7s3"
Code Commit

        |

GitHub Push

        |

CI Test

        |

Build

        |

Deploy Worker

        |

Production Verification

```

---

# 12. Wrangler Scripts


package.json：

必须包含：

```json id="9b2kwb"
{

"scripts":{

"dev":"wrangler dev",

"build":"tsc",

"deploy":"wrangler deploy",

"test":"vitest"

}

}
```

---

# 13. GitHub Actions


目录：

```text id="m5m6jz"
.github/workflows/
```

---

文件：

```text id="i7l5hl"
deploy.yml
```

---

流程：

```text id="jvx4jd"
Checkout

↓

Setup Node

↓

npm install

↓

npm test

↓

npm run build

↓

wrangler deploy
```

---

# 14. Cloudflare Domain


支持：

默认：

```text
workers.dev
```


---

可选：

自定义域名。


例如：

```text
sub.example.com
```

---

# 15. Deployment Verification


部署后：

必须检查：

---

## Worker


访问：

```text
/
```


返回：

正常页面。


---

## Health


访问：

```text
/api/health
```


返回：

```json
{
"status":"ok"
}
```

---

## Authentication


测试：

登录。


---

## KV


测试：

创建订阅。


---

# 16. Rollback


如果部署失败：

使用：

Cloudflare Version Rollback。


---

原则：

保留：

最近稳定版本。


---

# 17. Migration


数据变化：

必须：

先迁移。

再发布。


流程：

```text id="3o1zzb"
Backup KV

↓

Run Migration

↓

Deploy New Code

↓

Verify

```

---

# 18. Backup Strategy


KV：

重要版本：

定期导出。


---

至少：

发布前备份。


---

# 19. Monitoring


生产环境：

关注：

- Worker Errors
- Request Count
- CPU Time
- KV Errors


---

# 20. Deployment Security


生产部署：

必须：

使用：

GitHub Secrets。


---

禁止：

提交：

- API Token
- Account ID
- Secrets


---

# 21. 完成标准


部署系统完成：

必须：

```text id="p5yw8h"
[ ] Wrangler 可运行

[ ] KV 可读写

[ ] Secrets 正常

[ ] Worker 可访问

[ ] API 正常

[ ] 自动部署成功

```

---

# END