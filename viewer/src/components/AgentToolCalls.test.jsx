import React from 'react';
import { render, screen } from '@testing-library/react';
import AgentToolCalls from './AgentToolCalls';

describe('AgentToolCalls while the turn is working', () => {
  const pending = { id: 1, tool: 'query_source', outcome: 'pending' };
  const done = { id: 2, tool: 'list_sources', outcome: 'ok' };

  it('marks a call that has started but not finished', () => {
    // `outcome` used to be written only when a call returned, so a long query
    // showed nothing at all while it ran.
    render(<AgentToolCalls actions={[pending]} />);

    expect(screen.getByTestId('agent-action-pending')).toBeInTheDocument();
  });

  it('says it is working while any call is in flight', () => {
    render(<AgentToolCalls actions={[done, pending]} />);

    expect(screen.getByTestId('agent-turn-actions-running')).toBeInTheDocument();
  });

  it('says nothing about working once every call has settled', () => {
    render(<AgentToolCalls actions={[done]} />);

    expect(screen.queryByTestId('agent-turn-actions-running')).not.toBeInTheDocument();
  });

  it('counts the calls it has so far', () => {
    // The summary counts up as they arrive rather than appearing at the end.
    render(<AgentToolCalls actions={[done, pending]} />);

    expect(screen.getByText(/2 tool calls/)).toBeInTheDocument();
  });

  it('opens while the turn is working, so the work needs no click', () => {
    render(<AgentToolCalls actions={[pending]} open />);

    expect(screen.getByTestId('agent-turn-actions')).toHaveAttribute('open');
  });

  it('stays collapsed once the turn is done, so the answer is the point', () => {
    render(<AgentToolCalls actions={[done]} />);

    expect(screen.getByTestId('agent-turn-actions')).not.toHaveAttribute('open');
  });

  it('still renders nothing when there are no calls', () => {
    const { container } = render(<AgentToolCalls actions={[]} />);

    expect(container).toBeEmptyDOMElement();
  });
});

describe('a turn in flight reads as a narrative', () => {
  // AgentTimeline lives in AgentPrompt; this covers the row it renders per
  // item, which is a single-action AgentToolCalls held open.
  it('renders one call per row so narration can sit between them', () => {
    render(
      <>
        <p>Let me see what is here.</p>
        <AgentToolCalls actions={[{ id: 1, tool: 'list_sources', outcome: 'ok' }]} open />
        <p>Seven tables. Looking at one.</p>
        <AgentToolCalls actions={[{ id: 2, tool: 'describe_source', outcome: 'pending' }]} open />
      </>
    );

    const rows = screen.getAllByTestId('agent-turn-actions');
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveAttribute('open');
    expect(screen.getByText('list_sources')).toBeInTheDocument();
    expect(screen.getByTestId('agent-action-pending')).toBeInTheDocument();
  });
});
