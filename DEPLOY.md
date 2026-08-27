# DEPLOY.md — Super 2500 字彙練習

## 正式網址

https://www.hpchang.com/super-2500-vocab-practice/

## 部署架構

- Repository：`hpchang/super-2500-vocab-practice`（public）
- 預設分支：`main`
- GitHub Pages Source：`GitHub Actions`（build_type=workflow）
- 部署方式：`.github/workflows/deploy.yml`，push 到 `main` 自動 build + 發布
- 帳號層級自訂網域：`www.hpchang.com`（repo 無 CNAME）

## 為何用 GitHub Actions（偏離標準的例外）

本專案是 Vite + React + TypeScript，需要編譯，符合
`GITHUB_PAGES_DEPLOYMENT_STANDARD.md` 的例外條款：
「網站需要編譯…時，才改用 GitHub Actions 或其他平台。」

`vite.config.ts` 已設 `base: './'`，build 產物用相對路徑，
可在 `/<slug>/` 子路徑下運作。hash-based routing 不需伺服器 route 設定。

## 部署流程

```bash
npm run build        # 本機驗證 build 成功
git add -A
git commit -m "..."
git push             # push 到 main 後 Actions 自動部署
```

## 驗證方式

部署後確認：

1. `gh run list` 最新 workflow 為 success。
2. `https://www.hpchang.com/super-2500-vocab-practice/` 回傳 HTTP 200。
3. `assets/index-*.js`、`assets/index-*.css` 回傳 200（無 404）。
4. `assets/og-image.png` 回傳 200。
5. 頁面 title、canonical、Open Graph URL 正確。
6. 手機與桌面版功能正常，console 無錯誤。

## 注意事項

- `og:image` 指向 `assets/og-image.png`，來源是 `public/assets/og-image.png`
  （Vite 會自動複製進 build 產物）。若重新產生，需 1200×630 PNG。
- `dist/` 在 `.gitignore`，不進版控；部署產物由 Actions 產生。
- 本機 remote 用 HTTPS（`https://github.com/hpchang/super-2500-vocab-practice.git`），
  因本機無 GitHub SSH key。
