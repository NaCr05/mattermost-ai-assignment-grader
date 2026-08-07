# 单机生产部署指南

当前生产目标是单台服务器 Docker Compose。Caddy 是唯一公开入口，Frontend、Backend、Agent 和 PostgreSQL 只在 Compose 网络内通信。

## 前置条件

- 一台可公开访问的 Linux 服务器；
- `linux/amd64` 架构；
- Docker Engine 与 Docker Compose v2；
- systemd、Bash、`curl`、`sha256sum`；
- 指向服务器的域名；
- TCP 80、TCP 443 和 UDP 443 可访问；
- 可信的管理员工作站。

## 准备配置

在服务器仓库根目录：

```bash
cp .env.production.example .env.production
curl --fail --location --remote-name \
  https://github.com/NaCr05/mattermost-ai-assignment-grader/releases/download/v0.2.0/release-images.env
curl --fail --location --remote-name \
  https://github.com/NaCr05/mattermost-ai-assignment-grader/releases/download/v0.2.0/SHA256SUMS
sha256sum --ignore-missing --check SHA256SUMS
```

`release-images.env` 保存四个 GHCR 镜像的不可变 digest。不要把它改回浮动的 `latest` 或版本标签；需要审计依赖时，从同一 Release 下载 SPDX JSON SBOM。

至少设置：

| 变量 | 要求 |
|---|---|
| `SITE_ADDRESS` | 公开域名，不包含路径 |
| `PUBLIC_ORIGIN` | 与真实入口完全一致的 `https://域名` |
| `POSTGRES_PASSWORD` | 随机强密码 |
| `AUTH_SECRET` | 至少 32 字符的随机值 |
| `BOOTSTRAP_TOKEN` | 一次性随机值 |
| `AUTH_COOKIE_SECURE` | `true` |
| `ENABLE_PASCAL_EXECUTION` | `false` |

如果使用真实模型，再配置 `AGENT_MODE=live` 和 Provider 凭据。普通生产启动不需要 Seed。

## 启动

```bash
docker compose \
  --env-file .env.production \
  --env-file release-images.env \
  -f docker-compose.prod.yml config --quiet
docker compose \
  --env-file .env.production \
  --env-file release-images.env \
  -f docker-compose.prod.yml up -d --wait
docker compose \
  --env-file .env.production \
  --env-file release-images.env \
  -f docker-compose.prod.yml ps
```

生产启动只执行 `prisma migrate deploy`。Backend 使用生产 bundle 启动，Frontend 由 Nginx 提供静态文件，所有容器都使用非 root 用户。生产服务使用 `unless-stopped` 自动重启，Docker JSON 日志默认限制为 5 个、每个 10 MB；可通过 `LOG_MAX_SIZE` 和 `LOG_MAX_FILES` 调整。

## 健康检查

```text
https://你的域名/healthz
https://你的域名/api/health
https://你的域名/api/readyz
```

数据库、Backend、Agent 和内部 Nginx 不应在宿主机上出现公开端口。

## 创建首位管理员

在能够访问生产域名、且装有 PowerShell 的可信管理员工作站上，准备一份只包含正确 `BOOTSTRAP_TOKEN` 的受保护环境文件，或安全复制服务器的 `.env.production` 后运行：

```powershell
.\scripts\bootstrap-admin.ps1 `
  -EnvironmentFile .env.production `
  -BackendUrl https://你的域名/api `
  -FrontendUrl https://你的域名
```

脚本会安全提示输入密码，不打印 Token 或密码。初始化成功后，轮换 `BOOTSTRAP_TOKEN` 并重新创建 Backend 容器：

```bash
docker compose --env-file .env.production -f docker-compose.prod.yml up -d --force-recreate backend
```

即使 Token 尚未轮换，只要已经存在已设置密码的账号，Bootstrap 接口也会拒绝再次创建首位管理员；轮换仍是推荐的纵深防御。

## HTTPS 与代理

- Caddy 自动申请和续期证书；
- `PUBLIC_ORIGIN` 必须与浏览器真实 Origin 完全一致；
- `/api/*` 转发到 Backend；
- `/mattermost/*` 转发到 Mattermost adapter；
- 登录限速默认保存在单个 Backend 进程内，符合当前单实例部署；
- 扩展到多 Backend 副本前，需要共享限速存储和新的会话部署设计。

## 自动备份与告警

仓库提供每日执行的 systemd timer。以下示例假定仓库位于 `/opt/mattermost-ai-assignment-grader`：

```bash
sudo install -d -m 0700 /etc/mattermost-ai-assignment-grader
sudo install -m 0600 deploy/systemd/backup.conf.example \
  /etc/mattermost-ai-assignment-grader/backup.conf
sudoedit /etc/mattermost-ai-assignment-grader/backup.conf
sudo install -m 0644 deploy/systemd/mattermost-grader-backup.service \
  /etc/systemd/system/mattermost-grader-backup.service
sudo install -m 0644 deploy/systemd/mattermost-grader-backup.timer \
  /etc/systemd/system/mattermost-grader-backup.timer
sudo systemctl daemon-reload
sudo systemctl enable --now mattermost-grader-backup.timer
sudo systemctl start mattermost-grader-backup.service
sudo systemctl status mattermost-grader-backup.service
sudo systemctl list-timers mattermost-grader-backup.timer
```

`backup.conf` 必须设置正确的项目路径、`.env.production`、`release-images.env` 和备份目录。`BACKUP_ALERT_WEBHOOK_URL` 可选；设置后，失败通知只包含主机、UTC 时间和退出码，不发送备份内容或凭据。详细日志使用：

```bash
sudo journalctl -u mattermost-grader-backup.service --since today
```

备份使用 PostgreSQL custom format，先写入临时文件，验证可列出内容后再原子落盘，并生成相邻的 `.sha256`。默认保留 14 天。必须另外同步到受控、加密的异机存储；同机备份不能覆盖磁盘损坏或主机丢失。

不使用 systemd 时，可以在仓库根目录手动运行：

```bash
sudo bash ./scripts/backup.sh
```

PowerShell 环境仍可使用 `scripts/backup.ps1`，但生产 Linux 服务器不依赖 PowerShell。

## 恢复演练

至少每季度对最新备份执行一次真实恢复演练：

```bash
sudo bash ./scripts/restore-drill.sh \
  /var/backups/mattermost-ai-assignment-grader/tide-grader-YYYYMMDD-HHMMSS-PID.dump
```

脚本校验 checksum 和归档目录，创建一个全新的随机数据库，恢复后查询 migration 以及核心业务表，成功或失败后默认删除演练数据库。它拒绝覆盖当前生产数据库。

灾难恢复需要保留演练数据库时，显式设置 `KEEP_RESTORE_DRILL_DATABASE=true`；脚本会输出新数据库名称。人工核对账号、作业、提交、评估和审计记录后，才可修改 `POSTGRES_DB` 并重建 Backend。不要直接在当前生产数据库上测试恢复。Windows 管理环境也可以继续使用 `scripts/restore.ps1`。

## 最低运行监控

维护模式仍需要少量生产运维：

- 从服务器外部每 5 分钟检查一次 `https://你的域名/healthz` 和 `/api/readyz`；
- 对连续失败、TLS 证书异常、磁盘使用率超过 80% 和最近备份超过 26 小时设置通知；
- 每月检查一次 Security workflow 和私密安全报告；
- 每季度记录一次恢复演练结果。

仓库不绑定特定监控供应商。没有外部健康检查和备份失败通知时，不应把部署视为无人值守。

## 更新

1. 阅读 [CHANGELOG](../CHANGELOG.md)；
2. 备份数据库；
3. 拉取明确的 release/tag，并下载该 Release 的 `release-images.env` 与 `SHA256SUMS`；
4. 校验发布资产并拉取 digest 固定镜像；
5. 让 Backend 执行 `prisma migrate deploy`；
6. 检查 `/healthz`、`/api/health` 和 `/api/readyz`；
7. 完成一次教师登录、提交汇总和审核人工检查。

应用更新命令不使用 `--build`：

```bash
docker compose \
  --env-file .env.production \
  --env-file release-images.env \
  -f docker-compose.prod.yml pull
docker compose \
  --env-file .env.production \
  --env-file release-images.env \
  -f docker-compose.prod.yml up -d --wait
```

## 停止

```bash
docker compose \
  --env-file .env.production \
  --env-file release-images.env \
  -f docker-compose.prod.yml down
```

不要附加 `-v`，除非已经确认要删除生产数据库卷。

## 安全基线

部署前必须阅读 [SECURITY.md](../SECURITY.md) 和 [CAPABILITY_BOUNDARIES.md](../CAPABILITY_BOUNDARIES.md)。最低要求包括：

- Pascal 执行关闭；
- 强随机密钥；
- HTTPS；
- 私有内部端口；
- 登录限速；
- 定期备份与恢复演练；
- 检查 AuthAudit；
- AI 结果由教师最终确认。
