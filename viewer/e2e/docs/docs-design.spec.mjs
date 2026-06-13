/**
 * Docs design-compliance suite (ported from www/e2e/design-compliance.spec.ts).
 *
 * Gates on both desktop + mobile projects (see playwright.docs.config.mjs):
 *   - no horizontal overflow (mobile regressions are the usual culprit)
 *   - no near-invisible text (dark-on-dark / light-on-light) on the
 *     hero/heading and Material nav chrome
 *
 * Precondition: docs sandbox running on :8003 (or $VISIVO_DOCS_PORT)
 *   bash scripts/docs_sandbox.sh start
 */

import { test, expect } from '@playwright/test';

const PAGES = [
  '/',
  '/installation/',
  '/topics/sources/',
  '/topics/ci-cd/',
  '/contributing/editorial-guidelines/',
  '/reference/configuration/Dashboards/Dashboard/',
  '/concepts/',
  '/cloud/',
];

for (const route of PAGES) {
  test(`no horizontal overflow on ${route}`, async ({ page }) => {
    await page.goto(route);
    await page.waitForLoadState('domcontentloaded');
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth
    );
    // small tolerance for sub-pixel rounding / scrollbars
    expect(overflow, `${overflow}px of horizontal overflow on ${route}`).toBeLessThanOrEqual(2);
  });

  test(`no near-invisible text on hero/nav of ${route}`, async ({ page }) => {
    await page.goto(route);
    await page.waitForLoadState('domcontentloaded');
    const offenders = await page.evaluate(() => {
      const parseRGB = s => {
        const m = s.match(/rgba?\(([^)]+)\)/);
        if (!m) return null;
        const p = m[1].split(',').map(x => parseFloat(x.trim()));
        return [p[0], p[1], p[2], p[3] ?? 1];
      };
      const lum = (r, g, b) => {
        const a = [r, g, b].map(v => {
          v /= 255;
          return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
        });
        return 0.2126 * a[0] + 0.7152 * a[1] + 0.0722 * a[2];
      };
      const effectiveBg = el => {
        let node = el;
        while (node) {
          const bg = parseRGB(getComputedStyle(node).backgroundColor);
          if (bg && bg[3] > 0) return bg;
          node = node.parentElement;
        }
        return null;
      };
      const bad = [];
      // Hero/heading + Material nav chrome — the elements users must always
      // be able to read, regardless of palette tweaks.
      const els = Array.from(
        document.querySelectorAll(
          [
            '.md-content h1',
            '.md-content h2',
            'header.md-header a',
            'header.md-header span',
            '.md-tabs a',
            'nav.md-nav--primary a',
          ].join(',')
        )
      ).slice(0, 500);
      for (const el of els) {
        const text = el.innerText?.trim();
        if (!text) continue;
        const rect = el.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) continue;
        const style = getComputedStyle(el);
        if (style.visibility === 'hidden' || style.display === 'none') continue;
        const fg = parseRGB(style.color);
        const bg = effectiveBg(el);
        if (!fg || !bg) continue;
        const ratio =
          (Math.max(lum(fg[0], fg[1], fg[2]), lum(bg[0], bg[1], bg[2])) + 0.05) /
          (Math.min(lum(fg[0], fg[1], fg[2]), lum(bg[0], bg[1], bg[2])) + 0.05);
        // ratio < 1.5 ≈ near-invisible same-on-same color (the bug we care about)
        if (ratio < 1.5) {
          bad.push(`<${el.tagName.toLowerCase()}> "${text.slice(0, 40)}" ratio=${ratio.toFixed(2)}`);
        }
      }
      return bad;
    });
    expect(offenders, `near-invisible text on ${route}:\n${offenders.join('\n')}`).toEqual([]);
  });
}
