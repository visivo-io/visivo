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
