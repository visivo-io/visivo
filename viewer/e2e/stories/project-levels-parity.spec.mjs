/**
 * Story: Canvas ↔ editor LEVELS parity (VIS-899)
 *
 * Guards the single-source-of-truth fix: the canvas Project Editor level groups
 * and the right-rail Project-Settings "Dashboard Levels" list must show the
 * SAME levels. Before the fix the canvas rendered derived default level names
 * while the settings form read the literal (empty) `defaults.levels` and showed
 * "No dashboard levels defined" — two sources, one mismatch.
 *
 * This story (on `/workspace?view=project`):
 *   1. reads the level titles the canvas renders (level-group headers),
 *   2. opens the right-rail Project-Settings form (click canvas whitespace →
 *      project-chrome selection → <DefaultsEditForm>),
 *   3. reads the level titles the form shows (the "Title" inputs),
 *   4. asserts the canvas list is an in-order prefix of the editor list and
 *      that the editor is NOT empty when the canvas shows levels (the original
 *      bug). The integration project configures no `defaults.levels`, so this
 *      exercises the no-config derived case.
 *
 * Port: BASE defaults to :3051 (this ticket's sandbox) but is env-overridable:
 *   VISIVO_SANDBOX_BACKEND_PORT=8051 VISIVO_SANDBOX_FRONTEND_PORT=3051 \
 *   VISIVO_SANDBOX_NAME=vis899 bash scripts/sandbox.sh start
 *   # then: VIS_LEVELS_PARITY_BASE=http://localhost:3051 \
 *   #       npx playwright test project-levels-parity --reporter=list
 */

import { test, expect } from '@playwright/test';

const BASE = process.env.VIS_LEVELS_PARITY_BASE || 'http://localhost:3051';
const WORKSPACE_URL = `${BASE}/workspace?view=project`;
const SCREENS = 'e2e/stories/__screens__';
const WAIT = 20000;

test.use({ viewport: { width: 1600, height: 1200 } });

// Canvas level titles, in render order, from the level-group headers.
const canvasLevelTitles = page =>
  page
    .locator('[data-testid$="-title"]')
    .filter({ has: page.locator(':scope') })
    .evaluateAll(els =>
      els
        .filter(el => (el.getAttribute('data-testid') || '').startsWith('level-group-header-level:'))
        .map(el => el.textContent.trim())
        .filter(Boolean)
    );

// Editor level titles, in order, from the right-rail form's "Title" inputs.
const editorLevelTitles = page =>
  page
    .getByTestId('right-rail-edit-defaults')
    .locator('input[placeholder="Title"]')
    .evaluateAll(inputs => inputs.map(i => i.value).filter(v => v !== undefined));

test.describe('Canvas ↔ editor levels parity (VIS-899)', () => {
  test.setTimeout(90000);

  test('canvas level groups match the right-rail Dashboard Levels list', async ({ browser }) => {
    const page = await browser.newPage();
    const consoleErrors = [];
    page.on('console', msg => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });

    await page.goto(WORKSPACE_URL);
    await page.waitForLoadState('networkidle');
    await page.getByTestId('project-editor').waitFor({ timeout: WAIT });
    await page
      .locator('[data-testid^="level-group-header-level:"]')
      .first()
      .waitFor({ timeout: WAIT });

    const canvas = await canvasLevelTitles(page);
    expect(canvas.length).toBeGreaterThan(0);
    await page.screenshot({ path: `${SCREENS}/vis899-01-canvas-levels.png`, fullPage: true });

    // Open the right-rail Project Settings by selecting project chrome — click
    // canvas whitespace (the project-editor container handles the chrome click).
    await page.getByTestId('project-editor').click({ position: { x: 5, y: 5 } });
    await page.getByTestId('right-rail-edit-defaults').waitFor({ timeout: WAIT });
    await page
      .getByTestId('right-rail-edit-defaults')
      .locator('input[placeholder="Title"]')
      .first()
      .waitFor({ timeout: WAIT });

    const editor = await editorLevelTitles(page);
    await page.screenshot({ path: `${SCREENS}/vis899-02-editor-and-canvas.png`, fullPage: true });

    // The original bug: editor shows none while canvas shows levels.
    expect(editor.length).toBeGreaterThan(0);
    expect(editor).not.toEqual([]);

    // Parity: the canvas list is an in-order prefix of the editor's full
    // editable list (canvas applies display windowing on top of the shared
    // source), and both draw the SAME first levels.
    canvas.forEach((title, i) => {
      expect(editor[i]).toBe(title);
    });

    const realErrors = consoleErrors.filter(
      e =>
        !e.includes('favicon') &&
        !e.includes('DevTools') &&
        !e.includes('ResizeObserver') &&
        !e.includes('react-cool')
    );
    expect(realErrors).toHaveLength(0);

    await page.close();
  });
});
