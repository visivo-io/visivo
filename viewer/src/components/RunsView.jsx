import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import useStore from '../stores/store';
import { fetchRuns, fetchRunLog } from '../api/branching';
import AnsiText from './common/AnsiText';
import useProjectChangeListener from './views/workspace/useProjectChangeListener';

// queued/running are the only non-terminal states — while active a run is still
// building, so the detail panel tail-polls the log.
const isActiveRun = run => run.state === 'queued' || run.state === 'running';

// Run states mirror the backend RunState enum. `failed` uses the shared
// `highlight` design token (CLAUDE.md: "Highlight — used for destructive
// actions and alerts") instead of a hand-rolled red; the other states are
// distinct semantic status hues with no brand-palette equivalent, so they
// stay standard Tailwind (matching every other status pill in the app —
// e.g. the commit/deploy indicators).
const STATE_BADGE = {
  succeeded: 'bg-green-100 text-green-800',
  failed: 'bg-highlight-100 text-highlight-700',
  running: 'bg-blue-100 text-blue-800',
  queued: 'bg-amber-100 text-amber-800',
  canceled: 'bg-gray-100 text-gray-600',
};

const scopeLabel = run => run.dag_filter || (run.state === 'queued' ? '—' : 'all');

function RunDetail({ run }) {
  const err = run.error_json;
  const active = isActiveRun(run);
  // The captured build log, tail-polled while the run is active, then the final
  // static log once terminal. RunDetail only mounts while the row is open, so
  // the poll runs only when someone is watching.
  const { data: log } = useQuery({
    queryKey: ['runLog', run.id],
    queryFn: () => fetchRunLog(run.id),
    refetchInterval: active ? 2000 : false,
  });

  const meta = [
    ['Run ID', run.id, true],
    ['Scope', run.dag_filter || (run.state === 'queued' ? 'not set yet' : 'all (full rebuild)')],
    ['Created', run.created_at ? new Date(run.created_at).toLocaleString() : '—'],
    ['Updated', run.updated_at ? new Date(run.updated_at).toLocaleString() : '—'],
    run.is_superseded && ['Superseded', 'A newer run replaced this one.'],
  ].filter(Boolean);

  const consoleText =
    log?.logs ||
    (err && (err.error || err.logs_tail)) ||
    (active ? 'Waiting for output…' : 'No output captured.');

  return (
    <div className="space-y-3 text-xs">
      <dl className="space-y-1">
        {meta.map(([label, value, mono]) => (
          <div key={label} className="flex gap-2">
            <dt className="font-medium text-gray-500 w-24 shrink-0">{label}</dt>
            <dd className={`text-gray-700 break-all ${mono ? 'font-mono' : ''}`}>{value}</dd>
          </div>
        ))}
      </dl>
      <div>
        <div className={`font-medium mb-1 ${err ? 'text-highlight-700' : 'text-gray-500'}`}>
          {err ? `Error${err.phase ? ` — ${err.phase}` : ''}` : 'Logs'}
        </div>
        <pre className="bg-gray-900 text-gray-100 rounded p-3 overflow-auto max-h-80 whitespace-pre-wrap">
          <AnsiText text={consoleText} />
        </pre>
      </div>
    </div>
  );
}

/**
 * Runs view: the status of each run-on-save for the current project. Every save
 * of a data-producing resource kicks a debounced run server-side; this lists
 * them newest-first, polls so in-flight runs update live, and expands a run on
 * click to show its full details — including the error log for a failed run.
 *
 * Shared shape with the cloud: backed by the same fetchRuns/fetchRunLog +
 * /api/projects/<id>/run/ + /api/runs/<id>/logs/ contract (local serve
 * implements it via RunManager).
 *
 * e2e-gap-review.md D7 ("VIS-1087's remaining half"): `/runs` mounts OUTSIDE
 * the Workspace shell, so — before this hook was added here — a commit fired
 * from any `/workspace/...` tab hard-reloaded a tab sitting on `/runs` too
 * (the commit broadcast's `reload` socket event only skips
 * `window.location.reload()` when `window.__VISIVO_SOFT_RELOAD__` is true,
 * which only `useProjectChangeListener` sets, and only the Workspace called
 * it). A hard reload here silently loses which run row was expanded
 * (`expandedId`, purely local state) for no reason — mounting the same hook
 * Workspace.jsx already uses is a small, mechanical fix that changes nothing
 * else about this view's own behavior or data-fetching.
 *
 * 6c-T2 (shell-ia — "Runs view: dark-on-dark text on a shell-less page"):
 * the root no longer depends on `Home`'s ambient `bg-gray-50` wrapper for a
 * readable background — every entry point (loading / error / loaded) sets
 * its own explicit light surface, so this view is self-contained regardless
 * of what mounts it. The destructive states (load failure, a run's error
 * label/badge) use the shared `highlight` design token instead of a
 * hand-rolled red — see `STATE_BADGE`'s docstring for why the other status
 * hues stay standard Tailwind.
 */
export default function RunsView() {
  const projectId = useStore(state => state.project?.id);
  const [expandedId, setExpandedId] = useState(null);

  // D7: soft-refresh on backend `project_changed` events instead of a hard
  // page reload — see the module docstring above.
  useProjectChangeListener();
  const {
    data: runs = [],
    isLoading,
    error,
  } = useQuery({
    queryKey: ['runs', projectId],
    queryFn: () => fetchRuns(projectId),
    enabled: Boolean(projectId),
    refetchInterval: 4000,
    // The view mounts on navigation; always refetch so a run triggered while you
    // were editing shows up the moment you open Runs (not the stale cache).
    refetchOnMount: 'always',
  });

  if (isLoading) {
    return (
      <div data-testid="runs-view-loading" className="min-h-full bg-gray-50 p-6 text-gray-500">
        Loading runs…
      </div>
    );
  }
  if (error) {
    return (
      <div data-testid="runs-view-error" className="min-h-full bg-gray-50 p-6 text-highlight">
        Failed to load runs.
      </div>
    );
  }

  return (
    <div data-testid="runs-view" className="min-h-full bg-gray-50 p-6">
      <h2 className="text-xl font-bold text-gray-900 mb-1">Runs</h2>
      <p className="text-gray-500 text-sm mb-4">
        Each saved change triggers a debounced run that rebuilds the affected assets. Click a
        run for details.
      </p>
      {runs.length === 0 ? (
        <p className="text-gray-500">No runs yet — edit a resource to trigger one.</p>
      ) : (
        <div className="border rounded text-sm">
          <div className="flex items-center gap-4 px-3 py-2 text-gray-500 border-b text-xs font-medium">
            <span className="w-24">Status</span>
            <span className="w-48">Created</span>
            <span className="flex-1">Scope</span>
            <span className="w-16" />
          </div>
          {runs.map(run => {
            const isOpen = expandedId === run.id;
            return (
              <div key={run.id} className="border-b last:border-0">
                <button
                  type="button"
                  aria-expanded={isOpen}
                  onClick={() => setExpandedId(isOpen ? null : run.id)}
                  className="w-full flex items-center gap-4 px-3 py-2 text-left hover:bg-gray-50"
                >
                  <span className="w-24">
                    <span
                      className={`px-2 py-1 text-xs font-medium rounded-full ${
                        STATE_BADGE[run.state] || 'bg-gray-100 text-gray-800'
                      }`}
                    >
                      {run.state}
                    </span>
                  </span>
                  <span className="w-48 text-gray-700">
                    {run.created_at ? new Date(run.created_at).toLocaleString() : ''}
                  </span>
                  <span className="flex-1 text-gray-600">{scopeLabel(run)}</span>
                  <span className="w-16 flex items-center justify-end gap-2 text-gray-400">
                    {run.error_json && <span className="text-highlight text-xs font-medium">error</span>}
                    <span aria-hidden="true">{isOpen ? '▾' : '▸'}</span>
                  </span>
                </button>
                {isOpen && (
                  <div className="px-3 pb-4 bg-gray-50">
                    <RunDetail run={run} />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
