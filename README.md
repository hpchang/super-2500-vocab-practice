# Vocabulary Super 2500 — 國中英文超強字彙練習

國中英文字彙 Super 2500 的互動練習網站。以間隔複習（Leitner 排程）為核心，提供 6 種題型與適性情境填空，幫助學生有效記憶與複習單字。

**正式網站**：https://www.hpchang.com/super-2500-vocab-practice/

## 功能

- **6 種題型**：單字卡、英選中、中選英、情境填空、拼字、混合
- **情境填空適性系統**：每字 5 題（簡易 ×2、中等 ×2、艱難 ×1），依答題表現自動升降難度
- **間隔複習排程**：簡化 Leitner（New / Learning / Review / Strong，1/3/7 天複習）
- **多層次拼字提示**：字數 → 首字母 → 字首 → 完整拼法，逐步揭曉
- **發音**：Web Speech API 朗讀單字（TTS）
- **錯題複習**：自動收集答錯的單字，可再次練習
- **進度存於瀏覽器**（localStorage），無需帳號

## 目前內容範圍

- Unit 11（123 字）、Unit 12（130 字）已完整匯入並含練習內容（253 字）
- 其餘單元陸續擴充中

## 技術

- Vite + React + TypeScript
- Hash-based routing，可在任何靜態主機子路徑部署
- localStorage 存進度，無後端

## 本地開發

```bash
npm install        # 安裝依賴
npm run dev        # 本機開發
npm run build      # 正式建置
npm test           # 跑測試
```

## 部署

部署到 GitHub Pages（`https://www.hpchang.com/super-2500-vocab-practice/`），
push 到 `main` 後由 GitHub Actions 自動建置發布。詳見 `DEPLOY.md`。

## 資料

- 來源字彙由 Excel 工作簿匯入：`scripts/import-workbook.ts`
- 練習內容（中文、詞性、例句、題目）存放於 `src/data/enrichment/`
- 資料驗證：`npx tsx scripts/validate-data.ts`

## License

Private project. All rights reserved.
