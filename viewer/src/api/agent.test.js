/**
 * fetchAgentActions (VIS-1364).
 *
 * Fetchable is the point: it makes the Agent tab's topic a `poll` like the
 * runs list, so the tab works wherever the API does rather than only where a
 * socket happens to exist.
 */
import { fetchAgentActions } from './agent';
import { apiFetch } from './utils';
import { AGENT_ACTIONS } from '../events/topics';

jest.mock('./utils', () => ({ apiFetch: jest.fn() }));

const respond = (actions, status = 200) => ({
  status,
  json: async () => ({ actions }),
});

beforeEach(() => {
  jest.clearAllMocks();
});

describe('fetchAgentActions', () => {
  it('returns the actions the server listed', async () => {
    apiFetch.mockResolvedValue(respond([{ id: 1, tool: 'write_model' }]));

    expect(await fetchAgentActions()).toEqual([{ id: 1, tool: 'write_model' }]);
  });

  it('asks for a bounded page when told to', async () => {
    apiFetch.mockResolvedValue(respond([]));

    await fetchAgentActions({ limit: 20 });

    expect(apiFetch.mock.calls[0][0]).toContain('limit=20');
  });

  it('throws on a failure rather than returning an empty log', async () => {
    // An empty log and an unreachable server read identically on the tab, and
    // they mean opposite things.
    apiFetch.mockResolvedValue(respond(null, 500));

    await expect(fetchAgentActions()).rejects.toThrow('Failed to fetch agent actions');
  });
});

describe('the agent-actions topic', () => {
  it('is signal-then-fetch, like runs', () => {
    // Not a payload topic: once actions are recorded they can be asked for,
    // so the tab gets one rule instead of two and works with no socket.
    const topic = AGENT_ACTIONS(fetchAgentActions);

    expect(topic.event).toBe('agent_action');
    expect(typeof topic.poll).toBe('function');
  });

  it('polls through the fetcher it was given', async () => {
    const fetcher = jest.fn().mockResolvedValue([]);

    await AGENT_ACTIONS(fetcher).poll();

    expect(fetcher).toHaveBeenCalled();
  });
});
