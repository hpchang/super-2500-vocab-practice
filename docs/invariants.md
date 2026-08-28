# 系統不變量（Invariants）

這些是「一旦破壞，網站就壞掉或教錯」的系統性保證。每次改動若觸及相關程式碼，
先讀這一頁；每條不變量配有守護測試，改動後必須全綠。

背景：2026-08-28 兩次「135 測試全綠但上線壞掉」——測試環境與真實世界的差距
（載入時序、打包方式）正是改動本身時，既有測試系統性失明（詳見
`docs/code-review-fixes.md` 與 git log 的 P2-5 回歸）。E2E smoke（`npm run check`）
是這些不變量的最後一道防線。

## I-1：render 前 enrichment 必須載完

**陳述**：`main.tsx` 必須 `await loadEnrichments()` 之後才呼叫 `createRoot(...).render()`。
`data.ts` 的同步存取器（`getEnrichedEntry`、`isPracticable`、`getUnits`…）沒有
loading state——若 render 發生在 async chunk 抵達之前，索引會固化成空，首頁零單字。

**為什麼會被破壞**：任何「把 eager import 改 lazy」或「改載入順序」的改動。
模組層級的 `ENRICH_MAP` 是在 `enrichmentRegistry.ts` 內隨各 chunk 抵達重建的，
不是 module-init 一次固化——新增消費端時不得退回「import 完就建索引」的寫法。

**守護**：`e2e/smoke.spec.ts`「home renders unit cards with real data」——斷言
unit card 顯示真實字數（可練習 >0）。已驗證：把 `loadEnrichments()` 改成不 await，
此測試轉紅。

## I-2：作答當下題目鎖定，不被進度變動重建

**陳述**：`PracticeScreen` 的 `questions` 只在 `next()` 以 `getSnapshot()`（store
最新進度）重建；render 期間的進度變化不得觸發題目列表重建（否則作答後題目錯位、
適性難度跳題）。

**守護**：`tests/practiceCloze.test.tsx`（jsdom 組件層：作答後題幹/選項不變）。

## I-3：情境填空題幹具決定性線索

**陳述**：每題題幹只讓答案在文法與語意上都成立；`fullSentence` = 題幹 `___` 換成
規範字；題幹不得含任何選項字；cloze/medium/hard 干擾項同詞性；legacy cloze ≠ 例句。

**守護**：`tests/unit11ClozeData.test.ts`（參數化全量檢查 U11+U12 共 650 題）、
`npx tsx scripts/validate-data.ts`。

## I-4：練習內容只送 practiceable 的字

**陳述**：session 的 entryIds 一律通過 `isPracticable` 過濾（UnitSetup 的
defense-in-depth 過濾 + `buildQuestions` 的 entry 查找）；無 enrichment 的字不得
出現在選擇題/填空 session。

**守護**：unit tests（`tests/questions.test.ts`）；E2E smoke 的 practice loop
間接覆蓋（setup 頁只列可練習字）。

## I-5：storage 一律經安全介面

**陳述**：`localStorage`／`sessionStorage` 讀寫必須走 try/catch 的 safe 介面
（`src/lib/storage.ts`、`checkpoint.ts`、`session.ts`、`prefs.ts`），且讀入的資料
過 schema 驗證——隱私模式、配額滿、舊版損壞資料都不得讓 app crash。

**守護**：`tests/storage.test.ts`、`tests/sessionResume.test.tsx`；code review 時
grep `localStorage.` 直接使用點。

## I-6：TTS 收純英文單字，不收 entryId

**陳述**：傳給 `speak()` 的是經 `wordToSpeak` 解析的英文單字；`entryId`（如
`u11-w03`）直接送 TTS 會唸出亂碼。

**守護**：`tests/speak.test.ts`；review 時檢查所有 `SpeakerButton` 的 `text` 來源。

## I-7：發佈產物必須被執行過才算驗證

**陳述**：`npm test` + `tsc` + `build` 全綠**不代表**網站能動——它們不執行
`dist/`。任何動到載入/打包/路由的改動，merge 前必須跑 `npm run check`
（build + `vite preview` + 真瀏覽器 smoke）。

**守護**：CI（`deploy.yml`）在 upload-pages-artifact 前跑 `npm run check`；
本地 merge 前手動跑一次。

## I-8：進度資料結構向後相容

**陳述**：`progress.entries` 的 schema 變更必須容忍舊資料（缺欄位=預設值，
不 throw）——學生的進度存在瀏覽器裡，沒有 migration 機會。

**守護**：`tests/storage.test.ts` 的舊版資料 case；改 schema 時先加一個
「舊資料載入」測試再動程式碼。