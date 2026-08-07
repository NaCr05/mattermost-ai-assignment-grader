import type {
  Evaluation,
  EvaluationStatus,
  Submission,
} from "../types/grading";
import type { ReviewWorkspaceController } from "../grading/use-review-workspace";
import {
  auditActionLabels,
  formatDate,
  getAuditValue,
  levelLabels,
  statusLabels,
} from "./presentation";

export function SubmissionReviewCard(input: {
  submission: Submission;
  position: number;
  editor: ReviewWorkspaceController["editor"];
  audit: ReviewWorkspaceController["audit"];
}) {
  const { submission, editor, audit } = input;
  const evaluation = submission.evaluation;
  const isEditing = evaluation?.id === editor.editingId;
  const isBusy = editor.busyId === (evaluation?.id ?? submission.id);
  const isAuditOpen = audit.expandedId === submission.id;
  const audits = audit.bySubmission[submission.id] ?? [];

  return (
    <article className="submission-card">
      <div className="submission-card__node" aria-hidden="true">
        <span>{String(input.position).padStart(2, "0")}</span>
      </div>
      <div className="submission-card__student">
        <div className="avatar">
          {submission.student.displayName.slice(-1)}
        </div>
        <div>
          <h3>{submission.student.displayName}</h3>
          <p>
            @{submission.student.username} · {formatDate(submission.submittedAt)}
          </p>
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
                <span>
                  答案完整性 · {levelLabels[evaluation.completenessLevel]}
                </span>
                <p>{evaluation.completenessComment}</p>
              </div>
              <div>
                <span>
                  正确性判断 · {levelLabels[evaluation.correctnessLevel]}
                </span>
                <p>{evaluation.correctnessComment}</p>
              </div>
            </div>
            <div className="feedback-grid">
              <div>
                <h4>主要问题</h4>
                <ul>
                  {evaluation.mainProblems.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
              <div>
                <h4>修改建议</h4>
                <ul>
                  {evaluation.suggestions.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
            </div>

            {isEditing && editor.draft && (
              <div className="edit-form">
                <label>
                  分数
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={editor.draft.score}
                    onChange={(event) => editor.setDraft({
                      ...editor.draft!,
                      score: Number(event.target.value),
                    })}
                  />
                </label>
                <label>
                  等级
                  <select
                    value={editor.draft.grade}
                    onChange={(event) => editor.setDraft({
                      ...editor.draft!,
                      grade: event.target.value as Evaluation["grade"],
                    })}
                  >
                    {["A", "B", "C", "D", "F"].map((grade) => (
                      <option key={grade}>{grade}</option>
                    ))}
                  </select>
                </label>
                <label className="edit-form__comment">
                  正确性评语
                  <textarea
                    rows={3}
                    value={editor.draft.correctnessComment}
                    onChange={(event) => editor.setDraft({
                      ...editor.draft!,
                      correctnessComment: event.target.value,
                    })}
                  />
                </label>
              </div>
            )}

            <div className="card-actions">
              {isEditing ? (
                <>
                  <button
                    className="button"
                    disabled={isBusy}
                    onClick={() => void editor.save(evaluation)}
                  >
                    保存修改
                  </button>
                  <button className="button button--ghost" onClick={editor.cancel}>
                    取消
                  </button>
                </>
              ) : (
                <>
                  <button
                    className="button"
                    disabled={
                      isBusy ||
                      evaluation.status === "confirmed" ||
                      evaluation.status === "regrading"
                    }
                    onClick={() => void editor.confirm(evaluation)}
                  >
                    确认评估
                  </button>
                  <button
                    className="button button--secondary"
                    disabled={isBusy || evaluation.status === "regrading"}
                    onClick={() => editor.begin(evaluation)}
                  >
                    修改结果
                  </button>
                  <button
                    className="button button--ghost"
                    disabled={isBusy || evaluation.status === "regrading"}
                    onClick={() => void editor.regrade(evaluation)}
                  >
                    {isBusy || evaluation.status === "regrading"
                      ? "处理中…"
                      : "重新评估"}
                  </button>
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
                    <p className="audit-panel__empty">暂无评估审计记录。</p>
                  )}
                {audits.length > 0 && (
                  <ol className="audit-timeline">
                    {[...audits].reverse().map((auditEntry) => {
                      const score = getAuditValue(auditEntry, "score");
                      const grade = getAuditValue(auditEntry, "grade");
                      const status = getAuditValue(auditEntry, "status");
                      return (
                        <li key={auditEntry.id}>
                          <span
                            className={`audit-dot audit-dot--${auditEntry.action}`}
                            aria-hidden="true"
                          />
                          <div>
                            <div className="audit-timeline__title">
                              <strong>
                                {auditActionLabels[auditEntry.action]}
                              </strong>
                              <time>{formatDate(auditEntry.createdAt)}</time>
                            </div>
                            <p>
                              版本 {auditEntry.version}
                              {score ? ` · ${score} 分` : ""}
                              {grade ? ` / ${grade}` : ""}
                              {status
                                ? ` · ${statusLabels[status as EvaluationStatus] ?? status}`
                                : ""}
                            </p>
                            <small>
                              操作者：
                              {auditEntry.actor
                                ? `${auditEntry.actor.displayName} (@${auditEntry.actor.username})`
                                : auditEntry.action === "generated"
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
}
