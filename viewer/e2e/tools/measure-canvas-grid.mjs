/**
 * measure-canvas-grid — the measurement harness behind canvasGridGeometry's
 * "browser-measured" fixtures (M26 / VIS-1260).
 *
 * `canvasGridGeometry.js` claims to reproduce, in arithmetic, the geometry CSS
 * grid resolves for a <Dashboard> row. That claim is only worth something if
 * somebody can re-run it, so this script is the runnable proof: it builds rows
 * in headless Chromium using Dashboard.renderRow's EXACT styles
 * (`repeat(Σ widths, minmax(0, 1fr))`, `gap: 0.7rem`, `min-width: 0` items),
 * measures every slot with `getBoundingClientRect()`, and diffs the numbers
 * against the formulas the overlay previews with — width AND left offset.
 *
 * It also replays the full resize round-trip per row shape: for every item and
 * every reachable span it computes the ghost the overlay paints, commits that
 * span (sum-normalizing the row exactly as `setItemWidth` does), re-lays the row
 * out in the browser, and reports the worst |ghost − rendered| for both edges.
 *
 * Run (from `viewer/`, browsers already provisioned by Playwright):
 *
 *     node e2e/tools/measure-canvas-grid.mjs
 *     node e2e/tools/measure-canvas-grid.mjs --json    # machine-readable
 *
 * It is NOT a Playwright test (no `.spec.mjs` suffix, so `playwright.config.mjs`
 * never collects it) and it touches no sandbox — it needs nothing but a browser.
 * Exit code is non-zero if any measured deviation exceeds MAX_DEVIATION_PX.
 */
import { readFileSync } from 'node:fs';
import { chromium } from '@playwright/test';

// `viewer/package.json` has no `"type": "module"`, so Node parses a `.js` file
// under `src/` as CommonJS and chokes on its `export` statements. The geometry
// module has NO imports of its own, so loading its real source through a
// `data:` URL runs the actual shipped code with no build step and no flags —
// re-implementing the formulas here would defeat the entire point of the check.
const GEOMETRY_SRC = new URL(
  '../../src/components/views/project/canvas/canvasGridGeometry.js',
  import.meta.url
);
const {
  itemSlotWidthPx,
  precedingColsInRow,
  previewItemWidthPx,
  previewItemLeftShiftPx,
  rowGridTotal,
  spanLeftOffsetPx,
  MAX_ITEM_WIDTH,
} = await import(
  `data:text/javascript;base64,${readFileSync(GEOMETRY_SRC).toString('base64')}`
);

// A sub-pixel tolerance: Chromium resolves fr tracks with LayoutUnit (1/64 =
// 0.015625px) precision and that rounding accumulates across the tracks a slot
// straddles, so an exact float match is not achievable. Anything approaching a
// tenth of a pixel would mean the formula is a DIFFERENT formula.
const MAX_DEVIATION_PX = 0.05;

// Row shapes worth measuring: even splits, lopsided splits, prime totals, the
// degenerate solo row, and a row whose widths happen to total 12 (the shape the
// pre-M26 hardcoded grid got right by accident).
const SHAPES = [
  { widths: [6, 6], rowWidth: 1000 },
  { widths: [1, 2], rowWidth: 900 },
  { widths: [3, 5, 1], rowWidth: 1200 },
  { widths: [2, 3], rowWidth: 960 },
  { widths: [9, 2], rowWidth: 800 },
  { widths: [12], rowWidth: 900 },
  { widths: [3, 3, 3, 3], rowWidth: 1140 },
  { widths: [7, 2, 4, 1], rowWidth: 1013 },
  { widths: [2, 2, 2, 2], rowWidth: 1200 },
  { widths: [1, 1, 1, 1, 1], rowWidth: 777 },
];

// Lay a row out with Dashboard.renderRow's exact grid styles and hand back each
// slot's measured left offset (relative to the row) and width.
const measureRow = (page, widths, rowWidth) =>
  page.evaluate(
    ({ ws, rw }) => {
      const host = document.getElementById('host');
      host.style.width = `${rw}px`;
      host.innerHTML = '';
      const total = ws.reduce((s, w) => s + (w || 1), 0) || 1;
      const row = document.createElement('div');
      // ── Dashboard.jsx renderRow ──────────────────────────────────────────
      row.style.display = 'grid';
      row.style.gridTemplateColumns = `repeat(${total}, minmax(0, 1fr))`;
      row.style.gap = '0.7rem';
      row.style.marginTop = '0.5rem';
      row.style.marginBottom = '0.5rem';
      row.style.minWidth = '0';
      row.style.width = '100%';
      row.style.maxWidth = '100%';
      ws.forEach(w => {
        const cell = document.createElement('div');
        cell.style.gridColumn = `span ${w || 1}`;
        cell.style.width = 'auto';
        cell.style.minWidth = '0';
        cell.style.overflow = 'hidden';
        row.appendChild(cell);
      });
      // ─────────────────────────────────────────────────────────────────────
      host.appendChild(row);
      const rowRect = row.getBoundingClientRect();
      return {
        rowWidth: rowRect.width,
        columnGapPx: parseFloat(getComputedStyle(row).columnGap),
        slots: Array.from(row.children).map(cell => {
          const r = cell.getBoundingClientRect();
          return { left: r.left - rowRect.left, width: r.width };
        }),
      };
    },
    { ws: widths, rw: rowWidth }
  );

// Nothing in this file re-implements the geometry: every number under test
// comes out of the module itself, so a mutation there shows up here.
const precedingColsOf = (widths, index) =>
  precedingColsInRow(
    widths.map(width => ({ width })),
    index
  );

const run = async () => {
  const asJson = process.argv.includes('--json');
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
  await page.setContent(
    '<!doctype html><html><body style="margin:0;font-size:16px">' +
      '<div id="host" style="position:relative"></div></body></html>'
  );

  const report = [];
  let worstStatic = 0;
  let worstGhostWidth = 0;
  let worstGhostLeft = 0;
  let worstFrozenLeft = 0; // what a ghost pinned at `box.left` would be off by

  for (const { widths, rowWidth } of SHAPES) {
    const measured = await measureRow(page, widths, rowWidth);
    const startTotal = rowGridTotal(widths.map(width => ({ width })));
    const gap = measured.columnGapPx;

    // 1. STATIC: does the formula reproduce the rendered row as-is?
    const staticRows = measured.slots.map((slot, index) => {
      const formulaWidth = itemSlotWidthPx({
        rowWidth: measured.rowWidth,
        totalCols: startTotal,
        spanCols: widths[index],
        gapPx: gap,
      });
      const formulaLeft = spanLeftOffsetPx({
        rowWidth: measured.rowWidth,
        totalCols: startTotal,
        precedingCols: precedingColsOf(widths, index),
        gapPx: gap,
      });
      const dWidth = Math.abs(formulaWidth - slot.width);
      const dLeft = Math.abs(formulaLeft - slot.left);
      worstStatic = Math.max(worstStatic, dWidth, dLeft);
      return { index, dWidth, dLeft };
    });

    // 2. ROUND TRIP: ghost (what the overlay paints) vs. the committed re-layout.
    for (let index = 0; index < widths.length; index += 1) {
      const startCols = widths[index];
      const preceding = precedingColsOf(widths, index);
      const startLeft = measured.slots[index].left;
      for (let span = 1; span <= MAX_ITEM_WIDTH; span += 1) {
        const ghostWidth = previewItemWidthPx({
          rowWidth: measured.rowWidth,
          startTotal,
          startCols,
          spanCols: span,
          gapPx: gap,
        });
        const ghostLeft =
          startLeft +
          previewItemLeftShiftPx({
            rowWidth: measured.rowWidth,
            startTotal,
            startCols,
            spanCols: span,
            precedingCols: preceding,
            gapPx: gap,
          });

        const committed = widths.slice();
        committed[index] = span;
        const after = await measureRow(page, committed, rowWidth);
        const rendered = after.slots[index];

        worstGhostWidth = Math.max(worstGhostWidth, Math.abs(ghostWidth - rendered.width));
        worstGhostLeft = Math.max(worstGhostLeft, Math.abs(ghostLeft - rendered.left));
        // The pre-fix ghost froze `left` at the item's start box.
        worstFrozenLeft = Math.max(worstFrozenLeft, Math.abs(startLeft - rendered.left));
      }
    }

    report.push({
      widths,
      rowWidth,
      measuredRowWidth: measured.rowWidth,
      columnGapPx: gap,
      slots: measured.slots,
      staticRows,
    });
  }

  await browser.close();

  if (asJson) {
    console.log(
      JSON.stringify(
        { report, worstStatic, worstGhostWidth, worstGhostLeft, worstFrozenLeft },
        null,
        2
      )
    );
  } else {
    for (const r of report) {
      console.log(
        `[${r.widths.join(',')}] @${r.measuredRowWidth.toFixed(2)}px gap=${r.columnGapPx}px`
      );
      r.slots.forEach((slot, i) => {
        console.log(
          `    item ${i}: left=${slot.left.toFixed(4)}  width=${slot.width.toFixed(4)}` +
            `   Δleft=${r.staticRows[i].dLeft.toFixed(6)}  Δwidth=${r.staticRows[i].dWidth.toFixed(6)}`
        );
      });
    }
    console.log('');
    console.log(`worst |formula − rendered| (static)       = ${worstStatic.toFixed(6)}px`);
    console.log(`worst |ghost − rendered| (width)          = ${worstGhostWidth.toFixed(6)}px`);
    console.log(`worst |ghost − rendered| (left)           = ${worstGhostLeft.toFixed(6)}px`);
    console.log(`worst |frozen box.left − rendered| (left) = ${worstFrozenLeft.toFixed(6)}px  <- pre-fix`);
  }

  const worst = Math.max(worstStatic, worstGhostWidth, worstGhostLeft);
  if (worst > MAX_DEVIATION_PX) {
    console.error(`FAIL: worst deviation ${worst.toFixed(6)}px > ${MAX_DEVIATION_PX}px`);
    process.exitCode = 1;
  }
};

run().catch(err => {
  console.error(err);
  process.exitCode = 1;
});
