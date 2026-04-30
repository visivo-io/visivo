// Capture-on-view thumbnail flow.
//
// When the user actually opens a dashboard, the live <Dashboard> tree is
// already mounted, has fetched its data, and Plotly has drawn into real
// canvases. We snapshot that tree with html2canvas-pro and POST the resulting
// PNG to the backend, which stores it under the dashboard's clean name. The
// /project cards view then just shows whatever is on disk — no offscreen
// renders, no shared queue, no DuckDB-wasm contention.
//
// This module intentionally avoids React state — it gets a get-element
// callback (so we can poll for the DOM ref to be attached) and a
// cancellation predicate so the host effect can abort cleanly on unmount or
// dashboard switch.

import html2canvas from 'html2canvas-pro';
import { getUrl } from '../../contexts/URLContext';

const ASPECT_RATIO = 16 / 10;
const TARGET_WIDTH = 800;
const TARGET_HEIGHT = TARGET_WIDTH / ASPECT_RATIO;

// Skip if the backend already has a thumbnail. The /project cards page would
// already be showing it, so we don't need to spend the user's CPU.
const thumbnailExists = async dashboardName => {
  try {
    const res = await fetch(getUrl('dashboardQuery', { name: dashboardName }));
    if (!res.ok) return false;
    const data = await res.json();
    return !!data?.signed_thumbnail_file_url;
  } catch {
    return false;
  }
};

// Wait until the dashboard's chart loading spinners have cleared. The
// `.loading-spinner` class lives on the placeholder rendered by Chart.jsx
// while trace/insight data is in flight (see common/Loading.jsx).
//
// We always proceed to capture once the timeout hits, even if some spinners
// are still up — a partly-rendered thumbnail is better than no thumbnail,
// and the next visit will overwrite if the user manually deletes the file.
const waitForRender = async (element, isCancelled) => {
  const TIMEOUT_MS = 10000;
  const POLL_MS = 200;
  const start = Date.now();
  while (Date.now() - start < TIMEOUT_MS) {
    if (isCancelled()) return;
    if (element.querySelectorAll('.loading-spinner').length === 0) break;
    await new Promise(resolve => setTimeout(resolve, POLL_MS));
  }
  // Give Plotly one more idle tick to settle final transforms.
  await new Promise(resolve => setTimeout(resolve, 300));
};

const downscale = canvas => {
  const tempCanvas = document.createElement('canvas');
  tempCanvas.width = TARGET_WIDTH;
  tempCanvas.height = TARGET_HEIGHT;
  const ctx = tempCanvas.getContext('2d');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(canvas, 0, 0, canvas.width, canvas.height, 0, 0, TARGET_WIDTH, TARGET_HEIGHT);
  return tempCanvas;
};

const upload = (blob, dashboardName) => {
  const formData = new FormData();
  formData.append('file', blob, `${dashboardName}.png`);
  return fetch(getUrl('dashboardThumbnail', { name: dashboardName }), {
    method: 'POST',
    body: formData,
  });
};

// Wait for the host to attach its ref. The capture effect fires before the
// returned JSX commits, so the element isn't necessarily available yet.
const awaitElement = async (getElement, isCancelled) => {
  const TIMEOUT_MS = 5000;
  const POLL_MS = 100;
  const start = Date.now();
  while (Date.now() - start < TIMEOUT_MS) {
    if (isCancelled()) return null;
    const el = getElement();
    if (el) return el;
    await new Promise(resolve => setTimeout(resolve, POLL_MS));
  }
  return null;
};

export const captureDashboardThumbnail = async ({ dashboardName, getElement, isCancelled }) => {
  if (!dashboardName) return;

  if (await thumbnailExists(dashboardName)) return;
  if (isCancelled()) return;

  const element = await awaitElement(getElement, isCancelled);
  if (!element || isCancelled()) return;

  await waitForRender(element, isCancelled);
  if (isCancelled()) return;

  // Crop the capture to the visible viewport portion that fits the thumbnail
  // aspect ratio. That gives a hero shot rather than a distorted full-height
  // squish.
  const captureWidth = element.offsetWidth;
  const targetCaptureHeight = captureWidth / ASPECT_RATIO;
  const captureHeight = Math.min(targetCaptureHeight, element.offsetHeight);

  let canvas;
  try {
    canvas = await html2canvas(element, {
      scale: 1,
      logging: false,
      width: captureWidth,
      height: captureHeight,
      backgroundColor: '#ffffff',
      useCORS: true,
    });
  } catch {
    // Best-effort. If html2canvas chokes, just bail; user can revisit.
    return;
  }
  if (isCancelled()) return;

  const tempCanvas = downscale(canvas);
  await new Promise(resolve => {
    tempCanvas.toBlob(async blob => {
      if (blob && !isCancelled()) {
        try {
          await upload(blob, dashboardName);
        } catch {
          // Best-effort. The next visit will try again.
        }
      }
      resolve();
    });
  });
};
