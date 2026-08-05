import "./App.css";
import type {
  Evaluation,
  EvaluationAudit,
  EvaluationAuditAction,
  EvaluationStatus,
} from "./types/grading";
import {
  gradeOrder,
  type SubmissionSort,
  type SubmissionStatusFilter,
} from "./grading/review-queue-model";
import { useReviewWorkspace } from "./grading/use-review-workspace";
import { LoginScreen } from "./auth/LoginScreen";
import { useSession } from "./auth/use-session";
import type { Session } from "./auth/gateway";

const statusLabels: Record<EvaluationStatus, string> = {
  generated: "待教师审核",
  confirmed: "教师已确认",
  modified: "教师已修改",
  regrading: "正在重新评估",
  failed: "评估失败",
};

const levelLabels: Record<string, string> = {
  complete: "完整",
  partial: "部分完整",
  incomplete: "不完整",
  correct: "正确",
  mostly_correct: "大体正确",
  partially_correct: "部分正确",
  incorrect: "错误",
  uncertain: "信息不足",
};

const auditActionLabels: Record<EvaluationAuditAction, string> = {
  baseline: "历史基线",
  generated: "Agent 初次评估",
  regraded: "Agent 重新评估",
  confirmed: "教师确认",
  modified: "教师修改",
};

function formatDate(value: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getAuditSnapshot(audit: EvaluationAudit) {
  if (!isRecord(audit.snapshot)) return null;

  const nestedEvaluation = audit.snapshot.evaluation;
  return isRecord(nestedEvaluation) ? nestedEvaluation : audit.snapshot;
}

function getAuditValue(
  audit: EvaluationAudit,
  key: "score" | "grade" | "status",
) {
  const snapshot = getAuditSnapshot(audit);
  const value = snapshot?.[key];
  return typeof value === "string" || typeof value === "number"
    ? String(value)
    : null;
}

function ReviewWorkspace(input: {
  session: Session;
  authError: string;
  onLogout(): Promise<void>;
  onRevokeSessions(): Promise<boolean>;
}) {
  const { assignments, queue, editor, audit, feedback } = useReviewWorkspace();

  return (
    <main className="app-shell">
      <a className="skip-link" href="#review-queue">
        跳到审核队列
      </a>
      <header className="hero">
        <div className="hero__brand">
          <span className="brand-mark" aria-hidden="true">
            <span>T</span>
          </span>
          <div>
            <p className="hero__kicker">TIDE / DATA STRUCTURES</p>
            <h1>作业评估工作台</h1>
            <p className="hero__subtitle">发布、评估与复核的统一教师工作区</p>
          </div>
        </div>
        <div className="hero__actions">
          <div className="session-chip" aria-label="当前登录用户">
            <strong>{input.session.user.displayName}</strong>
            <span>@{input.session.user.username}</span>
            <button type="button" onClick={() => void input.onLogout()}>退出</button>
            <button type="button" onClick={() => void input.onRevokeSessions()}>
              退出所有设备
            </button>
          </div>
          {input.authError && <p className="auth-error" role="alert">{input.authError}</p>}
          <label>
            <span>搜索作业</span>
            <input
              value={assignments.search}
              onChange={(event) => assignments.setSearch(event.target.value)}
              placeholder="输入标题或题目关键词"
              aria-label="搜索作业"
            />
          </label>
          <label>
            <span>当前作业</span>
            <select
              value={assignments.selectedId}
              onChange={(event) => assignments.select(event.target.value)}
              aria-label="选择作业"
            >
              {assignments.visible.map((assignment) => (
                <option key={assignment.id} value={assignment.id}>
                  {assignment.title} · {assignment._count.submissions} 份提交
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            className="button button--ghost"
            onClick={() => void feedback.refresh()}
          >
            刷新数据
          </button>
        </div>
      </header>

      {assignments.selected && (
        <section className="assignment-brief">
          <div className="assignment-brief__copy">
            <p className="eyebrow">Problem context</p>
            <h2>{assignments.selected.title}</h2>
            <p>{assignments.selected.question}</p>
            <ol className="assignment-flow" aria-label="作业处理流程">
              <li>
                <span>01</span>
                <strong>学生提交</strong>
              </li>
              <li>
                <span>02</span>
                <strong>Agent 评估</strong>
              </li>
              <li>
                <span>03</span>
                <strong>教师复核</strong>
              </li>
            </ol>
          </div>
          <dl>
            <div>
              <dt>发布教师</dt>
              <dd>{assignments.selected.createdBy.displayName}</dd>
            </div>
            <div>
              <dt>截止时间</dt>
              <dd>{formatDate(assignments.selected.deadline)}</dd>
            </div>
          </dl>
        </section>
      )}

      <section className="stats" aria-label="审核进度">
        <div><span>提交总数</span><strong>{queue.stats.total}</strong></div>
        <div><span>待审核</span><strong>{queue.stats.pending}</strong></div>
        <div><span>已确认</span><strong>{queue.stats.confirmed}</strong></div>
        <div><span>已修改</span><strong>{queue.stats.modified}</strong></div>
      </section>

      <section className="analytics" aria-labelledby="analytics-title">
        <div className="analytics__heading">
          <div>
            <p className="eyebrow">Model analysis</p>
            <h2 id="analytics-title">评估统计概览</h2>
          </div>
          <p>
            已评估 {queue.agentStats.evaluated}/{queue.stats.total} 份
          </p>
        </div>
        <div className="analytics__content">
          <div className="analytics__metrics">
            <div><span>平均分</span><strong>{queue.agentStats.average ?? "—"}</strong></div>
            <div><span>最高分</span><strong>{queue.agentStats.highest ?? "—"}</strong></div>
            <div><span>最低分</span><strong>{queue.agentStats.lowest ?? "—"}</strong></div>
            <div>
              <span>完整答案</span>
              <strong>{queue.agentStats.completenessCounts.complete}</strong>
            </div>
          </div>
          <div className="grade-chart" aria-label="等级分布图">
            <h3>等级分布</h3>
            {gradeOrder.map((grade) => {
              const count = queue.agentStats.gradeCounts[grade];
              const width = `${(count / queue.agentStats.maxGradeCount) * 100}%`;
              return (
                <div className="grade-chart__row" key={grade}>
                  <span>{grade}</span>
                  <div>
                    <i style={{ width }} />
                  </div>
                  <strong>{count}</strong>
                </div>
              );
            })}
          </div>
          <div className="completeness-summary">
            <h3>完整性分布</h3>
            <div>
              <span>完整<strong>{queue.agentStats.completenessCounts.complete}</strong></span>
              <span>部分完整<strong>{queue.agentStats.completenessCounts.partial}</strong></span>
              <span>不完整<strong>{queue.agentStats.completenessCounts.incomplete}</strong></span>
            </div>
          </div>
        </div>
      </section>

      {(feedback.error || feedback.notice) && (
        <div
          className={`toast ${feedback.error ? "toast--error" : "toast--success"}`}
          role={feedback.error ? "alert" : "status"}
          aria-live={feedback.error ? "assertive" : "polite"}
        >
          <span>{feedback.error || feedback.notice}</span>
          {feedback.error && (
            <button type="button" onClick={() => void feedback.refresh()}>
              重新加载
            </button>
          )}
        </div>
      )}

      <section
        id="review-queue"
        className="submissions-section"
        aria-labelledby="review-queue-title"
        tabIndex={-1}
      >
        <div className="section-heading">
          <div>
            <p className="eyebrow">Review pipeline</p>
            <h2 id="review-queue-title">学生提交与评估报告</h2>
          </div>
          <p>AI 结果仅作辅助，最终结论由教师确认。</p>
        </div>

        <div className="filters" aria-label="提交筛选">
          <label className="filters__search">
            <span>搜索学生或答案</span>
            <input
              value={queue.search}
              onChange={(event) => queue.setSearch(event.target.value)}
              placeholder="姓名、用户名或答案关键词"
            />
          </label>
          <label>
            <span>审核状态</span>
            <select
              value={queue.statusFilter}
              onChange={(event) =>
                queue.setStatusFilter(event.target.value as SubmissionStatusFilter)
              }
            >
              <option value="all">全部状态</option>
              <option value="unevaluated">尚未评估</option>
              <option value="generated">待教师审核</option>
              <option value="confirmed">教师已确认</option>
              <option value="modified">教师已修改</option>
              <option value="regrading">正在重新评估</option>
              <option value="failed">评估失败</option>
            </select>
          </label>
          <label>
            <span>等级</span>
            <select
              value={queue.gradeFilter}
              onChange={(event) =>
                queue.setGradeFilter(
                  event.target.value as "all" | Evaluation["grade"],
                )
              }
            >
              <option value="all">全部等级</option>
              {gradeOrder.map((grade) => (
                <option value={grade} key={grade}>{grade}</option>
              ))}
            </select>
          </label>
          <label>
            <span>排序</span>
            <select
              value={queue.sortBy}
              onChange={(event) =>
                queue.setSortBy(event.target.value as SubmissionSort)
              }
            >
              <option value="newest">最新提交</option>
              <option value="score-desc">分数从高到低</option>
              <option value="score-asc">分数从低到高</option>
              <option value="student">学生姓名</option>
            </select>
          </label>
          <button
            className="button button--ghost filters__reset"
            disabled={!queue.hasActiveFilters}
            onClick={queue.clearFilters}
          >
            清除筛选
          </button>
        </div>
        {!queue.loading && queue.summary && queue.summary.submissions.length > 0 && (
          <p className="filter-result">
            显示 {queue.submissions.length} / {queue.summary.submissions.length} 份提交
          </p>
        )}

        {queue.loading && (
          <div className="empty-state" role="status" aria-live="polite">
            正在加载审核队列…
          </div>
        )}

        {!queue.loading && queue.summary?.submissions.length === 0 && (
          <div className="empty-state">该作业暂时没有学生提交。</div>
        )}

        {!queue.loading &&
          queue.summary &&
          queue.summary.submissions.length > 0 &&
          queue.submissions.length === 0 && (
            <div className="empty-state">
              没有符合当前搜索或筛选条件的提交。
            </div>
          )}

        {!queue.loading && queue.summary && (
          <div className="submission-list">
            {queue.submissions.map((submission, submissionIndex) => {
              const evaluation = submission.evaluation;
              const isEditing = evaluation?.id === editor.editingId;
              const isBusy = editor.busyId === (evaluation?.id ?? submission.id);
              const isAuditOpen = audit.expandedId === submission.id;
              const audits = audit.bySubmission[submission.id] ?? [];

              return (
                <article className="submission-card" key={submission.id}>
                  <div className="submission-card__node" aria-hidden="true">
                    <span>{String(submissionIndex + 1).padStart(2, "0")}</span>
                  </div>
                  <div className="submission-card__student">
                    <div className="avatar">
                      {submission.student.displayName.slice(-1)}
                    </div>
                    <div>
                      <h3>{submission.student.displayName}</h3>
                      <p>@{submission.student.username} · {formatDate(submission.submittedAt)}</p>
                    </div>
                    {evaluation && (
                      <span className={`status status--${evaluation.status}`}>
                        {statusLabels[evaluation.status]}
                      </span>
                    )}
                  </div>

                  <div className="answer-block">
                    <span>学生答案</span>
                    <p>{submission.answer}</p>
                  </div>

                  {!evaluation ? (
                    <div className="no-evaluation">
                      <p>这份提交尚未生成评估报告。</p>
                      <button
                        className="button"
                        disabled={isBusy}
                        onClick={() => void editor.create(submission)}
                      >
                        {isBusy ? "评估中…" : "生成基础评估"}
                      </button>
                    </div>
                  ) : (
                    <div className="evaluation-panel">
                      <div className="score-box">
                        <small className="score-box__label">Agent 评分</small>
                        <div>
                          <strong>{evaluation.score}</strong><span>/100</span>
                        </div>
                        <b>{evaluation.grade}</b>
                        <small>版本 {evaluation.version}</small>
                      </div>

                      <div className="evaluation-content">
                        <div className="dimension-grid">
                          <div>
                            <span>答案完整性 · {levelLabels[evaluation.completenessLevel]}</span>
                            <p>{evaluation.completenessComment}</p>
                          </div>
                          <div>
                            <span>正确性判断 · {levelLabels[evaluation.correctnessLevel]}</span>
                            <p>{evaluation.correctnessComment}</p>
                          </div>
                        </div>
                        <div className="feedback-grid">
                          <div>
                            <h4>主要问题</h4>
                            <ul>{evaluation.mainProblems.map((item) => <li key={item}>{item}</li>)}</ul>
                          </div>
                          <div>
                            <h4>修改建议</h4>
                            <ul>{evaluation.suggestions.map((item) => <li key={item}>{item}</li>)}</ul>
                          </div>
                        </div>

                        {isEditing && editor.draft && (
                          <div className="edit-form">
                            <label>分数<input type="number" min="0" max="100" value={editor.draft.score} onChange={(event) => editor.setDraft({ ...editor.draft!, score: Number(event.target.value) })} /></label>
                            <label>等级<select value={editor.draft.grade} onChange={(event) => editor.setDraft({ ...editor.draft!, grade: event.target.value as Evaluation["grade"] })}>{["A", "B", "C", "D", "F"].map((grade) => <option key={grade}>{grade}</option>)}</select></label>
                            <label className="edit-form__comment">正确性评语<textarea rows={3} value={editor.draft.correctnessComment} onChange={(event) => editor.setDraft({ ...editor.draft!, correctnessComment: event.target.value })} /></label>
                          </div>
                        )}

                        <div className="card-actions">
                          {isEditing ? (
                            <>
                              <button className="button" disabled={isBusy} onClick={() => void editor.save(evaluation)}>保存修改</button>
                              <button className="button button--ghost" onClick={editor.cancel}>取消</button>
                            </>
                          ) : (
                            <>
                              <button className="button" disabled={isBusy || evaluation.status === "confirmed"} onClick={() => void editor.confirm(evaluation)}>确认评估</button>
                              <button className="button button--secondary" disabled={isBusy} onClick={() => editor.begin(evaluation)}>修改结果</button>
                              <button className="button button--ghost" disabled={isBusy} onClick={() => void editor.regrade(evaluation)}>{isBusy ? "处理中…" : "重新评估"}</button>
                            </>
                          )}
                          <button
                            className="button button--ghost"
                            disabled={audit.loadingId === submission.id}
                            onClick={() => void audit.toggle(submission.id)}
                            aria-expanded={isAuditOpen}
                            aria-controls={`audit-panel-${submission.id}`}
                          >
                            {audit.loadingId === submission.id
                              ? "加载历史…"
                              : isAuditOpen
                                ? "收起评估历史"
                                : "查看评估历史"}
                          </button>
                        </div>

                        {isAuditOpen && (
                          <section
                            className="audit-panel"
                            id={`audit-panel-${submission.id}`}
                          >
                            <div className="audit-panel__heading">
                              <div>
                                <p className="eyebrow">Evaluation audit</p>
                                <h3>评估审计时间线</h3>
                              </div>
                              <span>{audits.length} 条不可变记录</span>
                            </div>
                            {audit.errors[submission.id] && (
                              <div className="audit-panel__error">
                                {audit.errors[submission.id]}
                                <button
                                  type="button"
                                  onClick={() => void audit.load(submission.id)}
                                >
                                  重试
                                </button>
                              </div>
                            )}
                            {!audit.errors[submission.id] &&
                              audit.loadingId !== submission.id &&
                              audits.length === 0 && (
                                <p className="audit-panel__empty">
                                  暂无评估审计记录。
                                </p>
                              )}
                            {audits.length > 0 && (
                              <ol className="audit-timeline">
                                {[...audits].reverse().map((audit) => {
                                  const score = getAuditValue(audit, "score");
                                  const grade = getAuditValue(audit, "grade");
                                  const status = getAuditValue(audit, "status");
                                  return (
                                    <li key={audit.id}>
                                      <span
                                        className={`audit-dot audit-dot--${audit.action}`}
                                        aria-hidden="true"
                                      />
                                      <div>
                                        <div className="audit-timeline__title">
                                          <strong>{auditActionLabels[audit.action]}</strong>
                                          <time>{formatDate(audit.createdAt)}</time>
                                        </div>
                                        <p>
                                          版本 {audit.version}
                                          {score ? ` · ${score} 分` : ""}
                                          {grade ? ` / ${grade}` : ""}
                                          {status ? ` · ${statusLabels[status as EvaluationStatus] ?? status}` : ""}
                                        </p>
                                        <small>
                                          操作者：
                                          {audit.actor
                                            ? `${audit.actor.displayName} (@${audit.actor.username})`
                                            : audit.action === "generated"
                                              ? "AI Agent"
                                              : "系统"}
                                        </small>
                                      </div>
                                    </li>
                                  );
                                })}
                              </ol>
                            )}
                          </section>
                        )}
                      </div>
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </section>
    </main>
  );
}

function App() {
  const { session, loading, error, login, logout, revokeSessions } = useSession();

  if (loading) {
    return <main className="auth-shell"><p role="status">正在验证登录状态…</p></main>;
  }
  if (!session) return <LoginScreen error={error} onLogin={login} />;
  if (session.user.role !== "teacher") {
    return (
      <main className="auth-shell">
        <section className="auth-card">
          <p className="eyebrow">STUDENT ACCOUNT</p>
          <h1>学生账号已登录</h1>
          <p>教师审核工作台仅向教师开放。学生可以通过已配置的课程入口提交和查看自己的内容。</p>
          {error && <p className="auth-error" role="alert">{error}</p>}
          <button className="button" type="button" onClick={() => void logout()}>退出登录</button>
          <button className="button button--ghost" type="button" onClick={() => void revokeSessions()}>
            退出所有设备
          </button>
        </section>
      </main>
    );
  }
  return (
    <ReviewWorkspace
      session={session}
      authError={error}
      onLogout={logout}
      onRevokeSessions={revokeSessions}
    />
  );
}

export default App;
