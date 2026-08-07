# Mattermost 集成

当前 v0.1.x 使用 Mattermost Slash Command 完成作业发布、学生提交和教师汇总。Web 工作台负责教师审核。长期方向是把 Mattermost 降为可选 adapter，但本文只描述当前已经实现的行为。

## 启动 Mattermost 本地开发环境

如果使用 Mattermost 源码开发环境：

```powershell
wsl -d Ubuntu
```

在 WSL 中进入 Mattermost `server` 目录：

```bash
cd /你的/Mattermost源码路径/server
make run
```

不要在 `~/code/mattermost` 根目录运行 `make run`。

设置本地 SiteURL 和仅限本机的集成白名单：

```bash
bin/mmctl config set ServiceSettings.SiteURL http://localhost:8065 --local
bin/mmctl config set ServiceSettings.AllowedUntrustedInternalConnections localhost,127.0.0.1 --local
bin/mmctl config get ServiceSettings.EnableCommands --local
```

最后一条命令应返回 `true`。

## 创建 `/ds` Slash Command

可以在 Mattermost 集成页面创建，也可以在 `server` 目录运行：

```bash
bin/mmctl command create your-team \
  --local \
  --creator 你的Mattermost用户名 \
  --title TIDE-Assistant \
  --description TIDE-assignment-assistant \
  --trigger-word ds \
  --url http://localhost:3001/mattermost/commands \
  --response-username TIDE-Agent \
  --autocomplete \
  --autocompleteDesc TIDE-assignment-assistant \
  --autocompleteHint help-publish-submit-summary \
  --post
```

把生成的 Token 写入本地 `.env`：

```dotenv
MATTERMOST_SLASH_TOKEN=生成的Token
MATTERMOST_TEACHER_USERNAME=你的Mattermost教师用户名
```

不要把真实 Token 提交到 Git。

让 Backend 重新读取配置：

```powershell
docker compose up -d --force-recreate backend
```

## Interactive Messages 回调

按钮回调地址默认根据 Slash Command 请求的 Host 生成。如果 Mattermost Server 无法访问该地址，显式配置：

```dotenv
MATTERMOST_ACTION_URL=http://Windows主机在WSL中的可达IP:3001/mattermost/actions
```

该地址必须从 Mattermost Server 所在网络可达。不要盲目填写 Mattermost Server 自己的 `localhost:3001`。

## 用户映射

- 平台账号包含 `teacher` 和 `student`；
- Mattermost 优先按 `mattermostUserId` 映射；
- 未绑定时可按同名平台用户名映射；
- `MATTERMOST_TEACHER_USERNAME` 只用于首次建立教师映射；
- Web 和 Mattermost 是两个身份 adapter，最终权限都由 Backend 检查。

## 命令

查看帮助：

```text
/ds help
```

教师发布：

```text
/ds publish | 标题 | 2026-07-25 23:59 | 题目内容 | 其他说明
```

学生提交：

```text
/ds submit | assignment_id | 答案内容
```

教师汇总：

```text
/ds summary | assignment_id
```

学生提交成功后，系统保存答案并请求 Agent。Agent 暂时失败时，提交不会丢失，教师可在 Web 工作台重新评估。

汇总卡片提供：

- **确认评估**：确认当前版本并追加 `confirmed` 审计记录；
- **重新评估**：调用 Agent，成功后追加 `regraded` 审计记录。

按钮上下文使用 `MATTERMOST_SLASH_TOKEN` 生成 HMAC 签名并绑定 Evaluation 版本。伪造、过期、错误用户或旧版本操作都会被拒绝。修改分数和评语仍在 Web 中完成。

## 常见问题

### `SiteURL must be configured to use slash commands`

```bash
bin/mmctl config set ServiceSettings.SiteURL http://localhost:8065 --local
```

### `Command with a trigger of 'ds' failed` 或 `address forbidden`

```bash
bin/mmctl config set ServiceSettings.AllowedUntrustedInternalConnections localhost,127.0.0.1 --local
```

该设置只适用于受控的本地开发环境。

### `Bind for 0.0.0.0:3000 failed`

Mattermost 开发环境中的 Grafana 使用 3000。本项目 Backend 保持：

```dotenv
BACKEND_PORT=3001
```

### `nc: bad address 'grafana'`

Mattermost 首次启动中断后，Grafana 可能没有加入 `mattermost-server_mm-test` 网络：

```powershell
docker network inspect mattermost-server_mm-test
```

检查 `mattermost-grafana` 是否在该网络并带有 `grafana` 别名。

### 外部产品通知超时

本地网络无法访问 Mattermost 外部服务时可能出现警告。以页面能否打开以及 `/api/v4/system/ping` 是否返回 `OK` 为准。
