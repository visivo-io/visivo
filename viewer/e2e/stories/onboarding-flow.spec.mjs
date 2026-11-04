import { test, expect } from '@playwright/test';

const BASE = process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3001';

async function gotoOnboardingFresh(page) {
  await page.goto(BASE);
  await page.evaluate(() => {
    try {
      window.localStorage.removeItem('visivo.onboarding.v1');
    } catch {
      /* ignore */
    }
  });
  await page.goto(`${BASE}/onboarding`);
  await page.waitForSelector('[data-testid="onboarding-frame"]', { timeout: 15000 });
}

async function clickThroughConcepts(page) {
  for (let i = 1; i <= 7; i++) {
    await expect(page.getByTestId(`onb-step-concept-${i}`)).toBeVisible();
    await page.getByTestId('onb-concept-continue').click();
  }
}

async function startTour(page, role) {
  await page.getByTestId('onb-start-tour').click();
  await page.getByTestId(`onb-role-${role}`).click();
  await page.getByTestId('onb-role-continue').click();
}

test.describe('Onboarding flow', () => {
  test('opens on the start screen: samples first, then own data, empty, and the tour', async ({
    page,
  }) => {
    await gotoOnboardingFresh(page);
    await expect(page.getByTestId('onb-step-start')).toBeVisible();
    await expect(page.getByRole('heading', { name: /Welcome to Visivo/ })).toBeVisible();
    for (const name of ['ev-sales', 'github-releases', 'college-football']) {
      await expect(page.getByTestId(`onb-sample-${name}`)).toBeVisible();
    }
    await expect(page.getByTestId('onb-sample-ev-sales').getByText('Suggested')).toBeVisible();
    await expect(page.getByTestId('onb-data-connect')).toBeVisible();
    await expect(page.getByTestId('onb-start-empty')).toBeVisible();
    await expect(page.getByTestId('onb-start-tour')).toBeVisible();
    await expect(page.getByTestId('onboarding-progress')).toHaveCount(0);
  });

  test('start empty lands on the editor in one click', async ({ page }) => {
    await gotoOnboardingFresh(page);
    await page.getByTestId('onb-start-empty').click();
    await page.waitForURL(/\/workspace\?view=project$|\/editor$/);
  });

  test('the concept tour walks every concept and returns to the start screen', async ({ page }) => {
    await gotoOnboardingFresh(page);
    await startTour(page, 'analytics_engineer');
    await clickThroughConcepts(page);
    await expect(page.getByTestId('onb-step-start')).toBeVisible();
  });

  test('software engineer who took the tour sees github-releases as Suggested', async ({ page }) => {
    await gotoOnboardingFresh(page);
    await startTour(page, 'software_engineer');
    await clickThroughConcepts(page);
    const tile = page.getByTestId('onb-sample-github-releases');
    await expect(tile.getByText('Suggested')).toBeVisible();
  });

  test('source creation modal opens from the start screen', async ({ page }) => {
    await gotoOnboardingFresh(page);
    await page.getByTestId('onb-data-connect').click();
    await expect(page.getByTestId('onb-source-modal')).toBeVisible();
    await expect(page.getByText('Add a Source')).toBeVisible();
  });

  test('back button returns to previous step on concept screens', async ({ page }) => {
    await gotoOnboardingFresh(page);
    await startTour(page, 'data_engineer');
    await expect(page.getByTestId('onb-step-concept-1')).toBeVisible();
    await page.getByTestId('onb-concept-continue').click();
    await expect(page.getByTestId('onb-step-concept-2')).toBeVisible();
    await page.getByTestId('onb-back').click();
    await expect(page.getByTestId('onb-step-concept-1')).toBeVisible();
  });
});
