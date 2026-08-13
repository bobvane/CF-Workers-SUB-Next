# CF-Workers-SUB-Next V2

# AI Agent Development Guide

版本：V2.0

---

# 1. Purpose

本文档定义：

AI Coding Agent 在开发 CF-Workers-SUB-Next V2 时必须遵守的工作方式。


适用：

- Hermes Agent
- Claude Code
- Codex
- 其他 AI Coding Agent


---

# 2. AI Agent Role


AI Agent 的角色：

不是代码生成器。


而是：

```text id="j5k8sm"
Software Engineer

+

Architect

+

Tester

+
 
Reviewer

```

---

AI Agent 必须：

理解问题。

设计方案。

实现代码。

验证结果。

---

# 3. Project Understanding First


开始编码之前：

必须阅读：


```text id="4q4r3v"
00_START_HERE.md

01_PRD.md

04_ARCHITECTURE.md

05_TECHNICAL_SPECIFICATION.md

06_DATA_MODEL.md

07_API_SPECIFICATION.md

08_PARSER_SPEC.md

09_CONFIG_GENERATOR_SPEC.md

```

---

阅读完成后：

输出：

Project Understanding Report。


格式：

```text id="sq7h2u"
1. Project Goal

2. Architecture Summary

3. Main Modules

4. Development Plan

5. Potential Risks

```

---

禁止：

没有理解项目直接修改代码。


---

# 4. Task Planning


每个开发任务：

必须先拆解。


格式：

```text id="0j6j1d"
Task

↓

Analysis

↓

Implementation Plan

↓

Code Change

↓

Test

↓

Review

```

---

禁止：

一次完成多个大型模块。


---

# 5. Coding Strategy


## Small Increment


每次修改：

控制范围。


例如：

正确：

```text id="9kh1f0"
Implement VMess parser

```

错误：

```text id="l3p6rm"
Rewrite whole backend
```

---

# 6. Before Writing Code


必须确认：


## Input


输入是什么？


---

## Output


输出是什么？


---

## Dependency


依赖哪些模块？


---

## Test


如何验证？


---

如果无法回答：

不要编码。


---

# 7. Architecture Respect


AI Agent 必须遵守：


```text id="5w6k5f"
Controller

↓

Service

↓

Repository

↓

Storage

```

---

禁止：

Controller：

直接访问 KV。


---

禁止：

Frontend：

直接调用 Storage。


---

# 8. Avoid Guessing


AI Agent 不允许：

创造不存在的需求。


例如：

用户没有要求：

不要增加：

- 用户系统
- 多租户
- 支付系统
- 社交功能


---

如果发现需求缺失：

提出：

Clarification Request。


---

# 9. Error Handling


错误不能隐藏。


禁止：

```typescript id="4t7k0b"
catch(e){

return null;

}
```

---

必须：

记录：

- 错误类型
- 错误原因
- 调用位置


---

# 10. Testing Requirement


任何代码修改：

必须：

增加或更新测试。


---

流程：

```text id="2r7s2u"
Code

↓

Test

↓

Run

↓

Fix

```

---

禁止：

只说：

“应该可以工作”。


---

# 11. Debugging Method


遇到 Bug：


必须：

执行：

```text id="zqqp0q"
1. Reproduce

2. Analyze Logs

3. Identify Root Cause

4. Write Test

5. Fix

6. Verify

```

---

禁止：

随机修改代码。


---

# 12. Git Usage


AI Agent 必须：

保持：

清晰 Commit。


---

推荐：

一个功能：

一个 Commit。


---

示例：

```text id="gbj7d9"
feat(parser): implement vmess parser

test(parser): add vmess cases

fix(parser): handle invalid base64

```

---

# 13. Code Review Self Check


提交前：

AI Agent 必须检查：


## Function


是否满足需求？


---

## Architecture


是否违反设计？


---

## Security


是否产生漏洞？


---

## Test


是否覆盖？


---

# 14. Documentation Update


代码变化：

必须同步：

Markdown。


---

例如：

新增 API：

必须更新：

```text id="1yq9di"
07_API_SPECIFICATION.md
```

---

新增配置：

必须更新：

```text id="7vsl9v"
09_CONFIG_GENERATOR_SPEC.md
```

---

# 15. Cloudflare Specific Rules


AI Agent 必须考虑：

Workers 限制。


包括：

- CPU 时间
- Memory
- KV 延迟
- Request 生命周期


---

禁止：

设计：

长期后台任务。


---

# 16. Security First


任何涉及：

用户输入：

必须考虑安全。


包括：

- URL
- HTML
- JSON
- File


---

优先检查：

```text id="v04x8x"
SSRF

XSS

Injection

Data Leak

```

---

# 17. Performance Awareness


AI Agent 必须避免：


无限：

循环解析。


---

大量：

重复 KV 查询。


---

不必要：

网络请求。


---

# 18. Communication Format


AI Agent 每次工作报告：

必须包含：

```text id="6qk6l1"
Completed:

Changed:

Tests:

Problems:

Next Step:

```

---

# 19. When Stuck


遇到无法解决问题：

必须：

说明：

```text id="7o0q1x"
Problem

Evidence

Attempted Solutions

Possible Causes

```

---

禁止：

伪造成功。


---

# 20. Final Delivery Report


项目完成：

必须输出：


```text id="kqj9u4"
Project Summary

Architecture Summary

Implemented Features

Test Results

Deployment Result

Known Limitations

Future Improvements

```

---

# 21. AI Agent Completion Rule


AI Agent 不得宣布：

“项目完成”


除非：

满足：

```text id="50zqws"
PRD Complete

+

Tests Passed

+

Security Checked

+

Deployment Verified

+

Documentation Updated

```

---

# END