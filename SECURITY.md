# Security Policy

## 报告安全漏洞

请 **不要** 公开报告安全漏洞。请通过以下方式私下报告：

- 创建 **Security Advisory**（仓库 → Security → Report a vulnerability）
- 或发邮件到仓库维护者

## 安全响应

我们会：
1. 确认收到报告（48 小时内）
2. 评估漏洞影响
3. 发布修复版本
4. 修复后公开披露

## 安全设计

本项目遵循以下安全实践：

- **SSRF 防护**：所有订阅 URL 经过校验，拒绝内网/私有 IP 访问
- **密码安全**：PBKDF2-SHA256 哈希，绝不存明文
- **Session 安全**：HttpOnly + Secure + SameSite=Strict Cookie
- **XSS 防护**：前端所有用户输入转义
- **速率限制**：登录接口限流防暴力破解
- **Secrets**：敏感信息只存 Cloudflare Secrets，代码零硬编码

## 支持版本

| 版本 | 支持状态 |
|------|----------|
| 0.1.x | ✅ 支持 |
| 更早版本 | ❌ 不支持 |