import React, { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import useStore from '../stores/store';
import { fetchRuns, fetchRunLog, cancelRun } from '../api/runs';
import AnsiText from './common/AnsiText';
import useProjectChangeListener from './views/workspace/useProjectChangeListener';
import { getTypeColors, getTypeIcon } from './views/common/objectTypeConfigs';

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

/**
 * The changes that need a run, with the button that runs them.
 *
 * This is the whole point of a manual trigger: your edits stop starting runs, so
 * there has to be one place that says what's outstanding and lets you act on it.
 * The list is exactly what the run will build — the server derives the scope from
 * the same unbuilt set it lists here, so the two can't drift apart.
 *
 * Note the button stays enabled with nothing staged, as "Run all". An explicit
 * full rebuild is the only way back when the outputs are missing or corrupt but
 * the fingerprints say they're built.
 */
function StagedPanel() {
  const staged = useStore(s => s.stagedChanges);
  const runTrigger = useStore(s => s.runTrigger);
  const setRunTrigger = useStore(s => s.setRunTrigger);
  const triggerRun = useStore(s => s.triggerRun);
  const latestRun = useStore(s => s.latestRun);
  const [error, setError] = useState(null);
  const [starting, setStarting] = useState(false);

  const running = latestRun ? isActiveRun(latestRun) : false;
  const count = staged.length;

  const onRun = async () => {
    setError(null);
    setStarting(true);
    // No dagFilter => build the staged set. With nothing staged the server reads
    // that as a full rebuild, which is what "Run all" promises.
    const result = await triggerRun();
    setStarting(false);
    if (!result.success) {
      setError(
        result.action === 'run_in_progress'
          ? 'A run is already in progress.'
          : result.error || 'Could not start the run.'
      );
    }
  };

  return (
    <div className="border rounded mb-6" data-testid="runs-staged-panel">
      <div className="flex items-start justify-between gap-4 px-3 py-3 border-b">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-gray-900">
            {count === 0
              ? 'No changes waiting to run'
              : `${count} change${count === 1 ? '' : 's'} waiting to run`}
          </h3>
          <p className="text-xs text-gray-500 mt-0.5">
            {count === 0
              ? 'Everything built. Editing a query, model or source will queue work here.'
              : 'A run rebuilds these and everything downstream of them.'}
          </p>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <RunTriggerToggle value={runTrigger} onChange={setRunTrigger} />
          <button
            type="button"
            onClick={onRun}
            disabled={running || starting}
            className={`px-3 py-1.5 rounded text-sm font-medium text-white ${
              running || starting
                ? 'bg-gray-300 cursor-not-allowed'
                : 'bg-primary hover:opacity-90'
            }`}
          >
            {running ? 'Running…' : count === 0 ? 'Run all' : `Run ${count}`}
          </button>
        </div>
      </div>
      {error && (
        <div className="px-3 py-2 text-xs text-red-600 border-b" role="alert">
          {error}
        </div>
      )}
      {count > 0 && (
        <ul className="max-h-48 overflow-y-auto divide-y">
          {staged.map(item => (
            <li
              key={`${item.type}:${item.name}`}
              className="flex items-center gap-2 px-3 py-2 text-sm"
            >
              <StagedTypeBadge type={item.type} />
              <span className="flex-1 truncate text-gray-800">{item.name}</span>
              {item.status === 'deleted' && (
                <span className="text-xs text-gray-500">deleted</span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function StagedTypeBadge({ type }) {
  const { bg, text } = getTypeColors(type);
  const Icon = getTypeIcon(type);
  return (
    <span
      className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-medium ${bg} ${text}`}
    >
      {Icon && <Icon className="h-3 w-3" />}
      {type}
    </span>
  );
}

/**
 * Automatic vs manual. Lives here rather than in the top bar because this is the
 * only screen where the consequence is visible — and it's where the tab dot sends
 * someone wondering why their changes aren't running.
 *
 * The scope caption is deliberately visible text, not a tooltip: assuming this is
 * per-project is the obvious mistake to make.
 */
function RunTriggerToggle({ value, onChange }) {
  if (!onChange) return null;
  return (
    <div className="text-right">
      <div
        className="inline-flex rounded border overflow-hidden text-xs"
        role="group"
        aria-label="When to run"
      >
        {[
          ['automatic', 'Automatic'],
          ['manual', 'Manual'],
        ].map(([mode, label]) => (
          <button
            key={mode}
            type="button"
            aria-pressed={value === mode}
            onClick={() => value !== mode && onChange(mode)}
            className={`px-2 py-1 ${
              value === mode ? 'bg-gray-800 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'
            }`}
          >
            {label}
          </button>
        ))}
      </div>
      <p className="text-[10px] text-gray-400 mt-0.5">Applies to all your projects.</p>
    </div>
  );
}

/**
 * Stop a run that's still going.
 *
 * Only rendered for queued/running runs — cancelling a finished one is
 * meaningless, and the endpoint 409s on it anyway. A 409 here isn't worth an
 * error state either: it just means the run terminated between render and click,
 * and the refetch below will show that.
 *
 * What cancelling guarantees is the state change: the run goes `canceled`, the
 * spinner stops and the commit gate reopens. Stopping the compute is best-effort
 * on the server (a Kubernetes Job is deleted; a warm-pool run finishes in the
 * background with its results discarded), which is why the button says "Cancel
 * run" rather than promising to kill anything.
 */
function CancelRunButton({ run }) {
  const queryClient = useQueryClient();
  const { mutate, isPending, isError } = useMutation({
    mutationFn: () => cancelRun(run.id),
    // Refetch either way: on 409 the list is simply out of date.
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['runs'] }),
  });

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={() => mutate()}
        disabled={isPending}
        className="px-2 py-1 text-xs font-medium rounded border border-red-200 text-red-700 hover:bg-red-50 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {isPending ? 'Cancelling…' : 'Cancel run'}
      </button>
      {isError && <span className="text-red-600">Couldn't cancel — try again.</span>}
    </div>
  );
}

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
      {active && <CancelRunButton run={run} />}
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
        A run rebuilds the assets your changes affect. Click a run for details.
      </p>
      <StagedPanel />
      {runs.length === 0 ? (
        <p className="text-gray-500">No runs yet.</p>
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
                    {run.error_json && (
                      <span className="text-highlight text-xs font-medium">error</span>
                    )}
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
