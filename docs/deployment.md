# 单机生产部署指南

当前生产目标是单台服务器 Docker Compose。Caddy 是唯一公开入口，Frontend、Backend、Agent 和 PostgreSQL 只在 Compose 网络内通信。

## 前置条件

- 一台可公开访问的 Linux 服务器；
- Docker Engine 与 Docker Compose v2；
- 指向服务器的域名；
- TCP 80、TCP 443 和 UDP 443 可访问；
- 可信的管理员工作站。

## 准备配置

在服务器仓库根目录：

```bash
cp .env.production.example .env.production
```

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
docker compose --env-file .env.production -f docker-compose.prod.yml config --quiet
docker compose --env-file .env.production -f docker-compose.prod.yml up -d --build
docker compose --env-file .env.production -f docker-compose.prod.yml ps
```

生产启动只执行 `prisma migrate deploy`。Backend 使用生产 bundle 启动，Frontend 由 Nginx 提供静态文件，所有容器都使用非 root 用户。

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

## 备份

备份使用 PostgreSQL custom format：

```powershell
.\scripts\backup.ps1 -EnvironmentFile .env.production
```

备份文件默认进入 `backups/`，不会包含仓库 Seed 或课程数据集操作。将备份复制到受控的异机存储，并建立保留和加密策略。

## 恢复演练

恢复脚本拒绝覆盖当前生产数据库，也拒绝覆盖已存在的目标数据库：

```powershell
.\scripts\restore.ps1 `
  -EnvironmentFile .env.production `
  -BackupPath .\backups\tide-grader-YYYYMMDD-HHMMSS.dump `
  -TargetDatabase tide_restore_YYYYMMDD
```

在恢复数据库中确认 migration、账号、作业、提交和评估正确后，才可修改 `POSTGRES_DB` 并重新启动 Compose。不要直接在当前生产数据库上测试恢复。

## 更新

1. 阅读 [CHANGELOG](../CHANGELOG.md)；
2. 备份数据库；
3. 拉取明确的 release/tag；
4. 重新构建镜像；
5. 让 Backend 执行 `prisma migrate deploy`；
6. 检查 `/healthz`、`/api/health` 和 `/api/readyz`；
7. 完成一次教师登录、提交汇总和审核人工检查。

## 停止

```bash
docker compose --env-file .env.production -f docker-compose.prod.yml down
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
