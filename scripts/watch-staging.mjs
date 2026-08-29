// 進度監控（防迴圈）：輪詢 .staging 的 units-<n>.json / units-<n>.part*.json，
// 對「有寫入但唯一 entry 數不增」的迴圈型滯留發出事件——活性（mtime 一直動）
// 不等於進展，這是單純 mtime watchdog 抓不到的盲點（批 2 U4 實戰）。
//
// 用法：node scripts/watch-staging.mjs <unit>:<目標字數> ...
//   例如：node scripts/watch-staging.mjs 1:102 2:38 3:93 4:79 5:19
// 事件（每行一個，適合 Monitor 直接吃）：
//   U4 progress 41/79        唯一 entry 數有淨增
//   U4 STALLED 26m no writes 無任何新寫入超過 25 分鐘
//   U4 LOOP writes active but unique count stuck at 41 for 32m   ← 迴圈訊號
//   U4 OVERLAP part4 vs part4a duplicate entryId: u4:human       ← 同批字重寫
//   U4 TIMEOUT 95m elapsed > 1.5x estimate (63m)                  ← 該介入了
//   U4 DONE 79/79           完整檔案就緒且數量達標
// 全部 DONE 後自動結束。
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { resolve, join } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const STAGING = resolve(ROOT, 'src/data/enrichment/.staging');

const targets = new Map();
for (const a of process.argv.slice(2)) {
  const [u, t] = a.split(':');
  if (!u || !t || !/^\d+$/.test(u) || !/^\d+$/.test(t)) {
    console.error('用法: node scripts/watch-staging.mjs <unit>:<目標字數> ...（如 4:79）');
    process.exit(2);
  }
  targets.set(u, Number(t));
}

const STALL_MS = 25 * 60_000; // 無任何寫入
const NOPROG_MS = 30 * 60_000; // 有寫入但唯一數不增（迴圈）
const EST_MIN_PER_24_WORDS = 15; // 產製速率估計（批 1 實戰約此值）
const OVERHEAD_MIN = 10; // 啟動/合併/自檢開銷

const state = new Map(); // unit -> { best, lastChange, ... }
const startedAt = Date.now();

function est(target) { return OVERHEAD_MIN + (target * EST_MIN_PER_24_WORDS) / 24; }

function unitFiles(u) {
  return readdirSync(STAGING)
    .filter((f) => f === `units-${u}.json` || f.startsWith(`units-${u}.part`))
    .map((f) => {
      const p = join(STAGING, f);
      try { return { f, p, mtime: statSync(p).mtimeMs }; } catch { return null; }
    })
    .filter(Boolean);
}

function scan(u) {
  const files = unitFiles(u);
  let lastWrite = 0;
  const unique = new Map(); // entryId -> file（同 id 出現於多檔 = 重疊）
  const overlap = new Map(); // entryId -> [files]
  for (const { f, p, mtime } of files) {
    lastWrite = Math.max(lastWrite, mtime);
    let d;
    try { d = JSON.parse(readFileSync(p, 'utf8')); } catch { continue; }
    if (!Array.isArray(d.entries)) continue;
    for (const e of d.entries) {
      const id = e?.entryId;
      if (!id) continue;
      if (unique.has(id)) {
        if (!overlap.has(id)) overlap.set(id, [unique.get(id)]);
        overlap.get(id).push(f);
      }
      unique.set(id, f);
    }
  }
  return { files, lastWrite, unique: unique.size, overlap, hasFinal: existsSync(join(STAGING, `units-${u}.json`)) };
}

function emit(msg) { console.log(msg); }

// 首次 baseline 回報
for (const [u, target] of targets) {
  if (!existsSync(STAGING)) { console.error(`找不到 ${STAGING}`); process.exit(2); }
  const s = scan(u);
  state.set(u, { best: s.unique, lastChange: Date.now(), stalled: false, loop: false, timedOut: false, overlapWarned: false });
  emit(`U${u} watch ${s.unique}/${target} start (est ${Math.round(est(target))}m)`);
}

const timer = setInterval(() => {
  const now = Date.now();
  let pending = 0;
  for (const [u, target] of targets) {
    const st = state.get(u);
    if (st.done) continue;
    const s = scan(u);

    // 完成判準：最終檔案存在且唯一數達標（以檔案對帳，不看 agent 自報）
    if (s.hasFinal && s.unique >= target) {
      st.done = true;
      emit(`U${u} DONE ${s.unique}/${target} (${Math.round((now - startedAt) / 60000)}m)`);
      continue;
    }
    pending++;

    // 重疊偵測：同 Unit 的 part 檔間 entryId 重複（輪迴重寫的痕跡）。
    // 最終檔已就緒時的重疊只是待清的 part 殘留，不算事件。
    const FINAL = `units-${u}.json`;
    const realOverlap = s.hasFinal
      ? [...s.overlap].filter(([, files]) => !files.every((f) => f === FINAL))
      : [...s.overlap];
    if (realOverlap.length && !st.overlapWarned) {
      st.overlapWarned = true;
      const [id, files] = realOverlap[0];
      emit(`U${u} OVERLAP duplicate entryId across part files: ${id} (${files.join(' + ')})${realOverlap.length > 1 ? ` +${realOverlap.length - 1} more` : ''}`);
    }
    // 重疊只警告一次，避免刷屏

    if (s.unique > st.best) {
      st.best = s.unique;
      st.lastChange = now;
      st.loop = false;
      emit(`U${u} progress ${s.unique}/${target}`);
      continue;
    }
    const idleMin = Math.round((now - s.lastWrite) / 60000);
    const noProgMin = Math.round((now - st.lastChange) / 60000);
    const elapsedMin = Math.round((now - startedAt) / 60000);

    if (idleMin * 60000 >= STALL_MS && !st.stalled) {
      st.stalled = true;
      emit(`U${u} STALLED ${idleMin}m no writes (unique ${s.unique}/${target}, elapsed ${elapsedMin}m)`);
    } else if (st.stalled && idleMin * 60000 < STALL_MS) {
      st.stalled = false; // 恢復寫入
      emit(`U${u} resumed (unique ${s.unique}/${target})`);
    }

    // 核心迴圈偵測：寫入活躍但唯一數持續不增
    if (!st.stalled && idleMin * 60000 < STALL_MS && now - st.lastChange >= NOPROG_MS && !st.loop) {
      st.loop = true;
      emit(`U${u} LOOP writes active but unique count stuck at ${s.unique}/${target} for ${noProgMin}m — 疑似重複產出迴圈，考慮盤點 part 檔後介入`);
    }

    // 時長上限：超過 1.5 倍估計仍未完成
    if (!st.timedOut && elapsedMin > 1.5 * est(target)) {
      st.timedOut = true;
      emit(`U${u} TIMEOUT elapsed ${elapsedMin}m > 1.5x estimate (${Math.round(est(target))}m), unique ${s.unique}/${target} — TaskStop 後盤點、派接手 agent`);
    }
  }
  if (pending === 0) { clearInterval(timer); emit('ALL UNITS DONE'); }
}, 60_000);