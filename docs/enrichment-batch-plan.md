# Enrichment 完成計畫：批次執行（批 1–3）

> 狀態：待執行（2026-08-28 訂定）。本計畫已與使用者確認，新 session 直接照做。
> 執行用 skill：`/add-vocab-unit`（完整流程）+ `/generate-vocab-enrichment`
> （並行產製規則與陷阱，含 13–18 實戰教訓）。

## 目標

完成全部剩餘 24 個 Unit 的字表匯入 + enrichment，共 2,461 字：

- **批 1：Unit 19–32**（14 個 Unit，1,733 字）
  - 大 Unit：U32(248)、U29(146)、U31(136)；小 Unit：U25(16)、U26(12)、U28(23)、U19(29)、U24(30)
- **批 2：Unit 1–5**（5 個 Unit，332 字）
  - U1(102)、U2(38)、U3(93)、U4(79)、U5(19)
- **批 3：Unit 6–10**（5 個 Unit，396 字）
  - U6(86)、U7(53)、U8(46)、U9(141)、U10(70)

各批字數來源：workbook 實算（`docs/國中英文超強字彙 Super 2500.xlsx`，
單字/頁數/重要/Unit 四欄）。

## 執行規則（已與使用者確認）

1. **逐批推進**：每批跑完 → 完整測試 → 確定沒問題 → 才跑下一批。
2. **批內修復**：測試有問題就修正到好；學到的經驗更新進
   `generate-vocab-enrichment` skill，才繼續。
3. **三批全部完成後**，由使用者檢查整體成果，再決定 push 時點。
   （批次期間 commit 在 local main，不 push。）
4. 預估總時長 4.5–5 小時（批 1 約 2.5h，批 2/3 各約 1h）。

## 每批固定流程

1. 匯入：`npx tsx scripts/import-workbook.ts -- --units=N,...`
   （先 `--dry-run` 確認 Units in output 與字數，再實際寫入）
2. 補**兩處** UNIT_METADATA（`src/lib/enrichmentRegistry.ts` +
   `scripts/validate-data.ts`），數字以 dry-run 輸出為準
3. 擴充 `tests/unit11ClozeData.test.ts` 參數化迴圈（載入新 units-*.json）
4. 派 subagent 寫 `src/data/enrichment/.staging/units-<n>.json`
   （skill 規則：暫存檔帶 Unit 號、medium/hard/cloze 干擾項用本 Unit 內部同詞性字）
5. 稽核：`node scripts/audit-staging.mjs <批內unit號...>`
   （兩輪式：先註冊全部檔案的 pos 再驗證；ALL CHECKS PASSED 才合併）
6. 合併 staging → `npx tsx scripts/validate-data.ts`（0 errors）
   → `npm test` → `npm run check`（build + Playwright smoke over dist）
7. 全綠 → commit（字表匯入與 enrichment 分開兩個 commit）→ 下一批

## 批 1 前置作業（本 session 已完成）

- [x] 稽核腳本已正規化：`scripts/audit-staging.mjs`
      （用法 `node scripts/audit-staging.mjs 19 20 ...`；兩輪式 pos 註冊、
      spellingHint 允許 `[a-z- ]`、跨 entry 句子唯一、池重用 ≤6）
- [x] skill 已更新：spellingHint 片語慣例、UNIT_METADATA 步驟、並行陷阱
- [x] registry 已改 lazy load（P2 merge），新增 Unit 仍只需放檔案 + metadata

## 已知風險

- **大 Unit 是時間瓶頸**（U32 248 字估 95–100 分）；若批 1 太久可拆半
- **subagent 自檢的 regex 比對範圍**要含空格（spellingHint），已寫進 skill
- **U32 若有大量跨頁字**，dry-run 字數要和本計畫表核對，不符時以 workbook 為準
- Playwright smoke 用真實資料，新 Unit 會自然被涵蓋；批 1 驗證時確認 smoke 過