/**
 * Visual capture for Track N preview surfaces (aesthetic sweep tooling).
 *
 * NOT an assertion spec — it navigates to each preview surface at desktop and
 * mobile viewports and saves a full-page PNG to /tmp/hard-n/ so the captured
 * frames can be reviewed for contrast / overflow / responsiveness. Each preview
 * type is captured in BOTH its Preview and (for previewable types) Lineage lens,
 * plus the preview-less Lineage-lock case.
 *
 * Run: VISIVO_BASE_URL=http://localhost:3021 npx playwright test \
 *        e2e/stories/workspace-previews-visual-capture.spec.mjs --project=parallel
 */

import { test, expect } from '@playwright/test';
import fs from 'fs';

// PLAYWRIGHT_BASE_URL must come before the :3001 fallback: :3001 is the SHARED
// sandbox, so without it an unset VISIVO_BASE_URL silently routes this spec
// onto whatever else is using that sandbox.
const BASE_URL =
  process.env.PLAYWRIGHT_BASE_URL || process.env.VISIVO_BASE_URL || 'http://localhost:3001';
const OUT = '/tmp/hard-n';
fs.mkdirSync(OUT, { recursive: true });

const VIEWPORTS = [
  { tag: 'desktop', width: 1440, height: 900 },
  { tag: 'mobile', width: 390, height: 844 },
];

// type → representative object name (verified live).
const PREVIEWABLE = [
  { type: 'chart', name: 'simple-scatter-chart' },
  { type: 'table', name: 'new_table' },
  { type: 'insight', name: 'simple-scatter-insight' },
  { type: 'input', name: 'show_markers' },
  { type: 'model', name: 'sales_data' },
];
const PREVIEW_LESS = [
  { type: 'source', name: 'local-sqlite' },
  { type: 'metric', name: 'total_value' },
];

async function openObject(page, type, name) {
  await page.getByTestId(`library-subsection-${type}-header`).click();
  const row = page.getByTestId(`library-row-${type}-${name}`);
  await expect(row).toBeVisible({ timeout: 10000 });
  await row.click();
}

for (const vp of VIEWPORTS) {
  test.describe(`visual capture @ ${vp.tag}`, () => {
    test.use({ viewport: { width: vp.width, height: vp.height } });

    test(`capture ${vp.tag} preview surfaces`, async ({ page }) => {
      // Pure capture tooling — it visits many surfaces with deliberate settle
      // waits, so the default 30s test budget is too small. Use a generous
      // finite budget (NOT 0) so an off-screen mobile click can't hang forever.
      test.setTimeout(240000);
      await page.goto(`${BASE_URL}/workspace`);
      await page.waitForLoadState('networkidle');
      await expect(page.getByTestId('workspace-left-rail')).toBeVisible({ timeout: 10000 });

      // Bare workspace shell first.
      await page.screenshot({ path: `${OUT}/${vp.tag}-00-shell.png`, fullPage: false });

      // On a wide viewport the three-rail shell shows the middle pane in-frame,
      // so a plain viewport screenshot captures the preview. On a narrow
      // (mobile) viewport the shell now auto-collapses both rails (6c-T2,
      // BLOCKER-at-1100px fix) and the canvas holds a real min-width, but at
      // true PHONE width (390px) that min-width still exceeds the viewport —
      // the shell has no horizontal scroll, so the middle pane still sits
      // partly off-screen-right inside an overflow-hidden parent and can't be
      // scrolled into view. Capturing the visible viewport is still the
      // honest representation of what a mobile user actually sees (now the
      // Library as a collapsed icon strip, not full-width, with the editor's
      // right portion clipped off-screen instead of the whole editor).
      // We never use element.screenshot()/scrollIntoView here because that hangs
      // on a clipped off-screen element.
      const shotMiddle = async file => {
        await page.screenshot({ path: file, fullPage: false }).catch(() => {});
      };

      // Every interaction is timeout-guarded (5s) and swallowed so a single
      // off-screen control on mobile degrades to "no extra shot", never a hang.
      const safeClick = sel =>
        page.getByTestId(sel).click({ timeout: 5000 }).catch(() => {});

      let idx = 1;
      for (const { type, name } of PREVIEWABLE) {
        await openObject(page, type, name).catch(() => {});
        await page
          .getByTestId(`workspace-middle-${type}-preview`)
          .waitFor({ timeout: 15000 })
          .catch(() => {});
        await page.waitForTimeout(2500);
        if (type === 'model') {
          await safeClick('model-preview-run');
          await page.waitForTimeout(4000);
        }
        await shotMiddle(
          `${OUT}/${vp.tag}-${String(idx).padStart(2, '0')}-${type}-preview.png`
        );

        await safeClick('workspace-lens-picker-option-lineage');
        await page.waitForTimeout(1500);
        await shotMiddle(
          `${OUT}/${vp.tag}-${String(idx).padStart(2, '0')}-${type}-lineage.png`
        );
        idx += 1;
      }

      for (const { type, name } of PREVIEW_LESS) {
        await openObject(page, type, name).catch(() => {});
        await page
          .getByTestId(`workspace-middle-${type}-lineage`)
          .waitFor({ timeout: 12000 })
          .catch(() => {});
        await page.waitForTimeout(1500);
        await shotMiddle(
          `${OUT}/${vp.tag}-${String(idx).padStart(2, '0')}-${type}-lineagelock.png`
        );
        idx += 1;
      }
    });
  });
}
