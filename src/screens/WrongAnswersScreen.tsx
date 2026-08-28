import { useEffect, useRef, useState } from 'react';
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
  const modalRef = useRef<HTMLDivElement | null>(null);
  const openModalBtnRef = useRef<HTMLButtonElement | null>(null);

  // Focus trap + focus restore for the clear-progress dialog (P0-10).
  useEffect(() => {
    if (!confirming) return;
    const modal = modalRef.current;
    modal?.querySelector<HTMLElement>('button')?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Tab' || !modal) return;
      const focusables = modal.querySelectorAll<HTMLElement>('button');
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      openModalBtnRef.current?.focus();
    };
  }, [confirming]);

  const cancelClear = () => setConfirming(false);

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
            <h2 className="section-title">錯題清單</h2>
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
          {groups.map(([unit, groupWrongs]) => (
            <button
              key={unit}
              className="btn"
              onClick={() => practiceGroup(unit, groupWrongs)}
            >
              練習 Unit {unit} 錯題（{groupWrongs.length} 字）
            </button>
          ))}
        </>
      )}

      <h2 className="section-title" style={{ marginTop: 24 }}>
        進度管理
      </h2>
      {!confirming ? (
        <button
          className="btn danger"
          onClick={() => setConfirming(true)}
          ref={openModalBtnRef}
        >
          清除所有進度
        </button>
      ) : (
        <div
          className="modal-overlay"
          onClick={() => setConfirming(false)}
          onKeyDown={(e) => e.key === 'Escape' && setConfirming(false)}
        >
          <div
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="clear-progress-title"
            onClick={(e) => e.stopPropagation()}
            ref={modalRef}
          >
            <h3 id="clear-progress-title">清除所有進度？</h3>
            <p>
              這會刪除所有作答紀錄、熟悉度與錯題，且無法復原。確定要繼續嗎？
            </p>
            <div className="btn-row">
              <button className="btn secondary" onClick={cancelClear} autoFocus>
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