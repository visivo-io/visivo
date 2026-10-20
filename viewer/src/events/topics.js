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
 * value. Nothing emits `runs_changed` yet, even where sockets are available,
 * so push stays disabled until that producer exists.
 *
 * 4s: what the Runs view already polled at. A shorter interval belongs with
 * the push channel, not with polling every project in an account.
 */
export const runsFor = (projectId, fetchRuns) => ({
  event: `runs_changed:${projectId}`,
  push: false,
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
/**
 * The same event, as a nudge rather than a value (VIS-1535).
 *
 * The Agent tab already polls the running session once a second for its
 * transcript, which is where a turn's work now appears. This says "something
 * just happened, look now" so the gap is a frame rather than up to a second.
 *
 * Deliberately no `poll`: there is nothing to fetch here that the session poll
 * is not already fetching, and a second interval asking a second endpoint for
 * the same news is how two sources of truth start. With no socket it simply
 * never fires, which is the honest answer — the session poll keeps working.
 */
export const AGENT_ACTIVITY = { event: 'agent_action' };

export const AGENT_ACTIONS = (fetchAgentActions, projectId) => ({
  // NOT scoped by project, unlike `runsFor` above. `serve_phase` already emits
  // this exact name (VIS-1337), and a socket belongs to one serve process
  // hosting one project — so scoping it would only stop the live push
  // matching. The POLL carries the project, which is what addresses the right
  // log. If cloud ever grows a push channel serving several projects over one
  // socket, scope it then, the way runs does.
  event: 'agent_action',
  poll: () => fetchAgentActions({ projectId }),
  intervalMs: 2000,
});
