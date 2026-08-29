import type { VocabUnit } from '@/types/index';
import { useProgress } from '@/progressStore';
import { dueEntries, wrongQueueEntries } from '@/lib/scheduler';

export function UnitCard({
  unit,
  navigate,
}: {
  unit: VocabUnit;
  navigate: (to: string) => void;
}) {
  const progress = useProgress();
  // 已學 = 答過至少一題（stage 離開 'new' 的唯一路徑是 recordAnswer）。
  const learned = unit.entries.filter(
    (e) => progress.entries[e.entryId] && progress.entries[e.entryId].stage !== 'new',
  ).length;
  const pct = unit.total > 0 ? Math.round((learned / unit.total) * 100) : 0;
  const reviewDue = dueEntries(progress.entries, Date.now()).filter((id) =>
    unit.entries.some((e) => e.entryId === id),
  ).length;
  const wrongCount = wrongQueueEntries(progress.entries).filter((w) =>
    unit.entries.some((e) => e.entryId === w.entryId),
  ).length;

  return (
    <button
      className="unit-card"
      onClick={() => navigate(`/unit/${unit.unit}/setup`)}
    >
      <div className="title">{unit.title}</div>
      <div className="stats">
        {/* Text content is the accessible name — an aria-label here would
            mask the per-unit stats from screen readers (P0-10). */}
        <span className="badge">共 {unit.total} 字</span>
        <span className="badge">重要 {unit.importantCount} 字</span>
        {reviewDue > 0 && (
          <span className="badge review">待複習 {reviewDue}</span>
        )}
        {wrongCount > 0 && <span className="badge wrong">錯題 {wrongCount}</span>}
      </div>
      {learned > 0 ? (
        <div className="unit-progress">
          <span className="unit-progress-label">已學 {learned}/{unit.total}</span>
          <div
            className="progress-track"
            role="progressbar"
            aria-valuenow={pct}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={`已學 ${learned} / ${unit.total} 字`}
          >
            <div className="progress-fill" style={{ width: `${pct}%` }} />
          </div>
        </div>
      ) : (
        <div className="unit-progress">
          <span className="unit-progress-label">未開始</span>
          <div className="progress-track" aria-hidden="true">
            <div className="progress-fill" style={{ width: 0 }} />
          </div>
        </div>
      )}
    </button>
  );
}