/**
 * Story: dropping a field into a NESTED-path chart well (marker.color,
 * line.dash, …) — the Build rail's "Key fields (scatter)" group.
 *
 * UX-bug-hunt finding (coverage gap #15): a drop writes a FLAT dot-key
 * (`setInsightProp` stores props['marker.color']), but a field row reads its
 * displayed value by NESTED path (FieldGroup's `getValueAtPath(value,
 * 'marker.color')` -> value.marker.color). So a column dropped into
 * marker.color read back `undefined` — the well kept showing the empty
 * "Type @ to insert a reference" placeholder even though the value WAS set and
 * the chart rendered. Top-level wells (x/y) were unaffected (flat == nested).
 * The fix expands the flat dot-keys before handing props to TracePropsEditor
 * so the well displays what was dropped.
 *
 * Precondition: sandbox running (integration project) on :3001/:8001.
 * Runs in the serial `exploration-mutations` project (mints a real
 * exploration record).
 */
import { test, expect } from '@playwright/test';
import { typeSql, runQuery } from '../helpers/explorer.mjs';
import { BASE_URL, API } from '../helpers/sandbox.mjs';

async function listExplorationIds(page) {
  const res = await page.request.get(`${API}/api/explorations/`).catch(() => null);
  if (!res || !res.ok()) return [];
  const data = await res.json().catch(() => []);
  return (data || []).map(e => e.id);
}

async function gotoExplorerHome(page) {
  await page.goto(`${BASE_URL}/workspace/exploration`);
  await page.waitForLoadState('networkidle');
  await expect(page.getByTestId('workspace-middle-explorer')).toBeVisible({ timeout: 30000 });
}

async function newExploration(page) {
  await page.getByTestId('explorer-home-new-exploration').click();
  await expect(page.getByTestId('workspace-middle-exploration')).toBeVisible({ timeout: 30000 });
  await page.waitForFunction(() => !!window.useStore.getState().explorerActiveModelName, {
    timeout: 10000,
  });
  await page.waitForURL(/\/workspace\/exploration\/exp_/, { timeout: 10000 });
}

async function dragAndDrop(page, sourceLocator, targetLocator) {
  const s = await sourceLocator.boundingBox();
  const t = await targetLocator.boundingBox();
  expect(s && t, 'both drag endpoints have a box').toBeTruthy();
  const sx = s.x + s.width / 2;
  const sy = s.y + s.height / 2;
  const tx = t.x + t.width / 2;
  const ty = t.y + t.height / 2;
  await page.mouse.move(sx, sy);
  await page.mouse.down();
  await page.mouse.move(sx + 10, sy, { steps: 3 });
  await page.waitForTimeout(100);
  await page.mouse.move(tx, ty, { steps: 12 });
  await page.mouse.move(tx, ty, { steps: 4 });
  await page.waitForTimeout(150);
  await page.mouse.up();
  await page.waitForTimeout(300);
}

test.describe('Exploration nested-property wells (marker.color drop display)', () => {
  test.describe.configure({ timeout: 60000 });

  let idsBefore = [];
  test.beforeEach(async ({ page }) => {
    idsBefore = await listExplorationIds(page);
  });
  test.afterEach(async ({ page }) => {
    const after = await listExplorationIds(page);
    for (const id of after.filter(i => !idsBefore.includes(i))) {
      await page.request.delete(`${API}/api/explorations/${id}/`).catch(() => {});
    }
  });

  test('a column dropped into marker.color shows a value pill in the well (not the empty placeholder)', async ({
    page,
  }) => {
    // Wide viewport keeps the chart-preview pane mounted beside the grid.
    await page.setViewportSize({ width: 1920, height: 1080 });
    await gotoExplorerHome(page);
    await newExploration(page);
    await typeSql(page, "SELECT 1 AS revenue, 'North' AS region UNION ALL SELECT 3, 'South'");
    await runQuery(page);
    await page.waitForFunction(() => window.useStore.getState().explorerChartInsightNames.length > 0, {
      timeout: 15000,
    });

    // Reveal the "Key fields (scatter)" group so marker.color's well renders.
    await page.getByTestId('field-group-more-key').click();
    const well = page.getByTestId('droppable-property-marker.color');
    await expect(well).toBeVisible({ timeout: 10000 });

    // The well starts EMPTY — the placeholder is present, no value pill.
    await expect(well).toContainText(/Type @ to insert a reference/i);

    // Drag the `region` column header into marker.color.
    const column = page.getByTestId('draggable-col-region');
    await expect(column).toBeVisible({ timeout: 10000 });
    await dragAndDrop(page, column, well);

    // GUARD: the well must now DISPLAY the dropped ref as a value pill —
    // "<model> ▸ region" — and no longer show the empty placeholder. Before
    // the flat-dot-key expansion fix, the flat props['marker.color'] read back
    // undefined and the well stayed on the placeholder.
    await expect(well).toContainText(/region/, { timeout: 10000 });
    await expect(well).not.toContainText(/Type @ to insert a reference/i);

    // And the value is actually stored on the insight.
    await expect
      .poll(() =>
        page.evaluate(() => {
          const s = window.useStore.getState();
          const name = s.explorerActiveInsightName;
          const props = s.explorerInsightStates[name]?.props || {};
          return Object.values(props).some(v => typeof v === 'string' && v.includes('.region}'));
        })
      )
      .toBe(true);
  });
});
