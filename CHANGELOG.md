# Changelog

本项目的重要变化记录在此。正式版本遵循语义化版本规则。

## [Unreleased]

## [0.1.0] - 2026-08-05

### Added

- 平台账号、HttpOnly 会话、CSRF 与教师/学生授权；
- 登录与 Bootstrap 限速、全会话撤销；
- Grading Module、Agent seam 和公开 DTO 脱敏；
- Agent 请求关联、结构化日志、Prometheus 指标、Token 与可配置成本估算；
- 独立的开发/生产 Compose、migration-only 启动和非 root 容器；
- 统一验证脚本、CI、历史密钥扫描、依赖与配置扫描；
- ISC License、贡献指南和安全报告流程。
- 单机 Compose 的非 root Caddy 自动 HTTPS 入口、整体 readiness 和备份/恢复演练；
- 管理员密码重置、账号禁用、旧会话撤销和持久化认证审计；
- Evaluation 模型/Prompt/Token/耗时/成本元数据与手动付费模型评测 workflow；

### Changed

- Backend 生产环境改为预构建 Node bundle；
- Frontend 生产环境改为 Nginx 静态托管；
- Frontend Review Workspace interface 收敛为五个职责分组；
- FastAPI/Uvicorn 依赖链升级，移除旧 Starlette 漏洞；
- Pascal 专项执行默认关闭。
- 生产模式改为仅由 Caddy 发布 HTTP/HTTPS，Nginx、Backend、Agent 和数据库保持内部访问；

### Security

- 客户端传入的用户 ID 不再作为身份依据；
- Agent 原始输出不再进入公开读取 DTO；
- 生产模式仅发布 Frontend 端口；
- Docker 构建上下文排除 `.env*`。
- `main` 要求 PR、CI/Security 状态检查和线性历史，并禁止强推或删除；
- Dependabot 漏洞告警和自动安全更新启用，生产 Node 镜像保持 Node 24 LTS。
