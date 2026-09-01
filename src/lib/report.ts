/** 回報情境填空題目問題：站內 POST 到 Google Form（formResponse 端點）。
 *
 *  設計重點：
 *  - 使用者（國中生）只勾「哪個選項有問題」＋選填說明，其餘資訊自動帶入，
 *    方便站長對回 enrichment JSON 的 Unit／難度／題號修正。
 *  - 用 `mode: 'no-cors'` 送出（Google formResponse 回 302，無法讀取回應），
 *    所以送出結果只能以「fetch 沒丟例外」視為成功。
 *  - FORM_CONFIG 集中在這裡：換表單只需改這一處。
 */

import type { Question } from '@/lib/questions';
import { getEntry } from '@/lib/data';

/** Google Form 設定。取得方式：
 *  1. form ID：表單「傳送」連結裡
 *     https://docs.google.com/forms/d/e/<FORM_ID>/viewform 的中段。
 *  2. 各欄位 entry ID：開啟表單頁 → 右鍵「檢查」每個輸入框，name 屬性為
 *     `entry.<數字>`；或檢視原始碼搜尋 `entry.`。
 *  欄位順序對應見 buildReportPayload()。 */
export const FORM_CONFIG = {
  formId: '1FAIpQLScZmzQU88sdRgZ5xV4cpRyOwn0WI3anNDET6zoQJONSWsA3lg',
  // entry IDs 對應表單欄位：
  //   word: 單字（短答案，自動帶入）
  //   locator: Unit/難度/題號（短答案，自動帶入）
  //   question: 題幹與四個選項（段落，自動帶入）
  //   problemOption: 有問題的選項（單選＋其他，學生勾選）
  //   note: 補充說明（段落，學生選填）
  entries: {
    word: 'entry.982374563',
    locator: 'entry.750031095',
    question: 'entry.1476160114',
    problemOption: 'entry.2075000661',
    note: 'entry.1558049245',
  },
} as const;

export function isFormConfigured(): boolean {
  return !FORM_CONFIG.formId.startsWith('PLACEHOLDER');
}

/** 組出 formResponse 的 URL-encoded body 欄位（key = entry.xxx）。 */
export function buildReportPayload(
  q: Question,
  unit: string,
  problemOption: string,
  note: string,
): Record<string, string> {
  const entry = getEntry(q.entryId);
  const word = entry?.word ?? q.prompt;
  const difficulty = q.clozeDifficulty ?? '?';
  const variant = q.clozeVariant != null ? `v${q.clozeVariant}` : '?';

  const optionsText = (q.options ?? [])
    .map((o) => {
      const mark = o.entryId === q.answer ? ' ✓' : '';
      return `(${o.label})${mark}`;
    })
    .join(' ');
  const questionText = [
    `${q.prompt} ${q.context?.fullSentence ?? ''}`.trim(),
    `選項：${optionsText}`,
  ].join('\n');

  return {
    [FORM_CONFIG.entries.word]: word,
    [FORM_CONFIG.entries.locator]: `u${unit} · ${difficulty} · ${variant}`,
    [FORM_CONFIG.entries.question]: questionText,
    [FORM_CONFIG.entries.problemOption]: problemOption,
    [FORM_CONFIG.entries.note]: note,
  };
}

/** 送出回報。no-cors 無法讀回應，回 true 代表請求已發出。
 *  「有問題的選項」是簡答欄（原 radio 已改），任意文字直收。 */
export async function submitReport(
  payload: Record<string, string>,
): Promise<boolean> {
  const action = `https://docs.google.com/forms/d/e/${FORM_CONFIG.formId}/formResponse`;
  const body = new URLSearchParams(payload);
  body.append('fvv', '1');
  body.append('pageHistory', '0');
  try {
    await fetch(action, {
      method: 'POST',
      mode: 'no-cors',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });
    return true;
  } catch {
    return false;
  }
}