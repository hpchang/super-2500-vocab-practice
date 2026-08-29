import { useProgress } from '@/progressStore';
import { wrongQueueEntries } from '@/lib/scheduler';
import { getEntry, getEnrichedEntry } from '@/lib/data';
import { SettingsDrawer } from '@/components/SettingsDrawer';
import { saveSession } from '@/session';
import { clearCheckpoint } from '@/lib/checkpoint';
import type { QuestionType } from '@/types/index';

export function WrongAnswersScreen({
  navigate,
}: {
  navigate: (to: string) => void;
}) {
  const progress = useProgress();
  const wrongs = wrongQueueEntries(progress.entries);

  // Group wrong entries by unit — PracticeScreen resolves entries from a
  // single unit, so a mixed-unit batch would silently drop other units'
  // questions (P0-3). Each group gets its own session.
  const groups = Object.entries(
    wrongs.reduce<Record<string, typeof wrongs>>((acc, w) => {
      const unit = w.entryId.split(':')[0].slice(1);
      (acc[unit] ??= []).push(w);
      return acc;
    }, {}),
  );

  const practiceGroup = (unit: string, groupWrongs: typeof wrongs) => {
    saveSession({
      unit,
      entryIds: groupWrongs.map((w) => w.entryId),
      type: 'mixed',
      batchSize: 20,
    });
    // Starting a new session invalidates any in-flight checkpoint — a stale
    // one would otherwise restore unrelated questions into this session
    // (P1 review 2026-08-29). PracticeScreen does the matching check too,
    // but clearing here keeps checkpoint state consistent at the source.
    clearCheckpoint();
    navigate('/practice');
  };

  return (
    <>
      <div className="app-header">
        <div>
          <h1>錯題複習</h1>
          <div className="sub">{wrongs.length} 個錯題字</div>
        </div>
        <div className="header-actions">
          <SettingsDrawer />
          <button className="back-btn" onClick={() => navigate('/')}>
            ← 返回
          </button>
        </div>
      </div>

      {wrongs.length === 0 ? (
        <div className="empty">目前沒有錯題，繼續加油！</div>
      ) : (
        <>
          {/* 錯題按 Unit 分組顯示（P1-5），每組一顆練習按鈕。 */}
          {groups.map(([unit, groupWrongs]) => (
            <div className="card" key={unit}>
              <h2 className="section-title">
                Unit {unit}（{groupWrongs.length} 字）
              </h2>
              {groupWrongs.map((w) => {
                const e = getEntry(w.entryId);
                const en = getEnrichedEntry(w.entryId);
                return (
                  <div className="list-item" key={w.entryId}>
                    <span>
                      {e?.word} — {en?.zh}
                    </span>
                    <span className="tag">
                      {w.lastWrongType ? typeLabel(w.lastWrongType) : '錯'} · {w.wrongCount} 次
                    </span>
                  </div>
                );
              })}
              <button
                className="btn group-practice-btn"
                onClick={() => practiceGroup(unit, groupWrongs)}
              >
                練習這 {groupWrongs.length} 個錯題字
              </button>
            </div>
          ))}
        </>
      )}

      {/* 清除進度移至常駐「進度與設定」drawer 的 danger zone（P1-5/P1-6）。 */}
    </>
  );
}

function typeLabel(t: QuestionType): string {
  switch (t) {
    case 'flashcard':
      return '單字卡';
    case 'en2zh':
      return '英選中';
    case 'zh2en':
      return '中選英';
    case 'cloze':
      return '情境填空';
    case 'spelling':
      return '拼字';
    default:
      return '混合';
  }
}