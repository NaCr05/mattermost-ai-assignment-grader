import type { Evaluation } from "../types/grading";
import {
  gradeOrder,
  type SubmissionSort,
  type SubmissionStatusFilter,
} from "../grading/review-queue-model";
import type { ReviewWorkspaceController } from "../grading/use-review-workspace";
import { SubmissionReviewCard } from "./SubmissionReviewCard";

export function ReviewQueue(input: {
  queue: ReviewWorkspaceController["queue"];
  editor: ReviewWorkspaceController["editor"];
  audit: ReviewWorkspaceController["audit"];
}) {
  const { queue, editor, audit } = input;

  return (
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

      {!queue.loading &&
        queue.summary &&
        queue.summary.submissions.length > 0 && (
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
          {queue.submissions.map((submission, index) => (
            <SubmissionReviewCard
              key={submission.id}
              submission={submission}
              position={index + 1}
              editor={editor}
              audit={audit}
            />
          ))}
        </div>
      )}
    </section>
  );
}
