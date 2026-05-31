/**
 * Story: Project Editor — inline level affordances (VIS-807 / Track M M-2a)
 *
 * Validates the inline level-CRUD affordances added to the unscoped Workspace
 * <ProjectEditor> surface: double-click rename, reorder up/down, add level, and
 * delete-with-confirm. Each gesture asserts the level list / tile grouping
 * updates and that a `project_editor_action` telemetry event fires with the
 * matching `kind`.
 *
 * Port: this worktree's sandbox runs on :3008 (backend :8008). The shared
 * playwright.config baseURL is :3001, so this spec navigates with an absolute
 * URL (overridable via PROJECT_EDITOR_BASE_URL).
 *
 * Levels note: the integration project has no `defaults.levels`, so levels
 * resolve by index against the `defaultLevels` fallback ("Organization",
 * "Department", …). The first create/rename/reorder seeds a concrete
 * persistable list (the store seeds from defaultLevels). All assertions are
 * tolerant of which concrete titles appear.
 */

import { test, expect } from '@playwright/test';

const BASE_URL = process.env.PROJECT_EDITOR_BASE_URL || 'http://localhost:3008';
const WORKSPACE_URL = `${BASE_URL}/workspace`;
const WAIT_FOR_PAGE = 20000;

const installEventCollector = page =>
  page.addInitScript(() => {
    window.__evts = [];
    window.addEventListener('visivo:workspace-telemetry', e => window.__evts.push(e.detail));
  });
const readEvents = page => page.evaluate(() => window.__evts || []);
const clearEvents = page =>
  page.evaluate(() => {
    window.__evts = [];
  });

const hasKind = (events, kind) =>
  events.some(e => e.eventName === 'project_editor_action' && e.payload?.kind === kind);

// Read the persisted level titles from the live zustand store. The Project
// Editor renders only the populated/in-window groups, so the canonical edit
// surface for empty levels is the store's `defaults.levels` array.
const readLevelTitles = page =>
  page.evaluate(() => {
    const s = window.useStore && window.useStore.getState && window.useStore.getState();
    const levels = (s && s.defaults && s.defaults.levels) || [];
    return levels.map(l => l.title);
  });

test.describe('Project Editor inline level affordances (M-2a)', () => {
  test.describe.configure({ mode: 'serial' });
  test.setTimeout(90000);

  /** @type {import('@playwright/test').Page} */
  let page;

  test.beforeAll(async ({ browser }) => {
    page = await browser.newPage();
    page._consoleErrors = [];
    page.on('console', msg => {
      if (msg.type() === 'error') page._consoleErrors.push(msg.text());
    });
    await installEventCollector(page);
    await page.goto(WORKSPACE_URL);
    await page.waitForLoadState('networkidle');
    await page.getByTestId('project-editor').waitFor({ timeout: WAIT_FOR_PAGE });
    await page
      .locator('[data-testid^="level-group-header-level:"]')
      .first()
      .waitFor({ timeout: WAIT_FOR_PAGE });
    await clearEvents(page);
  });

  test.afterAll(async () => {
    await page.close();
  });

  const firstLevelHeader = () =>
    page.locator('[data-testid^="level-group-header-level:"]').first();

  test('Rename: double-click a level title commits a new name on Enter', async () => {
    await clearEvents(page);
    const header = firstLevelHeader();
    const headerTestId = await header.getAttribute('data-testid');
    const titleEl = page.getByTestId(`${headerTestId}-title`);
    const originalTitle = (await titleEl.textContent())?.trim();

    await titleEl.dblclick();
    const input = page.getByTestId(`${headerTestId}-rename-input`);
    await expect(input).toBeVisible();
    const renamed = `Renamed ${Date.now() % 10000}`;
    await input.fill(renamed);
    await page.screenshot({
      path: 'e2e/stories/__screens__/vis807-01-rename-input.png',
      fullPage: true,
    });
    await input.press('Enter');

    await expect
      .poll(async () => hasKind(await readEvents(page), 'level_rename'), { timeout: 8000 })
      .toBe(true);

    // The level list reflects the new title (the round-trip re-fetches defaults).
    await expect
      .poll(
        async () =>
          page.locator('[data-testid$="-title"]', { hasText: renamed }).count(),
        { timeout: 10000 }
      )
      .toBeGreaterThan(0);
    expect(renamed).not.toBe(originalTitle);
    await page.screenshot({
      path: 'e2e/stories/__screens__/vis807-02-renamed.png',
      fullPage: true,
    });
  });

  test('Add level: the + Add level row appends a new level to defaults', async () => {
    await clearEvents(page);
    const before = (await readLevelTitles(page)).length;
    await page.getByTestId('project-editor-add-level').click();

    await expect
      .poll(async () => hasKind(await readEvents(page), 'level_create'), { timeout: 8000 })
      .toBe(true);

    // The persisted level list grows by one (an empty trailing level isn't
    // rendered as a group until it has dashboards, so we assert on the store).
    await expect
      .poll(async () => (await readLevelTitles(page)).length, { timeout: 10000 })
      .toBeGreaterThan(before);
    await page.screenshot({
      path: 'e2e/stories/__screens__/vis807-03-added.png',
      fullPage: true,
    });
  });

  test('Reorder: move a level down swaps it with the next in defaults order', async () => {
    await clearEvents(page);
    const titlesBefore = await readLevelTitles(page);
    expect(titlesBefore.length).toBeGreaterThanOrEqual(2);

    const headerTestId = await firstLevelHeader().getAttribute('data-testid');
    await page.getByTestId(`${headerTestId}-move-down`).click();

    await expect
      .poll(async () => hasKind(await readEvents(page), 'level_reorder'), { timeout: 8000 })
      .toBe(true);

    // The first two persisted levels swap order.
    await expect
      .poll(async () => (await readLevelTitles(page)).slice(0, 2).join('|'), { timeout: 10000 })
      .toBe([titlesBefore[1], titlesBefore[0]].join('|'));
    await page.screenshot({
      path: 'e2e/stories/__screens__/vis807-04-reordered.png',
      fullPage: true,
    });
  });

  test('Delete: confirm popover removes the level', async () => {
    await clearEvents(page);
    const headerTestId = await firstLevelHeader().getAttribute('data-testid');
    const before = (await readLevelTitles(page)).length;

    await page.getByTestId(`${headerTestId}-delete`).click();
    const confirm = page.getByTestId(`${headerTestId}-delete-confirm`);
    await expect(confirm).toBeVisible();
    await page.screenshot({
      path: 'e2e/stories/__screens__/vis807-05-delete-confirm.png',
      fullPage: true,
    });
    await page.getByTestId(`${headerTestId}-delete-confirm-btn`).click();

    await expect
      .poll(async () => hasKind(await readEvents(page), 'level_delete'), { timeout: 8000 })
      .toBe(true);

    await expect
      .poll(async () => (await readLevelTitles(page)).length, { timeout: 10000 })
      .toBeLessThan(before);
    await page.screenshot({
      path: 'e2e/stories/__screens__/vis807-06-after-delete.png',
      fullPage: true,
    });
  });

  test('No console errors during the level-CRUD happy path', async () => {
    const realErrors = page._consoleErrors.filter(
      e =>
        !e.includes('favicon') &&
        !e.includes('DevTools') &&
        !e.includes('react-cool') &&
        !e.includes('ResizeObserver')
    );
    expect(realErrors).toHaveLength(0);
  });
});
