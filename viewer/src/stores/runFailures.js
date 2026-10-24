/**
 * runFailures (VIS-993 §2 / VIS-981) — per-record run-failure selection.
 *
 * The run-failure loop-back: when the run triggered by a just-saved record
 * fails, the failure must surface ON that record's editing surface, not only
 * as a global indicator. Runs arrive in the cloud Run shape
 *   { id, state, dag_filter, error_json, is_superseded, created_at, ... }
 * where `dag_filter` carries `+name+`-joined object names
 * (e.g. "+revenue_insight+,+orders_model+") — the objects the run rebuilt.
 *
 * Semantics (kept deliberately simple): the failure for a record is the most
 * recent non-superseded FAILED run whose dag_filter includes the record's
 * name — unless a NEWER non-superseded SUCCEEDED run also mentions it, which
 * clears the failure. In-flight runs (queued/running) neither clear nor
 * surface: a stale failure stays visible while its retry executes.
 *
 * Pure helpers only (no store import — the run slice lives in runStore.js and
 * `state.runs` is populated by its pollRuns). NOTE for React consumers:
 * `selectLatestRunFailureFor(name)` builds a fresh result object per call, so
 * don't hand it straight to `useStore` (every store change would re-render) —
 * select `s.runs` and memoize `findLatestRunFailureFor` instead, as
 * RecordRunStatus does. The factory suits imperative reads
 * (`selectLatestRunFailureFor(name)(useStore.getState())`).
 *
 * When `error_json.diagnostics` is present (local serve), the message comes from
 * the diagnostic about the record; older payloads and cloud fall back to
 * `extractRunError`.
 */
import { diagnosticsFrom } from '../types/diagnostic';

const FALLBACK_ERROR = 'Run failed';

/** The diagnostic about `name`, else the first (the upstream failure). */
export const pickDiagnosticFor = (diagnostics, name) => {
  if (!Array.isArray(diagnostics) || diagnostics.length === 0) return null;
  return diagnostics.find(d => d?.object?.name === name) ?? diagnostics[0];
};

/**
 * "+revenue_insight+,+orders_model+" → ['revenue_insight', 'orders_model'].
 * Strips the `+` wrappers, splits on commas, tolerates whitespace and empty
 * segments; non-string / blank input → [].
 */
export const parseDagFilterNames = dagFilter => {
  if (typeof dagFilter !== 'string') return [];
  return dagFilter
    .split(',')
    .map(part => part.trim().replace(/^\++|\++$/g, '').trim())
    .filter(Boolean);
};

/**
 * Defensive error extraction from a run's `error_json`, which may be a JSON
 * string, a plain message string, an object, or null. Objects prefer
 * `message` → `error` → `detail`, else stringify; strings that parse to an
 * object recurse, otherwise the string IS the message.
 */
export const extractRunError = errorJson => {
  if (errorJson === null || errorJson === undefined) return FALLBACK_ERROR;
  if (typeof errorJson === 'object') {
    const message = errorJson.message || errorJson.error || errorJson.detail;
    if (typeof message === 'string' && message) return message;
    // A bare run envelope ({"phase":"run"}) has nothing readable to show.
    if ('phase' in errorJson || Array.isArray(errorJson.diagnostics)) return FALLBACK_ERROR;
    try {
      return JSON.stringify(errorJson);
    } catch (e) {
      return FALLBACK_ERROR; // circular payload — nothing readable to show
    }
  }
  if (typeof errorJson === 'string') {
    const raw = errorJson.trim();
    if (!raw) return FALLBACK_ERROR;
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') return extractRunError(parsed);
    } catch (e) {
      // Not JSON — the string is the message itself.
    }
    return raw;
  }
  return String(errorJson);
};

const runTime = run => {
  const t = Date.parse(run?.created_at);
  return Number.isNaN(t) ? 0 : t;
};

/**
 * The failure currently applying to `name`, per the module semantics above.
 *
 * @param {Array|undefined} runs the cloud runs list (state.runs)
 * @param {string} name the record name to match against dag_filter
 * @returns {{runId: string, error: string, diagnostic: Object|null, createdAt: string|null} | null}
 */
export const findLatestRunFailureFor = (runs, name) => {
  if (!Array.isArray(runs) || runs.length === 0 || !name) return null;
  const relevant = runs
    .map((run, index) => ({ run, index }))
    .filter(
      ({ run }) =>
        run && !run.is_superseded && parseDagFilterNames(run.dag_filter).includes(name)
    )
    // Newest first; the API returns newest-first already, so equal/missing
    // timestamps fall back to array order via the index tiebreak.
    .sort((a, b) => runTime(b.run) - runTime(a.run) || a.index - b.index);

  for (const { run } of relevant) {
    if (run.state === 'succeeded') return null; // a newer success clears it
    if (run.state === 'failed') {
      const diagnostic = pickDiagnosticFor(diagnosticsFrom(run.error_json), name);
      return {
        runId: run.id,
        error: diagnostic ? diagnostic.message : extractRunError(run.error_json),
        diagnostic,
        createdAt: run.created_at ?? null,
      };
    }
    // queued / running: neither clears nor surfaces — keep walking back.
  }
  return null;
};

/** Selector factory over the store state (see the React note in the header). */
export const selectLatestRunFailureFor = name => state =>
  findLatestRunFailureFor(state?.runs, name);

/**
 * Why `name` has no built output: its own run failure (above), or else a
 * diagnostic about it in the newest run, whatever that run's dag_filter. Serve
 * scopes its start-up build to the dashboards, so the insight that failed is
 * named only in the diagnostics. Null when neither explains it.
 */
export const findBuildFailureFor = (runs, name) => {
  const scoped = findLatestRunFailureFor(runs, name);
  if (scoped) return scoped;
  if (!Array.isArray(runs) || !name) return null;
  const newest = runs
    .map((run, index) => ({ run, index }))
    .filter(({ run }) => run && !run.is_superseded)
    .sort((a, b) => runTime(b.run) - runTime(a.run) || a.index - b.index)[0]?.run;
  if (newest?.state !== 'failed') return null;
  const diagnostic = diagnosticsFrom(newest.error_json).find(d => d.object?.name === name);
  if (!diagnostic) return null;
  return {
    runId: newest.id,
    error: diagnostic.message,
    diagnostic,
    createdAt: newest.created_at ?? null,
  };
};
