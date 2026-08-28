import { loadResult } from '@/session';
import { summarize } from '@/lib/scoring';
import { getEntry, getEnrichedEntry } from '@/lib/data';
import { saveSession } from '@/session';

export function ResultsScreen({ navigate }: { navigate: (to: string) => void }) {
  const result = loadResult();

  if (!result || result.results.length === 0) {
    return (
      <>
        <button className="back-btn" onClick={() => navigate('/')}>
          ← 返回
        </button>
        <div className="empty">沒有可顯示的結果</div>
      </>
    );
  }

  const summary = summarize(result.results);
  const wrongEntries = summary.wrongEntries;
  const unitTitle = result.unit === '11' ? 'Unit 11' : `Unit ${result.unit}`;

  const repracticeWrong = () => {
    if (wrongEntries.length === 0) return;
    // Wrong entries may span units (mixed sessions); PracticeScreen resolves
    // entries from a single unit, so keep only this unit's wrong entries
    // instead of silently dropping the rest (P0-3).
    const unitWrong = wrongEntries.filter((w) =>
      w.entryId.startsWith(`u${result.unit}:`),
    );
    saveSession({
      unit: result.unit,
      entryIds: unitWrong.map((w) => w.entryId),
      type: 'mixed',
      batchSize: 20,
    });
    navigate('/practice');
  };

  return (
    <>
      <div className="app-header">
        <div>
          <h1>練習結果</h1>
          <div className="sub">{unitTitle} · {typeLabel(result.type)}</div>
        </div>
        <button className="back-btn" onClick={() => navigate('/')}>
          ← 返回
        </button>
      </div>

      <div className="card">
        <div className="summary-big">
          <div className="pct">{Math.round(summary.accuracy * 100)}%</div>
          <div className="frac">
            {summary.correct} / {summary.total} 題答對
          </div>
        </div>
        <div className="result-stat">
          <span className="label">答對</span>
          <span className="value" style={{ color: 'var(--success)' }}>
            {summary.correct}
          </span>
        </div>
        <div className="result-stat">
          <span className="label">答錯</span>
          <span className="value" style={{ color: 'var(--danger)' }}>
            {summary.wrong}
          </span>
        </div>
      </div>

      <div className="card">
        <h2 className="section-title">各題型表現</h2>
        {Object.entries(summary.byType).map(([type, s]) => (
          <div className="result-stat" key={type}>
            <span className="label">{typeLabel(type as any)}</span>
            <span className="value">
              {s.correct}/{s.total}
            </span>
          </div>
        ))}
      </div>

      <div className="card">
        <h2 className="section-title">
          需要再練的單字 ({wrongEntries.length})
        </h2>
        {wrongEntries.length === 0 ? (
          <div className="empty">全部答對，太棒了！</div>
        ) : (
          wrongEntries.map((w) => {
            const e = getEntry(w.entryId);
            const en = getEnrichedEntry(w.entryId);
            return (
              <div className="list-item" key={w.entryId}>
                <span>
                  {e?.word} — {en?.zh}
                </span>
                <span className="tag">{typeLabel(w.type)}</span>
              </div>
            );
          })
        )}
      </div>

      <div className="btn-row">
        <button
          className="btn"
          disabled={wrongEntries.length === 0}
          onClick={repracticeWrong}
        >
          重練錯題
        </button>
        <button
          className="btn secondary"
          onClick={() => {
            // Carry the cloze difficulty through so a fixed difficulty
            // (e.g. 艱難) survives into the next batch (P0-7).
            const diff = result.difficulty && result.difficulty !== 'adaptive' ? `/${result.difficulty}` : '';
            navigate(`/unit/${result.unit}/setup/${result.type}${diff}`);
          }}
        >
          下一批
        </button>
      </div>
      <div className="btn-row">
        <button className="btn ghost" onClick={() => navigate('/')}>
          返回首頁
        </button>
      </div>
    </>
  );
}

function typeLabel(t: string): string {
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