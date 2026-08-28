---
name: add-vocab-unit
description: 為 vocabulary_super2500 新增一個 Unit 的完整流程（匯入字表、產製 enrichment、註冊 metadata、驗證）
---

# 新增 Unit 流程

為 vocabulary_super2500 新增 Unit N（1–32，現有 11、12）時，依序執行：

## 1. 匯入字表（Excel → vocab.json）

```bash
# 先 dry-run 預覽（merge 模式預設保留既有 units）
npx tsx scripts/import-workbook.ts -- --units=N --dry-run

# 確認輸出「Units in output」包含 11, 12, N 再實際寫入
npx tsx scripts/import-workbook.ts -- --units=N
```

- workbook 在 `docs/國中英文超強字彙 Super 2500.xlsx`。
- 預設 **merge 模式**：只重建指定的 units，其餘保留。`--full-replace` 才會整份重建。
- 若 unit 在 workbook 無資料列會明確報錯（防止打錯 unit 號）。

## 2. 註冊 workbook 基準數量（兩處，需同步）

固定字數驗證用，兩個檔案的 `UNIT_METADATA` 要一致：

- `src/lib/enrichmentRegistry.ts`（網站端）
- `scripts/validate-data.ts`（validator）

```ts
'N': { total: <workbook 字數>, important: <重要字數> },
```

不確定數字時，跑一次 dry-run 看「Unit N: X words, Y important」輸出。
沒有 metadata 的 unit 仍可運作（validator 改查內部一致性），但固定數值
驗證是防匯入缺漏的關卡，建議補上。

## 3. 產製 enrichment（量大，用 subagent 分批）

用 `/generate-vocab-enrichment` skill 產製 `src/data/enrichment/units-N.json`。
品質標準重點（詳見該 skill 與 validator）：

- 每字 5 題 cloze（legacy 1 + easy 2 + medium 2 + hard 1），決定性線索：
  題幹只讓答案成立、`fullSentence` 用規範字、干擾項同詞性（easy 可跨）、
  題幹不得含任何選項字。
- staging → 稽核 → 合併的流程見 skill 內文（Unit 12 的 A–F 分批模式）。

## 4. 驗證

```bash
npx tsx scripts/validate-data.ts   # 0 errors
npm test                            # 全過
npm run build                       # 成功
```

新增 unit 後 `src/lib/data.ts` 與 validator **不需要改**——registry 用
`import.meta.glob` 自動發現 `units-*.json`（P1-8）。

## 5. 收尾

- CLAUDE.md 更新「目前完成範圍」（Unit 數、字數）。
- commit 切分：字表匯入與 enrichment 分開（`feat(data): ...` / `feat(enrichment): ...`）。
- push 即自動部署（CI 會跑 test + tsc + validate）。