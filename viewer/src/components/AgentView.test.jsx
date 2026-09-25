/**
 * The Agent tab (VIS-1336).
 *
 * An activity log, not a transcript: the value is seeing what an agent changed
 * and being able to reach it. So the properties worth pinning are that an
 * object reference is navigable, that a failure says what went wrong, and that
 * the view cannot tell whether its data was pushed or polled.
 */
import React from 'react';
import { render, screen, waitFor, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import AgentView from './AgentView';
import { fetchAgentActions } from '../api/agent';
import { subscribe, canDeliver } from '../events/eventSource';
import { futureFlags } from '../router-config';

jest.mock('../api/agent', () => ({ fetchAgentActions: jest.fn() }));
jest.mock('../events/eventSource', () => ({
  subscribe: jest.fn(() => jest.fn()),
  canDeliver: jest.fn(() => true),
}));

const action = (overrides = {}) => ({
  id: 1,
  timestamp: 1_700_000_000,
  tool: 'write_model',
  object: { type: 'model', name: 'orders' },
  outcome: 'ok',
  error: null,
  summary: "write_model model 'orders'",
  ...overrides,
});

const renderView = () =>
  render(
    <MemoryRouter future={futureFlags}>
      <AgentView />
    </MemoryRouter>
  );

beforeEach(() => {
  jest.clearAllMocks();
  canDeliver.mockReturnValue(true);
  subscribe.mockReturnValue(jest.fn());
  fetchAgentActions.mockResolvedValue([]);
});

describe('the log', () => {
  test('lists what an agent did', async () => {
    fetchAgentActions.mockResolvedValue([action()]);

    renderView();

    expect(await screen.findByText('write_model')).toBeInTheDocument();
  });

  test('an empty log says how activity gets here', async () => {
    // Someone opening the tab before connecting a client should learn what to
    // do, not see a blank panel.
    renderView();

    expect(await screen.findByTestId('agent-view-empty')).toHaveTextContent('MCP client');
  });

  test('it says writes are drafts', async () => {
    // The consequence an agent's user most needs to know, and cannot infer.
    renderView();

    await screen.findByTestId('agent-view-empty');
    expect(screen.getByText(/uncommitted drafts/)).toBeInTheDocument();
  });
});

describe('an entry is navigable', () => {
  test('an object reference links into the workspace', async () => {
    fetchAgentActions.mockResolvedValue([action()]);

    renderView();

    const link = await screen.findByTestId('agent-action-object-orders');
    expect(link).toHaveAttribute('href', '/workspace?edit=model%3Aorders');
  });

  test('a name needing encoding survives the query string', async () => {
    fetchAgentActions.mockResolvedValue([
      action({ object: { type: 'model', name: 'a&b c' } }),
    ]);

    renderView();

    const link = await screen.findByTestId('agent-action-object-a&b c');
    expect(link.getAttribute('href')).toContain(encodeURIComponent('model:a&b c'));
  });

  test('a tool about no object renders without one', async () => {
    fetchAgentActions.mockResolvedValue([
      action({ tool: 'get_schema', object: null }),
    ]);

    renderView();

    expect(await screen.findByText('get_schema')).toBeInTheDocument();
  });
});

describe('when something failed', () => {
  test('it is marked, and says why', async () => {
    fetchAgentActions.mockResolvedValue([
      action({ outcome: 'error', error: "No source named 'nope'." }),
    ]);

    renderView();

    expect(await screen.findByText('failed')).toBeInTheDocument();
    expect(screen.getByText(/No source named/)).toBeInTheDocument();
  });

  test('a failed entry is still navigable', async () => {
    // The entry you most want to click is the one that went wrong.
    fetchAgentActions.mockResolvedValue([
      action({ outcome: 'error', error: 'nope' }),
    ]);

    renderView();

    expect(await screen.findByTestId('agent-action-object-orders')).toBeInTheDocument();
  });
});

describe('where its data comes from', () => {
  test('it subscribes rather than polling on its own', async () => {
    renderView();

    await waitFor(() => expect(subscribe).toHaveBeenCalled());
    expect(subscribe.mock.calls[0][0].event).toBe('agent_action');
  });

  test('what the topic delivers replaces the list', async () => {
    renderView();
    await waitFor(() => expect(subscribe).toHaveBeenCalled());

    const handler = subscribe.mock.calls[0][1];
    // The seam calls the handler from outside React, which is exactly what a
    // socket push will do.
    await act(async () => {
      handler([action({ id: 2, tool: 'write_chart', object: null })]);
    });

    expect(await screen.findByText('write_chart')).toBeInTheDocument();
  });

  test('it stops subscribing when the tab goes away', async () => {
    const unsubscribe = jest.fn();
    subscribe.mockReturnValue(unsubscribe);

    const { unmount } = renderView();
    await waitFor(() => expect(subscribe).toHaveBeenCalled());
    unmount();

    expect(unsubscribe).toHaveBeenCalled();
  });

  test('an unreachable server is not shown as an empty log', async () => {
    // The seam swallows a failed poll by design, so the first read is what
    // tells these two apart — and they mean opposite things.
    fetchAgentActions.mockRejectedValue(new Error('nope'));

    renderView();

    expect(await screen.findByTestId('agent-view-error')).toBeInTheDocument();
  });

  test('a dist build shows an empty log rather than spinning', async () => {
    // Static files: there is no server an agent could have worked through.
    canDeliver.mockReturnValue(false);

    renderView();

    expect(await screen.findByTestId('agent-view-empty')).toBeInTheDocument();
    expect(subscribe).not.toHaveBeenCalled();
  });
});
