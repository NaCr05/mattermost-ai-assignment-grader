# 贡献指南

感谢参与 mattermost-ai-assignment-grader。提交贡献即表示你同意相关代码以仓库的 ISC License 发布。

本项目自 `v0.2.0` 起处于维护模式。除严重安全、数据完整性和发布阻塞问题外，不计划接受功能扩展或常规依赖追新；开始较大工作前请先确认维护者已经重新开放对应范围。

## 开始之前

1. 从 `main` 创建短生命周期分支；
2. 不要提交 `.env`、Token、真实用户信息、课程名单、学生答案或内部地址；
3. 不要修改或整理 Seed、课程数据集和本地验收数据，除非维护者明确批准该数据批次；
4. 公共 DTO、数据库 Schema、Mattermost 命令和评分行为发生变化时，必须在 PR 中明确说明兼容性影响。

## 本地开发

```powershell
Copy-Item .env.example .env
.\scripts\start-demo.ps1
```

默认启动只部署 migration，不运行 Seed。开发者如确需本地测试数据，可显式运行：

```powershell
docker compose exec backend npm run prisma:seed
```

## 提交前验证

Docker Desktop 可用时，在仓库根目录运行统一门禁：

```powershell
.\scripts\verify.ps1
```

该脚本使用独立 Compose 项目和临时命名卷，验证 Backend、Frontend、Agent、migration-only 启动、生产端口和非 root 身份，完成后自动清理测试资源。

文档改动必须通过受 Git 跟踪的链接检查；它已经包含在统一门禁中，也可以单独运行 `./scripts/check-doc-links.ps1`。

如仅调试某个模块，可以先运行对应的局部测试，但 PR 合并前仍需通过统一门禁。

## Pull Request 要求

- 描述问题、解决方案和行为保持要求；
- 列出实际运行的验证命令及结果；
- 新功能同时覆盖正常、边界和失败路径；
- 评分 Module 的测试应穿过其 interface，不依赖内部实现；
- UI 变更说明键盘操作、窄屏和错误/空状态影响；
- 不在截图、日志或测试输出中暴露真实用户数据。

安全问题不要提交公开 Issue，请遵循 [SECURITY.md](SECURITY.md)。
