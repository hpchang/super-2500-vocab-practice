# Vocabulary Super 2500 — 國中英文超強字彙練習

國中英文 Super 2500 的互動練習網站。以間隔複習、適性情境填空與錯題重練，幫助學生依自己的學習狀態記憶及複習單字。

**正式網站**：https://www.hpchang.com/super-2500-vocab-practice/

## 目前內容

- Unit 1–32 全部上線，共 **2,476 個單字**，其中 1,243 個標記為重要字
- 每個單字都有中文、詞性、例句、拼字提示與完整練習內容
- 每個單字有 5 題適性情境填空：簡易 ×2、中等 ×2、艱難 ×1
- 全書共有 **12,380 題適性情境填空**，另保留每字 1 題 legacy cloze 供混合題型使用

## 主要功能

- **6 種題型**：單字卡、英選中、中選英、情境填空、拼字、混合
- **適性情境填空**：依正確率與連續答題表現，自動選擇簡易、中等或艱難題目；也可固定難度
- **間隔複習排程**：簡化 Leitner 系統（New / Learning / Review / Strong），安排 1、3、7 天複習
- **智慧批次**：依序優先安排錯題、到期複習、未練過及其他單字
- **錯題複習**：自動收集錯題，並依 Unit 分組重新練習
- **中斷續練**：未完成的練習保存於瀏覽器，重新整理或關閉分頁後可接續原題目與進度
- **多層次拼字提示**：字數與詞性 → 首字母 → 字首 → 完整拼法
- **發音設定**：使用 Web Speech API，可調整自動播放與語速
- **個人化設定**：淺色／深色／跟隨系統、減少動態效果、答對自動前進
- **學習紀錄**：結果頁顯示題型表現、待再練單字及近 14 天練習趨勢
- **單元進度**：32 個 Unit 分為四組收合顯示，並呈現各單元與各組已學進度

所有進度、設定、歷史紀錄及中斷練習都儲存在使用者自己的瀏覽器，不需帳號，也沒有後端服務或跨裝置同步。

## 技術架構

- Vite + React 18 + TypeScript
- Hash-based routing，支援 GitHub Pages 子路徑部署
- `localStorage` 保存學習進度、偏好、歷史與練習 checkpoint
- `sessionStorage` 保存目前分頁的 session／結果資料
- Enrichment JSON 透過 `import.meta.glob` 動態載入
- Vitest + jsdom 單元／組件測試
- Playwright 對正式 `dist/` 執行 Chromium smoke test

## 本地開發

需要 Node.js 22 與 npm。

```bash
npm install            # 安裝依賴
npm run dev            # 啟動 Vite 開發伺服器
npm test               # 執行 Vitest 單元與組件測試
npm run test:watch     # 監看模式執行測試
npm run validate       # 驗證 vocab 與 enrichment 資料
npx tsc --noEmit       # TypeScript 型別檢查
npm run build          # 型別檢查並建立正式 dist/
npm run check          # 正式 build + Playwright Chromium smoke
npm run preview        # 預覽既有 dist/
```

`npm run check` 是唯一會在真實瀏覽器中驗證正式 `dist/` 產物的指令；合併或部署前應執行完整測試、資料驗證與 `npm run check`。

## 資料維護

### 字彙來源

來源工作簿位於：

```text
docs/國中英文超強字彙 Super 2500.xlsx
```

匯入工具預設採 **merge 模式**，只更新指定 Unit，保留其他既有單元：

```bash
npm run import -- --units=11,12 --dry-run  # 預覽，不寫入
npm run import -- --units=11,12            # 匯入指定 Unit
```

`--full-replace` 只保留本次指定的 Unit，使用前應特別確認。Importer 會正規化資料、保留跨 Unit 重複字紀錄，並以 atomic write 更新 `src/data/vocab.json`。

### Enrichment

```text
src/data/vocab.json                 # 32 個 Unit 的來源字彙
src/data/enrichment/units-*.json    # 中文、詞性、例句、提示及情境題
scripts/validate-data.ts            # 全量資料驗證
```

新增 enrichment 檔後，registry 會在建置時自動發現 `units-*.json`，不需另外修改硬編碼清單。情境題資料會檢查 entryId、選項唯一性、詞性、題幹與選項衝突、題目重複及干擾項池重用等規則。

## 工程品質

本專案依故障邊界採用分層驗證：

1. 純邏輯與資料轉換使用 Vitest unit tests
2. React 可見狀態轉換使用 jsdom component tests
3. vocab／enrichment 使用全量 validator 與內容品質測試
4. 打包、非同步資料載入、hash routing 與核心操作使用 Playwright production smoke
5. TTS、真機觸控與特定瀏覽器行為保留人工抽查

相關文件：

- [工程品質策略](docs/engineering-quality.md)
- [系統不變量](docs/invariants.md)
- [Pre-merge checklist](docs/pre-merge-checklist.md)
- [部署說明](DEPLOY.md)

## 部署

Push 到 `main` 後，GitHub Actions 會依序執行：

1. Vitest 測試
2. TypeScript 型別檢查
3. 資料驗證
4. 正式 build 與 Playwright smoke
5. 上傳並發布 GitHub Pages artifact

任一步驟失敗都不會部署。正式網址與部署後檢查方式見 [DEPLOY.md](DEPLOY.md)。

## 專案結構

```text
src/components/          共用 UI 元件
src/screens/             首頁、設定、練習、結果與錯題頁
src/lib/                 題目、適性、排程、儲存、語音與歷史邏輯
src/data/                字彙與 enrichment JSON
src/types/               TypeScript 資料型別
scripts/                 匯入與資料驗證工具
tests/                   Vitest 單元、資料與組件測試
e2e/                     Playwright production smoke
docs/                    品質策略、規範與維護文件
.github/workflows/        GitHub Pages 部署流程
```

## License

Private project. All rights reserved.
