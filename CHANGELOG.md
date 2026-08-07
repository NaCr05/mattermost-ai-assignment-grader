# Changelog

本项目的重要变化记录在此。正式版本遵循语义化版本规则。

## [Unreleased]

维护模式下没有计划中的功能变更。

## [0.2.0] - 2026-08-07

### Added

- 增加无默认凭据的交互式首位管理员初始化脚本及首次登录验证；
- 增加本地启动、生产部署、Mattermost、架构、Agent、项目回顾和接手指南；
- 增加使用匿名合成内容的教师工作台和 EvaluationAudit 截图；
- 增加 Linux 原子备份、checksum、失败 webhook、systemd timer 和恢复演练脚本；
- 增加 GHCR 发布 workflow，为 Backend、Agent、Frontend 和 Caddy 生成 digest、provenance、SPDX SBOM 与校验和；
- 增加只接受 Git 跟踪目标的 Markdown 链接门禁。

### Changed

- README 改为简洁的产品入口和文档路由，删除仅存在于本地的演示链接；
- 产品范围冻结为 Mattermost 发布/提交与 Web 教师工作台，项目进入安全维护模式；
- 拆分前端会话路由、教师工作区、学生提示页、审核队列、提交卡片和样式职责；
- 生产 Compose 改为消费 Release 的不可变镜像，不再在服务器上现场构建；
- 生产服务增加 `unless-stopped` 自动重启和有界 JSON 日志轮转；
- 基础镜像按 OCI digest 固定；
- Dependabot 停止常规版本升级 PR，保留安全告警与安全更新。

### Security

- 明确只有 Mock 模式具有发布门禁证据；DeepSeek adapter 因没有付费验收凭据，仅作为未验证的尽力支持能力；
- 明确 `0.1.x` 停止支持，最新 `0.2.x` 只评估严重安全、数据完整性和发布阻塞问题；
- 正式镜像提供 SBOM、不可变 digest 和 `SHA256SUMS`，生产部署必须校验 Release 资产。

## [0.1.1] - 2026-08-06

### Added

- 真实 Chromium 开发前端 smoke，并纳入统一验证入口；
- Evaluation 确认、失败与并发重评的状态表征测试。

### Changed

- 修复非 root 开发容器中 Vite 缓存目录不可写导致的空白页；
- 确认、修改和重评统一使用状态与版本条件原子竞争，Mattermost 交互签名绑定 Evaluation 版本；
- Assignment、Submission、Evaluation 与 Audit 响应改为显式公开字段投影；
- 修正页面语言、标题、描述、主题色和站点图标；
- 同步 README 与验证记录中的自动测试数字。

### Security

- 未声明的新数据库字段默认不会进入公开 DTO 或历史审计快照；
- 并发重评只有一个请求能取得 Agent 调用权，失败终态会推进版本并使旧写入失效。

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
