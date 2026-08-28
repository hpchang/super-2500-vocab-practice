import type { VocabUnit } from '@/types/index';
import { practicableCount } from '@/lib/data';
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
  const practicable = practicableCount(unit.unit);
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
        <span className="badge practicable">可練習 {practicable} 字</span>
        {reviewDue > 0 && (
          <span className="badge review">待複習 {reviewDue}</span>
        )}
        {wrongCount > 0 && <span className="badge wrong">錯題 {wrongCount}</span>}
      </div>
    </button>
  );
}