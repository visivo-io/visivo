/**
 * Story: Editor New Smoke
 *
 * Safety-net smoke for the editor view. Confirms the lens loads, the project
 * editor surface and the Library data layer (Sources + Models) render, and
 * there are no console errors.
 *
 * The standalone `/editor` page was removed in VIS-772 (Track B): `/editor`
 * now redirects to `/workspace?view=project`, where the ProjectEditor renders
 * in the Workspace middle pane and the object list lives in the left Library
 * rail (Data Layer → Sources / Models / … subsections). This smoke drives that
 * route.
 *
 * Precondition: Sandbox running on :3001/:8001
 */

import { test, expect } from '@playwright/test';

const WAIT_FOR_PAGE = 15000;

test.describe('Editor New Smoke', () => {
  test.describe.configure({ mode: 'serial' });
  test.setTimeout(60000);

  /** @type {import('@playwright/test').Page} */
  let page;

  test.beforeAll(async ({ browser }) => {
    page = await browser.newPage();
    page._consoleErrors = [];
    page.on('console', msg => {
      if (msg.type() === 'error') {
        page._consoleErrors.push(msg.text());
      }
    });

    await page.goto('/workspace?view=project');
    await page.waitForLoadState('networkidle');
    await page.getByTestId('project-editor').waitFor({ timeout: WAIT_FOR_PAGE });
  });

  test.afterAll(async () => {
    await page.close();
  });

  test('Step 1: Project editor surface renders', async () => {
    await expect(page.getByTestId('project-editor')).toBeVisible();
    // The project health bar surfaces source/model/insight/dashboard counts.
    await expect(page.getByTestId('project-editor-health-sources')).toBeVisible();
    await expect(page.getByTestId('project-editor-health-models')).toBeVisible();
  });

  test('Step 2: Library data layer shows Sources and Models subsections', async () => {
    await expect(page.getByTestId('library-subsection-source')).toBeVisible();
    await expect(page.getByTestId('library-subsection-model')).toBeVisible();
  });

  test('Step 3: Search inputs render (project editor + library)', async () => {
    await expect(page.getByTestId('project-editor-search')).toBeVisible();
    await expect(page.getByTestId('library-search')).toBeVisible();
  });

  test('Step 4: Project editor exposes level management + a new-dashboard action', async () => {
    await expect(page.getByTestId('project-editor-add-level')).toBeVisible();
    await expect(page.getByTestId('project-editor-new-dashboard')).toBeVisible();
  });

  test('Step 5: No console errors during load', async () => {
    const realErrors = page._consoleErrors.filter(
      e =>
        !e.includes('favicon') &&
        !e.includes('DevTools') &&
        !e.includes('react-cool') &&
        !e.includes('Download the React DevTools')
    );
    expect(realErrors).toHaveLength(0);
  });
});
