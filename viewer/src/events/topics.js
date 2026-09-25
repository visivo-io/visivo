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

/**
 * An agent did something — a tool ran, against an object, and it worked or it
 * did not.
 *
 * Carries a `poll`, so this is a signal-then-fetch topic like runs rather than
 * a payload one. That is a change from how the activity stream was first
 * framed: it assumed the socket payload WAS the value because nothing could be
 * asked for it. Once actions are recorded they can be asked for, which gives
 * the tab one rule instead of two and makes it work where there is no socket
 * at all.
 *
 * 2s: an agent's actions land in bursts while someone is watching the tab, and
 * the tab is only mounted when they are.
 */
export const AGENT_ACTIONS = fetchAgentActions => ({
  event: 'agent_action',
  poll: () => fetchAgentActions(),
  intervalMs: 2000,
});
