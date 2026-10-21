import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AgentTimeline } from './AgentPrompt';

const text = value => ({ kind: 'text', text: value });
const call = (id, tool, outcome = 'ok') => ({
  kind: 'action',
  action: { id, tool, outcome },
});

describe('AgentTimeline', () => {
  it('bundles consecutive calls into one group', () => {
    render(
      <AgentTimeline
        items={[call(1, 'list_models'), call(2, 'profile_model'), call(3, 'get_model')]}
      />
    );

    const groups = screen.getAllByTestId('agent-timeline-group');
    expect(groups).toHaveLength(1);
    expect(screen.getByText(/3 tool calls/)).toBeInTheDocument();
  });

  it('starts a new group after the agent speaks', () => {
    // The narration is what separates one piece of work from the next.
    render(
      <AgentTimeline
        items={[
          call(1, 'list_models'),
          call(2, 'profile_model'),
          call(3, 'get_model'),
          text('I am trying XYZ'),
          call(4, 'write_x'),
          call(5, 'read_y'),
          text('This is the final statement'),
        ]}
      />
    );

    expect(screen.getAllByTestId('agent-timeline-group')).toHaveLength(2);
    expect(screen.getByText(/3 tool calls/)).toBeInTheDocument();
    expect(screen.getByText(/2 tool calls/)).toBeInTheDocument();
    expect(screen.getByText('I am trying XYZ')).toBeInTheDocument();
    expect(screen.getByText('This is the final statement')).toBeInTheDocument();
  });

  it('keeps the order the work happened in', () => {
    render(
      <AgentTimeline
        items={[call(1, 'list_models'), text('then I said this'), call(2, 'write_x')]}
      />
    );

    // The narration sits between the two runs of calls, not above or below
    // both of them.
    const spoken = screen.getByTestId('agent-timeline-text');
    const [first, second] = screen.getAllByTestId('agent-timeline-group');

    expect(first.compareDocumentPosition(spoken)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    expect(spoken.compareDocumentPosition(second)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
  });

  it('opens only the group being worked on', () => {
    // Everything above it is finished, and a turn that leaves every group
    // open is a wall by its fifth call.
    render(
      <AgentTimeline
        items={[call(1, 'list_models'), text('next'), call(2, 'write_x', 'pending')]}
      />
    );

    const [first, last] = screen.getAllByTestId('agent-timeline-group');
    expect(first).not.toHaveAttribute('open');
    expect(last).toHaveAttribute('open');
  });

  it('keeps a group collapsed when the poll brings more work', async () => {
    // The session is polled every second and each poll delivers a fresh
    // array. The earlier version put every call in its own disclosure keyed
    // by array index, so a poll that changed the item count REMOUNTED them —
    // and a remounted <details> comes back at its initial state. Keying a
    // group by position (groups only append) plus holding open/closed in
    // state is what makes a collapse stick.
    const { rerender } = render(
      <AgentTimeline items={[call(1, 'list_models'), call(2, 'profile_model')]} />
    );
    const group = screen.getByTestId('agent-timeline-group');
    expect(group).toHaveAttribute('open');

    await userEvent.click(screen.getByText(/2 tool calls/));
    expect(screen.getByTestId('agent-timeline-group')).not.toHaveAttribute('open');

    // The next poll: same group, one more call in it.
    rerender(
      <AgentTimeline
        items={[call(1, 'list_models'), call(2, 'profile_model'), call(3, 'get_model')]}
      />
    );

    expect(screen.getByTestId('agent-timeline-group')).not.toHaveAttribute('open');
  });

  it('does not remount a group when a later one appears', () => {
    // The actual fix. A remounted <details> returns to its initial state, so
    // whether the component survives a poll IS whether a collapse survives.
    const { rerender } = render(<AgentTimeline items={[call(1, 'list_models')]} />);
    const before = screen.getByTestId('agent-timeline-group');

    rerender(
      <AgentTimeline
        items={[call(1, 'list_models'), text('now this'), call(2, 'write_x')]}
      />
    );

    expect(screen.getAllByTestId('agent-timeline-group')[0]).toBe(before);
  });

  it('says a group is working while any call in it is', () => {
    render(<AgentTimeline items={[call(1, 'query_source', 'pending')]} />);

    expect(screen.getByTestId('agent-timeline-running')).toBeInTheDocument();
  });

  it('counts the failures in a group', () => {
    render(
      <AgentTimeline items={[call(1, 'write_x'), call(2, 'write_dashboard', 'error')]} />
    );

    expect(screen.getByText('1 failed')).toBeInTheDocument();
  });

  it('renders nothing for a turn that has not started', () => {
    render(<AgentTimeline items={[]} />);

    expect(screen.getByTestId('agent-timeline')).toBeEmptyDOMElement();
    expect(screen.queryAllByTestId('agent-timeline-group')).toHaveLength(0);
  });
});
