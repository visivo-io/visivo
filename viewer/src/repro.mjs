import { chromium } from 'playwright';
const b = await chromium.launch();
const p = await b.newPage({ viewportSize: { width: 1600, height: 1000 } });
await p.goto('http://localhost:3001/workspace', { waitUntil: 'networkidle' });
await p.waitForTimeout(2500);
await p.getByTestId('library-subsection-insight-header').click();
await p.waitForTimeout(700);
// An insight WITH input controls — changing one re-renders the plot with data.
await p.getByTestId('library-row-insight-checkboxes-filter-insight').click();
await p.waitForTimeout(8000);

if (!(await p.locator('.js-plotly-plot').count())) { console.log('no plot'); await b.close(); process.exit(0); }
await p.evaluate(() => {
  window.__h = [];
  const el = document.querySelector('.js-plotly-plot');
  const tick = () => {
    const h = Math.round(el.getBoundingClientRect().height);
    const last = window.__h[window.__h.length - 1];
    if (!last || last.h !== h) window.__h.push({ h, c: Math.round(el.parentElement.getBoundingClientRect().height), lh: el.layout?.height ?? null, t: window.__h.length });
    requestAnimationFrame(tick);
  };
  tick();
});

// Toggle input controls to force data-driven re-renders.
const boxes = p.locator('[data-testid^="preview-input"] input, input[type="checkbox"]');
const n = await boxes.count();
console.log('input controls found:', n);
for (let i = 0; i < Math.min(n, 4); i++) {
  await boxes.nth(i % n).click({ force: true }).catch(()=>{});
  await p.waitForTimeout(1500);
}
const seen = await p.evaluate(() => window.__h);
console.log('distinct heights:', JSON.stringify(seen.slice(0, 12)));
console.log('any at 400:', seen.filter(s => s.h === 400 || s.lh === 400).length);
await b.close();
