/**
 * The Agent tab: the conversation, and an external MCP client's calls grouped
 * beneath it. The loop's own calls already sit under their turn, so the log
 * must never repeat them.
 */
import React from 'react';
import { render, screen, waitFor, act, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import AgentView from './AgentView';
import { fetchAgentActions } from '../api/agent';
import { subscribe, canDeliver } from '../events/eventSource';
import { futureFlags } from '../router-config';

jest.mock('../api/agent', () => ({ fetchAgentActions: jest.fn() }));
// Tested on its own; here it only has to be on the page.
jest.mock('./AgentPrompt', () => () => <div data-testid="agent-prompt" />);
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
  source: 'mcp',
  session_id: null,
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

const external = () => screen.findByRole('region', { name: 'External MCP calls' });

describe('what is listed', () => {
  test("an external client's calls are grouped like an agent turn", async () => {
    fetchAgentActions.mockResolvedValue([action()]);

    renderView();

    const group = await external();
    expect(within(group).getByTestId('agent-turn-actions')).toHaveTextContent('1 tool call');
    expect(within(group).getByText('write_model')).toBeInTheDocument();
  });

  test('they sit above the conversation, so the prompt box is last', async () => {
    fetchAgentActions.mockResolvedValue([action()]);

    renderView();

    const group = await external();
    const prompt = screen.getByTestId('agent-prompt');
    expect(group.compareDocumentPosition(prompt) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  test("the agent's own calls are not listed again", async () => {
    // They already sit under the turn that made them.
    fetchAgentActions.mockResolvedValue([action({ source: 'agent', session_id: 's1' })]);

    renderView();

    await waitFor(() => expect(fetchAgentActions).toHaveBeenCalled());
    expect(screen.queryByRole('region', { name: 'External MCP calls' })).not.toBeInTheDocument();
    expect(screen.queryByText('write_model')).not.toBeInTheDocument();
  });

  test('unattributed calls are the cloud loop\'s and are not listed either', async () => {
    fetchAgentActions.mockResolvedValue([action({ source: undefined })]);

    renderView();

    await waitFor(() => expect(fetchAgentActions).toHaveBeenCalled());
    expect(screen.queryByRole('region', { name: 'External MCP calls' })).not.toBeInTheDocument();
  });

  test('a group reads oldest first', async () => {
    fetchAgentActions.mockResolvedValue([
      action({ id: 2, tool: 'write_chart', object: null }),
      action({ id: 1, tool: 'write_model', object: null }),
    ]);

    renderView();

    const rows = within(await external()).getAllByTestId('agent-turn-action');
    expect(rows.map(row => row.textContent)).toEqual(['write_model', 'write_chart']);
  });

  test('there is no subheading, and the prompt is there from the start', async () => {
    fetchAgentActions.mockReturnValue(new Promise(() => {}));

    renderView();

    expect(screen.getByTestId('agent-prompt')).toBeInTheDocument();
    expect(screen.queryByText(/connect your own MCP client/)).not.toBeInTheDocument();
  });
});

describe('an entry is navigable', () => {
  test('an object reference links into the workspace', async () => {
    fetchAgentActions.mockResolvedValue([action()]);

    renderView();

    const link = await screen.findByTestId('agent-action-object-orders');
    expect(link).toHaveAttribute('href', '/workspace?edit=model%3Aorders');
  });

  test('a tool about no object renders without one', async () => {
    fetchAgentActions.mockResolvedValue([action({ tool: 'get_schema', object: null })]);

    renderView();

    expect(within(await external()).getByText('get_schema')).toBeInTheDocument();
  });
});

describe('when something failed', () => {
  test('it is counted, and says why', async () => {
    fetchAgentActions.mockResolvedValue([
      action({ outcome: 'error', error: "No source named 'nope'." }),
    ]);

    renderView();

    const group = await external();
    expect(within(group).getByTestId('agent-turn-actions-failed')).toHaveTextContent('1 failed');
    expect(within(group).getByText(/No source named/)).toBeInTheDocument();
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

    expect(within(await external()).getByText('write_chart')).toBeInTheDocument();
  });

  test('it stops subscribing when the tab goes away', async () => {
    const unsubscribe = jest.fn();
    subscribe.mockReturnValue(unsubscribe);

    const { unmount } = renderView();
    await waitFor(() => expect(subscribe).toHaveBeenCalled());
    unmount();

    expect(unsubscribe).toHaveBeenCalled();
  });

  test('an unreachable server says so, without hiding the prompt', async () => {
    fetchAgentActions.mockRejectedValue(new Error('nope'));

    renderView();

    expect(await screen.findByTestId('agent-view-error')).toBeInTheDocument();
    expect(screen.getByTestId('agent-prompt')).toBeInTheDocument();
  });

  test('a dist build lists nothing and does not subscribe', async () => {
    canDeliver.mockReturnValue(false);

    renderView();

    expect(screen.queryByRole('region', { name: 'External MCP calls' })).not.toBeInTheDocument();
    expect(subscribe).not.toHaveBeenCalled();
  });
});
