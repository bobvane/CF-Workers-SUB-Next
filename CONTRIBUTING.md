# Contributing

欢迎对 CF-Workers-SUB-Next 做出贡献！无论是修复 Bug、添加功能还是改进文档。

## 开发流程

1. **Fork** 仓库并创建你的分支：`git checkout -b feature/xxx`
2. **开发**：小步提交，每个功能一个 commit
3. **测试**：确保新增代码有测试，`npm test` 全部通过
4. **构建**：`npm run build` 类型检查通过
5. **提交**：使用 Conventional Commit 格式
6. **Push** 并创建 Pull Request

## Commit 规范

```
type(scope): subject
```

例如：

```
feat(parser): add hysteria2 parser
fix(api): handle invalid request body
test(generator): add yaml validation
docs: update deployment guide
```

## 测试要求

所有新增功能必须有对应测试，至少覆盖：
- 正常流程
- 异常流程
- 边界情况

运行：`npm test`

## 代码规范

- TypeScript strict mode
- 模块化，禁止巨型单文件
- 禁止硬编码敏感信息
- 遵循架构分层（API → Service → Repository → Storage）