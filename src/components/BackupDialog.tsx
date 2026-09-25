import { useEffect, useRef, useState } from 'react';
import {
  buildBackup,
  parseBackup,
  summarizeBackup,
  backupFilename,
  type BackupSummary,
  type ImportResult,
} from '@/lib/backup';
import { getSnapshot, applyImportedProgress } from '@/progressStore';
import { getPlanSnapshot, applyImportedPlan } from '@/studyPlanStore';
import { loadHistory, applyImportedHistory } from '@/lib/history';

/**
 * 進度備份對話框：匯出成檔案、匯入並**合併**。
 *
 * 為什麼要合併：學生的流程是「A 匯出 → B 匯入 → B 練習 → B 匯出 →
 * A 匯入」，覆蓋語意只要順序記錯就會吃掉一臺的進度（I-13）。
 *
 * 匯入分兩階段：選檔後先**預覽**（這份檔案有什麼），確認後才合併。檔案
 * 來自外部、內容可任意，且合併不可逆，先看清楚再按。
 * Modal 結構比照 ReportDialog（父層持有 open 狀態、Escape 關閉）。
 */

type Status =
  | { kind: 'idle' }
  | { kind: 'preview'; summary: BackupSummary; raw: string }
  | { kind: 'done'; result: ImportResult }
  | { kind: 'error'; reason: string };

export function BackupDialog(props: {
  openerRef?: { current: HTMLElement | null };
  onClose: () => void;
}) {
  const { openerRef, onClose } = props;
  const [status, setStatus] = useState<Status>({ kind: 'idle' });
  const [fileError, setFileError] = useState<string | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
        openerRef?.current?.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    panelRef.current?.querySelector<HTMLElement>('button, input')?.focus();
    return () => document.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const exportBackup = () => {
    const payload = buildBackup({
      progress: getSnapshot(),
      plan: getPlanSnapshot(),
      history: loadHistory(),
      now: Date.now(),
    });
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = backupFilename(payload.exportedAt);
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const onFileChosen = async (file: File | undefined) => {
    setFileError(null);
    if (!file) return;
    const text = await file.text();
    const parsed = parseBackup(text);
    if (!parsed.ok) {
      setStatus({ kind: 'error', reason: parsed.reason });
      return;
    }
    setStatus({
      kind: 'preview',
      summary: summarizeBackup(parsed.payload),
      raw: text,
    });
  };

  const confirmImport = () => {
    if (status.kind !== 'preview') return;
    const parsed = parseBackup(status.raw);
    if (!parsed.ok) {
      setStatus({ kind: 'error', reason: parsed.reason });
      return;
    }
    const p = applyImportedProgress(parsed.payload.progress);
    const historyAdded = applyImportedHistory(parsed.payload.history);
    const plan = applyImportedPlan(parsed.payload.plan);
    setStatus({
      kind: 'done',
      result: {
        progressAdded: p.added,
        progressUpdated: p.updated,
        historyAdded,
        planOutcome: plan.outcome,
      },
    });
  };

  const fmtDate = (ms: number | null) =>
    ms ? new Date(ms).toLocaleDateString('zh-TW') : '—';

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal backup-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="backup-title"
        onClick={(e) => e.stopPropagation()}
        ref={panelRef}
      >
        <h3 id="backup-title">備份與同步</h3>

        <p className="settings-note">
          進度存在這臺電腦的瀏覽器裡。換電腦時，先在這裡匯出成檔案帶過去，
          在另一臺匯入即可繼續（匯入會合併，不會覆蓋）。
        </p>

        <div className="settings-group">
          <button className="btn secondary" onClick={exportBackup} type="button">
            匯出進度檔案
          </button>
        </div>

        <div className="settings-group">
          <label className="backup-file-label" htmlFor="backup-file">
            匯入進度檔案
          </label>
          <input
            id="backup-file"
            ref={fileInputRef}
            type="file"
            accept="application/json,.json"
            onChange={(e) => void onFileChosen(e.target.files?.[0])}
          />
        </div>

        {fileError && (
          <p className="report-error" role="alert">
            {fileError}
          </p>
        )}

        <div className="backup-status" aria-live="polite">
          {status.kind === 'error' && (
            <p className="report-error" role="alert">
              {status.reason}
            </p>
          )}

          {status.kind === 'preview' && (
            <div className="settings-confirm">
              <p>這份備份檔（匯出於 {fmtDate(status.summary.exportedAt)}）含有：</p>
              <ul className="backup-summary">
                <li>已練過 {status.summary.words} 個字</li>
                <li>最近作答：{fmtDate(status.summary.lastAnsweredAt)}</li>
                <li>
                  學習計畫：
                  {status.summary.planStartDate
                    ? `${status.summary.planStartDate} 開始，${status.summary.planDays} 天紀錄`
                    : '無'}
                </li>
                <li>練習紀錄：{status.summary.historyRecords} 筆</li>
              </ul>
              <p>匯入會與這臺電腦的進度合併，兩邊的練習都會保留。</p>
              <div className="btn-row">
                <button
                  className="btn secondary"
                  onClick={() => {
                    setStatus({ kind: 'idle' });
                    if (fileInputRef.current) fileInputRef.current.value = '';
                  }}
                  type="button"
                >
                  取消
                </button>
                <button className="btn" onClick={confirmImport} type="button">
                  確認合併
                </button>
              </div>
            </div>
          )}

          {status.kind === 'done' && (
            <div className="settings-confirm">
              <p className="report-sent">✓ 已合併完成</p>
              <ul className="backup-summary">
                <li>新增 {status.result.progressAdded} 個字</li>
                <li>更新 {status.result.progressUpdated} 個字</li>
                <li>練習紀錄新增 {status.result.historyAdded} 筆</li>
                <li>{planOutcomeText(status.result.planOutcome)}</li>
              </ul>
            </div>
          )}
        </div>

        <div className="btn-row">
          <button className="btn secondary" onClick={onClose} type="button">
            關閉
          </button>
        </div>
      </div>
    </div>
  );
}

function planOutcomeText(outcome: ImportResult['planOutcome']): string {
  switch (outcome) {
    case 'adopted':
      return '學習計畫：已採用備份中的計畫';
    case 'merged':
      return '學習計畫：已合併每日紀錄';
    case 'mismatch':
      return '學習計畫：備份中的計畫與本機不同，已保留本機計畫';
    case 'none':
      return '學習計畫：備份中沒有計畫';
  }
}
