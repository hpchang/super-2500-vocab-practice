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

## I-9：選擇題答案位置穩定但不得固定

**陳述**：同一批單字與題型必須產生相同的題序及選項順序，但正確答案必須分布在
第 1～4 項，不得因偽隨機數的低位元偏差而固定或嚴重集中在同一位置。

**守護**：`tests/questions.test.ts` 覆蓋 20 題整體分布、最小 5 題批次的跨批次
聚合分布、跨 Unit 位置序列不得相同，以及相同輸入的完整題序與選項 ID 順序。
不要要求單一 5 題批次必須涵蓋四格——那在真正均勻亂數下也常自然缺一格；應檢查
多批次聚合是否有位置永遠缺席或嚴重壟斷。

## I-10：checkpoint 必須還原完整作答階段並隔離 session

**陳述**：checkpoint 不只保存「第幾題」，也隱含兩種 UI 階段：
`results.length === index` 表示尚未作答；`results.length === index + 1` 表示目前題已
作答、feedback 正在顯示。恢復後不得讓同一題再作答計分。checkpoint 只能套用到同一
session；若 live session 不同應捨棄 checkpoint，若 sessionStorage 因關閉分頁消失則
應從 checkpoint 內的 `session` 恢復。

**守護**：`tests/sessionResume.test.tsx` 的 feedback-phase refresh case；
`tests/sessionIsolation.test.tsx` 的跨 Unit stale checkpoint、WrongAnswers 開新 session
清除，以及 closed-tab（sessionStorage 空）恢復。

## I-11：progress storage 必須容忍損壞資料與多分頁並行

**陳述**：`loadProgress()` 必須逐筆驗證 `EntryProgress`，不能只驗證外層 JSON／
`entries`；損壞筆應剔除，不能讓 Home 的 scheduler 解引用後 crash。多分頁寫入時不得
以過期的整份 snapshot 覆蓋其他分頁進度；寫前合併最新 storage，並接收 `storage`
event，以 `lastAnsweredAt` 較新者為準。

**守護**：`tests/storage.test.ts` 的 null／錯誤型別 entry cases；
`tests/concurrentProgress.test.ts` 先讓另一分頁寫 A，再由舊 snapshot 寫 B，斷言 A/B
都保留。這類測試必須實測舊程式轉紅，單一 tab 的 round-trip 測試無法守住 lost
update。

## 附錄：過去 bug-fix 對照檢查層（為什麼需要 E2E 層）

用歷史 fix 回答「這三層（unit / jsdom 組件 / E2E smoke）各抓什麼」——
未來判斷一個改動該配哪層測試時，先對照這張表。

| 過去的 fix | 當時怎麼死的 | 哪層抓得到 |
|---|---|---|
| `a0b4b5b` 閃卡選完即走吞釋義 | UI 行為無渲染斷言 | **E2E**（smoke 斷言答後 feedback 含「釋義」）＋ DoD 要求先寫渲染斷言 |
| `c87b1ee` 情境填空作答後題目錯位 | 作答→進度→useMemo 重建題目 | **jsdom 組件層**（`practiceCloze.test.tsx`，I-2） |
| `f969a12` TTS 挑可靠聲音 | Chrome TTS 殭屍引擎 | **三層都抓不到**——真實 TTS 不在 headless 重現；靠 review 人檢（I-6）＋ [[chrome-tts-debugging]] 的分層診斷 |
| `ea36c92` 批次排序優先序 | 純邏輯 | **unit 層**（`selection.test.ts`）——這類不需要 E2E |
| `e1a6827` 下一批題型延續 | URL 段解析跨檔改動 | **E2E**（smoke 深鏈 `/#/unit/11/setup/cloze` 走同一路徑） |
| P2-5 `c1bb9e3` lazy-load 回歸 | 打包時序：module-init 固化空索引 | **E2E**（smoke 對 dist/ 斷言 unit card 有字數；已實測轉紅，I-1） |
| `54d0550` feedback refresh 重複計分 | checkpoint 還原資料但漏了 UI phase | **jsdom 組件層**（在作答後、Next 前 remount；I-10） |
| `1f76296` stale／closed-tab checkpoint | 只測 refresh，未測 session identity 與 sessionStorage 消失 | **jsdom 組件層**（跨 Unit＋清空 sessionStorage；I-10） |
| `c56ec7c` malformed progress crash | 外層 JSON 合法但 nested entry 損壞 | **unit 層**（注入 null／錯誤型別；I-11） |
| `b5af4fd` 答案位置規律 | 20 題樣本通過，但最小 5 題與跨 Unit 仍可預測 | **unit 層**（邊界設定＋跨身份樣本；I-9） |
| `e4f5fc2` 多分頁 lost update | 單 tab round-trip 全綠，並行 stale snapshot 覆蓋整份資料 | **unit 層**（模擬兩個 writer；I-11） |

**判斷規則**：改動若改變「測試環境與真實世界的差距」（載入時序、打包、
路由、真實渲染），配 E2E 或 jsdom 渲染斷言；純邏輯配 unit；依賴外部環境
（TTS、真機觸控、隱私模式）的行為三層皆盲，明文寫進 invariants 靠 review 人檢。