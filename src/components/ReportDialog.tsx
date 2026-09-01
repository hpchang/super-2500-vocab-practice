import { useEffect, useRef, useState } from 'react';
import type { Question } from '@/lib/questions';
import {
  buildReportPayload,
  submitReport,
  isFormConfigured,
} from '@/lib/report';

/**
 * 回報題目問題對話框：學生勾選哪個選項有問題（＋選填說明），
 * 站內直接 POST 到 Google Form，不需登入、不跳離網站。
 * Modal 結構比照 SettingsDrawer（.modal-overlay > .modal、Escape 關閉、
 * 開啟時 focus 第一個控制項）。
 */

type Status = 'editing' | 'sending' | 'sent' | 'failed';

export function ReportDialog(props: {
  question: Question;
  unit: string;
  openerRef?: { current: HTMLElement | null };
  onClose: () => void;
}) {
  const { question, unit, openerRef, onClose } = props;
  const [choice, setChoice] = useState('');
  const [note, setNote] = useState('');
  const [status, setStatus] = useState<Status>('editing');
  const panelRef = useRef<HTMLDivElement | null>(null);

  const options = question.options ?? [];

  // Escape 關閉、開啟時 focus 第一個 radio；關閉後 focus 回報發按鈕。
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && status !== 'sending') {
        onClose();
        openerRef?.current?.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    panelRef.current
      ?.querySelector<HTMLElement>('input, button, textarea')
      ?.focus();
    return () => document.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  const closeAfter = (ms: number) => {
    setTimeout(() => {
      onClose();
      openerRef?.current?.focus();
    }, ms);
  };

  const submit = async () => {
    if (!choice || status !== 'editing') return;
    setStatus('sending');
    const payload = buildReportPayload(question, unit, choice, note.trim());
    const ok = await submitReport(payload);
    if (ok) {
      setStatus('sent');
      closeAfter(1500);
    } else {
      setStatus('failed');
    }
  };

  if (!isFormConfigured()) {
    return (
      <div className="modal-overlay" onClick={onClose}>
        <div
          className="modal report-modal"
          role="dialog"
          aria-modal="true"
          aria-labelledby="report-title"
          onClick={(e) => e.stopPropagation()}
          ref={panelRef}
        >
          <h3 id="report-title">回報題目問題</h3>
          <p className="settings-note">回報功能設定中，敬請期待。</p>
          <div className="btn-row">
            <button className="btn" onClick={onClose} type="button">
              關閉
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal report-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="report-title"
        onClick={(e) => e.stopPropagation()}
        ref={panelRef}
      >
        <h3 id="report-title">回報題目問題</h3>

        {status === 'sent' ? (
          <>
            <p className="report-sent">✓ 已送出，謝謝你！</p>
          </>
        ) : (
          <>
            <p className="report-lead">哪個選項在這題不適合？</p>
            <div className="report-options" role="radiogroup" aria-label="有問題的選項">
              {options.map((o) => (
                <label key={o.entryId} className="report-option">
                  <input
                    type="radio"
                    name="report-option"
                    value={o.label}
                    checked={choice === o.label}
                    onChange={() => setChoice(o.label)}
                  />
                  <span>{o.label}</span>
                </label>
              ))}
              <label className="report-option">
                <input
                  type="radio"
                  name="report-option"
                  value="其他"
                  checked={choice === '其他'}
                  onChange={() => setChoice('其他')}
                />
                <span>其他（例如題目本身）</span>
              </label>
            </div>
            <textarea
              className="report-note"
              placeholder="補充說明（可留空）"
              rows={2}
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
            {status === 'failed' && (
              <p className="report-error" role="alert">
                送出失敗，請檢查網路後再試一次。
              </p>
            )}
            <div className="btn-row">
              <button
                className="btn btn-secondary"
                onClick={onClose}
                disabled={status === 'sending'}
                type="button"
              >
                取消
              </button>
              <button
                className="btn"
                onClick={submit}
                disabled={!choice || status === 'sending'}
                type="button"
              >
                {status === 'sending' ? '送出中…' : '送出'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}