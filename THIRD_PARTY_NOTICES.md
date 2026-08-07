# 第三方软件与素材

本项目依赖的第三方软件及版本以以下机器可读清单为准：

- `backend/package-lock.json`
- `frontend/package-lock.json`
- `agent/requirements.txt`
- Dockerfile 与 Compose 中按 digest 固定的基础镜像

每个依赖仍受其自身许可证约束。Dependabot、`npm audit`、`pip-audit` 和仓库 Security workflow 用于持续发现依赖风险；发布者仍应在发布镜像前复核依赖许可证和镜像扫描结果。

仓库当前没有捆绑第三方图片、字体或课程数据集作为产品素材。`assets/readme/` 中的两张界面截图由本项目使用匿名合成数据生成，属于第一方项目说明素材；课程名单、学生提交和本地验收数据不得进入公开发布内容。

`v0.2.0` Release 为每个应用镜像提供 SPDX JSON SBOM、不可变镜像 digest 和 `SHA256SUMS`。这些清单是发布时依赖事实的补充证据，不替代上游组件许可证。
