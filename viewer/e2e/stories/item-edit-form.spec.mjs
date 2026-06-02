/**
 * Story: ItemEditForm — pill-and-drag leaf slot + container variant (VIS-787)
 *
 * The shell-level Edit form is still a VIS-G1 stub in the running Workspace
 * (the right-rail Edit tab renders "Edit form coming soon (VIS-G1)"), so the
 * live DashboardEditForm → RowEditForm → ItemEditForm tree is not yet reachable
 * through navigation. To still get a REAL-browser visual gate (real CSS, real
 * fonts, real EmbeddedPill rainbow colors), we mount the actual ItemEditForm
 * module — served by the Vite dev server at /src/... — into a container on the
 * running page and screenshot it. This exercises the genuine component code
 * path (not a mock) with the app's real stylesheet loaded.
 *
 * Validated:
 *   - leaf variant: a filled leaf renders an EmbeddedPill (rainbow type color)
 *     for the chart ref; clearing it shows the empty dashed drop-zone visual.
 *   - container variant (Item.rows): nested sub-rows render via RowEditForm.
 *
 * Precondition: vis787 sandbox running on :3006 / :8006.
 */

import { test, expect } from '@playwright/test';

const mountItemEditForm = async (page, { item, leafDropZoneId }) => {
  return page.evaluate(
    async ({ item, leafDropZoneId }) => {
      // The bare specifiers (`react`, etc.) are only resolvable inside Vite's
      // module graph, not from page.evaluate, so import the Vite-optimized dep
      // bundles directly. ItemEditForm itself imports `react` through Vite,
      // which dedupes to the same instance — so hooks share one React.
      const Rmod = await import(
        /* @vite-ignore */ '/node_modules/.vite/deps/react.js'
      );
      const Dmod = await import(
        /* @vite-ignore */ '/node_modules/.vite/deps/react-dom_client.js'
      );
      const dndMod = await import(
        /* @vite-ignore */ '/node_modules/.vite/deps/@dnd-kit_core.js'
      );
      const React = Rmod.default || Rmod;
      const ReactDOM = Dmod.default || Dmod;
      const dnd = dndMod;
      const { default: ItemEditForm } = await import(
        '/src/components/new-views/common/ItemEditForm.jsx'
      );
      const { default: RowEditForm } = await import(
        '/src/components/new-views/common/RowEditForm.jsx'
      );

      // Tear down any previous mount.
      const prev = document.getElementById('vis787-harness');
      if (prev) prev.remove();

      const host = document.createElement('div');
      host.id = 'vis787-harness';
      host.style.cssText =
        'position:fixed;top:0;left:0;width:380px;padding:16px;background:#ffffff;z-index:99999;';
      document.body.appendChild(host);

      const h = React.createElement;
      const App = () => {
        const [state, setState] = React.useState(item);
        return h(
          dnd.DndContext,
          null,
          h(ItemEditForm, {
            item: state,
            itemId: 'harness-0',
            itemIndex: 0,
            leafDropZoneId,
            RowComponent: RowEditForm,
            onChange: next => setState(next),
            onRemove: () => {},
            onSelectRef: () => {},
          })
        );
      };

      const root = ReactDOM.createRoot(host);
      root.render(h(App));
      // Allow React to flush.
      await new Promise(r => setTimeout(r, 150));
      return true;
    },
    { item, leafDropZoneId }
  );
};

// vis787 sandbox runs on :3006; the shared config defaults to :3001.
test.use({ baseURL: 'http://localhost:3006' });

test.describe('ItemEditForm visual gate (VIS-787)', () => {
  test.describe.configure({ mode: 'serial' });
  test.setTimeout(90000);

  /** @type {import('@playwright/test').Page} */
  let page;

  test.beforeAll(async ({ browser }) => {
    page = await browser.newPage();
    await page.setViewportSize({ width: 480, height: 720 });
    await page.goto('/workspace?view=project');
    await page.waitForLoadState('networkidle');
  });

  test.afterAll(async () => {
    await page.close();
  });

  test('Step 1: leaf variant renders an EmbeddedPill for the chart ref', async () => {
    await mountItemEditForm(page, {
      item: { width: 2, chart: 'ref(simple-line-chart)', table: '', markdown: '', input: '' },
      leafDropZoneId: 'harness-leaf',
    });

    const zone = page.locator('#vis787-harness [data-testid="ref-dropzone-harness-leaf"]');
    await expect(zone).toHaveAttribute('data-filled', 'true');
    // The pill label is the ref name.
    await expect(page.locator('#vis787-harness').getByText('simple-line-chart')).toBeVisible();
    // Leaf-mode toggle active.
    await expect(
      page.locator('#vis787-harness [data-testid="item-harness-0-mode-leaf"]')
    ).toHaveAttribute('aria-checked', 'true');

    // Assert the pill actually carries a rainbow type color (chart=pink family),
    // i.e. it is NOT a transparent / default grey pill — guards dark-on-dark.
    const pillColor = await page.evaluate(() => {
      const pill = document
        .querySelector('#vis787-harness [data-testid="ref-dropzone-harness-leaf"]')
        .querySelector('span.font-medium');
      const cs = getComputedStyle(pill);
      return { color: cs.color };
    });
    // chart text color should be a saturated (non-grey, non-black) value.
    expect(pillColor.color).not.toBe('rgb(0, 0, 0)');

    await page.locator('#vis787-harness').screenshot({
      path: 'e2e/stories/__screens__/vis787-01-leaf-filled-pill.png',
    });
  });

  test('Step 2: removing the pill reveals the empty dashed drop-zone', async () => {
    await page.locator('#vis787-harness [data-testid="pill-remove"]').click();
    const zone = page.locator('#vis787-harness [data-testid="ref-dropzone-harness-leaf"]');
    await expect(zone).toHaveAttribute('data-filled', 'false');
    await expect(zone).toContainText(/Drop a chart, table, markdown, or input/i);

    await page.locator('#vis787-harness').screenshot({
      path: 'e2e/stories/__screens__/vis787-02-leaf-empty-dropzone.png',
    });
  });

  test('Step 3: container variant renders nested sub-rows via RowEditForm', async () => {
    await mountItemEditForm(page, {
      item: {
        width: 1,
        rows: [
          { height: 'small', items: [{ width: 1, chart: 'ref(simple-line-chart)' }] },
          { height: 'small', items: [{ width: 1, table: 'ref(simple-table)' }] },
        ],
      },
    });

    await expect(
      page.locator('#vis787-harness [data-testid="item-harness-0-mode-container"]')
    ).toHaveAttribute('aria-checked', 'true');
    await expect(
      page.locator('#vis787-harness [data-testid="item-harness-0-rows"]')
    ).toBeVisible();
    await expect(
      page.locator('#vis787-harness [data-testid="row-edit-form-harness-0-0"]')
    ).toBeVisible();
    await expect(
      page.locator('#vis787-harness [data-testid="row-edit-form-harness-0-1"]')
    ).toBeVisible();
    // Both nested leaf refs render as pills.
    await expect(page.locator('#vis787-harness').getByText('simple-line-chart')).toBeVisible();
    await expect(page.locator('#vis787-harness').getByText('simple-table')).toBeVisible();

    await page.locator('#vis787-harness').screenshot({
      path: 'e2e/stories/__screens__/vis787-03-container-nested-rows.png',
    });
  });

  test('Step 4: reorder a nested sub-row (move row 1 down)', async () => {
    await page
      .locator('#vis787-harness [aria-label="Move nested row 1 down"]')
      .click();
    // After swap the first rendered nested row holds the table ref.
    const firstRow = page.locator('#vis787-harness [data-testid="row-edit-form-harness-0-0"]');
    await expect(firstRow.getByText('simple-table')).toBeVisible();

    await page.locator('#vis787-harness').screenshot({
      path: 'e2e/stories/__screens__/vis787-04-container-reordered.png',
    });
  });
});
