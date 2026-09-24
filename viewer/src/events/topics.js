/**
 * The topics a screen can subscribe to.
 *
 * Declared in one place so the socket event name and its polling equivalent
 * cannot drift apart — they are two ways of saying the same thing, and a
 * screen picks neither.
 */

/**
 * The backend recompiled the project: an external YAML edit, or a refresh
 * after a publish. `drafts_dropped` says whether a dirty Build session was
 * overwritten (Q15 last-write-wins).
 *
 * No `poll` — only a server watching the filesystem knows this happened, and
 * cloud has no equivalent to ask for.
 */
export const PROJECT_CHANGED = { event: 'project_changed' };

/**
 * The project's runs changed — one started, or one already running moved on.
 *
 * Carries a `poll`, so the same list arrives whether the server pushed or the
 * viewer asked: on a push the event is only the signal and this fetches the
 * value. Nothing emits `runs_changed` yet — the cloud sidecar is VIS-1345
 * slices 1–2 — so today every subscriber takes the polling path and sees no
 * difference when that lands.
 *
 * 4s: what the Runs view already polled at. A shorter interval belongs with
 * the push channel, not with polling every project in an account.
 */
export const runsFor = (projectId, fetchRuns) => ({
  event: `runs_changed:${projectId}`,
  poll: () => fetchRuns(projectId),
  intervalMs: 4000,
});
