import type { Session } from "../auth/gateway";
import { AdminAccountPanel } from "../auth/AdminAccountPanel";
import { gradeOrder } from "../grading/review-queue-model";
import {
  useReviewWorkspace,
  type ReviewWorkspaceOptions,
} from "../grading/use-review-workspace";
import { formatDate } from "./presentation";
import { ReviewQueue } from "./ReviewQueue";

export type TeacherWorkspaceProps = {
  session: Session;
  authError: string;
  onLogout(): Promise<void>;
  onRevokeSessions(): Promise<boolean>;
  grading?: ReviewWorkspaceOptions;
};

export function TeacherWorkspace(input: TeacherWorkspaceProps) {
  const { assignments, queue, editor, audit, feedback } = useReviewWorkspace(
    input.grading,
  );

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
            <p className="hero__subtitle">评估、复核与审计的统一教师工作区</p>
          </div>
        </div>
        <div className="hero__actions">
          <div className="session-chip" aria-label="当前登录用户">
            <strong>{input.session.user.displayName}</strong>
            <span>@{input.session.user.username}</span>
            <button type="button" onClick={() => void input.onLogout()}>
              退出
            </button>
            <button
              type="button"
              onClick={() => void input.onRevokeSessions()}
            >
              退出所有设备
            </button>
          </div>
          <AdminAccountPanel session={input.session} />
          {input.authError && (
            <p className="auth-error" role="alert">{input.authError}</p>
          )}
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
              <li><span>01</span><strong>学生提交</strong></li>
              <li><span>02</span><strong>Agent 评估</strong></li>
              <li><span>03</span><strong>教师复核</strong></li>
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
          <p>已评估 {queue.agentStats.evaluated}/{queue.stats.total} 份</p>
        </div>
        <div className="analytics__content">
          <div className="analytics__metrics">
            <div>
              <span>平均分</span>
              <strong>{queue.agentStats.average ?? "—"}</strong>
            </div>
            <div>
              <span>最高分</span>
              <strong>{queue.agentStats.highest ?? "—"}</strong>
            </div>
            <div>
              <span>最低分</span>
              <strong>{queue.agentStats.lowest ?? "—"}</strong>
            </div>
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
                  <div><i style={{ width }} /></div>
                  <strong>{count}</strong>
                </div>
              );
            })}
          </div>
          <div className="completeness-summary">
            <h3>完整性分布</h3>
            <div>
              <span>
                完整<strong>{queue.agentStats.completenessCounts.complete}</strong>
              </span>
              <span>
                部分完整<strong>{queue.agentStats.completenessCounts.partial}</strong>
              </span>
              <span>
                不完整<strong>{queue.agentStats.completenessCounts.incomplete}</strong>
              </span>
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

      <ReviewQueue queue={queue} editor={editor} audit={audit} />
    </main>
  );
}
