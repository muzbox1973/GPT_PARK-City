import { expect, test, type Page } from '@playwright/test';

async function open(page: Page, errors: string[]) {
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await page.waitForFunction(() => document.body.classList.contains('ready'), null, { timeout: 30_000 });
  // 웹폰트 교체로 패널이 다시 배치되는 동안 클릭하지 않도록
  await page.evaluate(() => document.fonts.ready.then(() => true));
}

async function expandSheet(page: Page) {
  const panel = page.locator('.panel');
  if (await panel.evaluate((p) => p.classList.contains('collapsed'))) await page.locator('.p-collapse').click();
}

test('캔버스 1개가 생성되고 콘솔 오류 0건', async ({ page }) => {
  const errors: string[] = [];
  await open(page, errors);
  await page.waitForTimeout(1500);
  await expect(page.locator('#stage canvas')).toHaveCount(1);
  expect(errors).toEqual([]);
});

test('랜드마크 수만큼 이름표 DOM 이 생성된다', async ({ page }) => {
  await open(page, []);
  const n = await page.evaluate(async () => (await (await fetch('./town.config.json')).json()).landmarks.length);
  await expect(page.locator('.label')).toHaveCount(n);
});

test('액션 버튼 3개를 각각 누르면 대응 카운터가 1씩 증가한다', async ({ page }) => {
  await open(page, []);
  await expandSheet(page);
  const acts = page.locator('.act');
  await expect(acts).toHaveCount(3);
  for (let i = 0; i < 3; i++) {
    await acts.nth(i).click();
    await expect(page.locator('.count .n').nth(i)).toHaveText('1');
  }
});

test('젤리 맛 버튼을 누르면 선택 표시가 옮겨진다', async ({ page }) => {
  await open(page, []);
  await expandSheet(page);
  const f = page.locator('.flavor');
  await expect(f.nth(0)).toHaveClass(/\bon\b/);
  await f.nth(2).click();
  await expect(f.nth(2)).toHaveClass(/\bon\b/);
  await expect(f.nth(0)).not.toHaveClass(/\bon\b/);
});

test('이름표 버튼을 누르면 이름표가 모두 숨겨진다', async ({ page }) => {
  await open(page, []);
  await expandSheet(page);
  await page.locator('.pb-labels').click();
  await page.waitForTimeout(300);
  const visible = await page.locator('.label').evaluateAll((els) => els.filter((e) => (e as HTMLElement).style.display !== 'none' && (e as HTMLElement).offsetParent !== null).length);
  expect(visible).toBe(0);
});

test('모바일에서는 패널이 아래쪽 시트로 표시된다', async ({ page }, info) => {
  test.skip(info.project.name !== 'mobile', '모바일 전용');
  await open(page, []);
  const vh = page.viewportSize()!.height;
  const box = (await page.locator('.panel').boundingBox())!;
  expect(Math.round(box.y + box.height)).toBe(vh);
  expect(box.height).toBe(64);
  await page.locator('.p-collapse').click();
  await page.waitForTimeout(400);
  const open2 = (await page.locator('.panel').boundingBox())!;
  expect(Math.abs(open2.height - vh * 0.55)).toBeLessThan(2);
});
