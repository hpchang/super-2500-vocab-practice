# Code Review 修復計畫（2026-08-28）

> 來源：全專案唯讀 code review（工程＋UI 設計師＋UX 設計師，兩輪交叉評審已達共識）。
> 本文件為唯一執行依據；重開 session 後按 Phase 順序實作。
> 審查當下基線：97 tests 全過、build 成功、validate-data 0 errors、tsc --noEmit 通過。

## 背景與結論

- 專案為可用的 PoC，無 Critical 級安全或資料毀損問題。
- 主要風險集中在：複習排程計算、跨 Unit 資料流、適性難度邊界、單字卡評分語意、
  以及擴充 32 Units 前的硬編碼架構。
- UI／UX 共識：**不採強制 stepper**，改為「今日任務 → 一鍵開始 → 作答後理解 → 明確下一步」。

---

## P0：學習與資料正確性（先修，每項含驗收）

### P0-1 待複習篩選固定 now=0

- 問題：`filterEntries()` 的 review 分支呼叫 `isDueForReview(p, 0)`，
  正常 epoch 的 `nextReviewAt` 永遠大於 0，真實到期字篩不出來。
- 位置：`src/lib/selection.ts:29-34`（呼叫端 `src/screens/UnitSetupScreen.tsx:57-65`）
- 修法：`filterEntries()` 增加 `now` 參數（預設 `Date.now()`），傳入 `isDueForReview`。
- 驗收：單元測試涵蓋「已到期 / 未到期 / 無進度」三種邊界；Setup 選待複習能出現到期字。

### P0-2 首頁繼續學習固定導向 Unit 11

- 問題：首頁統計是全域（`HomeScreen.tsx:9-10`），但按鈕固定 `navigate('/unit/11/setup')`
  （`HomeScreen.tsx:35-37`），且 Setup 預設「重要字」（`UnitSetupScreen.tsx:45`），
  只有 U12 或非重要字到期時目標字完全不出現。
- 修法（擇一，建議 A）：
  - A：導向第一個有到期/錯題任務的 Unit，並自動套用對應 filter（review/wrong）。
  - B：建立全域今日任務 queue（需 SessionConfig 支援，工程量較大）。
- 驗收：只有 U12 到期時，首頁按「繼續學習」能練到 U12 到期字；新增 component 測試。

### P0-3 跨 Unit 錯題被靜默丟棄 + batchSize 未生效

- 問題：
  - `WrongAnswersScreen.tsx:18-29` 取第一筆錯題的 unit，卻塞入全部錯題 entryIds；
    `PracticeScreen.tsx:44-48` 只從該 unit 找 entry，其他 Unit 的題目被 filter 掉。
  - `ResultsScreen.tsx:24-31` 的 repracticeWrong 同樣模式。
  - 兩處都寫 `batchSize` 但 buildQuestions 未 slice，超過 20 題仍全練。
- 修法（建議 A）：
  - A：錯題依 Unit 分組，每組獨立 session（UI 顯示分組按鈕）。
  - B：SessionConfig 升級為 multi-unit queue（工程量大，列 P1+）。
  - 無論何者：建題前依 batchSize slice。
- 驗收：跨 U11/U12 錯題重練不丟題；錯題 > batchSize 時題數 = batchSize；補回歸測試。

### P0-4 適性難度 50% 邊界與規格不符

- 問題：規格與 Setup 文案寫「錯誤率 ≥50% 降簡易」，實作是 `accuracy < 0.5`
  （`src/lib/adaptive.ts:22-23`）。2/4 正確且未連錯兩次 → 仍 medium。
- 修法：改 `accuracy <= 0.5`（或改算 error rate `>= 0.5`）；
  同步 `adaptive.ts` 註解與 `UnitSetupScreen.tsx:204-207` 文案。
- 驗收：精確 50%（2/4）回 easy 的單元測試。

### P0-5 單字卡「有點熟」被當成「記得」

- 問題：`gradeFlashcard()` 只回 boolean（`src/lib/scoring.ts:31-34`），
  Practice 只傳 `correct` 給 `recordAnswer`（`PracticeScreen.tsx:134-139`），
  scheduler 無法區分（`src/lib/scheduler.ts:49-57`）。
  learning 階段按「有點熟」會直接升 review + 3 天，違反「familiar 留在 learning」註解。
- 修法：保留 rating 到 scheduler——為 `forgot / familiar / remembered` 定義
  獨立 stage 與 interval（familiar：stage 留 learning 或不上升，複習間隔短於 correct）。
- 驗收：三種 rating 的 stage/interval 各有單元測試；結果統計 familiar 仍計為「想起來」。

### P0-6 cloze 題池重置會清掉其他難度紀錄

- 問題：`PracticeScreen.tsx:146-155`，當前 tier 用完時
  `...used.length ? prev.clozeUsed : {}` spread 空物件，easy/medium/hard 其他層
  的 clozeUsed 一併消失 → 提早重複出題。
- 修法：永遠 spread `prev.clozeUsed`，只重設當前 difficulty 的陣列：
  `clozeUsed: { ...prev.clozeUsed, [q.clozeDifficulty]: [] }` 再 push。
- 驗收：跨 tier 使用紀錄測試（easy 用完後 medium/hard 紀錄仍在）。

### P0-7 固定 cloze 難度在「下一批」遺失

- 問題：`SessionResult` 無 difficulty（`src/session.ts:16-20`）；
  Results「下一批」只帶 type（`ResultsScreen.tsx:110`）；
  UnitSetup difficulty 初始恆為 adaptive（`UnitSetupScreen.tsx:48-49`）。
- 修法：`SessionResult` 加入 `difficulty?: DifficultyMode`；
  saveResult 時寫入 session.difficulty；下一批 route/session 帶回；
  結果頁 CTA 顯示延續的難度。
- 驗收：選「艱難」完成後按下一批，Setup 難度仍為艱難（component 測試）。

### P0-8 瀏覽集合與可出題集合分離

- 問題：`all` 模式繞過 practiceableOnly（`selection.ts:45-52`），
  Setup「全部瀏覽」可把未 enrichment 字放進 batch，buildQuestions 靜默跳題
  （`PracticeScreen.tsx:44-52`）→ 顯示字數 ≠ 實際題數。
  另外可練數顯示固定為全 unit（`UnitSetupScreen.tsx:147`）不隨 filter。
- 修法：start 前一律對 batch 強制 `isPracticable` 過濾；
  Setup 顯示「已選 X / 可練 Y」，兩者一致；未 enrichment 項在瀏覽時 disabled。
- 驗收：partial-enrichment 單元測試：選取數 = 實際出題數。

### P0-9 Session storage 安全介面

- 問題：`src/session.ts:22-47` 直接讀寫 sessionStorage，未處理被封鎖、quota error、
  JSON 合法但結構錯誤（entryIds/unit/type 不合法）。
- 修法：共用 storage adapter（get/set/delete 全包 try/catch）+ runtime schema 驗證；
  無效 session 顯示可理解錯誤，不 uncaught throw。
- 驗收：blocked / malformed session 的測試（jsdom 可模擬）。

### P0-10 Accessibility 基本盤

問題與位置：
- 無全域 `:focus-visible`（globals.css）。
- feedback 無 `role=status`/`aria-live`、答後 focus 不移（`PracticeScreen.tsx:330-362`）。
- 拼字 input 只有 placeholder 無 label（`PracticeScreen.tsx:269-276`）。
- 清除進度 modal 無 `role=dialog`/`aria-modal`/focus trap/Escape/restore focus
  （`WrongAnswersScreen.tsx:84-99`）。
- UnitCard `aria-label` 只讀「Unit 11 設定」，遮蔽統計（`UnitCard.tsx:22-27`）。
- section-title 多為 div 非 heading（Home/Setup/Results/Wrong 各處）。
- filter/segment active 無 `aria-pressed`（`UnitSetupScreen.tsx:133-143,171-185`）。
- 無 `prefers-reduced-motion`（globals.css 有 transform/transition 多處）。
- 進度條無 `role=progressbar`/`aria-valuenow`，首題寬度 0%（`PracticeScreen.tsx:222-224`，
  應 `(index+1)/length`）。

修法：逐項補語意與焦點管理；全域
`:focus-visible { outline: 3px solid var(--focus); outline-offset: 3px; }`；
新增 `--focus` token（建議 #7C3AED）。

### P0-11 對比修正（WCAG AA）

現況 light theme 文字/弱背景對比：success 2.97:1、warning 2.95:1、danger 4.17:1，
皆低於一般文字 4.5:1（`globals.css:10-15,176-188,523-531,656-662`）。

修法：light token 文字色改：
```css
--success: #166534;
--warning: #92400e;
--danger: #b91c1c;
```
dark tokens 已達標（約 8.2/9.5/6.2），分開保留；不可只靠顏色傳達正誤（配圖示/文字）。

### P0-12 CI 補測試與驗證

- 問題：deploy workflow 只 build（`.github/workflows/deploy.yml:26-27`）。
- 修法：build 前加 `npm test`、`npx tsc --noEmit`、`npx tsx scripts/validate-data.ts`。

---

## P1：資訊架構與 32 Units 基礎

### P1-1 Home 今日任務 hero

- 全域到期/錯題總數 + 各 Unit count 分流；不固定 U11。
- 無待辦時 CTA 為「開始學新字」。
- PoC 文案改：「目前已開放 Unit 11、12，共 253 字完整練習；其他單元準備中。」
  （現文案「各約 20 字」與實際 123/130 字不符，`HomeScreen.tsx:21-23`，先改文案＝P0 級小修）

### P1-2 Setup 一鍵開始 + 進階 drawer

- Primary「一鍵開始」：重要字、10 題、混合。
- 「調整練習內容」可展開 drawer：篩選、WordPicker、批次、題型、cloze 難度。
- 不強迫四步 stepper。

### P1-3 WordPicker 強化

- 英文/中文搜尋（中文查 enrichment zh）。
- Sticky toolbar：全選、清除、已選 x、可練 x。
- 空選取時 CTA disabled 並顯示「請至少選 1 個單字」。
- （`src/components/WordPicker.tsx` 現況無搜尋/全選，僅 320px 清單）

### P1-4 Results 三 KPI + 情境 CTA

- 主資訊：完成 / 答對 / 待再練；accuracy 次要。
- 錯題按 entryId 去重（現況 `summarize()` 的 wrongEntries 是逐題累積，`scoring.ts:46-71`）。
- 有錯題 → primary「重練這些字」；全對 → primary「下一批」（不渲染 disabled primary）。

### P1-5 錯題頁依 Unit 分組

- Unit 分組顯示，每組獨立 session（或明確 sequential queue）。
- 清除進度移至常駐「進度與設定」的 danger zone，與錯題主任務分離。

### P1-6 常駐「進度與設定」入口

- Home/Setup/Practice/Results/Wrong header 皆可達；Practice 用不離題 drawer。
- 內容：清除進度、語音自動播放/速度、減少動態、主題（至少 system，dark 可選）。

### P1-7 Importer 修復

- 路徑：實際 workbook 在 `docs/國中英文超強字彙 Super 2500.xlsx`，
  腳本仍指根目錄（`scripts/import-workbook.ts:9`）→ 現已失效。
- 覆寫風險：`--units=13` 會以僅 U13 的內容整份覆寫 `vocab.json`（`:99-132`）。
- 修法：改讀 `docs/`；merge 模式（預設保留既有 units）＋明確 full-replace 選項；
  dry-run；unit 參數驗證；atomic write（tmp + rename）；
  測試：子集匯入不得刪除既有 units。
- 注意：本 review 未執行 importer（避免覆寫 vocab.json）。

### P1-8 Unit/Enrichment registry 泛化

- `src/lib/data.ts:1-16` ENRICHMENTS 硬編碼 11/12 → 新 Unit 永遠 isPracticable=false。
- `scripts/validate-data.ts:27-40,71-82` 只驗 11/12 與固定數量。
- 修法：集中 manifest（或 build 時自動 glob `src/data/enrichment/units-*.json`
  產生 registry module）；validator 迭代 manifest；
  測試的單元清單與數量改由 manifest 驅動（固定數值驗證移到 per-unit metadata）。

### P1-9 設計 tokens 與元件狀態

- Light tokens（建議值）：bg #F6F8FC、surface #FFF、subtle #EEF3F8、border #D7E0EA、
  text #172033、muted #526174、brand #1D4ED8、brand-weak #E8F0FF、accent #B45309、
  focus #7C3AED；間距 4/8/12/16/24/32/48；radius 12/16/999；body 16–18px。
- Practice 題幹 36–48px（現 1.3rem 偏小）、cloze 22–28px（現 1.1rem）；
  選項 min-height 64px（現 56px）。
- 全元件補 default/hover/focus/selected/correct/wrong/disabled 狀態。
- 移除 inline style 色彩/間距（Setup/Practice/Results/Wrong 多處 inline style）。

### P1-10 響應式

- 現況無 media query；`.app` max-width 640。
- 320px 不橫向捲動；題型 segment 手機改 2×3 或橫滑；list-item 加 min-width:0/flex-wrap；
  200% zoom 核心流程可用；tap target ≥44px。

---

## P2：持續學習體驗

1. **Session resume**：版本化 **localStorage** checkpoint（UX 驗收硬條件：跨分頁/跨日
   宣稱就必須用 localStorage，不能只靠 sessionStorage）。保存 index、題目快照、
   results、type/difficulty；恢復後題幹/選項不得跳動；完成後清除。
2. **Enrichment dynamic import**：主 chunk 現 660.96 kB（>500 kB 警告）；
   按 Unit 動態載入 + route chunk；CI 加 bundle budget。
3. **語音設定**：自動播放開關、速度；unsupported 時顯示狀態。
4. **主題切換**：至少 system；dark 可選（CSS 已有 `[data-theme]` 支援，缺 UI toggle）。
5. **歷史成效**：1/3/7 日保留率、錯題修復率；教師/家長可讀摘要。
6. **輕量慶祝**：streak、徽章、empty state 插圖——最後做，不搶學習主流程。

---

## 驗收硬門檻（全數通過才算完成）

- 320px 無水平捲動；200% zoom 核心流程可用。
- 互動目標 ≥44px；鍵盤可完成全流程。
- Feedback 被 aria-live 宣告；答後 focus 到 feedback/下一題。
- 作答後題幹與選項不跳動（既有 regression test 持續通過）。
- 顯示選取字數 = 實際出題數。
- 跨 Unit 錯題不遺失；超過 batch limit 不超量。
- Fixed difficulty 在下一批保持。
- 到期字能出現在待複習篩選。
- 「有點熟」不改變 stage 升級語意。
- Storage 損壞/被封鎖、無 speech、未知 route：不崩潰，顯示可理解訊息。
- WCAG AA 對比、focus-visible、reduced-motion 全通過。
- 清除進度可取消；確認後 UI 與 storage 同步歸零。

## 成功指標（上線後量測）

- 首次進站 → 開始 ≥80%；開始 → 完成 ≥70%；設定放棄 <20%。
- 首題中位首答 <15 秒；10 題中位完成 <5 分鐘。
- 到期任務 24h 內完成 ≥60%；錯題 24h 內重練 ≥50%。
- 同字 1/3/7 日保留率初始目標 75%/70%/65%；兩週重複錯答率降 ≥20%。

## 建議 commit 切分（conventional commits）

每個 P0 項目一個 commit（fix: ...），共約 11 個；P0-10/P0-11 可各拆 2 個（語意/對比）。
P1 依 IA 頁面切（feat: home hero / setup drawer / wordpicker / results kpi / wrong grouping），
P1-7、P1-8 各獨立 commit。文件更新（本檔＋CLAUDE.md）用 docs: commit。

---

## 執行紀錄（2026-08-28，全部完成）

- **P0（12 項）**：commit `5450324`。實際以單一 commit 合併（多項共用檔案，
  hunk 級拆分風險高於收益），body 逐項列出。
- **P1（10 項）**：commits `652d672`（P1-7 importer＋P1-8 registry）、
  `f1c9e57`（P1-1..6、P1-9..10）。
- **CI**：Node 20 → 22（jsdom/undici 需要較新 API；首次 CI 測試跑抓到，
  commit `f1c326e`）。新流程 test + tsc + validate 全過才 build。
- **P2**：未開始。prefs.ts（主題/語音/動態）已是 P2-3/P2-4 的 UI 基礎。

## 上線後使用者回饋與修復（2026-08-28）

### 回饋 1：Chrome 發音沒有聲音（Safari 正常）

- **診斷**：Console watchdog log 顯示 `speaking=true, paused=false` 但
  `onstart` 永不觸發——Chrome 的 macOS TTS 引擎卡在殭屍狀態（自稱播放中、
  不出聲、不丟錯誤），任何網頁端程式碼都無法喚醒。Safari 走 macOS 原生
  語音管線所以正常。
- **程式端已修**（commits `b65dd4d`、`f969a12`）：
  - cancel+ speak 同 tick 會被 Chrome 靜默丟棄 → 只在真的有語音時 cancel，
    並 defer 到下一 tick；每次 nudge `resume()`（feature-checked）。
  - 210 個 voice 中部分系統新穎聲音註冊了但不會出聲 → 選 voice 改優先
    `localService`（本機 en-US → 本機 en-* → 任意 en-US → 任意 en-*）。
  - 1.2s watchdog：無 onstart 就用預設聲音重試一次並 log 診斷
    （`diagnoseSpeech()`）。
- **環境端解法**：完全結束 Chrome（Cmd+Q）重啟即恢復（macOS 更新/切換
  音訊裝置後 Chrome TTS 引擎可能卡死）。使用者已確認重啟後正常。

### 回饋 2：「下一題」按鈕擾人（commit `8ccc1f5`）

- Feedback 階段 **Enter/Space 前進**（focus 在 button/input 時不攔截，
  Space 仍可啟動喇叭按鈕）；選擇題 1-4 作答全程不離鍵。
- **Feedback 區整塊可點即前進**（內部喇叭按鈕除外）。
- **單字卡選完即走**＋**答對自動前進**（1.2s、答錯停留、hover 暫停、
  最後一題不自動跳），自動前進預設關閉、⚙ 設定可開。

### 回饋 3：單字卡評分後不顯示中文意思（commits `a0b4b5b`、`99bfeb3`）

- **根因**：回饋 2 的「選完即走」是設計錯誤——單字卡 prompt 只有英文單字，
  **中文釋義只存在 feedback 區**，立即 next() 使 feedback 永不渲染。
- **教訓**：112 個既有測試全綠，因為該行為本來就沒有測試。既有測試只證明
  「沒弄壞舊功能」，不證明「新行為是對的」。
- **修法**：單字卡評分後停留顯示釋義（Enter/點擊/自動前進仍適用，停留很短）；
  釋義放大置頂；feedback 標題依評量顯示（「沒關係，再看一次釋義」）。
- **預防準則（已存入專案記憶）**：
  1. 改 UI 行為先列「使用者會看到什麼」，每條寫渲染層斷言（先紅後綠）。
  2. 「減少一步」類改動先問：被刪的那步原本提供什麼資訊？資訊只在
     feedback 出現的題型不能跳過 feedback。
  3. 新 UX 行為的 commit 必須至少配一個 component 測試。
- 測試現況：**113 tests**（新增 flashcard 釋義回歸測試）。