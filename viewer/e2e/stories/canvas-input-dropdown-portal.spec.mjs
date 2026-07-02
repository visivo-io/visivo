/**
 * Story: Canvas input dropdown escapes the item slot (VIS-901 #6 — regression).
 *
 * The canvas build surface renders each item in a slot that clips its content
 * with `overflow-hidden` (Dashboard.renderRow). An input's option menu used to be
 * an `absolute`-positioned child INSIDE that slot, so it was cut off below the
 * item div — the "Search options…" box and the option list were invisible on the
 * canvas. This has regressed more than once, so this spec is a hard regression
 * guard.
 *
 * The fix (PortalDropdownMenu) portals the menu to <body> with fixed positioning
 * so it overlays OUTSIDE the slot regardless of any ancestor overflow. This spec
 * opens a single-select dropdown input on the canvas and asserts:
 *   - the menu is portalled to <body> (not a descendant of its item slot), and
 *   - it visually extends BEYOND the slot's bounding box (i.e. it would have been
 *     clipped without the portal), and
 *   - the "Search options…" search box is present in the menu.
 *
 * Precondition: an isolated sandbox running the integration project, which has the
 * `insights-dashboard` with single-select dropdown inputs on the canvas.
 *   VISIVO_SANDBOX_BACKEND_PORT=8048 VISIVO_SANDBOX_FRONTEND_PORT=3048 \
 *   VISIVO_SANDBOX_NAME=vis901 bash scripts/sandbox.sh start
 *   # then: VIS_CANVAS_DND_BASE=http://localhost:3048 npx playwright test canvas-input-dropdown-portal
 */

import { test, expect } from '@playwright/test';

const BASE = process.env.VIS_CANVAS_DND_BASE || 'http://localhost:3008';
const SCREENS = 'e2e/stories/__screens__';
const DASHBOARD = 'insights-dashboard';
// "Split Threshold (Dropdown)" — a single-select Dropdown.jsx input on the canvas.
const DROPDOWN_LABEL = 'Split Threshold (Dropdown)';
const WAIT = 20000;

test.use({ viewport: { width: 1600, height: 1200 } });

const openCanvas = async page => {
  await page.goto(`${BASE}/workspace/dashboard/${DASHBOARD}`);
  await page.waitForLoadState('networkidle');
  await expect(page.getByTestId('project-canvas')).toBeVisible({ timeout: WAIT });
  await expect(page.getByTestId(`dashboard_${DASHBOARD}`)).toBeVisible({ timeout: WAIT });
};

test.describe('Canvas input dropdown portal (VIS-901 #6)', () => {
  test.setTimeout(120000);

  test('an input dropdown opens OUTSIDE its overflow-clipped item slot', async ({ page }) => {
    await openCanvas(page);

    // Locate the single-select dropdown's trigger button by its label wrapper
    // (Dropdown.jsx renders `<div class="w-full min-w-[200px]">` with the label).
    const found = await page.evaluate(label => {
      const wrappers = Array.from(document.querySelectorAll('div.min-w-\\[200px\\]'));
      const w = wrappers.find(x => (x.textContent || '').includes(label));
      if (!w) return { ok: false, reason: 'no dropdown wrapper' };
      const btn = w.querySelector('button');
      if (!btn) return { ok: false, reason: 'no trigger button' };
      btn.scrollIntoView({ block: 'center' });
      // The slot clips with overflow-hidden — assert the precondition holds so a
      // passing test really proves the portal escape (not just "menu renders").
      const slot = btn.closest('[data-canvas-path]');
      const slotClips = slot && getComputedStyle(slot).overflow === 'hidden';
      return { ok: true, slotClips };
    }, DROPDOWN_LABEL);
    expect(found.ok, found.reason || 'dropdown trigger found').toBe(true);
    expect(found.slotClips, 'the item slot clips with overflow:hidden').toBe(true);

    // Open the dropdown via a real pointer sequence on its trigger.
    const result = await page.evaluate(async label => {
      const wrappers = Array.from(document.querySelectorAll('div.min-w-\\[200px\\]'));
      const w = wrappers.find(x => (x.textContent || '').includes(label));
      const btn = w.querySelector('button');
      btn.scrollIntoView({ block: 'center' });
      await new Promise(r => setTimeout(r, 120));
      const r = btn.getBoundingClientRect();
      const o = {
        bubbles: true,
        cancelable: true,
        view: window,
        clientX: r.left + r.width / 2,
        clientY: r.top + r.height / 2,
        button: 0,
      };
      btn.dispatchEvent(new PointerEvent('pointerdown', { ...o, pointerId: 1 }));
      btn.dispatchEvent(new MouseEvent('mousedown', o));
      btn.dispatchEvent(new PointerEvent('pointerup', { ...o, pointerId: 1 }));
      btn.dispatchEvent(new MouseEvent('mouseup', o));
      btn.dispatchEvent(new MouseEvent('click', o));
      await new Promise(r => setTimeout(r, 300));

      const menu = document.querySelector('[data-testid="portal-dropdown-menu"]');
      if (!menu) return { menuFound: false };
      const slot = btn.closest('[data-canvas-path]');
      const mr = menu.getBoundingClientRect();
      const sr = slot.getBoundingClientRect();
      return {
        menuFound: true,
        parentIsBody: menu.parentElement === document.body,
        insideSlot: slot.contains(menu),
        hasSearchInput: !!menu.querySelector('input'),
        // The menu overflows the slot vertically (it would have been clipped).
        extendsBeyondSlot: mr.bottom > sr.bottom + 1 || mr.top < sr.top - 1,
      };
    }, DROPDOWN_LABEL);

    expect(result.menuFound, 'the dropdown option menu opened').toBe(true);
    // Portalled to <body>, NOT nested in the clipped slot.
    expect(result.parentIsBody, 'menu portals to <body>').toBe(true);
    expect(result.insideSlot, 'menu is NOT a descendant of the item slot').toBe(false);
    // The "Search options…" search box is part of the menu.
    expect(result.hasSearchInput, 'menu contains the search box').toBe(true);
    // The whole point of the fix: the menu paints beyond the slot bounds.
    expect(result.extendsBeyondSlot, 'menu escapes the slot bounding box').toBe(true);

    await page.screenshot({ path: `${SCREENS}/vis901-06-dropdown-portal.png`, fullPage: false });
  });
});
