/**
 * Story: Project Editor in a narrow middle pane (user-reported viewport bug).
 *
 * At a ~1071px viewport the Workspace middle pane is only ~383px wide (left
 * rail 320 + right rail 360 + handles take the rest), yet the Project Editor
 * used VIEWPORT breakpoints (`sm:`/`lg:`) and rendered its widest layout into
 * its narrowest container: 4-across stat cards with clipped labels, the
 * Recent Edits aside squeezing the level groups, and 3-across ~57px tiles.
 *
 * The fix keys the layout to CONTAINER width (Tailwind v4 `@container` +
 * `@[Npx]:` variants, the BrokenRefCard pattern). This story pins the narrow
 * behavior at the user's reported viewport:
 *   1. Stat cards wrap to 2×2 and no label is clipped.
 *   2. The Recent Edits aside stacks BELOW the level groups.
 *   3. Dashboard tiles render ≥1 sane column (≥180px wide).
 * And the wide behavior (1600px) still gets 4-across cards + side-by-side aside.
 *
 * Port: follows project-editor.spec.mjs — absolute URL, default :3003
 * (override with PROJECT_EDITOR_BASE_URL).
 */

import { test, expect } from '@playwright/test';

const BASE_URL = process.env.PROJECT_EDITOR_BASE_URL || 'http://localhost:3003';
const WORKSPACE_URL = `${BASE_URL}/workspace`;
const SCREENS = 'e2e/stories/__screens__';
const WAIT = 20000;

const openProjectEditor = async page => {
  await page.goto(WORKSPACE_URL);
  await page.waitForLoadState('networkidle');
  await expect(page.getByTestId('project-editor')).toBeVisible({ timeout: WAIT });
  await expect(page.getByTestId('project-editor-health')).toBeVisible({ timeout: WAIT });
};

const healthCardBoxes = async page => {
  const boxes = [];
  for (const key of ['dashboards', 'insights', 'models', 'sources']) {
    boxes.push(await page.getByTestId(`project-editor-health-${key}`).boundingBox());
  }
  return boxes;
};

test.describe('Project Editor — narrow middle pane (container queries)', () => {
  test.describe.configure({ mode: 'serial' });
  test.setTimeout(90000);

  /** @type {import('@playwright/test').Page} */
  let page;

  test.beforeAll(async ({ browser }) => {
    page = await browser.newPage({ viewport: { width: 1071, height: 900 } });
  });

  test.afterAll(async () => {
    await page.close();
  });

  test('stat cards wrap to 2×2 with no clipped labels at 1071px', async () => {
    await openProjectEditor(page);

    const [d, i, m, s] = await healthCardBoxes(page);
    // 2×2: dashboards/insights share a row; models/sources sit on the next.
    expect(Math.abs(d.y - i.y)).toBeLessThan(2);
    expect(Math.abs(m.y - s.y)).toBeLessThan(2);
    expect(m.y).toBeGreaterThan(d.y + d.height - 2);

    // No label overflows its card (the old bug clipped "DASHBOARDS" → "DASHB…"
    // by letting the sibling card paint over it).
    const clipped = await page.evaluate(() => {
      const cards = document.querySelectorAll('[data-testid^="project-editor-health-"]');
      return Array.from(cards).some(card => {
        const label = card.querySelector('span:last-child span:last-child, div > span:last-child');
        return label && label.scrollWidth > label.clientWidth + 1;
      });
    });
    expect(clipped, 'no stat-card label is clipped').toBe(false);
    await page.screenshot({ path: `${SCREENS}/narrow-pane-01-1071px.png`, fullPage: false });
  });

  test('Recent Edits stacks below the level groups at 1071px', async () => {
    const recent = await page.getByTestId('project-editor-recent').boundingBox();
    const firstGroup = await page
      .locator('[data-testid^="level-group-dropzone-"]')
      .first()
      .boundingBox();
    expect(recent.y, 'aside stacked below the groups').toBeGreaterThan(firstGroup.y);
    // Full-width when stacked — not squeezed into a 4/12 column.
    expect(recent.width).toBeGreaterThan(250);
  });

  test('dashboard tiles keep a sane width at 1071px', async () => {
    const tile = await page.locator('[data-testid^="project-tile-"]').first().boundingBox();
    expect(tile.width, 'tiles never collapse below ~180px').toBeGreaterThanOrEqual(180);
  });

  test('wide viewport (1600px) still gets 4-across cards and a side-by-side aside', async () => {
    await page.setViewportSize({ width: 1600, height: 1000 });
    await openProjectEditor(page);

    const [d, i, m, s] = await healthCardBoxes(page);
    expect(Math.abs(d.y - i.y)).toBeLessThan(2);
    expect(Math.abs(d.y - m.y)).toBeLessThan(2);
    expect(Math.abs(d.y - s.y)).toBeLessThan(2);

    const recent = await page.getByTestId('project-editor-recent').boundingBox();
    const firstGroup = await page
      .locator('[data-testid^="level-group-dropzone-"]')
      .first()
      .boundingBox();
    // Side-by-side: the aside starts to the RIGHT of the groups column.
    expect(recent.x).toBeGreaterThan(firstGroup.x + firstGroup.width - 2);
    await page.screenshot({ path: `${SCREENS}/narrow-pane-02-1600px.png`, fullPage: false });
  });
});
