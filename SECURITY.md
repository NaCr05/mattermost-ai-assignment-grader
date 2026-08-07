# 安全策略

## 支持范围

本项目自 `v0.2.0` 起进入维护模式：

| 版本 | 状态 |
|---|---|
| 最新 `0.2.x` | 仅评估严重安全漏洞、数据完整性问题和发布阻塞问题 |
| `0.1.x` 及更早版本 | 不再支持，请升级到最新 `0.2.x` |

维护模式不包含功能开发、常规依赖追新、兼容性扩展或响应时间保证。维护者会尽力查看私密报告，但不承诺确认、修复或发布补丁的 SLA；如果仓库后续归档，所有版本均视为停止支持。

## 报告安全问题

请通过 GitHub 仓库的 **Security → Advisories → Report a vulnerability** 私下报告。不要在公开 Issue、Discussion、日志或截图中包含漏洞利用细节、Token、Cookie、学生信息或内部地址。

报告最好包含：

- 受影响的提交或版本；
- 可复现的最小步骤；
- 影响范围和前置条件；
- 已采取的临时缓解措施；
- 不含真实个人数据的证明材料。

维护者会在有能力处理时评估严重性、缓解方式和披露安排。请在收到明确协调结果前避免公开漏洞细节；若长期没有响应，报告者应假定该项目没有主动维护资源，并优先停止受影响的公开部署。

## 生产安全基线

- `ENABLE_PASCAL_EXECUTION=false`；
- 使用仓库提供的 Caddy HTTPS 入口，将 `SITE_ADDRESS` 设置为域名，并让 `PUBLIC_ORIGIN` 与真实 HTTPS Origin 完全一致；
- 使用随机 `AUTH_SECRET`、数据库密码和一次性 `BOOTSTRAP_TOKEN`；
- Bootstrap 完成后轮换或移除 Token；
- 不向宿主机发布 Backend、Agent 或 PostgreSQL 端口；
- 保持登录限速开启；
- 发布前执行 `./scripts/verify.ps1`，运行中的部署至少每月检查一次 Security workflow；
- Linux 服务器使用 systemd 定时器和 `scripts/backup.sh`，Windows 管理端可使用 `scripts/backup.ps1`；
- 保留异机加密备份，检查备份失败通知，并至少每季度执行一次恢复到新数据库的演练；
- 定期检查 `AuthAudit` 中的失败登录、密码重置、账号禁用和会话撤销事件；
- AI 输出仅作辅助，教师负责最终结论。

Pascal 专项执行器不是安全沙箱，即使在本地显式开启，也不得用于处理公开环境中的不可信输入。
