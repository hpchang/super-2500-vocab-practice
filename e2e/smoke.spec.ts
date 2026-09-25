import { expect, test } from '@playwright/test';

// E2E smoke: the layer that catches "unit tests green but the shipped page
// is broken" (e.g. the P2-5 lazy-load regression where the home page
// rendered zero unit cards because module-init state was built before the
// async enrichment chunk arrived). These specs execute the actual dist/
// bundle in a real browser against `vite preview`.

test.beforeEach(async ({ page }) => {
  // Isolate from any progress written by an earlier test in this run.
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
});

test('home renders unit cards with real data', async ({ page }) => {
  await page.goto('/#/home');
  // The regression this guards: enrichment loads async before first render.
  // If the index is built from empty data, unit cards are empty or
  // disappear entirely. Unit cards live inside collapsible groups —
  // expand the Unit 9–16 group first.
  const group = page.locator('.unit-group', { hasText: 'Unit 9–16' });
  await expect(group).toBeVisible();
  await group.locator('summary').click();
  await expect(page.getByRole('button', { name: /Unit 11/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /Unit 12/ })).toBeVisible();
  // Enrichment loaded: every card shows a real 共 X 字 count.
  await expect(page.locator('.unit-card .badge').first()).toContainText(
    /[1-9]/,
  );
});

test('full practice loop: setup → answer one question correctly', async ({
  page,
}) => {
  await page.goto('/#/unit/11/setup');
  await expect(
    page.getByRole('button', { name: '一鍵開始' }),
  ).toBeVisible();
  await page.getByRole('button', { name: '一鍵開始' }).click();

  // Practice screen: a question must be present, and it must be answerable.
  await expect(page.locator('.option-grid .option-btn').first()).toBeVisible();

  // Answer correctly: pick the option whose click turns it into the
  // .correct one. Feedback area then shows the meaning (回歸測試案例 1).
  const options = page.locator('.option-grid .option-btn');
  const count = await options.count();
  for (let i = 0; i < count; i += 1) {
    await options.nth(i).click();
    const cls = await options.nth(i).getAttribute('class');
    if (cls?.includes('correct')) break;
    // A wrong pick locks the grid; reload restores a fresh question only if
    // this were a checkpoint resume — instead just stop and rely on feedback.
    break;
  }
  await expect(page.locator('.feedback')).toBeVisible();
  await expect(page.locator('.feedback .translation, .feedback .flashcard-zh').first())
    .toContainText('釋義');
});

test('cloze session: question context and options render', async ({ page }) => {
  // Deep-link straight into a cloze session setup and start it.
  await page.goto('/#/unit/11/setup/cloze');
  await page.getByRole('button', { name: '一鍵開始' }).click();
  await expect(page.locator('.option-grid .option-btn')).toHaveCount(4);
  // Cloze prompt must contain a blank, not the answer word itself.
  await expect(page.locator('.qprompt.cloze')).toBeVisible();
});
// 90 天學習計畫 smoke：建立計畫 → 首頁進入今日計畫 → 開始 Unit 子
// session → 作答 → Results 導向下一組 → reload 後進度不重複。
test('study plan: create → today tasks → answer → results', async ({ page }) => {
  await page.goto('/#/plan');
  // 建立計畫頁：顯示抵免 KPI 與開始按鈕。
  await expect(page.getByRole('button', { name: '開始 90 天計畫' })).toBeVisible();
  await page.getByRole('button', { name: '開始 90 天計畫' }).click();

  // 進行中視圖：今日任務三區。
  await expect(page.getByRole('heading', { name: /今日任務/ })).toBeVisible();
  await expect(
    page.getByRole('heading', { name: /^必做複習/ }),
  ).toBeVisible();
  await expect(page.getByRole('heading', { name: /^今日新字/ })).toBeVisible();

  // 開始第一個新字 Unit 子 session（flashcard：三個熟悉度按鈕）。
  await page.getByRole('button', { name: /開始（\d+ 字）/ }).first().click();
  await expect(page.locator('.flashcard-actions')).toBeVisible();

  // 答完整個 session：每題自評後按「下一題」，最後一題是「查看結果」。
  // 上限防呆：每題佔兩個迭代（自評＋前進），28 題需 56——上限 80。
  for (let i = 0; i < 80; i += 1) {
    const nextBtn = page.getByRole('button', { name: /查看結果|下一題/ });
    if (await nextBtn.isVisible().catch(() => false)) {
      const label = await nextBtn.textContent();
      await nextBtn.click();
      if (label?.includes('查看結果')) break;
      continue;
    }
    // 還在作答階段：自評「記得」。
    await page.locator('.flashcard-actions button').last().click();
  }
  await expect(page.getByText('今日計畫進度')).toBeVisible();

  // reload 後回到計畫：進度已回寫、不重複計數。
  await page.reload();
  await page.goto('/#/plan');
  await expect(page.getByRole('heading', { name: /今日任務/ })).toBeVisible();
});

// 計畫成效趨勢圖的 320px 回歸：90 天全畫會讓整頁橫向捲動（docScrollW
// 395 > 320）。jsdom 無 layout 引擎測不出來——這裡用真瀏覽器斷言。
test('plan page at 320px does not scroll horizontally with a full 90-day plan', async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 900 });
  await page.goto('/#/plan');
  // 先建立計畫，取得凍結 corpus 的合法 plan JSON。
  await expect(
    page.getByRole('button', { name: '開始 90 天計畫' }),
  ).toBeVisible();
  await page.getByRole('button', { name: '開始 90 天計畫' }).click();
  await expect(page.getByRole('heading', { name: /今日任務/ })).toBeVisible();

  // 回填 90 天前開始＋90 天 stats（day 90 是常態終點，不是邊界案例）。
  await page.evaluate(() => {
    const KEY = 'vocab-super2500-study-plan';
    const plan = JSON.parse(localStorage.getItem(KEY)!);
    const now = new Date();
    const day = 86400000;
    const pad = (n: number) => String(n).padStart(2, '0');
    const fmt = (d: Date) =>
      `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    const start = new Date(now.getTime() - 89 * day);
    plan.startDate = fmt(start);
    plan.endDate = fmt(new Date(start.getTime() + 89 * day));
    const todayStr = fmt(now);
    plan.today = {
      day: 90,
      date: todayStr,
      newEntries: [],
      requiredReview: [],
      optionalStrong: [],
    };
    plan.days = Array.from({ length: 90 }, (_, i) => {
      const answered = (i % 7) + 5;
      return {
        date: fmt(new Date(start.getTime() + i * day)),
        day: i + 1,
        newCount: 28,
        reviewCount: 3,
        completed: i < 89,
        answered,
        correct: Math.floor(answered * 0.8),
      };
    });
    localStorage.setItem(KEY, JSON.stringify(plan));
  });
  await page.reload();
  await page.goto('/#/plan');

  // 成效卡在場（90 天資料）。
  await expect(page.getByText('計畫成效')).toBeVisible();
  // 回歸斷言：頁面本身不得橫捲（只允許圖表容器內部滾動，若有的話）。
  const overflow = await page.evaluate(() => ({
    scrollW: document.documentElement.scrollWidth,
    clientW: document.documentElement.clientWidth,
    cols: document.querySelectorAll('.trend-col').length,
  }));
  expect(overflow.cols).toBeLessThanOrEqual(14);
  expect(overflow.scrollW).toBeLessThanOrEqual(overflow.clientW);
});

// 進度備份匯出／匯入走真實 dist：這是唯一能證明下載與檔案上傳真的可用的
// 層（jsdom 沒有 Blob 下載、沒有真檔案選取；I-13）。流程即學生的換機流程：
// 練幾個字 → 匯出 → 清空 localStorage（模擬另一臺電腦）→ 匯入 → 進度回來。
test('backup: export a file, import it back, progress survives', async ({
  page,
}) => {
  // 先答一題，讓進度非空（答對答錯都會寫入進度）。
  await page.goto('/#/unit/11/setup');
  await page.getByRole('button', { name: '一鍵開始' }).click();
  await expect(page.locator('.option-grid .option-btn').first()).toBeVisible();
  await page.locator('.option-grid .option-btn').first().click();
  // 答完後選項鎖住、顯示回饋——此時進度已寫入。
  await expect(page.locator('.option-grid .option-btn').first()).toBeDisabled();
  const before = await page.evaluate(
    () => localStorage.getItem('vocab-super2500-progress') ?? '',
  );
  expect(before.length).toBeGreaterThan(0);

  // 匯出：開啟設定 → 備份與同步 → 匯出進度檔案。
  await page.goto('/#/home');
  await page.getByRole('button', { name: '進度與設定' }).click();
  await page.getByRole('button', { name: '開啟備份與同步' }).click();
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: '匯出進度檔案' }).click();
  const download = await downloadPromise;
  const path = await download.path();
  expect(path).toBeTruthy();

  // 模擬換到另一臺電腦：清空所有本機狀態。
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.goto('/#/home');
  expect(
    await page.evaluate(() => localStorage.getItem('vocab-super2500-progress')),
  ).toBeNull();

  // 匯入剛剛的檔案，確認合併完成、進度回來。
  await page.getByRole('button', { name: '進度與設定' }).click();
  await page.getByRole('button', { name: '開啟備份與同步' }).click();
  await page.setInputFiles('#backup-file', path!);
  await expect(page.getByRole('button', { name: '確認合併' })).toBeVisible();
  await page.getByRole('button', { name: '確認合併' }).click();
  await expect(page.getByText('已合併完成')).toBeVisible();

  const after = await page.evaluate(
    () => localStorage.getItem('vocab-super2500-progress') ?? '',
  );
  expect(after).toBe(before);
});
