# Context

目前專案只有 `國中英文超強字彙 Super 2500.xlsx`，尚無網站程式。PoC 的目的，是先用 Unit 11 與 Unit 12 驗證「選 Unit／選單字 → 小批次練習 → 即時回饋 → 錯題再練 → 保存進度」是否適合國中生，而不是一次完成全部 32 Units。

工作簿已確認共有 2,485 筆單字；Unit 11 有 123 字（65 個重要字，頁 106–117），Unit 12 有 130 字（76 個重要字，頁 121–134）。Excel 只有單字、頁數、重要標記與 Unit，沒有中文、詞性、例句或題目。依使用者選擇，PoC 會匯入兩個 Unit 的全部 253 字，但先為每個 Unit 約 20 個重要字完成可實際練習的內容，共約 40 字。

# Recommended approach

## 1. 建立靜態前端 PoC

- 使用 Vite、React、TypeScript 建立手機優先的單頁網站。
- 使用繁體中文介面，視覺簡潔成熟，不採兒童化遊戲風格。
- 不建立帳號或後端；學習進度保存在瀏覽器 `localStorage`。
- 使用 hash-based navigation，讓建置結果可直接部署到 Cloudflare Pages、GitHub Pages 或其他靜態主機；本次只做到可部署與本機驗證，不對外發布。

## 2. 建立可擴充到 32 Units 的資料流程

新增 `scripts/import-workbook.ts`：

- 讀取 `工作表1`，忽略尾端只有格式但沒有單字的空白列。
- 正規化 Unicode、前後空白與重複空格。
- 將頁數轉為整數，將「是／否」轉成 boolean。
- PoC 僅輸出 Unit 11、12，但參數設計可日後匯入全部 Units。
- 產生 Unit-specific `entryId` 與跨 Unit 共用的 `termId`。
- 同 Unit 重複字視為錯誤；跨 Unit 重複字保留並列入報告，避免錯誤刪除課程資料。

產出版本化 JSON，瀏覽器不直接解析 Excel。

## 3. 製作 40 字的 PoC 題庫

- 從 Unit 11、12 各挑選約 20 個重要字，兼顧 noun／verb／adjective／adverb 等詞性，並確保填空題能組成合理的同詞性干擾選項。
- 每個 PoC 單字補上：繁中釋義、詞性、簡短英文例句、例句中譯、拼字提示，以及一題情境填空題。
- 內容標記為 `draft` 或 `reviewed`，保留日後校訂與來源欄位；不使用執行時翻譯 API。
- 填空題保存完整句子、正確答案與三個人工檢查過的干擾選項；四個選項必須唯一、詞性相容，而且只能有一個合理答案。
- 其餘 213 字保留在 Unit 單字清單與資料驗證中，但 PoC 練習介面會清楚顯示「目前可練習 20 字」，不假裝缺少的中文或題目已完成。

## 4. 實作學習流程

### 首頁

- 顯示 Unit 11、Unit 12 卡片。
- 顯示總字數、重要字數、目前可練習字數、待複習與錯題數。
- 提供「繼續學習」及「複習錯題」入口。

### Unit 設定頁

- 顯示完整來源單字清單及目前 PoC 可練習範圍。
- 可篩選重要字、待複習、錯題，或自訂勾選可用單字。
- 批次大小提供 5、10、20，預設 10。
- 題型提供：單字卡、英選中、中選英、情境填空、拼字、混合模式。
- 若所選單字不支援某題型，停用該模式並顯示可用數量，不在執行時臨時編造題目。

### 練習頁

- 一次顯示一題，顯示 Unit、題型與 `目前題數 / 總題數`。
- 選擇題使用四個大型按鈕並支援鍵盤 1–4。
- 情境填空答題後顯示完整句子、中文、關鍵線索與各選項詞義。
- 拼字採正規化後的精確比對，保留連字號、撇號與片語空格。
- 單字卡提供「不記得／有點熟／記得」。
- 所有題型提供即時回饋，但不在作答前揭露答案。

### 結果與錯題複習

- 顯示正確率、各題型表現與需要再練的單字。
- 提供「重練錯題」、「下一批」及「返回 Unit」。
- 錯題以 `entryId` 去重，記錄最近答錯題型與次數。

## 5. 學習進度

新增版本化的 localStorage adapter，以 Unit-specific `entryId` 保存：

- 作答次數、答對／答錯次數、連續答對次數。
- New／Learning／Review／Strong 四階段熟悉度。
- 最近作答與下次複習時間。
- 是否仍在錯題佇列。

PoC 採簡化 Leitner 節奏：答錯回到 Learning 並進入錯題；答對依階段安排約 1／3／7 天後複習。提供清除進度功能，執行前必須確認。

# Critical files

預計新增的主要檔案：

- `package.json`, `vite.config.ts`, `tsconfig.json`, `index.html`
- `scripts/import-workbook.ts`：Excel 匯入與正規化
- `scripts/validate-data.ts`：數量、欄位、重複字及題目品質檢查
- `src/data/vocab.json`：Unit 11、12 的正規化來源資料
- `src/data/enrichment/units-11-12.json`：約 40 字的 PoC 內容與題目
- `src/types/{vocabulary,questions,progress}.ts`：資料契約
- `src/lib/{data,selection,questions,scoring,scheduler,storage}.ts`：純邏輯層
- `src/screens/{HomeScreen,UnitSetupScreen,PracticeScreen,ResultsScreen,WrongAnswersScreen}.tsx`
- `src/components/{UnitCard,WordPicker,Flashcard,MultipleChoice,SpellingInput,SessionProgress,ResultsSummary}.tsx`
- `src/styles/globals.css`
- `tests/{data,questions,scoring,scheduler,storage}.test.ts`

# Implementation sequence

1. 載入 artifact design 指引，建立 Vite／React／TypeScript 專案與基本視覺系統。
2. 實作 Excel importer、資料型別與 validator，確認 Unit 11／12 數量分別為 123／130，重要字為 65／76。
3. 選定每 Unit 約 20 個 PoC 單字，建立並驗證中文、詞性、例句與情境填空內容。
4. 實作單字篩選、題目產生、評分、拼字正規化、錯題與複習排程等純函式。
5. 實作首頁、Unit 設定、練習、結果與錯題複習畫面。
6. 加入 localStorage schema、錯誤復原與清除進度確認。
7. 完成響應式、鍵盤操作、焦點狀態與非純色彩回饋。
8. 執行自動測試、正式建置，並實際啟動網站走完主要流程。

# Verification

- 資料測試：Unit 11／12 及重要字數量與 Excel 一致；沒有 Unit 內重複；空白與頁數正確正規化。
- 題目測試：每題四個唯一選項、答案只出現一次、填空選項詞性相容、所有 ID 都能解析。
- 邏輯測試：中英選擇、拼字比對、錯題去重、熟悉度轉換與到期選字。
- 儲存測試：重新載入後保留進度；損壞或舊版資料能安全回復。
- UI 測試：選 Unit → 自訂選字 → 完成五種題型 → 查看結果 → 重練錯題。
- 執行 `npm test`、`npm run build`，再啟動成品於桌面與手機寬度實際檢查。

# PoC completion criteria

- Unit 11、12 的 253 筆來源資料完整匯入且可瀏覽。
- 每個 Unit 約 20 字可完成所有題型。
- 學生可選 Unit、篩選／勾選單字及選擇 5／10／20 字批次。
- 單字卡、中英選擇、情境填空、拼字與混合模式均可完成。
- 答錯單字可立即重練，進度在重新整理後仍保留。
- 手機與桌面皆可操作，測試與正式建置通過。
