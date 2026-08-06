# 本地启动指南

本文是本地开发与首次登录的执行说明。项目定位、能力摘要和文档入口以根目录 [README](../README.md) 为准。

## 最短路径

### 前置条件

- Windows 10/11；
- Docker Desktop 已启动；
- PowerShell 5.1 或 PowerShell 7；
- Git。

克隆仓库后进入根目录：

```powershell
git clone https://github.com/NaCr05/mattermost-ai-assignment-grader.git
Set-Location .\mattermost-ai-assignment-grader
```

启动所有本地服务：

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\start-demo.ps1
```

如果 `.env` 不存在，脚本会：

1. 从 `.env.example` 创建 `.env`；
2. 生成本地 PostgreSQL 密码；
3. 生成至少 32 字符的 `AUTH_SECRET`；
4. 生成一次性 `BOOTSTRAP_TOKEN`；
5. 验证 Compose 配置；
6. 构建并启动数据库、Agent、Backend 和 Frontend；
7. 应用 Prisma migration；
8. 等待四个容器健康。

脚本不会执行 Seed，也不会加载课程数据集。

## 创建首位管理员

本地服务健康后运行：

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\bootstrap-admin.ps1
```

脚本会交互式询问：

- 管理员用户名；
- 显示名称；
- 至少 12 个字符的密码；
- 密码确认。

它从本地 `.env` 读取一次性 Token，但不会显示 Token、密码或默认凭据。初始化成功后，打开 `http://localhost:5173` 并使用刚创建的账号登录。

平台一旦存在已设置密码的账号，Bootstrap 接口就会拒绝再次初始化。后续教师和学生账号由教师在“账号管理”中创建或维护。

### 非默认地址

脚本默认使用 `http://127.0.0.1:BACKEND_PORT` 和 `http://127.0.0.1:FRONTEND_PORT`。也可以显式指定：

```powershell
.\scripts\bootstrap-admin.ps1 `
  -BackendUrl http://127.0.0.1:3001 `
  -FrontendUrl http://127.0.0.1:5173
```

不要把密码或 Bootstrap Token 作为普通命令行字符串传入。

## 服务地址

| 服务 | 默认地址 |
|---|---|
| Web 工作台 | `http://localhost:5173` |
| Backend 健康检查 | `http://localhost:3001/health` |
| Backend 就绪检查 | `http://localhost:3001/readyz` |
| Agent 健康检查 | `http://localhost:8000/health` |
| Agent Prometheus 指标 | `http://localhost:8000/metrics` |
| Agent API 文档 | `http://localhost:8000/docs` |

PostgreSQL、Backend、Agent 和 Frontend 在开发模式下都只绑定 `127.0.0.1`。Backend 默认使用 3001，避免和 Mattermost 开发环境的 Grafana 3000 冲突。

## 手动 Compose

已有安全的 `.env` 时，可以绕过 PowerShell 启动助手：

```powershell
docker compose config --quiet
docker compose up -d --build
docker compose ps
```

Backend 容器启动时会生成 Prisma Client、应用 migration 并启动开发服务器。正常启动不执行 Seed。

如明确不需要重新构建：

```powershell
.\scripts\start-demo.ps1 -NoBuild
```

## 配置原则

本地默认使用：

```dotenv
AGENT_MODE=mock
ENABLE_PASCAL_EXECUTION=false
AUTH_COOKIE_SECURE=false
```

- Mock 不需要 API Key；
- Pascal 执行必须保持关闭；
- `.env` 已被 Git 忽略，不要把它复制到 Issue、日志或截图；
- Mattermost 是当前发布和提交入口，配置方法见 [Mattermost 集成](mattermost.md)。

只有开发者明确需要仓库内测试数据时才手动执行：

```powershell
docker compose exec backend npm run prisma:seed
```

Seed 不是正常启动流程的一部分，也不应被整理为平台运行依赖。

## 验证

提交前运行统一门禁：

```powershell
./scripts/verify.ps1
```

只进行较快的开发检查时：

```powershell
./scripts/verify.ps1 -SkipProduction
```

局部命令和 PR 约定见 [CONTRIBUTING.md](../CONTRIBUTING.md)。

## 停止与数据保护

停止服务但保留数据：

```powershell
docker compose down
```

不要运行下面的命令，除非明确要删除本地所有作业、提交和评估：

```powershell
docker compose down -v
```

## 常见问题

### Docker Hub TLS 或 x509 异常

如果构建在拉取基础镜像时出现证书错误，通常是网络、代理或 DNS 问题。已有本地镜像时可临时恢复：

```powershell
docker compose up -d --no-build
```

不要因此删除本地镜像或数据库卷。

### 服务没有变为 healthy

检查容器状态和最近日志：

```powershell
docker compose ps
docker compose logs --tail 100 backend agent frontend db
```

确认 `.env` 中端口未被占用，并检查 Docker Desktop 的 CPU、内存和磁盘资源。

### 平台已经初始化

`bootstrap-admin.ps1` 返回“已经初始化”时，不要删除数据库重新执行。使用已有教师账号登录；如忘记密码，由另一名教师在账号管理中重置。当前密码找回策略是管理员重置。
