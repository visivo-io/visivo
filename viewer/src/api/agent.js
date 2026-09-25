import { apiFetch } from './utils';
import { getUrl } from '../contexts/URLContext';

/**
 * What agents have done this session, newest first.
 *
 * Fetchable on purpose. It makes the Agent tab's topic a `poll` like the runs
 * list, so the tab works wherever the API does — including cloud, which has no
 * push channel — rather than only where a socket happens to exist.
 */
export const fetchAgentActions = async ({ limit } = {}) => {
  const url = limit ? `${getUrl('agentActions')}?limit=${limit}` : getUrl('agentActions');
  const response = await apiFetch(url);
  if (response.status === 200) {
    return (await response.json()).actions;
  }
  throw new Error('Failed to fetch agent actions');
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
export const startAgentSession = async ({ prompt, model } = {}) => {
  const response = await apiFetch(getUrl('agentSessions'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt, ...(model ? { model } : {}) }),
  });
  const body = await response.json().catch(() => ({}));
  if (response.status === 201) return { session: body };
  if (response.status === 409) return { busy: body.session };
  if (response.status === 400 && body.action === 'configure_agent') {
    return { unconfigured: body.error };
  }
  throw new Error(body.error || 'Failed to start the agent');
};

export const fetchAgentSession = async sessionId => {
  const response = await apiFetch(getUrl('agentSession', { sessionId }));
  if (response.status === 200) return await response.json();
  if (response.status === 404) return null;
  throw new Error('Failed to read the agent session');
};

export const cancelAgentSession = async sessionId => {
  const response = await apiFetch(getUrl('agentSessionCancel', { sessionId }), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  });
  if (response.status === 200) return await response.json();
  throw new Error('Failed to stop the agent');
};
