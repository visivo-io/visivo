// Module-scoped semaphore that throttles concurrent dashboard thumbnail
// generations across all DashboardCard instances on the page.
//
// Each thumbnail mounts a hidden <Dashboard> containing every Plotly trace.
// Two pieces of shared global state limit how many can run in parallel:
//   1. WebGL contexts: 3D traces each grab one and the browser caps at ~16.
//   2. DuckDB-wasm: a single instance + catalog is shared across all live
//      Dashboards, so one offscreen render dropping a parquet table while a
//      sibling is still querying it produces "Catalog Error: Table … does
//      not exist" cascades and eventually "memory access out of bounds".
//
// Strictly serial is the only safe value here. WebGL contexts allow more
// (~16 browser cap) but the shared DuckDB-wasm catalog gets corrupted with
// any concurrent renders — Plotly throws SVG NaN errors and no POSTs land.
// Until thumbnail rendering stops going through the shared DuckDB instance
// (e.g. server-side render, or per-dashboard DuckDB instances), this needs
// to stay at 1.
const MAX_CONCURRENT_THUMBNAILS = 1;

let active = 0;
const waiters = [];

const grant = resolve => {
  active += 1;
  let released = false;
  const release = () => {
    if (released) return;
    released = true;
    active -= 1;
    const next = waiters.shift();
    if (next) next();
  };
  resolve(release);
};

export const acquireThumbnailSlot = () =>
  new Promise(resolve => {
    if (active < MAX_CONCURRENT_THUMBNAILS) {
      grant(resolve);
    } else {
      waiters.push(() => grant(resolve));
    }
  });
