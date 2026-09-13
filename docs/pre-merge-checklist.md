# Pre-merge checklist / Definition of Done

每個 PR／branch merge 回 `main`（= 自動部署上線）前逐條勾選。
整體風險與測試分層見 `docs/engineering-quality.md`；具體系統保證見
`docs/invariants.md`。這份文件只負責可執行的 Definition of Done。

## Definition of Done（任何程式碼改動）

- [ ] `npm test` 全綠
- [ ] `npx tsc --noEmit` 0 errors
- [ ] `npx tsx scripts/validate-data.ts` 0 errors（有動 data/enrichment 時）
- [ ] `npm run check` 全綠（build + 真瀏覽器 smoke；**一律要跑**，
      這是唯一執行打包產物的驗證）
- [ ] 新行為至少配一個能失敗的測試（純邏輯測試通過不算——UI 行為改動
      要 jsdom 渲染斷言，先紅後綠）
- [ ] 新增／變更的不變量已更新 `docs/invariants.md`
- [ ] Commit 遵循 conventional commits（subject ≤50 bytes、imperative、
      body 解釋 why、72 字折行）；此 repo 無 `test` type，測試隨 feat/fix 進

## 特定改動的加碼檢查

### 動到載入／打包／非同步（sync→async、lazy-load、code splitting）
- [ ] 掃過「哪些模組在 import 當下就從被改的東西衍生狀態」
      （module-init 依賴）——P2-5 死在這裡
- [ ] 新時序有測試：先 render 再 await，不是 await 完再斷言
      （參考 `tests/enrichmentLoad.test.tsx`）
- [ ] `npm run check` 對 `dist/` 的 smoke 必跑（I-7）

### 動到 UI 行為
- [ ] 先列「改完後使用者會看到什麼」，每條寫成渲染斷言
- [ ] 「減少一步」先問：被刪的那步原本提供什麼資訊？（案例 1 死在這）

### 動到 storage schema 或 progress 結構
- [ ] 舊資料載入測試（缺欄位=預設值，不 throw）（I-8）
- [ ] localStorage 讀寫走 safe 介面（I-5）

### 新增 Unit
- [ ] 走 `.claude/skills/add-vocab-unit/SKILL.md` 的流程
- [ ] `tests/unit11ClozeData.test.ts` 的參數化涵蓋擴及新 unit
      （或確認 validator 覆蓋）

## 跑 `npm run check` 前的環境檢查

`playwright.config.ts` 設 `reuseExistingServer: false`——Playwright 每次自己
啟一個 `vite preview`（port 4173）。因此：

- [ ] **先確認 4173 沒有殘留的 preview server**：`lsof -ti:4173`（或
      `pgrep -fl "vite preview"`），有就 `kill` 掉再跑。
- [ ] **不要用 `(npm run preview &)` 手動背景起 server** 來自行驗證——
      背景化的 shell 結束後該 process 仍活著並佔住 4173，之後的
      `npm run check` 會與它競爭，出現「點擊逾時、頁面卡住」的**假失敗**。

2026-09-12 實例：一個孤兒 preview server 佔著 4173，導致 study-plan smoke
間歇性卡在單字卡點擊。當時誤判為「既有產品 bug」，還拿這個髒環境去跑
pristine HEAD 對照，得到「pristine 也失敗 → 非本次改動造成」的**錯誤結論**；
清掉孤兒 server 後同一測試 3/3 全過。**教訓：驗證環境本身要先確認乾淨，
否則對照實驗會一起被污染，反而佐證錯誤假設。** 看到間歇性 E2E 失敗時，
先查環境（port、殘留 process、機器負載），再懷疑程式。

## Merge 前最後一關

- [ ] 在**目標 branch**（merge 後的狀態）重跑一次 `npm run check`——
      衝突解決本身可能引入回歸
- [ ] 部署後開 https://www.hpchang.com/super-2500-vocab-practice/
      抽查首頁 unit card 有字數、進一題練習能作答

## 已知併發改動的 merge 注意（2026-08-28）

`worktree-p2` merge 回 `main` 時：
- `src/lib/enrichmentRegistry.ts`：P2-5 改成 lazy-load（移除 UNIT_METADATA、
  新增 `loadEnrichments()`／`ENRICH_MAP`）；main 上的 Unit 13–18 metadata
  改動要手動併進 lazy 版本，**不可**用 main 版整檔蓋掉。
- merge 後跑 `npm run check` + `npm test`（worktree 內 135 tests 為基準）。