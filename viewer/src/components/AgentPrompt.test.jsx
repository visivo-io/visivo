import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import AgentPrompt from './AgentPrompt';
import { cancelAgentSession, fetchAgentSession, startAgentSession } from '../api/agent';

jest.mock('../api/agent', () => ({
  startAgentSession: jest.fn(),
  fetchAgentSession: jest.fn(),
  cancelAgentSession: jest.fn(),
}));

const session = (state, extra = {}) => ({ id: 's1', state, transcript: [], ...extra });

const said = (role, text) => ({ role, text, at: `2026-09-27T12:0${text.length}:00` });

beforeEach(() => jest.clearAllMocks());

describe('AgentPrompt', () => {
  it('will not send an empty prompt', () => {
    render(<AgentPrompt />);
    expect(screen.getByTestId('agent-send')).toBeDisabled();
  });

  it('sends the prompt and then shows the answer in the transcript', async () => {
    startAgentSession.mockResolvedValue({ session: session('running') });
    fetchAgentSession.mockResolvedValue(
      session('succeeded', {
        output: 'Built the model.',
        transcript: [said('user', 'build a model'), said('agent', 'Built the model.')],
      })
    );
    render(<AgentPrompt />);

    await userEvent.type(screen.getByLabelText('What should the agent do?'), 'build a model');
    await userEvent.click(screen.getByTestId('agent-send'));

    expect(startAgentSession).toHaveBeenCalledWith({
      projectId: undefined,
      prompt: 'build a model',
      sessionId: undefined,
    });
    expect(await screen.findByTestId('agent-transcript')).toHaveTextContent('Built the model.');
  });

  it('offers Stop instead of Send while it is working', async () => {
    startAgentSession.mockResolvedValue({ session: session('running') });
    fetchAgentSession.mockResolvedValue(session('running'));
    render(<AgentPrompt />);

    await userEvent.type(screen.getByLabelText('What should the agent do?'), 'go');
    await userEvent.click(screen.getByTestId('agent-send'));

    expect(await screen.findByTestId('agent-stop')).toBeInTheDocument();
    expect(screen.queryByTestId('agent-send')).not.toBeInTheDocument();
  });

  it('stopping says the drafts survived', async () => {
    startAgentSession.mockResolvedValue({ session: session('running') });
    fetchAgentSession.mockResolvedValue(session('running'));
    cancelAgentSession.mockResolvedValue({ cancelled: true, session: session('cancelled') });
    render(<AgentPrompt />);

    await userEvent.type(screen.getByLabelText('What should the agent do?'), 'go');
    await userEvent.click(screen.getByTestId('agent-send'));
    await userEvent.click(await screen.findByTestId('agent-stop'));

    expect(await screen.findByTestId('agent-cancelled')).toHaveTextContent(/still there as a draft/);
  });

  it('shows the setup instructions verbatim when no key is configured', async () => {
    // The first-run case. The backend's message IS the instructions, so it is
    // shown rather than replaced with a generic failure.
    startAgentSession.mockResolvedValue({ unconfigured: 'Set ANTHROPIC_API_KEY, or add ...' });
    render(<AgentPrompt />);

    await userEvent.type(screen.getByLabelText('What should the agent do?'), 'go');
    await userEvent.click(screen.getByTestId('agent-send'));

    expect(await screen.findByTestId('agent-notice-configure')).toHaveTextContent(
      'Set ANTHROPIC_API_KEY'
    );
  });

  it('says so when another agent is already working', async () => {
    startAgentSession.mockResolvedValue({ busy: session('running') });
    fetchAgentSession.mockResolvedValue(session('running'));
    render(<AgentPrompt />);

    await userEvent.type(screen.getByLabelText('What should the agent do?'), 'go');
    await userEvent.click(screen.getByTestId('agent-send'));

    expect(await screen.findByTestId('agent-notice-busy')).toBeInTheDocument();
  });

  it('surfaces a failure with its reason', async () => {
    startAgentSession.mockResolvedValue({ session: session('running') });
    fetchAgentSession.mockResolvedValue(session('failed', { error: 'the provider said no' }));
    render(<AgentPrompt />);

    await userEvent.type(screen.getByLabelText('What should the agent do?'), 'go');
    await userEvent.click(screen.getByTestId('agent-send'));

    expect(await screen.findByTestId('agent-failed')).toHaveTextContent('the provider said no');
  });

  it('keeps the prompt when it could not be sent, so it is not retyped', async () => {
    startAgentSession.mockResolvedValue({ unconfigured: 'no key' });
    render(<AgentPrompt />);
    const input = screen.getByLabelText('What should the agent do?');

    await userEvent.type(input, 'expensive to retype');
    await userEvent.click(screen.getByTestId('agent-send'));

    await screen.findByTestId('agent-notice-configure');
    expect(input).toHaveValue('expensive to retype');
  });
});

describe('AgentPrompt — whose model', () => {
  it('says when the answer is coming from the Visivo account', async () => {
    startAgentSession.mockResolvedValue({
      session: session('running', { model_source: 'visivo_cloud' }),
    });
    fetchAgentSession.mockResolvedValue(session('succeeded', { output: 'ok' }));
    render(<AgentPrompt />);

    await userEvent.type(screen.getByLabelText('What should the agent do?'), 'go');
    await userEvent.click(screen.getByTestId('agent-send'));

    expect(await screen.findByTestId('agent-model-source')).toHaveTextContent(
      /Using your Visivo account/
    );
  });

  it('says when it is the user’s own key', async () => {
    // Someone spending their own money should never be unsure that they are.
    startAgentSession.mockResolvedValue({
      session: session('running', { model_source: 'byo_key' }),
    });
    fetchAgentSession.mockResolvedValue(session('succeeded', { output: 'ok' }));
    render(<AgentPrompt />);

    await userEvent.type(screen.getByLabelText('What should the agent do?'), 'go');
    await userEvent.click(screen.getByTestId('agent-send'));

    expect(await screen.findByTestId('agent-model-source')).toHaveTextContent(
      /Using your own API key/
    );
  });

  it('a spent monthly limit reads as a limit, not a failure', async () => {
    startAgentSession.mockResolvedValue({
      limitReached: 'This account has used its $100 monthly inference limit.',
    });
    render(<AgentPrompt />);

    await userEvent.type(screen.getByLabelText('What should the agent do?'), 'go');
    await userEvent.click(screen.getByTestId('agent-send'));

    expect(await screen.findByTestId('agent-notice-limit')).toHaveTextContent(
      /\$100 monthly inference limit/
    );
  });
});

describe('AgentPrompt — it is a conversation', () => {
  it('a second prompt continues the first, rather than starting over', async () => {
    // Without the session id, "now add a chart to that" has no referent.
    startAgentSession.mockResolvedValue({ session: session('running') });
    fetchAgentSession.mockResolvedValue(
      session('succeeded', {
        output: 'Done.',
        transcript: [said('user', 'make a model'), said('agent', 'Done.')],
      })
    );
    render(<AgentPrompt />);
    const box = screen.getByLabelText('What should the agent do?');

    await userEvent.type(box, 'make a model');
    await userEvent.click(screen.getByTestId('agent-send'));
    await screen.findByTestId('agent-transcript');

    await userEvent.type(box, 'now chart it');
    await userEvent.click(screen.getByTestId('agent-send'));

    expect(startAgentSession).toHaveBeenLastCalledWith({
      projectId: undefined,
      prompt: 'now chart it',
      sessionId: 's1',
    });
  });

  it('shows both sides, oldest first', async () => {
    startAgentSession.mockResolvedValue({ session: session('running') });
    fetchAgentSession.mockResolvedValue(
      session('succeeded', {
        transcript: [
          said('user', 'one'),
          said('agent', 'two'),
          said('user', 'three'),
          said('agent', 'four'),
        ],
      })
    );
    render(<AgentPrompt />);

    await userEvent.type(screen.getByLabelText('What should the agent do?'), 'one');
    await userEvent.click(screen.getByTestId('agent-send'));

    await screen.findByTestId('agent-transcript');
    expect(screen.getAllByTestId('agent-turn-user')).toHaveLength(2);
    expect(screen.getAllByTestId('agent-turn-agent')).toHaveLength(2);
  });

  it('an evicted conversation drops its id so the next Send starts a new one', async () => {
    // Otherwise every subsequent prompt fails the same way against a dead id.
    startAgentSession
      .mockResolvedValueOnce({ session: session('running') })
      .mockResolvedValueOnce({ sessionGone: 'That conversation is no longer available.' })
      .mockResolvedValueOnce({ session: session('running') });
    fetchAgentSession.mockResolvedValue(
      session('succeeded', { transcript: [said('user', 'a'), said('agent', 'b')] })
    );
    render(<AgentPrompt />);
    const box = screen.getByLabelText('What should the agent do?');

    await userEvent.type(box, 'a');
    await userEvent.click(screen.getByTestId('agent-send'));
    await screen.findByTestId('agent-transcript');

    await userEvent.type(box, 'b');
    await userEvent.click(screen.getByTestId('agent-send'));
    await screen.findByTestId('agent-notice-gone');

    // The prompt is still in the box — it was never sent, so it is not
    // retyped. Pressing Send again is the whole recovery.
    expect(box).toHaveValue('b');
    await userEvent.click(screen.getByTestId('agent-send'));

    expect(startAgentSession).toHaveBeenLastCalledWith({
      projectId: undefined,
      prompt: 'b',
      sessionId: undefined,
    });
  });
});
