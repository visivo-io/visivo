/**
 * Story: Trace-Props Editor (VIS-1020)
 *
 * Exercises the grouped, schema-driven, AJV-validated Plotly-props editor
 * (`TracePropsEditor`) against its LIVE edit surface — the Workspace right rail's
 * Edit tab, which mounts `InsightEditForm` → `<TracePropsEditor>` for the
 * selected insight (see RightRailEditPanel `INLINE_LEAF_FORMS.insight`).
 *
 * Stories (acceptance):
 *   (a) GROUPED FORM — the editor renders the "Essentials" group plus the
 *       type-woven "Key fields (<type>)" group (buildTraceGroupSpec §3).
 *   (b) TYPE-SWITCH PRESERVATION — picking a new type in the TypeSelector
 *       (a brand react-select) carries a compatible top-level prop forward
 *       (scatter `x` → bar), and the grouped title flips to the new type
 *       ("Key fields (bar)") — preserveTraceProps via the controlled onChange.
 *   (c) INLINE AJV ERROR — an invalid enum value (`mode: 'bogus'` on scatter)
 *       surfaces a per-field inline error at its dot-path
 *       (`property-error-mode`) AND the overall invalid indicator
 *       (`trace-props-invalid-indicator`).
 *
 * HARNESS: like right-rail-routing.spec.mjs, we drive selection through the
 * live zustand store on `window.useStore` (Library + Outline are the real
 * selection paths; both call `openWorkspaceTab` / `setWorkspaceRightTab`). We
 * seed the chosen insight's props deterministically via the store so the test
 * does not depend on the integration fixture's exact prop values — only on an
 * insight existing (the integration project has 20).
 *
 * Precondition: sandbox running on :3001/:8001 (override via PLAYWRIGHT_BASE_URL).
 */

import { test, expect } from '@playwright/test';

const WORKSPACE_URL = '/workspace';
const WAIT_FOR_PAGE = 20000;
const EDITOR = '[data-testid="trace-props-editor"]';

/** The insight collection entry can be an envelope (`{name,status,config}`) or
 *  bare (`{name, ...config}`); seed props in whichever shape the record uses so
 *  InsightEditForm reads `config.props` correctly (matches unwrapRecordConfig). */
const seedInsightProps = (page, name, props) =>
  page.evaluate(
    ({ name, props }) => {
      const s = window.useStore.getState();
      const insights = (s.insights || []).map(rec => {
        if (rec.name !== name) return rec;
        if (rec.config) return { ...rec, config: { ...rec.config, props } };
        return { ...rec, props };
      });
      window.useStore.setState({ insights });
    },
    { name, props }
  );

/** Pick the first insight name from the live store (integration has 20). */
const firstInsightName = page =>
  page.evaluate(() => {
    const insights = window.useStore.getState().insights || [];
    return insights.length ? insights[0].name : null;
  });

/** Select an insight in the right rail's Edit tab so InsightEditForm mounts. */
const openInsightEdit = async (page, name) => {
  await page.evaluate(
    ({ name }) => {
      const s = window.useStore.getState();
      s.openWorkspaceTab({ id: `insight:${name}`, type: 'insight', name });
      s.setWorkspaceRightTab('edit');
    },
    { name }
  );
  await page.locator(EDITOR).waitFor({ timeout: 10000 });
};

test.describe('Trace-Props Editor (VIS-1020)', () => {
  test.describe.configure({ mode: 'serial' });
  test.setTimeout(90000);

  /** @type {import('@playwright/test').Page} */
  let page;
  /** @type {string} */
  let insightName;

  test.beforeAll(async ({ browser }) => {
    page = await browser.newPage();
    page._consoleErrors = [];
    page.on('console', msg => {
      if (msg.type() === 'error') page._consoleErrors.push(msg.text());
    });

    await page.goto(WORKSPACE_URL);
    await page.waitForLoadState('networkidle');
    await page.getByTestId('workspace-right-rail').waitFor({ timeout: WAIT_FOR_PAGE });

    // Ensure the insight collection is loaded, then grab a target insight.
    await page.evaluate(() => window.useStore.getState().fetchInsights?.());
    await expect.poll(() => firstInsightName(page), { timeout: WAIT_FOR_PAGE }).not.toBeNull();
    insightName = await firstInsightName(page);
    expect(insightName, 'the integration project should expose at least one insight').toBeTruthy();
  });

  test.afterAll(async () => {
    await page.close();
  });

  test('(a) grouped editor shows Essentials + "Key fields (<type>)"', async () => {
    // Seed a clean scatter props object with a compatible top-level prop.
    await seedInsightProps(page, insightName, { type: 'scatter', x: ['a', 'b', 'c'] });
    await openInsightEdit(page, insightName);

    const editor = page.locator(EDITOR);

    // TypeSelector reflects the seeded type (react-select shows the label).
    await expect(editor.getByTestId(`type-selector-${insightName}`)).toContainText(/Scatter/i, {
      timeout: 10000,
    });

    // Essentials group (★★) always renders for a type with Tier-A catalog paths.
    await expect(editor.getByTestId('field-group-header-essentials')).toBeVisible({
      timeout: 10000,
    });

    // The type-woven "Key fields (scatter)" group (Tier-B catalog paths).
    await expect(editor.getByText('Key fields (scatter)')).toBeVisible({ timeout: 10000 });
  });

  test('(b) switching type via TypeSelector preserves a compatible prop (x) and updates the type', async () => {
    // Re-seed scatter with x set (the compatible prop we expect to survive).
    await seedInsightProps(page, insightName, { type: 'scatter', x: ['a', 'b', 'c'], mode: 'markers' });
    await openInsightEdit(page, insightName);

    const editor = page.locator(EDITOR);
    await expect(editor.getByText('Key fields (scatter)')).toBeVisible({ timeout: 10000 });

    // The seeded scatter `x` prop renders as a PropertyRow (path label is the
    // dot-path in a mono span). Confirm it is present BEFORE the switch.
    await expect(editor.getByText('x', { exact: true }).first()).toBeVisible({ timeout: 10000 });

    // Drive the TypeSelector react-select: open its menu, type to filter to
    // "Bar", then click the option. The menu portals to document.body and its
    // options carry the brand classNamePrefix `vis-select__option`.
    const typeSelector = editor.getByTestId(`type-selector-${insightName}`);
    await typeSelector.click();
    const combobox = typeSelector.getByRole('combobox');
    await combobox.fill('Bar');
    const barOption = page.locator('.vis-select__option', { hasText: /^Bar$/ }).first();
    await barOption.waitFor({ timeout: 10000 });
    await barOption.click();

    // Type updated: the grouped title flips to the bar type, TypeSelector shows Bar.
    await expect(editor.getByText('Key fields (bar)')).toBeVisible({ timeout: 10000 });
    await expect(editor.getByTestId(`type-selector-${insightName}`)).toContainText('Bar');

    // Compatible prop preserved: `x` is valid in the bar schema, so its
    // PropertyRow is still rendered after the switch (preserveTraceProps).
    await expect(editor.getByText('x', { exact: true }).first()).toBeVisible({ timeout: 10000 });
  });

  test('(c) an invalid enum value surfaces an inline AJV error at its dot-path', async () => {
    // `mode` on scatter is an enum; 'bogus' is not a member → AJV reports it.
    await seedInsightProps(page, insightName, { type: 'scatter', x: ['a'], mode: 'bogus' });
    await openInsightEdit(page, insightName);

    const editor = page.locator(EDITOR);
    await expect(editor.getByText('Key fields (scatter)')).toBeVisible({ timeout: 10000 });

    // Per-field inline error keyed to the offending dot-path (`mode`).
    await expect(page.getByTestId('property-error-mode')).toBeVisible({ timeout: 10000 });

    // Overall invalid indicator next to the TypeSelector.
    await expect(editor.getByTestId('trace-props-invalid-indicator')).toBeVisible({
      timeout: 10000,
    });
  });

  test('no console errors while exercising the editor', async () => {
    const realErrors = page._consoleErrors.filter(
      e =>
        !e.includes('favicon') &&
        !e.includes('DevTools') &&
        !e.includes('react-cool') &&
        !e.includes('ResizeObserver') &&
        !e.includes('Download the React DevTools') &&
        !/Failed to load resource/i.test(e)
    );
    expect(realErrors).toHaveLength(0);
  });
});
