import { useEffect, useRef, useState } from 'react';
import { usePrefs, updatePrefs } from '@/prefs';
import { resetProgress } from '@/progressStore';
import { isSpeechSupported } from '@/lib/speak';

/**
 * 常駐「進度與設定」drawer (P1-6): reachable from every screen's header.
 * Contains progress reset (danger zone), speech autoplay, reduced motion
 * and theme — the UI half of P2-3/P2-4.
 */
export function SettingsDrawer() {
  const prefs = usePrefs();
  const [open, setOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const openBtnRef = useRef<HTMLButtonElement | null>(null);

  // Escape closes; focus returns to the gear button.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        openBtnRef.current?.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    panelRef.current?.querySelector<HTMLElement>('button, input')?.focus();
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  const close = () => {
    setOpen(false);
    openBtnRef.current?.focus();
  };

  return (
    <>
      <button
        ref={openBtnRef}
        className="settings-btn"
        aria-label="進度與設定"
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => setOpen(true)}
        type="button"
      >
        ⚙<span className="settings-label">設定</span>
      </button>

      {open && (
        <div className="modal-overlay" onClick={close}>
          <div
            className="modal settings-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="settings-title"
            onClick={(e) => e.stopPropagation()}
            ref={panelRef}
          >
            <h3 id="settings-title">進度與設定</h3>

            <div className="settings-group">
              <div className="settings-row">
                <label htmlFor="pref-speech">自動唸單字</label>
                <input
                  id="pref-speech"
                  type="checkbox"
                  checked={prefs.speechAutoplay}
                  disabled={!isSpeechSupported()}
                  onChange={(e) =>
                    updatePrefs({ speechAutoplay: e.target.checked })
                  }
                />
              </div>
              {!isSpeechSupported() && (
                <div className="settings-note">此瀏覽器不支援語音</div>
              )}

              <div className="settings-row">
                <label htmlFor="pref-motion">減少動態效果</label>
                <input
                  id="pref-motion"
                  type="checkbox"
                  checked={prefs.reducedMotion}
                  onChange={(e) =>
                    updatePrefs({ reducedMotion: e.target.checked })
                  }
                />
              </div>

              <div className="settings-row">
                <label htmlFor="pref-theme">外觀</label>
                <select
                  id="pref-theme"
                  value={prefs.theme}
                  onChange={(e) =>
                    updatePrefs({
                      theme: e.target.value as 'system' | 'light' | 'dark',
                    })
                  }
                >
                  <option value="system">跟隨系統</option>
                  <option value="light">淺色</option>
                  <option value="dark">深色</option>
                </select>
              </div>
            </div>

            <div className="settings-danger">
              <div className="settings-danger-title">危險區域</div>
              {confirming ? (
                <div className="settings-confirm">
                  <p>這會刪除所有作答紀錄、熟悉度與錯題，且無法復原。</p>
                  <div className="btn-row">
                    <button className="btn secondary" onClick={() => setConfirming(false)}>
                      取消
                    </button>
                    <button
                      className="btn danger"
                      onClick={() => {
                        resetProgress();
                        setConfirming(false);
                        close();
                      }}
                    >
                      確定清除
                    </button>
                  </div>
                </div>
              ) : (
                <button className="btn danger" onClick={() => setConfirming(true)}>
                  清除所有進度
                </button>
              )}
            </div>

            <div className="btn-row">
              <button className="btn secondary" onClick={close}>
                關閉
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}