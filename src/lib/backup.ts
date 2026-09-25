/**
 * 進度備份：匯出全部學習狀態成一個 JSON 檔，匯入時**合併**回本機。
 *
 * 為什麼是合併而不是覆蓋：學生的實際流程是
 * 「A 匯出 → B 匯入 → B 練習 → B 匯出 → A 匯入」，
 * 任何覆蓋語意都會在順序記錯時吃掉一臺的進度。合併則不管怎麼來回都不會
 * 遺失（I-13）。逐字合併規則與多分頁共用同一套（`mergeProgressData`）。
 *
 * 這個模組的解析／合併函式是純函式，不碰 storage 也不 import store——
 * 套用由 `progressStore` / `studyPlanStore` 的 `applyImported*` 負責，
 * 避免 store 的模組層初始化被測試載入時連帶觸發。
 *
 * 只處理「學習狀態」：progress、study plan、history。`prefs`／`groups`
 * 是裝置在地的 UI 偏好，`checkpoint` 是裝置在地的中途恢復點，皆不備份。
 */

import type { ProgressData, StudyPlan } from '@/types/index';
import { CURRENT_SCHEMA, isValidEntry } from './storage';
import { isValidPlan } from './studyPlanStorage';
import { PLAN_SCHEMA_VERSION } from '@/types/index';
import { HISTORY_SCHEMA, isHistoryRecord, MAX_RECORDS } from './history';
import type { HistoryRecord } from './history';

export const BACKUP_FORMAT = 'vocab-super2500-backup';
export const BACKUP_FORMAT_VERSION = 1;

export interface BackupPayload {
  format: string;
  formatVersion: number;
  /** 匯出當下 epoch ms。 */
  exportedAt: number;
  /** 各區塊寫出時的內部 schema，供未來 migrate 判斷。 */
  appSchema: {
    progress: number;
    plan: number;
    history: number;
  };
  progress: ProgressData;
  plan: StudyPlan | null;
  history: HistoryRecord[];
}

export type ParseResult =
  | { ok: true; payload: BackupPayload }
  | { ok: false; reason: string };

/** 各區塊的摘要——供匯入前的預覽顯示（使用者看得到自己要合併什麼）。 */
export interface BackupSummary {
  exportedAt: number;
  /** 有作答紀錄的字數。 */
  words: number;
  /** 最近一次作答時間，無資料時 null。 */
  lastAnsweredAt: number | null;
  planDays: number;
  historyRecords: number;
  /** 匯入檔有計畫時，其開始日。 */
  planStartDate: string | null;
}

export function buildBackup(input: {
  progress: ProgressData;
  plan: StudyPlan | null;
  history: HistoryRecord[];
  now: number;
}): BackupPayload {
  return {
    format: BACKUP_FORMAT,
    formatVersion: BACKUP_FORMAT_VERSION,
    exportedAt: input.now,
    appSchema: {
      progress: CURRENT_SCHEMA,
      plan: PLAN_SCHEMA_VERSION,
      history: HISTORY_SCHEMA,
    },
    progress: input.progress,
    plan: input.plan,
    history: input.history,
  };
}

/** 備份檔名——用日期，ASCII，避免各瀏覽器對中文檔名處理不一。 */
export function backupFilename(now: number): string {
  const d = new Date(now);
  const p = (n: number) => String(n).padStart(2, '0');
  return `vocab-super2500-backup-${d.getFullYear()}-${p(
    d.getMonth() + 1,
  )}-${p(d.getDate())}.json`;
}

/**
 * 驗證並解析備份檔。外部檔案的內容可任意，一律不信任：
 * 逐區塊做形狀驗證，損壞的**單筆**剔除而不是整份失敗（比照 `loadProgress`
 * 的 I-11 政策），但信封本身（format／formatVersion）不符則明確拒收，
 * 不靜默處理。
 */
export function parseBackup(raw: string): ParseResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ok: false, reason: '這不是有效的備份檔（無法解析 JSON）。' };
  }
  if (typeof parsed !== 'object' || parsed === null) {
    return { ok: false, reason: '這不是有效的備份檔（內容格式不符）。' };
  }
  const o = parsed as Record<string, unknown>;

  if (o.format !== BACKUP_FORMAT) {
    return { ok: false, reason: '這不是 Super 2500 的進度備份檔。' };
  }
  if (o.formatVersion !== BACKUP_FORMAT_VERSION) {
    return {
      ok: false,
      reason: `備份檔版本不支援（檔案為 ${String(
        o.formatVersion,
      )}，本版支援 ${BACKUP_FORMAT_VERSION}）。`,
    };
  }

  // progress：逐筆驗證，損壞筆剔除。
  const rawEntries =
    typeof o.progress === 'object' &&
    o.progress !== null &&
    typeof (o.progress as Record<string, unknown>).entries === 'object' &&
    (o.progress as Record<string, unknown>).entries !== null
      ? ((o.progress as Record<string, unknown>).entries as Record<
          string,
          unknown
        >)
      : {};
  const entries: ProgressData['entries'] = {};
  for (const [id, v] of Object.entries(rawEntries)) {
    if (isValidEntry(v)) entries[id] = v;
  }

  // plan：整份驗證，不過就當作沒有計畫（不讓壞計畫進到 store）。
  const plan: StudyPlan | null = isValidPlan(o.plan) ? o.plan : null;

  // history：逐筆驗證、去重（同 `at` 視為同一場）、排序、上限。
  const rawHistory = Array.isArray(o.history) ? o.history : [];
  const byAt = new Map<number, HistoryRecord>();
  for (const r of rawHistory) {
    if (isHistoryRecord(r)) byAt.set(r.at, r);
  }
  const history = [...byAt.values()]
    .sort((a, b) => a.at - b.at)
    .slice(-MAX_RECORDS);

  const exportedAt =
    typeof o.exportedAt === 'number' && Number.isFinite(o.exportedAt)
      ? o.exportedAt
      : 0;

  return {
    ok: true,
    payload: {
      format: BACKUP_FORMAT,
      formatVersion: BACKUP_FORMAT_VERSION,
      exportedAt,
      appSchema: { progress: CURRENT_SCHEMA, plan: PLAN_SCHEMA_VERSION, history: HISTORY_SCHEMA },
      progress: { schemaVersion: CURRENT_SCHEMA, entries },
      plan,
      history,
    },
  };
}

export function summarizeBackup(payload: BackupPayload): BackupSummary {
  const words = Object.values(payload.progress.entries);
  let lastAnsweredAt: number | null = null;
  for (const e of words) {
    const at = e.lastAnsweredAt ?? 0;
    if (lastAnsweredAt === null || at > lastAnsweredAt) lastAnsweredAt = at;
  }
  return {
    exportedAt: payload.exportedAt,
    words: words.length,
    lastAnsweredAt,
    planDays: payload.plan?.days.length ?? 0,
    historyRecords: payload.history.length,
    planStartDate: payload.plan?.startDate ?? null,
  };
}

/** 套用後回報給使用者的中文摘要（純資料，UI 只負責組字串）。 */
export interface ImportResult {
  progressAdded: number;
  progressUpdated: number;
  historyAdded: number;
  planOutcome: 'adopted' | 'merged' | 'mismatch' | 'none';
}
