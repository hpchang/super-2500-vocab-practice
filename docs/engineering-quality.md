# 工程品質策略

> 這是一份持續演進的專案文件（living document）。它整理目前有效的品質原則、
> 風險、測試分層與品質閘門；不是 QA 對話逐字稿，也不是尚未確認想法的待辦清單。

## 目的

Vocabulary Super 2500 是無後端的瀏覽器應用，但仍跨越多個可能失效的邊界：
資料匯入與 enrichment、React 狀態轉換、localStorage、非同步 chunk 載入、正式打包、
靜態網站路由及瀏覽器 API。單一測試層無法代表所有這些環境。

本策略要回答四個問題：

1. 使用者最不能失敗的流程是什麼？
2. 系統可能以哪些方式失敗？
3. 每種風險由哪一層測試或人工檢查攔截？
4. 一個改動達到什麼條件才算完成、可合併、可部署？

具體操作與系統保證分別見：

- [系統不變量](./invariants.md)：什麼條件永遠必須成立，以及對應守護測試。
- [Pre-merge checklist / Definition of Done](./pre-merge-checklist.md)：合併前實際執行項目。
- [Playwright smoke](../e2e/smoke.spec.ts)：在真實 Chromium 執行正式 `dist/` 的關鍵流程。
- [Playwright 設定](../playwright.config.ts)：以 `vite preview` 啟動正式產物。
- [部署流程](../.github/workflows/deploy.yml)：部署前的自動品質閘門。

## 為什麼需要這份策略

2026-08-28 發生兩次「既有測試全綠，但使用者流程仍損壞」的回歸：

1. 單字卡自動前進略過 feedback，而中文釋義只存在 feedback 區，使用者看不到答案。
2. Enrichment 從 eager import 改為 lazy import 後，entry index 在 async chunk 抵達前
   由空 registry 建立，真實瀏覽器顯示零個可練習單字；Vitest 的本地模組載入沒有重現
   production chunk 的網路時序。

第一個案例揭露缺少使用者可見行為的渲染斷言；第二個案例揭露缺少執行正式打包產物的
瀏覽器測試。它們不是「多寫幾個 unit test」就能完整解決的同類問題，而是測試策略未涵蓋
故障所在的系統邊界。

因此，本專案採用風險導向原則：**先辨識故障發生在哪個邊界，再選擇最便宜且足以重現
該邊界的驗證方式。**

## 品質原則

1. **測試層次由風險決定，不由檔案類型決定。** 純邏輯用 unit test；React 可見狀態
   轉換用 component test；打包、載入、路由與瀏覽器整合用 production E2E smoke。
2. **測試必須能在錯誤版本上失敗。** 只證明目前程式碼會通過，不足以構成回歸保護。
3. **`test + typecheck + build` 不等於可部署。** `build` 只產生 `dist/`，不證明瀏覽器
   能載入並完成核心流程；`npm run check` 才會執行正式產物。
4. **重要架構假設要外顯。** 會造成網站空白、資料遺失或教錯內容的條件寫入
   `docs/invariants.md`，並盡可能配可執行守護測試。
5. **重大事故改善品質系統，而不只修單一 bug。** 除了 regression test，也要檢查
   risk register、測試層、品質閘門或 invariant 是否有缺口。
6. **自動化與人工檢查互補。** 真實 TTS 音質、真機觸控與特定瀏覽器隱私模式未必能在
   CI 穩定重現；不能可靠自動化的風險應明文列出人工檢查，而不是假裝已被測試覆蓋。
7. **品質閘門應逐步自動化。** 可重複且客觀的 checklist 項目最終應進入 npm script、
   CI required check 或部署流程，避免依賴個人記憶。

## 關鍵使用者流程

以下流程是 smoke 與發布抽查的優先範圍：

1. 首頁顯示至少一個含真實可練習字數的 Unit。
2. 使用者可以進入 Unit 設定並開始練習。
3. 題目與選項正常出現，作答後顯示 feedback、釋義或正確答案。
4. 情境填空顯示題幹、四個選項與答後語境。
5. 完成 session 後顯示結果，且進度可在重新開啟網站後保留。
6. `main` 部署後，正式網址可以完成上述最短流程。

Smoke 不追求覆蓋所有題型與邊界值；它的目的，是快速判斷正式產物是否具備可用的核心
功能。演算法、資料品質與邊界值交由較便宜且更容易定位錯誤的測試層完整覆蓋。

## 風險與控制

| 風險 | 使用者後果 | 主要控制 | 品質閘門 |
|---|---|---|---|
| Enrichment chunk 未載入或 index 過早建立 | 首頁零個可練習單字 | Playwright production smoke、I-1 | PR / deploy |
| Vocab 與 enrichment 不一致 | 缺題目、缺答案或顯示錯字 | data validator、資料測試 | PR |
| 情境填空答案不唯一 | 教錯內容 | 全量資料規則測試、人工抽查、I-3 | PR |
| 作答更新進度後題目被重建 | 題幹或選項在作答後改變 | jsdom component regression、I-2 | PR |
| Feedback 被略過 | 使用者看不到釋義或答案 | component test、E2E practice loop | PR |
| 非 practiceable entry 進入 session | 空題或無有效選項 | unit test、defense-in-depth、I-4 | PR |
| Storage 阻擋、損壞或舊 schema | 網站 crash 或進度遺失 | safe adapter、schema tests、I-5/I-8 | PR |
| Hash route 或 base path 在部署後失效 | 直接連結或頁面導航失敗 | E2E deep link、部署後抽查 | deploy |
| TTS 收到 entryId 或不可靠 voice | 發音錯誤或無聲 | unit test、code review、人工瀏覽器測試、I-6 | PR / manual |
| 響應式版面或真機互動異常 | 手機無法操作 | viewport/人工 smoke；必要時新增 visual test | manual / future |

風險新增、嚴重度改變或控制方式改變時，更新此表；尚未接受的改善方案先建立 GitHub Issue，
不要直接把提案寫成已生效的專案規則。

## 測試分層與責任

### 1. Unit tests

適用於純函式、排程、選擇、評分、提示、題目生成與資料轉換。這一層應快速、確定且容易
指出錯誤位置。

典型檔案：`tests/selection.test.ts`、`tests/scoring.test.ts`、
`tests/adaptive.test.ts`、`tests/questions.test.ts`。

### 2. Data validation

適用於 vocab/enrichment 結構、數量、entryId 對齊、cloze 規則與內容不變量。

執行：

```bash
npm run validate
```

資料內容的語意自然度與唯一性若無法完全由規則判斷，仍需人工抽查。

### 3. Component tests（Vitest + jsdom）

適用於 React 事件後的使用者可見狀態轉換，例如作答後題目是否保持、釋義是否出現、
checkpoint 是否恢復正確位置。

jsdom 不等同真實瀏覽器，也不執行 Vite production chunk 的網路載入；它不能取代 E2E。

### 4. Production E2E smoke（Playwright）

`npm run check` 先建立 `dist/`，再由 `vite preview` 提供正式產物，最後以 Chromium 執行
`e2e/smoke.spec.ts`。

```bash
npm run check
```

這一層專門守住：production build、chunk 載入、hash routing、真實 DOM 與關鍵互動流程。
Smoke 應保持少量、穩定與高價值，避免把所有細節測試都推進較慢且較脆弱的 E2E 層。

### 5. 人工與真實環境檢查

Web Speech API 的實際聲音、不同作業系統 voice、真機觸控、隱私模式與視覺細節可能無法
在 CI 忠實重現。這些風險記入 invariants 或 checklist，並在相關改動後做針對性人工驗證。

## 品質閘門

### 開發時

- 受影響的 unit/component test 先紅後綠。
- 修改資料時執行 validator。
- 修改架構時先檢查相關 invariants。

### 合併前

完整 Definition of Done 見 [pre-merge checklist](./pre-merge-checklist.md)。最低要求：

```bash
npm test
npx tsc --noEmit
npm run validate   # 有動 data/enrichment 時
npm run check      # 一律執行正式 dist/ smoke
```

### CI / 部署前

`.github/workflows/deploy.yml` 在上傳 GitHub Pages artifact 前執行 tests、typecheck、validator
與 Playwright smoke；任一步失敗都不得部署。

### 部署後

抽查正式網站首頁 Unit 字數、開始一題練習與作答 feedback。未來若部署頻率或協作規模提高，
可將此步升級成對正式 URL 的自動 post-deploy smoke 或 canary gate。

## 文件分工

| 內容 | 保存位置 | 性質 |
|---|---|---|
| 目前採用的品質原則、風險與測試策略 | 本文件 | 可持續更新的現況 |
| 永遠必須成立的系統條件 | `docs/invariants.md` | 規範 + 守護測試 |
| Merge 前必做項目 | `docs/pre-merge-checklist.md` | 操作清單 / Definition of Done |
| 重大架構選擇及取捨 | `docs/adr/NNNN-*.md` | 不覆寫歷史；可標記 superseded |
| 已發生且具系統性學習價值的事故 | `docs/quality-incidents/`（需要時建立） | 精簡 postmortem |
| 尚未決定或尚未排程的改善想法 | GitHub Issues（建議標籤 `quality`） | 提案與 backlog |
| 個人閱讀心得或一般工程筆記 | 專案外個人筆記 | 不屬於專案規範 |

本文件保存整理過、可執行的結論；不保存 QA 對話逐字稿。Git history 已提供策略變更紀錄，
不需在文件內另維護冗長 changelog。

## 品質策略如何演進

### 提出新想法

尚未接受的想法先建立 GitHub Issue，而不是直接寫成正式規則。建議內容：

```markdown
## Risk
這項改善要避免哪種具體故障？

## Failure scenario
什麼輸入或環境會造成什麼錯誤或使用者影響？

## Proposed control
建議在哪一層攔截：unit、component、E2E、CI、deploy 或人工檢查？

## Cost and trade-offs
執行時間、維護成本、flakiness、環境或依賴成本。

## Acceptance criteria
怎樣才算完成？哪個錯誤版本能讓新檢查轉紅？

## Related invariant / decision
是否新增或改變 invariant、架構決策或 Definition of Done？
```

### 接受並實作

提案被接受後，依影響更新：

1. 程式碼與能在舊版本失敗的 regression test。
2. 本文件的 risk register、測試責任或 quality gate。
3. 新增或變更的 `docs/invariants.md` 條目。
4. `docs/pre-merge-checklist.md` 的操作要求。
5. 若是重大架構取捨，新增 ADR，不覆寫舊決策脈絡。
6. CI 或 npm script，將可自動化的規則變成不可遺漏的 gate。

### 事故後學習

事故處理不能停在「修 bug + 加一個 test」。還要問：

- 現有哪一層為什麼看不到它？
- 風險是否已在 risk register？
- 是否破壞未被記錄的 invariant？
- 應增加新測試、調整測試層，還是增加部署／人工 gate？
- 這是單一缺陷，還是同一類故障可能在其他地方重演？

只有具跨功能、跨版本學習價值的事故才需要獨立 postmortem；一般 bug 保留 regression test、
Issue/PR 與 commit body 即可，避免文件膨脹。

## 維護時機

以下改動應重新檢查本策略：

- sync 改 async、lazy-load、code splitting 或 module initialization 順序變更；
- storage schema、路由、部署平台或 base path 變更；
- 新增後端、登入、跨裝置同步或遠端資料來源；
- 新增重要使用者流程或新的瀏覽器 API；
- CI 時間、E2E flakiness 或維護成本顯著上升；
- 發生「既有檢查全綠但正式流程損壞」的事故。

至少在重大架構變更或品質事故後檢視一次；不需要為了形式固定週期更新。

## 參考脈絡

本策略綜合以下工程傳統，而非遵循一套固定的「三件套標準」：

- Test Pyramid / Test Sizes：不同測試層的成本、速度與可見範圍。
- Continuous Delivery / Deployment Pipeline：從 commit 到部署的自動品質閘門。
- Design by Contract / invariants：把必須永遠成立的條件外顯並守護。
- Architecture Decision Records：保存重大決策的 context、decision 與 consequences。
- Definition of Done：對「完成」建立共同且可檢查的品質狀態。
- SRE release engineering：發布前後的 smoke、checklist、staged rollout 與可靠性思維。

延伸閱讀：

- [Martin Fowler — The Practical Test Pyramid](https://martinfowler.com/articles/practical-test-pyramid.html)
- [Google Testing Blog — Test Sizes](https://testing.googleblog.com/2010/12/test-sizes.html)
- [Martin Fowler — Deployment Pipeline](https://martinfowler.com/bliki/DeploymentPipeline.html)
- [Michael Nygard — Documenting Architecture Decisions](https://cognitect.com/blog/2011/11/15/documenting-architecture-decisions)
- [Eiffel Software — Design by Contract](https://www.eiffel.com/values/design-by-contract/)
- [The Scrum Guide — Definition of Done](https://scrumguides.org/scrum-guide.html)
- [Google SRE — Release Engineering](https://sre.google/sre-book/release-engineering/)
- [Google SRE — Launch Checklist](https://sre.google/sre-book/launch-checklist/)
