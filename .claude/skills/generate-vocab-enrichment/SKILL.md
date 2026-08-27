---
name: generate-vocab-enrichment
description: 為 Vocabulary Super 2500 尚未完成的 Unit 產製 enrichment JSON（中文、詞性、例句、5 題情境填空），供 subagent 並行生成。格式、品質規則、驗證與合併步驟都寫在下方。
---

# 產製 Vocabulary Enrichment（Unit 1–10、13–32）

為指定 Unit 產生 `src/data/enrichment/units-<n>.json`。一個 Unit 一檔。此 skill 供「主 session 派 subagent 並行產製」與「subagent 自行生成」共用。

## 產製前（主 session 做）

1. 確認該 Unit 已匯入 vocab.json：
   `npx tsx scripts/import-workbook.ts -- --units=<n>`
   再跑 `npx tsx scripts/validate-data.ts` 確認 vocab 通過。
2. 派 subagent 時給它：此 skill 名稱、Unit 編號、vocab.json 中該 Unit 的 entryId 清單（subagent 也可自己讀 `src/data/vocab.json`）。

## JSON 格式（schemaVersion 1）

```json
{
  "schemaVersion": 1,
  "unit": "11",
  "entries": [
    {
      "entryId": "u11:apartment",
      "zh": "公寓",
      "pos": "noun",
      "example": "We live in a small apartment.",
      "exampleZh": "我們住在一間小公寓裡。",
      "spellingHint": "a-p-a-r-t-m-e-n-t",
      "status": "reviewed",
      "source": "人工編寫",
      "cloze": { "sentence": "We live in a small ___.", "fullSentence": "We live in a small apartment.", "translation": "我們住在一間小公寓裡。", "clue": "住的地方，通常在大樓裡", "answerEntryId": "u11:apartment", "distractorEntryIds": ["u11:balcony", "u11:kitchen", "u11:bedroom"] },
      "clozeEasy": [ /* 2 題，跨詞性干擾 */ ],
      "clozeMedium": [ /* 2 題，同詞性干擾 */ ],
      "clozeHard": { /* 1 題，同詞性 + 語意相近干擾 */ }
    }
  ]
}
```

- `entryId` = `u<unit>:<word>`，字面照 vocab.json 的 entryId，不可改。
- `pos` 只用五種：`noun | verb | adjective | adverb | phrase`。
- `spellingHint`：字母以 `-` 連字（多字片語也用 `-` 分隔），全部小寫。
- 範例參考 `src/data/enrichment/units-11.json`。

## 每字的內容要求

每個 entry 需產出：
- `zh` 繁中釋義（貼近國中課本、一個主要義即可）
- `pos` 詞性
- `example` 簡短英文例句（國中生可懂，避免過難字彙）
- `exampleZh` 例句繁中翻譯
- `spellingHint` 以 `-` 連字母
- `status` 一律 `reviewed`；`source` 一律 `人工編寫`
- **5 題情境填空**，每題為 `ClozeQuestion`（sentence 含 `___`、fullSentence、translation、clue、answerEntryId、distractorEntryIds[3]）：
  - `cloze`：1 題，**同詞性**干擾（供非適性填空／選擇題干擾項用）
  - `clozeEasy`：2 題，**跨詞性**干擾（noun 對 verb/adjective 等，明顯易判）
  - `clozeMedium`：2 題，**同詞性**干擾（須靠語意才能選）
  - `clozeHard`：1 題，**同詞性 + 語意相近**干擾（最難）

## 干擾項規則（validate-data 會強制檢查）

- 4 個選項（答案 + 3 干擾）必須**全部唯一**。
- 干擾項 entryId 必須存在於 vocab.json（可跨 Unit）。
- easy 的 3 個干擾項必須與答案**不同詞性**。
- medium / hard / cloze 的干擾項必須與答案**同詞性**。
- hard 干擾項還須與答案**語意相近**（e.g. apartment 配 house/room/building）。
- 干擾項最好取自同 Unit 或鄰近 Unit 的重要字，學生較熟。

## 句子品質要求

- `sentence` 的 `___` 位置要讓答案在文法上唯一合理；**干擾項填入後文法也要成立**（同詞性干擾尤其如此），但語意不合。
- `fullSentence` = sentence 填入答案後的完整句。
- 句子用國中生程度英文；繁中翻譯、`clue` 用繁中。
- `clue` 是答後提示（繁中短語），不是答案。
- 例句與填空句**不同**（不要重複用同一句）。

## 驗證與合併

1. 生成後跑 `npx tsx scripts/validate-data.ts`，必須 **0 errors**。常見錯誤與修法：
   - `distractor not in vocab` → 干擾項不在任何已匯入 Unit，換一個已匯入的 entryId。
   - `should be cross-POS` / `POS !=` → easy 誤用同詞性、或 medium/hard 誤用跨詞性，改干擾項。
   - `options not unique` → 干擾項與答案重複，換一個。
   - `missing blank` / `missing clue` / `need 3 distractors` → 補欄位。
2. 合併：把新檔案放到 `src/data/enrichment/`，然後在 `src/lib/data.ts` 的 `ENRICHMENTS` 註冊 `'<n>': enrichment<n> as EnrichmentData`，並新增對應 `import enrichment<n> from '@/data/enrichment/units-<n>.json'`。
3. 重跑 `npx tsx scripts/validate-data.ts` 確認 0 errors。
4. 建議抽檢 3–5 句例句／填空句的英文自然度（subagent 產製品質可能不均）。

## 產製規模建議

- 每 Unit 約 90–130 字。一次 subagent 負責 1–2 個 Unit。
- 可並行多個 subagent（各寫不同檔案，無衝突）。
- 全部完成後主 session 統一註冊 `src/lib/data.ts` 並驗證、commit。

## 完成定義

- 每個目標 Unit 都有 `units-<n>.json`，含該 Unit 全部字。
- `validate-data.ts` 0 errors、`npm test` 全過、`npm run build` 成功。
- `src/lib/data.ts` 已註冊新 Unit。
