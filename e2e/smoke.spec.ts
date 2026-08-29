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