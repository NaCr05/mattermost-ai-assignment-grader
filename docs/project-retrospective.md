# 项目回顾：Mattermost AI Assignment Grader

## 项目目标与最终结果

项目目标是为课程团队提供一个可自行部署的 AI 辅助作业评估平台，把学生提交、结构化初评、教师复核和审计记录连接成可追踪流程。最终交付范围冻结为：Mattermost 负责作业发布和学生提交，Web 负责教师审核与账号管理，Backend 维护评分和身份状态，Agent 提供 Mock 及可选在线模型 adapter，PostgreSQL 保存业务与审计数据。

已交付的主要结果：

- 教师可以发布、汇总、确认、修改和重新评估作业；
- 学生可以通过 Mattermost 提交答案；
- 评估状态、版本竞争和历史审计具有数据库级约束与测试；
- Web 身份来自服务端会话，包含 CSRF、登录限速和会话撤销；
- 单机 Compose 提供 HTTPS、私有内部端口、migration-only 启动和非 root 容器；
- 统一验证覆盖 Backend、Frontend、Agent、浏览器、生产拓扑和备份恢复；
- `v0.2.0` 通过 digest 镜像、SBOM 和校验和形成不可变发布物。

完整学生 Web 流程、教师 Web 发布、多节点部署和不可信代码安全执行已明确延期，不属于 `v0.2.0` 成功标准。产品范围以 [README](../README.md) 为准，安全边界以 [CAPABILITY_BOUNDARIES](../CAPABILITY_BOUNDARIES.md) 为准。

## 关键技术决策

### 冻结 Mattermost 与 Web 的当前职责

- 背景：Mattermost 工作流已经可用，而完整 Web 学生端仍只是入口提示。
- 决策：维护版本保留 Mattermost 发布/提交和 Web 教师审核，不把未实现的 Web 自助流程作为当前能力。
- 备选：继续开发完整独立 Web 平台。
- 原因：继续开发会扩大产品、权限和测试范围，不符合封版目标。
- 结果：部署者必须把 Mattermost 视为当前核心工作流的一部分。

### 用 Grading Module 统一业务状态

- 背景：HTTP、Mattermost、首次评估和重评如果各自维护规则，容易出现状态漂移。
- 决策：由 `backend/src/grading/` 统一评估状态、乐观锁、Agent 调用权和审计追加。
- 备选：在每个 adapter 中直接操作 Prisma。
- 原因：深模块 interface 让协议 adapter 复用同一行为契约，也让并发失败路径可测试。
- 结果：公开路由和 DTO 保持稳定，内部状态竞争集中验证。详见 [架构说明](architecture.md)。

### 服务端会话是 Web 身份权威

- 背景：客户端提交用户 ID 不能作为授权依据。
- 决策：使用 HttpOnly 会话 Cookie、CSRF Token、数据库会话版本和服务端角色/归属检查。
- 备选：继续接受客户端身份字段或使用无状态长生命周期 Token。
- 原因：当前是单 Backend Compose，持久化会话版本可以可靠撤销旧 Cookie。
- 结果：扩展到多实例前仍需重新设计共享限速和部署策略。

### 默认禁止 Pascal 执行

- 背景：仓库内执行器不具备文件系统、网络、内存和进程级沙箱。
- 决策：`ENABLE_PASCAL_EXECUTION=false` 是开发和生产默认值，公开部署不得开启。
- 备选：把受限子进程描述成生产沙箱。
- 原因：当前隔离强度不足以处理不可信代码。
- 结果：系统可以评估文本和代码说明，但不承诺编译或执行正确性。

### 发布镜像与源码构建分离

- 背景：生产服务器现场构建和浮动基础镜像无法重现已验证版本。
- 决策：开发 Compose 从源码构建；Release workflow 发布 `linux/amd64` GHCR 镜像、digest、SBOM、provenance 和校验和；生产 Compose 必须加载 `release-images.env`。
- 备选：继续在生产服务器执行 `--build`。
- 原因：不可变发布物能把运行内容绑定到版本证据，并减少停更后的构建漂移。
- 结果：其他 CPU 架构不在当前支持范围内。

## 做得好的部分

- 表征测试先固定行为，再提取 Grading Module、Agent seam 和 Frontend Workspace，降低了整理过程中的行为漂移。
- `scripts/verify.ps1` 把模块测试、真实 Chromium、空库 migration、生产端口、非 root、依赖审计和恢复演练收敛为单一门禁。
- 公开 DTO 使用显式允许字段投影；模型原始输出、Token、成本和未来私有字段不会自动泄露。
- Evaluation 版本竞争和并发重评通过数据库条件更新表达，避免只依赖进程内锁。
- Seed、课程数据集和本地演示输入始终与通用开源平台边界分离。
- GitHub 分支保护、历史密钥扫描、依赖/配置扫描和私密安全报告形成了发布反馈闭环。

## 问题、原因与解决方案

### 评分职责曾分散在协议入口

- 现象与影响：Web 和 Mattermost 容易形成不同的提交、评估和审核规则。
- 原因：早期以路由为中心实现功能，缺少稳定业务 interface。
- 解决：提取 Grading Module，并让 HTTP 与 Mattermost adapters 共同调用。
- 验证：Backend 单元、API、状态和 DTO 测试穿过模块边界。
- 状态：已解决。

### 前端入口和工作区职责过大

- 现象与影响：会话、角色路由、队列、审核卡片和样式集中，空白页与陈旧请求更难定位。
- 原因：原型阶段优先完成单页主流程。
- 解决：拆分 Login、Teacher Workspace、Student 提示页、Review Queue、Submission Card 和 `useReviewWorkspace` interface。
- 验证：Vitest 状态测试与真实 Chromium smoke。
- 状态：已解决；完整学生 Web 产品功能已延期。

### 评估生命周期存在并发覆盖风险

- 现象与影响：两个教师或两个重评请求可能覆盖同一旧版本，失败状态也可能不一致。
- 原因：状态与版本条件未在同一数据库竞争中表达。
- 解决：确认、修改、重评和失败终态统一推进版本；只有一个并发请求取得 Agent 调用权。
- 验证：`backend/tests/grading-state.test.ts` 和 DTO/API 测试。
- 状态：已解决。

### 生产启动缺少长期无人值守边界

- 现象与影响：容器异常后不会自动恢复，日志可无限增长，Linux 服务器没有定时备份和恢复演练入口。
- 原因：最初部署流程集中验证一次性启动。
- 解决：增加 `unless-stopped`、日志轮转、systemd timer、原子备份、checksum、失败 webhook 和 Bash 恢复演练。
- 验证：Compose 配置、容器运行策略检查和 Linux CI 恢复演练。
- 状态：已解决；外部健康监控与异机备份仍由部署者配置。

### 在线模型能力缺少真实验收凭据

- 现象与影响：adapter 存在，但没有可用仓库 Secret，也没有一次成功的付费 workflow 运行。
- 原因：真实模型调用需要单独凭据、费用授权，并受外部模型变化影响。
- 解决：Mock 作为唯一发布门禁已验证模式；DeepSeek 明确标记为未验证的尽力支持能力。
- 验证：结构化 adapter 单元测试和合成评估脚本存在；付费运行未执行。
- 状态：已知限制。

## 技术债务与剩余风险

| 项目 | 保留原因 | 影响 | 缓解或后续动作 | 状态 |
|---|---|---|---|---|
| DeepSeek 没有付费验收 | 仓库无 API Key，模型是外部可变服务 | 在线评分质量、延迟和成本未知 | 只宣传 Mock 已验证；重新启用前运行 `live-eval.yml` | 已接受 |
| Mattermost 是必需入口 | 完整 Web 发布/提交未实现 | 不能作为纯 Web 学生平台使用 | README 明确范围 | 已接受 |
| 单 Backend/单 PostgreSQL | 当前目标是单服务器 Compose | 没有高可用和横向扩展 | 外部监控、异机备份、恢复演练 | 已接受 |
| 管理员重置密码 | 自助找回会引入邮件和身份验证系统 | 用户忘记密码需人工处理 | 保留至少一个可信教师账号 | 已接受 |
| Pascal 执行器不是沙箱 | 建立真正沙箱超出项目范围 | 不可运行不可信学生代码 | 生产保持关闭 | 已接受 |
| 生产仍需最低运维 | 证书、磁盘、备份和安全事件不会自动消失 | 完全无人值守可能造成数据丢失 | 按 [部署指南](deployment.md) 设置告警与季度演练 | 持续操作 |

## 可复用资产

| 资产 | 位置 | 复用价值 | 使用说明 |
|---|---|---|---|
| 统一验证 Harness | `scripts/verify.ps1` | 从源码到生产拓扑的一键门禁 | 不读取 Seed 或课程数据集 |
| Grading Module | `backend/src/grading/` | 协议无关的评分生命周期 | 新 adapter 只调用公开 interface |
| Agent provider seam | `agent/provider_port.py`、`agent/providers.py` | 隔离 Mock 与在线模型 | 输出必须通过 Pydantic 契约 |
| 浏览器 smoke | `tests/browser-smoke/` | 验证真实静态资源和用户主流程 | 使用匿名合成 fixture |
| 安全 DTO 投影 | `backend/src/grading/dto.ts` | 防止未来字段自动公开 | 新公开字段需显式加入并测试 |
| 生产备份与演练 | `scripts/backup.sh`、`scripts/restore-drill.sh` | Linux 原子备份和恢复验证 | 配合 `deploy/systemd/` 使用 |
| 不可变镜像 workflow | `.github/workflows/release-images.yml` | 发布 digest、SBOM 和 provenance | 只在语义化版本 tag 上运行 |
| 文档链接门禁 | `scripts/check-doc-links.ps1` | 阻止链接到忽略或未提交文件 | 已纳入统一验证 |

## 下次应当如何改进

- 开始做：在原型阶段就写清产品入口、身份权威和不支持范围。
- 停止做：在 README 中保留没有时间与维护资源支撑的主动路线图。
- 继续做：先写表征测试，再提取深模块和 adapter seam。
- 类似项目预检：先确定是否允许执行用户代码、是否需要真实模型、如何保存个人数据、部署者能承担哪些运维。
- 更早回答：Mattermost 是核心产品还是可选入口；学生是否必须使用 Web；在线模型的验收预算和支持期限是什么。

## 封版验证证据

最终发布证据记录在 [tests/TEST_RESULTS.md](../tests/TEST_RESULTS.md) 和 GitHub `v0.2.0` Release。Mock 路径进入自动门禁；真实付费模型评估未运行，不能被解释为已验证能力。
