import { test, expect } from '@playwright/test';

test('修理一覧ページが開ける', async ({ page }) => {
  await page.goto('http://localhost:3000/repairs');

  await expect(page).toHaveURL(/\/repairs/);
  await expect(page.locator('body')).toBeVisible();
});

test('新規案件ページが開ける', async ({ page }) => {
  await page.goto('http://localhost:3000/repairs/new');

  await expect(page).toHaveURL(/\/repairs\/new/);
  await expect(page.locator('body')).toBeVisible();
});

test('一覧ページに主要操作が表示される', async ({ page }) => {
  await page.goto('http://localhost:3000/repairs');

  await expect(
    page.getByText(/新規|追加|登録|修理|案件/)
  ).toBeVisible();
});