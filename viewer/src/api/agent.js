import { apiFetch } from './utils';
import { getUrl } from '../contexts/URLContext';

/**
 * What agents have done this session, newest first.
 *
 * Fetchable on purpose. It makes the Agent tab's topic a `poll` like the runs
 * list, so the tab works wherever the API does — including cloud, which has no
 * push channel — rather than only where a socket happens to exist.
 */
export const fetchAgentActions = async ({ projectId, limit } = {}) => {
  const base = getUrl('agentActions', { projectId });
  const url = limit ? `${base}?limit=${limit}` : base;
  const response = await apiFetch(url);
  if (response.status === 200) {
    return (await response.json()).actions;
  }
  throw new Error('Failed to fetch agent actions');
};

/**
 * The project's conversations, newest first, without transcripts.
 *
 * What lets the tab pick up where it left off. A session lives on the server —
 * a DB row in cloud, the serve process's memory locally — and until this was
 * read, a reload lost a conversation that was sitting there the whole time.
 */
export const listAgentSessions = async ({ projectId } = {}) => {
  const response = await apiFetch(getUrl('agentSessions', { projectId }));
  if (response.status === 200) return (await response.json()).sessions || [];
  throw new Error('Failed to list agent sessions');
};

/**
 * Start a run of the built-in loop. Returns the session immediately — the loop
 * runs in the background, because a model call takes as long as it takes and a
 * request that waits for one times out in a proxy somebody else configured.
 *
 * Two refusals are ordinary rather than exceptional, so they come back as
 * values: 409 when a loop is already running (one at a time — two editing the
 * same draft tier would interleave), and 400 `configure_agent` when no API key
 * is set, which is the first-run case and carries its own instructions.
 */
export const startAgentSession = async ({ projectId, prompt, model, sessionId } = {}) => {
  const response = await apiFetch(getUrl('agentSessions', { projectId }), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      prompt,
      ...(model ? { model } : {}),
      // Continues the conversation. Absent starts a new one.
      ...(sessionId ? { session_id: sessionId } : {}),
    }),
  });
  const body = await response.json().catch(() => ({}));
  if (response.status === 201) return { session: body };
  if (response.status === 409) return { busy: body.session };
  if (response.status === 400 && body.action === 'configure_agent') {
    return { unconfigured: body.error };
  }
  // The account's Visivo-supplied inference budget is spent for the month. Not
  // a failure to fix — a limit to wait out or raise — so it reads as its own
  // outcome rather than a generic error.
  if (response.status === 429 && body.action === 'inference_limit_reached') {
    return { limitReached: body.error };
  }
  // The conversation was evicted. The caller starts a new one deliberately
  // rather than appearing to continue something that is gone.
  if (response.status === 404 && body.action === 'agent_session_gone') {
    return { sessionGone: body.error };
  }
  throw new Error(body.error || 'Failed to start the agent');
};

export const fetchAgentSession = async (sessionId, projectId) => {
  const response = await apiFetch(getUrl('agentSession', { projectId, sessionId }));
  if (response.status === 200) return await response.json();
  if (response.status === 404) return null;
  throw new Error('Failed to read the agent session');
};

export const cancelAgentSession = async (sessionId, projectId) => {
  const response = await apiFetch(getUrl('agentSessionCancel', { projectId, sessionId }), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  });
  if (response.status === 200) return await response.json();
  throw new Error('Failed to stop the agent');
};
