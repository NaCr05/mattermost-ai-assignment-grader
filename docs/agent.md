# Agent 运行与评估

本文说明 Agent 模式、结构化输出、可观测性、真实模型评估和执行边界。安全限制以 [CAPABILITY_BOUNDARIES.md](../CAPABILITY_BOUNDARIES.md) 为准。

## Mock 模式

```dotenv
AGENT_MODE=mock
ENABLE_PASCAL_EXECUTION=false
```

特点：

- 不需要网络或 API Key；
- 输出稳定，可重复；
- 适合本地开发、CI 和演示；
- 本质是关键词规则，不是通用语义模型。

当前 Mock 规则主要围绕单链表反转样例。面对其他题型、中文同义表达或关键词欺骗时可能误判。

## DeepSeek 模式

```dotenv
AGENT_MODE=live
DEEPSEEK_API_KEY=你的Key
DEEPSEEK_BASE_URL=https://api.deepseek.com
DEEPSEEK_MODEL=配置的模型名称
ENABLE_PASCAL_EXECUTION=false
```

重新构建 Agent 和 Backend：

```powershell
docker compose up -d --build agent backend
```

在线模式使用结构化提示词和 Pydantic 输出校验。首次输出校验失败时重试一次；网络、限流或重复无效输出会返回结构化失败，由 Backend 保留 Submission 并更新状态。

## 输出契约

Evaluation Module 输出：

- 完整性等级和评语；
- 正确性等级和评语；
- 主要问题；
- 修改建议；
- 0–100 分；
- A–F 等级；
- Provider 与运行元数据。

公开 Evaluation DTO 只包含教师审核所需字段。模型、Prompt 版本、请求 ID、Token、耗时、估算成本和原始输出保存在内部投影中，不直接返回前端。

## 可观测性

Agent 提供：

- 请求关联 ID；
- Provider 和模型；
- Prompt 版本；
- 总耗时和尝试次数；
- 输入/输出 Token；
- 可选成本估算；
- 内部 Prometheus 指标。

指标地址：

```text
http://127.0.0.1:8000/metrics
```

指标和普通日志不应包含学生答案、模型原始输出、API Key 或 Token。

## 成本估算

默认单价为 0，因此不会产生有意义的金额估算。需要时根据 Provider 当前价格配置：

```dotenv
DEEPSEEK_INPUT_COST_PER_MILLION_USD=0
DEEPSEEK_OUTPUT_COST_PER_MILLION_USD=0
```

价格属于部署配置，不应硬编码到代码或 README。

## 真实模型合成评估

真实模型评估会产生外部请求和费用，不进入普通 CI。确认 Agent 已以 `live` 模式运行后，显式授权：

```powershell
$env:ALLOW_PAID_LIVE_EVALUATION="true"
$env:AGENT_URL="http://127.0.0.1:8000"
python ./tests/run_live_model_evaluation.py
```

评估使用匿名合成用例，不读取 Seed 或课程数据集。当前门禁检查：

- 通过率；
- P95 延迟；
- 总估算成本；
- 非法输入拒绝；
- 中英文正确与错误答案；
- 模糊回答和提示词注入。

默认阈值：

| 指标 | 阈值 |
|---|---|
| 通过率 | 不低于 80% |
| P95 延迟 | 不高于 90 秒 |
| 总估算成本 | 不高于 1 美元 |

可以通过 `LIVE_EVAL_*` 环境变量调整。脚本只写脱敏摘要，不保存题目、答案或模型原始输出。

## GitHub 手动评估

`Live model evaluation` workflow 只能手动触发，并要求明确确认付费请求。Repository Environment `live-model-evaluation` 需要：

- Secret：`DEEPSEEK_API_KEY`；
- Variables：模型、Base URL 和可选单价。

workflow 保存脱敏 JSON 摘要 30 天，不参与普通 PR 或 `main` push 门禁。

## Pascal 执行

```dotenv
ENABLE_PASCAL_EXECUTION=false
```

必须保持默认关闭。关闭时 Agent 返回结构化“代码执行已禁用”，不会调用 `exec`。

仓库保留的 Pascal 专项执行器只有受限 builtins、独立子进程和超时，不具备文件系统、网络、内存或进程级沙箱隔离。即使在受控本地显式开启，也不得处理公开环境中的不可信输入。

## 故障处理

| 故障 | 系统行为 |
|---|---|
| Provider 超时或 500 | 返回失败；Submission 保留 |
| Provider 非法 JSON | 校验失败并按策略重试 |
| 重试仍失败 | Evaluation/Submission 标记失败 |
| 教师重新评估 | 由 Grading Module 取得并发执行权 |
| 重评失败 | 当前版本保留并记录失败状态 |
| 过期教师写入 | 返回版本冲突 |

教师可以在 Web 工作台重新触发评估，但最终分数仍需人工判断。
