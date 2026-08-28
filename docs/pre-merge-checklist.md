# Pre-merge checklist / Definition of Done

每個 PR／branch merge 回 `main`（= 自動部署上線）前逐條勾選。
「為什麼」見 `docs/invariants.md`——這份是操作清單，那份是原理。

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