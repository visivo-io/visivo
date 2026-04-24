import { readdirSync, readFileSync, writeFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Helpers for file-mutating e2e tests that must snapshot YAML state,
 * let the Explorer mutate it via Save + Publish, and then restore on
 * teardown so the project is returned byte-identical.
 *
 * All helpers are synchronous wrt. the filesystem — they read/write
 * immediately. `waitForServerReload` is the only async function; use it
 * after any write to give the hot-reload watcher time to re-compile.
 */

function isYamlFile(name) {
  return name.endsWith('.visivo.yml') || name.endsWith('.visivo.yaml');
}

function walkYamlFiles(dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'target' || entry.name === '.visivo_cache' || entry.name.startsWith('.'))
        continue;
      out.push(...walkYamlFiles(full));
    } else if (entry.isFile() && isYamlFile(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

export function snapshotProject(projectDir) {
  const snap = new Map();
  for (const path of walkYamlFiles(projectDir)) {
    snap.set(path, readFileSync(path, 'utf8'));
  }
  return snap;
}

export function restoreProject(snapshot) {
  let wrote = 0;
  for (const [path, content] of snapshot.entries()) {
    const current = readFileSync(path, 'utf8');
    if (current !== content) {
      writeFileSync(path, content, 'utf8');
      wrote++;
    }
  }
  return wrote;
}

export function assertProjectMatches(snapshot) {
  const diffs = [];
  for (const [path, content] of snapshot.entries()) {
    const current = readFileSync(path, 'utf8');
    if (current !== content) diffs.push(path);
  }
  return diffs;
}

/**
 * Wait for the backend to finish its hot-reload cycle after a file write.
 *
 * Strategy: fetch `/data/project.json` and compare its byte content against
 * the first poll. When the content changes (or the fetch becomes available
 * again after a transient failure), the reload has committed. We then wait
 * a short settle window for the frontend to re-fetch.
 */
export async function waitForServerReload(backendBaseUrl, { timeoutMs = 8000, settleMs = 500 } = {}) {
  const url = `${backendBaseUrl.replace(/\/$/, '')}/data/project.json`;
  const baseline = await fetchTextOrNull(url);
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    await sleep(150);
    const current = await fetchTextOrNull(url);
    if (current != null && current !== baseline) {
      await sleep(settleMs);
      return true;
    }
  }
  await sleep(settleMs);
  return false;
}

async function fetchTextOrNull(url) {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
