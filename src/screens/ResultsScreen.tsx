import { loadResult } from '@/session';
import { summarize } from '@/lib/scoring';
import { getEntry, getEnrichedEntry } from '@/lib/data';
import { SettingsDrawer } from '@/components/SettingsDrawer';
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

  // 下一批 carries question type + fixed cloze difficulty (P0-7).
  const nextBatch = () => {
    const diff =
      result.difficulty && result.difficulty !== 'adaptive'
        ? `/${result.difficulty}`
        : '';
    navigate(`/unit/${result.unit}/setup/${result.type}${diff}`);
  };

  return (
    <>
      <div className="app-header">
        <div>
          <h1>練習結果</h1>
          <div className="sub">{unitTitle} · {typeLabel(result.type)}</div>
        </div>
        <div className="header-actions">
          <SettingsDrawer />
          <button className="back-btn" onClick={() => navigate('/')}>
            ← 返回
          </button>
        </div>
      </div>

      {/* 三 KPI（P1-4）：完成 / 答對 / 待再練；accuracy 次要。 */}
      <div className="card">
        <div className="kpi-row">
          <div className="kpi">
            <div className="kpi-value">{summary.total}</div>
            <div className="kpi-label">完成</div>
          </div>
          <div className="kpi">
            <div className="kpi-value kpi-success">
              {summary.correct}
            </div>
            <div className="kpi-label">答對</div>
          </div>
          <div className="kpi">
            <div
              className={`kpi-value${wrongEntries.length > 0 ? ' kpi-warn' : ''}`}
            >
              {wrongEntries.length}
            </div>
            <div className="kpi-label">待再練</div>
          </div>
        </div>
        <div className="accuracy-line">
          正確率 {Math.round(summary.accuracy * 100)}%
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

      {/* 情境 CTA（P1-4）：有錯題→重練這些字；全對→下一批；不渲染 disabled primary。 */}
      <div className="btn-row">
        {wrongEntries.length > 0 ? (
          <button className="btn" onClick={repracticeWrong}>
            重練這些字（{wrongEntries.length}）
          </button>
        ) : (
          <button className="btn" onClick={nextBatch}>
            下一批
          </button>
        )}
      </div>
      {wrongEntries.length > 0 && (
        <div className="btn-row">
          <button className="btn secondary" onClick={nextBatch}>
            下一批
          </button>
        </div>
      )}
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