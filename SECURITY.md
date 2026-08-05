# 安全策略

## 支持范围

公开发布前只维护 `main` 的最新状态。首个稳定版本发布后，本文件将补充具体版本支持窗口。

## 报告安全问题

请通过 GitHub 仓库的 **Security → Advisories → Report a vulnerability** 私下报告。不要在公开 Issue、Discussion、日志或截图中包含漏洞利用细节、Token、Cookie、学生信息或内部地址。

报告最好包含：

- 受影响的提交或版本；
- 可复现的最小步骤；
- 影响范围和前置条件；
- 已采取的临时缓解措施；
- 不含真实个人数据的证明材料。

维护者会先确认收到报告，再评估严重性、修复范围和披露时间。请在协调披露完成前避免公开漏洞细节。

## 生产安全基线

- `ENABLE_PASCAL_EXECUTION=false`；
- 使用 HTTPS，并将 `PUBLIC_ORIGIN` 设置为真实 Origin；
- 使用随机 `AUTH_SECRET`、数据库密码和一次性 `BOOTSTRAP_TOKEN`；
- Bootstrap 完成后轮换或移除 Token；
- 不向宿主机发布 Backend、Agent 或 PostgreSQL 端口；
- 保持登录限速开启；
- 定期执行 `./scripts/verify.ps1` 并检查 Security workflow；
- 备份 PostgreSQL 数据并验证恢复流程；
- AI 输出仅作辅助，教师负责最终结论。

Pascal 专项执行器不是安全沙箱，即使在本地显式开启，也不得用于处理公开环境中的不可信输入。
