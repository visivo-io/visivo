import React from 'react';
import { render, screen } from '@testing-library/react';
import AgentToolCalls, { ActionRow } from './AgentToolCalls';

describe('AgentToolCalls while the turn is working', () => {
  const pending = { id: 1, tool: 'query_source', outcome: 'pending' };
  const done = { id: 2, tool: 'list_sources', outcome: 'ok' };

  it('marks a call that has started but not finished', () => {
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
    render(<AgentToolCalls actions={[done, pending]} />);

    expect(screen.getByText(/2 tool calls/)).toBeInTheDocument();
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
  it('renders one call per row so narration can sit between them', () => {
    render(
      <>
        <p>Let me see what is here.</p>
        <ActionRow action={{ id: 1, tool: 'list_sources', outcome: 'ok' }} />
        <p>Seven tables. Looking at one.</p>
        <ActionRow action={{ id: 2, tool: 'describe_source', outcome: 'pending' }} />
      </>
    );

    expect(screen.queryAllByTestId('agent-turn-actions')).toHaveLength(0);
    expect(screen.getAllByTestId('agent-turn-action')).toHaveLength(2);
    expect(screen.getByText('list_sources')).toBeInTheDocument();
    expect(screen.getByTestId('agent-action-pending')).toBeInTheDocument();
  });
});
