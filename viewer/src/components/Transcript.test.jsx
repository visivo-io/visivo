import React from 'react';
import { render, screen } from '@testing-library/react';
import { Transcript } from './AgentPrompt';

const entry = (at, items) => ({
  role: 'agent',
  text: '',
  at,
  actions: items.filter(i => i.kind === 'action').map(i => i.action),
  items,
  pending: true,
});

const call = (id, tool) => ({ kind: 'action', action: { id, tool, outcome: 'ok' } });

describe('Transcript identity while a turn works', () => {
  it('does not remount the entry when the turn reports again', () => {
    const { rerender } = render(
      <Transcript entries={[entry('2026-10-21T07:00:00', [call(1, 'list_models')])]} running />
    );
    const before = screen.getByTestId('agent-turn-agent');

    rerender(
      <Transcript
        entries={[entry('2026-10-21T07:00:00', [call(1, 'list_models'), call(2, 'get_model')])]}
        running
      />
    );

    expect(screen.getByTestId('agent-turn-agent')).toBe(before);
  });

  it('survives a turn that reports a different timestamp', () => {
    const { rerender } = render(
      <Transcript entries={[entry('2026-10-21T07:00:00', [call(1, 'list_models')])]} running />
    );
    const before = screen.getByTestId('agent-turn-agent');

    rerender(
      <Transcript entries={[entry('2026-10-21T07:00:09', [call(1, 'list_models')])]} running />
    );

    expect(screen.getByTestId('agent-turn-agent')).toBe(before);
  });
});
