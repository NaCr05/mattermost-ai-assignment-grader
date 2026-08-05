# TIDE 平台验证记录

> 验证日期：2026-08-05
>
> 验证入口：`./scripts/verify.ps1`
>
> Agent 模式：`mock`，`ENABLE_PASCAL_EXECUTION=false`

## 结论

统一验证入口已在全新命名卷中完整通过。验证只使用代码内的合成用例和临时测试记录，没有整理、复制或发布 Seed 与课程数据集。

| 验证面 | 结果 |
|---|---:|
| Backend 单元测试 | 16/16 |
| Backend PostgreSQL + Agent 集成测试 | 18/18 |
| Frontend 模块与 Workspace 测试 | 10/10 |
| Agent 模块测试 | 8/8 |
| 合成端到端验收 | 6/6 |
| Backend TypeScript、Frontend lint、Python Ruff | 通过 |
| Backend 生产 bundle、Frontend 静态构建 | 通过 |
| npm audit（Backend、Frontend） | 0 个已知漏洞 |
| pip-audit（Agent） | 0 个已知漏洞 |
| Gitleaks 工作树扫描 | 未发现敏感信息 |
| Trivy 依赖、Secret、Dockerfile 扫描 | 0 个高危/严重发现 |

## 行为与安全断言

- 登录失败达到阈值后返回 `429`，成功登录可重置账号维度计数。
- 撤销全部会话后，先前签发的 Cookie 均失效。
- 管理员重置密码或禁用账号后目标用户旧 Cookie 失效，禁用账号无法通过 Web 或 Mattermost 继续操作，关键操作写入 `AuthAudit`。
- 身份来自服务端会话，CSRF、教师归属和学生本人访问限制保持生效。
- Agent 请求 ID、模型、Prompt 版本、耗时、Token 和估算成本持久化到 Evaluation，公开评分与审计 DTO 不暴露这些内部元数据或原始模型输出。
- Pascal 执行默认关闭；关闭时不会调用 `exec`。
- 生产模式仅 Caddy 发布 HTTP/HTTPS；Frontend/Nginx、Backend、Agent 与 PostgreSQL 仅在容器网络内可达。
- 五个生产容器均以非 root UID 运行，Pascal 执行仍默认关闭。
- 首次启动应用 7 个 migration，五张受监控业务/认证表计数均为 `0`，启动日志未运行 Seed。
- `/healthz` 和 `/api/readyz` 均返回 HTTP 200。
- PostgreSQL custom-format 备份成功恢复到全新数据库，迁移数量一致，随后删除隔离恢复库。

## 合成验收边界

6 条验收覆盖完整、部分正确、明显错误、模糊回答、已知 Mock 误判和禁止执行代码。通过表示系统行为符合当前契约，不表示 AI 的教学判断必然正确。真实模型评估是显式付费操作，只能使用匿名合成输入：

```powershell
$env:ALLOW_PAID_LIVE_EVALUATION = "true"
$env:AGENT_URL = "http://127.0.0.1:8000"
python .\tests\run_live_model_evaluation.py
```

当前付费模型用例未在本次验证中执行。手动 workflow 提供 18 个匿名合成案例以及通过率、P95 延迟和总成本门禁；它不写入题目、答案或原始模型输出，也不能使用 Seed、课程数据集、个人信息或学生答案。
