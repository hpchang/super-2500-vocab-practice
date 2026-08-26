import { useState } from 'react';
import { useProgress } from '@/progressStore';
import { resetProgress } from '@/progressStore';
import { wrongQueueEntries } from '@/lib/scheduler';
import { getEntry, getEnrichedEntry } from '@/lib/data';
import { saveSession } from '@/session';
import type { QuestionType } from '@/types/index';

export function WrongAnswersScreen({
  navigate,
}: {
  navigate: (to: string) => void;
}) {
  const progress = useProgress();
  const wrongs = wrongQueueEntries(progress.entries);
  const [confirming, setConfirming] = useState(false);

  const practiceAll = () => {
    if (wrongs.length === 0) return;
    // Determine the unit from the first entry.
    const first = wrongs[0];
    const unit = first.entryId.split(':')[0].slice(1);
    saveSession({
      unit,
      entryIds: wrongs.map((w) => w.entryId),
      type: 'mixed',
      batchSize: Math.min(20, wrongs.length),
    });
    navigate('/practice');
  };

  const doClear = () => {
    resetProgress();
    setConfirming(false);
  };

  return (
    <>
      <div className="app-header">
        <div>
          <h1>錯題複習</h1>
          <div className="sub">{wrongs.length} 個錯題字</div>
        </div>
        <button className="back-btn" onClick={() => navigate('/')}>
          ← 返回
        </button>
      </div>

      {wrongs.length === 0 ? (
        <div className="empty">目前沒有錯題，繼續加油！</div>
      ) : (
        <>
          <div className="card">
            <div className="section-title">錯題清單</div>
            {wrongs.map((w) => {
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
          </div>
          <button className="btn" onClick={practiceAll}>
            練習全部錯題
          </button>
        </>
      )}

      <div className="section-title" style={{ marginTop: 24 }}>
        進度管理
      </div>
      {!confirming ? (
        <button className="btn danger" onClick={() => setConfirming(true)}>
          清除所有進度
        </button>
      ) : (
        <div className="modal-overlay" onClick={() => setConfirming(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>清除所有進度？</h3>
            <p>
              這會刪除所有作答紀錄、熟悉度與錯題，且無法復原。確定要繼續嗎？
            </p>
            <div className="btn-row">
              <button className="btn secondary" onClick={() => setConfirming(false)}>
                取消
              </button>
              <button className="btn danger" onClick={doClear}>
                確定清除
              </button>
            </div>
          </div>
        </div>
      )}
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