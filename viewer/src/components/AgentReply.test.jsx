import React from 'react';
import { render, screen, within } from '@testing-library/react';
import AgentReply from './AgentReply';
import { AgentTimeline, Transcript } from './AgentPrompt';

jest.unmock('react-markdown');

const REPLY = `Here are a few observations:

1. **Most gigs disclose pay:** 42 of the 50 list it.
2. **OpenTrain AI** posts the most.

What next?
* Pay by role
* Remote roles`;

describe('AgentReply', () => {
  it('shows the Markdown the model writes, not its raw characters', () => {
    render(<AgentReply text={REPLY} data-testid="reply" />);
    const reply = screen.getByTestId('reply');

    expect(within(reply).getAllByRole('list')).toHaveLength(2);
    expect(within(reply).getAllByRole('listitem')).toHaveLength(4);
    expect(within(reply).getByText('Most gigs disclose pay:').tagName).toBe('STRONG');
    expect(reply).not.toHaveTextContent('**');
  });

  it('keeps raw HTML as text', () => {
    render(<AgentReply text={'<img src=x onerror="alert(1)"> done'} data-testid="reply" />);
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });

  it('opens a link in a new tab, away from the app', () => {
    render(<AgentReply text="See [the docs](https://docs.visivo.io)." />);
    const link = screen.getByRole('link', { name: 'the docs' });
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  });

  it('renders nothing for an empty reply', () => {
    render(<AgentReply text="" data-testid="reply" />);
    expect(screen.queryByTestId('reply')).not.toBeInTheDocument();
  });
});

describe('agent text keeps its formatting', () => {
  it('after the turn finishes', () => {
    render(
      <Transcript
        entries={[
          { role: 'user', text: 'what is in it?' },
          { role: 'agent', text: REPLY, actions: [] },
        ]}
        running={false}
      />
    );
    const reply = screen.getByTestId('agent-reply');
    expect(within(reply).getAllByRole('listitem')).toHaveLength(4);
    expect(reply).not.toHaveTextContent('**');
  });

  it('while the turn runs, the same way', () => {
    render(<AgentTimeline items={[{ kind: 'text', text: REPLY }]} />);
    const spoken = screen.getByTestId('agent-timeline-text');
    expect(within(spoken).getAllByRole('listitem')).toHaveLength(4);
  });

  it("leaves the user's own message as they typed it", () => {
    render(
      <Transcript entries={[{ role: 'user', text: '**not bold**\nsecond line' }]} running={false} />
    );
    expect(screen.getByText(/\*\*not bold\*\*/)).toBeInTheDocument();
  });
});
