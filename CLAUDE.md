# Vocabulary Super 2500 — 專案交接說明

## 專案概況

國中英文超強字彙 Super 2500 — 字彙練習網站。
Vite + React + TypeScript，hash-based routing，localStorage 存進度，無後端。
全程使用繁體中文介面與內容。
**已部署上線**：https://www.hpchang.com/super-2500-vocab-practice/（GitHub Actions 自動部署，詳見 `DEPLOY.md`）。

## Git 進度

分支 `main`（推送即自動部署）。已完成的近期工作：
- 部署 + SEO（canonical／OG／README／repo 描述）
- 批次優先未練字（`src/lib/selection.ts`）
- 「下一批」延續原題型（URL 帶 type 參數）
- 單字卡照字母序、其他題型 seeded 隨機（`src/lib/questions.ts`）

## 目前完成範圍

### 來源資料
- Excel 全文 2,485 字已可匯入。`scripts/import-workbook.ts` 預設只輸出 Unit 11、12。
- `src/data/vocab.json` 目前只含 Unit 11（123 字/65 重要字）、Unit 12（130 字/76 重要字）。
- **Unit 1–10、13–32 尚未匯入 vocab.json**，需要時跑：
  `npx tsx scripts/import-workbook.ts -- --units=1,2,...,32`

### Enrichment（中文/詞性/例句/題目）
- Unit 11: 123 字、Unit 12: 130 字，全部 253 字已有完整 enrichment。
- 其餘 30 個單元無 enrichment（網站標「尚未提供練習」）。

### 題型（6 種）
單字卡、英選中、中選英、情境填空、拼字、混合。

### 情境填空適性系統（重點功能）
- 每字 5 題：簡易 2 題（跨詞性干擾項）+ 中等 2 題（同詞性干擾項）+ 艱難 1 題（人工例句 + 語意相近干擾項）。
- 適性規則：首次→中等；錯誤率 ≥50% 或連錯 ≥2→簡易；答對率 ≥80% 且連對 ≥2→艱難。
- 出過的題目記錄避免重複，同難度用完才重出。
- Unit 設定頁選情境填空時可選難度：適性／簡易／中等／艱難（預設適性）。
- 干擾項可跨 Unit，語意相近用中文釋義 Jaccard 相似度判斷。

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
src/lib/{scoring,scheduler,storage,hints,speak}.ts
src/screens/{HomeScreen,UnitSetupScreen,PracticeScreen,ResultsScreen,WrongAnswersScreen}.tsx
src/components/{UnitCard,WordPicker,SpeakerButton}.tsx
src/styles/globals.css
tests/{data,questions,scoring,scheduler,storage,hints,speak,adaptive}.test.ts
```

## 指令

```
npm install          安裝依賴
npm run dev          本機開發
npm run build        正式建置
npm test             跑測試（59 tests）
npx tsx scripts/import-workbook.ts    匯入 Excel
npx tsx scripts/validate-data.ts     驗證資料
```

## 驗證狀態（最後一次）

- `npm test` → 59 tests 全通過
- `npm run build` → 成功
- `npx tsx scripts/validate-data.ts` → 0 errors
- Runtime（jsdom）→ 0 錯誤

## 待辦

1. **完成其餘 30 Units**：Unit 1–10、13–32 的來源資料匯入 + enrichment 內容。
   enrichment 量大（約 2,232 字 × 內容），建議分批用 subagent 並行產製。
   產製流程已包成 skill：`/generate-vocab-enrichment`（含格式、品質規則、驗證與合併步驟）。
2. 任何後續優化或 bug 修復。

## 注意事項

- 全程繁體中文介面與內容（非簡體）。
- Commit 遵循 conventional commits（subject ≤50 字、imperative mood、body 解釋 why、72 字折行）。
- enrichment 是 subagent 產製的，品質已驗證但建議後續抽檢人工例句自然度。
- 拼字提示已改成多層次漸進（不再一次給全部字母）。
- 情境填空選項一律用英文單字（非中文釋義）。
- 發音傳給 TTS 的是純英文單字（經 wordToSpeak 解析），不可用 entryId。