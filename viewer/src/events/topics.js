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
