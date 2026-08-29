# Vocabulary Super 2500 — 專案交接說明

## 專案概況

國中英文超強字彙 Super 2500 — 字彙練習網站。
Vite + React + TypeScript，hash-based routing，localStorage 存進度，無後端。
全程使用繁體中文介面與內容。
**已部署上線**：https://www.hpchang.com/super-2500-vocab-practice/（GitHub Actions 自動部署，詳見 `DEPLOY.md`）。

## Git 進度

分支 `main`（推送即自動部署）。已完成的近期工作：
- 部署 + SEO（canonical／OG／README／repo 描述）
- 批次排序：錯題 → 到期複習 → 未練過 → 其餘（`src/lib/selection.ts`）
- 「下一批」延續原題型（URL 帶 type 參數）
- 單字卡照字母序、其他題型 seeded 隨機（`src/lib/questions.ts`）
- **Unit 11、12 情境填空全部重寫為「決定性線索」**（`3c311ed`、`f1795bd`）
- 三批 enrichment 全部完成：全書 Unit 1–32 / 2,476 字上線（含
  vocab.json 補漏 commit `86c4314`、watchdog `6b8a156`）
- **主頁 UI 改版**（`880f660`、`8a92ebe`）：移除 PoC 標記與 practicable
  機制；單元列表改 4 分組收合（`UnitGroups.tsx` + `groupPrefs.ts`，
  localStorage 記展開狀態）；UnitCard 顯示已學 X/Y 進度條

## 目前完成範圍

### 來源資料
- Excel 全文 2,485 字已可匯入。`scripts/import-workbook.ts` 預設 merge 模式
  （`--units=N,...` 指定要匯入的 Unit，`--dry-run` 可預覽）。
- **`src/data/vocab.json` 已含全部 32 個 Unit（共 2,476 字）**。
  U32 workbook 有 9 個同字跨頁重複列，importer 保留首筆並警告（239 非 248）。

### Enrichment（中文/詞性/例句/題目）
- **Unit 1–32 全部 2,476 字已有完整 enrichment**（每字 5 題情境填空，
  共 12,380 題；三批產製完成於 2026-08-29，均通過 audit-staging 全量稽核）。

### 題型（6 種）
單字卡、英選中、中選英、情境填空、拼字、混合。

### 情境填空適性系統（重點功能）
- 每字 5 題：簡易 2 題（強線索，同詞性優先、跨詞性亦可）+ 中等 2 題（同詞性，以搭配或功能區分）+ 艱難 1 題（相關同詞性選項，由上下文唯一區分）。
- 適性規則：首次→中等；錯誤率 ≥50% 或連錯 ≥2→簡易；答對率 ≥80% 且連對 ≥2→艱難。
- 出過的題目記錄避免重複，同難度用完才重出。
- Unit 設定頁選情境填空時可選難度：適性／簡易／中等／艱難（預設適性）。
- 干擾項可跨 Unit，但優先選同 Unit；難題的相關選項由人工語境與搭配確認答案唯一。
- **決定性線索品質標準（Unit 1–32 已全量達標）**：每題題幹只讓答案在文法與語意上都成立；`fullSentence` = 題幹 `___` 換成規範字（動詞用原形，照 vocab word 原樣含大小寫）；題幹不得含任何選項字；cloze／medium／hard 干擾項同詞性、easy 可跨詞性；每層干擾項池重用 ≤6；legacy cloze ≠ 例句；legacy 中文釋義（zh）四選項唯一。

### 批次選擇（`src/lib/selection.ts`）
- `buildBatch` 依優先序分組：**錯題（inWrongQueue）→ 到期複習（isDueForReview）→ 未練過（無 progress）→ 其餘（練過未到期）**，每組內維持工作簿字母序。
- 目的：重複出題時先出最需要練的字，避免「下一批」重複上一批的單字。
- 首次練習（空進度）仍從頭開始；`buildBatch` 接受 `now` 參數（預設 `Date.now()`）供測試。

### 其他功能
- 多層次拼字提示（字數+詞性 → 首字母 → 字首 → 完整拼法）。
- Web Speech API 發音（單字卡/英選中作答前自動唸；拼字/填空作答後自動唸）。
- 簡化 Leitner 排程（New/Learning/Review/Strong，1/3/7 天複習）。
- 錯題複習、清除進度（需確認）。

## 關鍵檔案結構

```
scripts/import-workbook.ts        Excel → vocab.json（參數 --units 可擴充）
scripts/validate-data.ts          資料驗證
src/data/vocab.json               來源資料（目前 U11/12）
src/data/enrichment/units-11.json 123 字 enrichment
src/data/enrichment/units-12.json 130 字 enrichment
src/types/{vocabulary,questions,progress}.ts
src/lib/data.ts                   資料載入
src/lib/questions.ts               題目建構（含 buildClozeSession）
src/lib/clozeGenerator.ts          5 題生成器（模板+干擾項+語意）
src/lib/adaptive.ts               適性難度選擇
src/lib/{scoring,scheduler,storage,hints,speak,selection}.ts
src/screens/{HomeScreen,UnitSetupScreen,PracticeScreen,ResultsScreen,WrongAnswersScreen}.tsx
src/components/{UnitCard,WordPicker,SpeakerButton}.tsx
src/styles/globals.css
tests/{data,questions,scoring,scheduler,storage,hints,speak,adaptive}.test.ts
tests/practiceCloze.test.tsx       PracticeScreen 組件回歸（jsdom，@vitest-environment 標註）
tests/setup.ts                     測試環境初始化（IS_REACT_ACT_ENVIRONMENT）
vite.config.ts                     vitest include 含 *.test.tsx + setupFiles
```

## 指令

```
npm install          安裝依賴
npm run dev          本機開發
npm run build        正式建置
npm test             跑測試（435 tests）
npm run check        build + Playwright smoke over dist（唯一跑 dist 的驗證）
node scripts/audit-staging.mjs <unit號...>   稽核 staging 檔（兩輪式 pos）
npx tsx scripts/import-workbook.ts --units=N    匯入 Excel（merge 模式；--dry-run 可預覽）
npx tsx scripts/validate-data.ts     驗證資料
```

## 驗證狀態（最後一次）

- `npm test` → 435 tests 全通過
- `npm run build` → 成功
- `npx tsx scripts/validate-data.ts` → 0 errors
- `npx tsc --noEmit` → 0 errors

## 待辦

1. **批次計畫已全部完成（2026-08-29）**：Unit 1–32 全部字表與 enrichment
   上線，commit 在 local main（未 push）。待使用者檢查整體成果後決定
   push 時點（push 即自動部署）。
2. **已修：情境填空作答後題目錯位**（2026-08）。
   - **修法**：`PracticeScreen` 的 `questions` 由 useMemo（依賴 `progress.entries`）改為 useState，只在 `next()` 以 `getSnapshot()`（store 最新進度）重建——作答當下鎖定已呈現題目，適性難度／variant 決策移到下一題。
   - **驗證**：新增 `tests/practiceCloze.test.tsx` 回歸測試（jsdom 組件層，作答後題幹/選項不變）；對舊程式碼可重現失敗、對新程式碼通過。`npm test` 97 全過、build 成功。
3. **已修：Unit 12 情境填空對齊決定性線索**（2026-08-28，commit `f1795bd`）。
   - 重寫全部 130 字 × 5 題（650 題），比照 Unit 11 品質標準；保留 `zh/pos/example/exampleZh/spellingHint/status/source` 不變。
   - 產製流程：subagent 分批（A–F）寫入 `src/data/enrichment/.staging/` → 稽核腳本檢查 7 個品質維度 → 合併回 `units-12.json` → 刪除 staging。
   - 驗證：`tests/unit11ClozeData.test.ts` 參數化涵蓋 Unit 11–18（87→173 tests）、`validate-data` 0 errors、build 成功。

4. **Code review 修復：P0 + P1 已完成**（2026-08-28）。
   - **P0 已修**（commit `5450324`，12 項全數）：待複習 now=0、首頁導向有任務的
     Unit（route 帶 filter）、跨 Unit 錯題分組＋batchSize slice、adaptive 50% 邊界、
     familiar 不升 stage（0.5 天間隔）、clozeUsed 保留其他難度、固定難度延續
     （`SessionResult.difficulty`）、practiceable 強制過濾、session storage 安全介面
     （try/catch + schema 驗證）、a11y 基本盤（focus-visible/aria-live/dialog/
     reduced-motion）、對比 #166534/#92400E/#B91C1C、CI 補 test+tsc+validate。
   - **P1 已完成**（commits `652d672`、`f1c9e57`，10 項全數）：
     - Registry 泛化：`src/lib/enrichmentRegistry.ts` 用 `import.meta.glob` 取代
       硬編碼 11/12——新增 Unit 只需放 JSON 檔；validator 迭代 enrichment 目錄。
     - Importer：改讀 `docs/` workbook、merge 模式預設保留既有 units、
       `--dry-run`／`--full-replace`、atomic write、unit 參數驗證。
     - IA：Home 今日任務 hero（錯題→複習→開始學新字）、Setup 一鍵開始＋進階
       drawer、WordPicker 搜尋/全選、Results 三 KPI＋情境 CTA、錯題依 Unit 分組、
       常駐「進度與設定」drawer（語音自動播放/減少動態/主題，`src/prefs.ts`
       localStorage 獨立於學習進度）。
     - 視覺/響應式：tokens 更新、題幹 2.25rem、選項 64px、tap ≥44px、
       320px 不橫捲、hover/active 狀態。
5. **P2 尚未開始**（見 `docs/code-review-fixes.md`）：session resume（localStorage
   checkpoint）、enrichment dynamic import（主 chunk 約 660kB）、語音速度、
   歷史成效、慶祝元素。prefs.ts 的主題/語音開關已是 P2-3/P2-4 的 UI 基礎。

## 注意事項

- 全程繁體中文介面與內容（非簡體）。
- Commit 遵循 conventional commits（subject ≤50 字、imperative mood、body 解釋 why、72 字折行）。
- enrichment 是 subagent 產製的，品質已驗證但建議後續抽檢人工例句自然度。
- 拼字提示已改成多層次漸進（不再一次給全部字母）。
- 情境填空選項一律用英文單字（非中文釋義）。
- 發音傳給 TTS 的是純英文單字（經 wordToSpeak 解析），不可用 entryId。