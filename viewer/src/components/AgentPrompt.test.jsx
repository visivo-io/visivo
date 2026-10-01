import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import AgentPrompt from './AgentPrompt';
import { futureFlags } from '../router-config';
import {
  cancelAgentSession,
  fetchAgentSession,
  listAgentSessions,
  startAgentSession,
} from '../api/agent';
import {
  authorizationProgress,
  fetchAuthorization,
  startAuthorization,
} from '../api/authorization';

jest.mock('../api/agent', () => ({
  startAgentSession: jest.fn(),
  fetchAgentSession: jest.fn(),
  cancelAgentSession: jest.fn(),
  listAgentSessions: jest.fn(),
}));

jest.mock('../api/authorization', () => ({
  fetchAuthorization: jest.fn(),
  startAuthorization: jest.fn(),
  authorizationProgress: jest.fn(),
}));

const session = (state, extra = {}) => ({ id: 's1', state, transcript: [], ...extra });

const said = (role, text) => ({ role, text, at: `2026-09-27T12:0${text.length}:00` });

beforeEach(() => {
  jest.clearAllMocks();
  // The default for every test that is not about resuming: this project has
  // no earlier conversation.
  listAgentSessions.mockResolvedValue([]);
  // And for every test that is not about authorizing: already connected, so
  // the prompt box is what renders.
  fetchAuthorization.mockResolvedValue({ authorized: true, host: 'https://app.visivo.io' });
});

describe('AgentPrompt', () => {
  it('will not send an empty prompt', async () => {
    render(<AgentPrompt />);
    // Awaited because the authorization check settles after mount; asserting
    // synchronously leaves its state update outside act().
    expect(await screen.findByTestId('agent-send')).toBeDisabled();
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

describe('AgentPrompt — when polling itself is broken', () => {
  it('gives up and says so rather than spinning forever', async () => {
    // A malformed URL threw on every poll and the catch swallowed it, so a
    // structural bug looked like an agent that simply never answered.
    startAgentSession.mockResolvedValue({ session: session('running') });
    fetchAgentSession.mockRejectedValue(new Error('url.replace is not a function'));
    render(<AgentPrompt />);

    await userEvent.type(screen.getByLabelText('What should the agent do?'), 'go');
    await userEvent.click(screen.getByTestId('agent-send'));

    expect(await screen.findByTestId('agent-notice-error', {}, { timeout: 10000 })).toHaveTextContent(
      /Lost contact with the agent/
    );
  }, 15000);
});

describe('what a turn did', () => {
  // An answer with no visible work reads as an agent that did nothing — the
  // tool calls existed, but in a flat log nothing tied them to the turn.
  const withRouter = () =>
    render(
      <MemoryRouter future={futureFlags}>
        <AgentPrompt />
      </MemoryRouter>
    );

  const call = (overrides = {}) => ({
    id: 1,
    tool: 'write_model',
    object: { type: 'model', name: 'orders' },
    outcome: 'ok',
    error: null,
    ...overrides,
  });

  const answered = actions =>
    session('succeeded', {
      transcript: [said('user', 'build a model'), { ...said('agent', 'Built it.'), actions }],
    });

  const ask = async () => {
    await userEvent.type(screen.getByLabelText('What should the agent do?'), 'build a model');
    await userEvent.click(screen.getByTestId('agent-send'));
  };

  it('counts the tool calls above the answer', async () => {
    startAgentSession.mockResolvedValue({ session: session('running') });
    fetchAgentSession.mockResolvedValue(
      answered([call(), call({ id: 2, tool: 'write_chart' }), call({ id: 3, tool: 'write_table' })])
    );
    withRouter();
    await ask();

    expect(await screen.findByTestId('agent-turn-actions')).toHaveTextContent('3 tool calls');
  });

  it('says "1 tool call", not "1 tool calls"', async () => {
    startAgentSession.mockResolvedValue({ session: session('running') });
    fetchAgentSession.mockResolvedValue(answered([call()]));
    withRouter();
    await ask();

    expect(await screen.findByTestId('agent-turn-actions')).toHaveTextContent('1 tool call');
  });

  it('lists each call, linked to what it touched', async () => {
    startAgentSession.mockResolvedValue({ session: session('running') });
    fetchAgentSession.mockResolvedValue(
      answered([
        call(),
        call({ id: 2, tool: 'write_chart', object: { type: 'chart', name: 'revenue' } }),
      ])
    );
    withRouter();
    await ask();

    expect(await screen.findAllByTestId('agent-turn-action')).toHaveLength(2);
    expect(screen.getByTestId('agent-action-object-orders')).toHaveAttribute(
      'href',
      '/workspace?edit=model%3Aorders'
    );
  });

  it('surfaces a failure in the summary, so it need not be expanded to be seen', async () => {
    startAgentSession.mockResolvedValue({ session: session('running') });
    fetchAgentSession.mockResolvedValue(
      answered([call(), call({ id: 2, outcome: 'error', error: 'no such source' })])
    );
    withRouter();
    await ask();

    expect(await screen.findByTestId('agent-turn-actions-failed')).toHaveTextContent('1 failed');
    expect(screen.getByTestId('agent-turn-actions')).toHaveTextContent('no such source');
  });

  it('shows nothing at all when a turn called no tools', async () => {
    startAgentSession.mockResolvedValue({ session: session('running') });
    fetchAgentSession.mockResolvedValue(answered([]));
    withRouter();
    await ask();

    expect(await screen.findByTestId('agent-transcript')).toHaveTextContent('Built it.');
    expect(screen.queryByTestId('agent-turn-actions')).not.toBeInTheDocument();
  });

  it('survives a turn from a server that does not send actions', async () => {
    startAgentSession.mockResolvedValue({ session: session('running') });
    fetchAgentSession.mockResolvedValue(
      session('succeeded', { transcript: [said('agent', 'Built it.')] })
    );
    withRouter();
    await ask();

    expect(await screen.findByTestId('agent-transcript')).toHaveTextContent('Built it.');
    expect(screen.queryByTestId('agent-turn-actions')).not.toBeInTheDocument();
  });
});

describe('picking the conversation back up', () => {
  // Navigate away and back, or refresh, and the transcript used to vanish —
  // even though the server still had it. Reported against cloud, but it was
  // never a cloud bug: nothing ever asked which conversation this project was
  // having.
  const listed = (id, state) => ({ id, state, prompt: 'earlier', turns: 2 });

  const whole = (id, state, text) =>
    session(state, { id, transcript: [said('user', 'earlier'), said('agent', text)] });

  it('shows the last conversation without being asked', async () => {
    listAgentSessions.mockResolvedValue([listed('s9', 'succeeded')]);
    fetchAgentSession.mockResolvedValue(whole('s9', 'succeeded', 'Built it earlier.'));
    render(<AgentPrompt />);

    expect(await screen.findByTestId('agent-transcript')).toHaveTextContent('Built it earlier.');
    expect(fetchAgentSession).toHaveBeenCalledWith('s9', undefined);
  });

  it('prefers a turn that is still working over a newer finished one', async () => {
    // A reload mid-turn is the moment this feels most like lost work.
    listAgentSessions.mockResolvedValue([listed('s2', 'succeeded'), listed('s1', 'running')]);
    fetchAgentSession.mockResolvedValue(whole('s1', 'running', 'partway'));
    render(<AgentPrompt />);

    expect(await screen.findByTestId('agent-stop')).toBeInTheDocument();
    expect(fetchAgentSession).toHaveBeenCalledWith('s1', undefined);
  });

  it('does not poll a conversation that has already finished', async () => {
    listAgentSessions.mockResolvedValue([listed('s9', 'succeeded')]);
    fetchAgentSession.mockResolvedValue(whole('s9', 'succeeded', 'Built it earlier.'));
    render(<AgentPrompt />);

    await screen.findByTestId('agent-transcript');
    const polls = fetchAgentSession.mock.calls.length;
    await new Promise(resolve => setTimeout(resolve, 1200));

    expect(fetchAgentSession).toHaveBeenCalledTimes(polls);
    expect(screen.getByTestId('agent-send')).toBeInTheDocument();
  });

  it('a project with no history looks exactly as it always did', async () => {
    listAgentSessions.mockResolvedValue([]);
    render(<AgentPrompt />);

    expect(await screen.findByTestId('agent-send')).toBeInTheDocument();
    expect(screen.queryByTestId('agent-transcript')).not.toBeInTheDocument();
    expect(fetchAgentSession).not.toHaveBeenCalled();
  });

  it('a list that cannot be read leaves the tab usable and says nothing', async () => {
    // They came here to ask for something. A failed lookup of what they asked
    // last time is not worth an error box.
    listAgentSessions.mockRejectedValue(new Error('offline'));
    render(<AgentPrompt />);

    expect(await screen.findByTestId('agent-send')).toBeInTheDocument();
    expect(screen.queryByTestId('agent-notice-error')).not.toBeInTheDocument();
  });

  it('does not overwrite a conversation started while it was still looking', async () => {
    let release;
    listAgentSessions.mockReturnValue(new Promise(resolve => (release = resolve)));
    startAgentSession.mockResolvedValue({ session: session('running', { id: 'new' }) });
    fetchAgentSession.mockResolvedValue(
      session('succeeded', { id: 'new', transcript: [said('agent', 'The new one.')] })
    );
    render(<AgentPrompt />);

    await userEvent.type(screen.getByLabelText('What should the agent do?'), 'go');
    await userEvent.click(screen.getByTestId('agent-send'));
    release([listed('old', 'succeeded')]);

    expect(await screen.findByTestId('agent-transcript')).toHaveTextContent('The new one.');
    expect(fetchAgentSession).not.toHaveBeenCalledWith('old', undefined);
  });
});

describe('before this serve has been authorized', () => {
  // It used to meet a first-time user with the resolver's BYO error — "Set
  // ANTHROPIC_API_KEY, or add `agent: api_key:` to ~/.visivo/profile.yml" —
  // which asks them to go and acquire a provider account, in a terminal, for
  // something this page can do in one click.
  const unauthorized = () =>
    fetchAuthorization.mockResolvedValue({
      authorized: false,
      host: 'https://app.visivo.io',
    });

  it('offers to connect the account instead of a prompt box', async () => {
    unauthorized();
    render(<AgentPrompt />);

    expect(await screen.findByTestId('agent-authorize-button')).toBeInTheDocument();
    expect(screen.queryByTestId('agent-send')).not.toBeInTheDocument();
  });

  it('names the deployment it would connect to', async () => {
    // One host per serve — the page should not leave someone guessing which.
    unauthorized();
    render(<AgentPrompt />);

    expect(await screen.findByTestId('agent-authorize-host')).toHaveTextContent(
      'https://app.visivo.io'
    );
  });

  it('runs the device flow and becomes usable without a reload', async () => {
    unauthorized();
    startAuthorization.mockResolvedValue({ authId: 'a1', url: 'https://app.visivo.io/x' });
    authorizationProgress.mockResolvedValue({ done: true, failed: false, message: 'Authorized' });
    window.open = jest.fn();
    render(<AgentPrompt />);

    await userEvent.click(await screen.findByTestId('agent-authorize-button'));
    // What the popup lands on, once.
    expect(startAuthorization).toHaveBeenCalled();

    fetchAuthorization.mockResolvedValue({ authorized: true, host: 'https://app.visivo.io' });

    expect(await screen.findByTestId('agent-send', undefined, { timeout: 5000 })).toBeInTheDocument();
  });

  it('keeps bring-your-own-key, below and collapsed', async () => {
    // Real, and the option that keeps working when the credit runs out — just
    // not the first ask. Stated outright rather than waiting on a failed
    // request to reveal it: the prompt box is not on screen here, so nothing
    // can fail to produce the instructions.
    unauthorized();
    render(<AgentPrompt />);

    const byo = await screen.findByTestId('agent-authorize-byo');
    expect(byo).toHaveTextContent('ANTHROPIC_API_KEY');
    // A disclosure, not the headline.
    expect(byo.tagName).toBe('DETAILS');
    expect(byo).not.toHaveAttribute('open');
  });

  it('does not hide a conversation already on screen behind a login', async () => {
    // Someone using their own key is authorized for nothing and still has a
    // transcript. Replacing it with a sign-in prompt would lose their work.
    fetchAuthorization.mockResolvedValue({ authorized: true, host: 'https://app.visivo.io' });
    startAgentSession.mockResolvedValue({ session: session('running') });
    fetchAgentSession.mockResolvedValue(
      session('succeeded', { transcript: [said('agent', 'Built it.')] })
    );
    render(<AgentPrompt />);

    await userEvent.type(screen.getByLabelText('What should the agent do?'), 'go');
    await userEvent.click(screen.getByTestId('agent-send'));
    await screen.findByTestId('agent-transcript');

    fetchAuthorization.mockResolvedValue({ authorized: false, host: 'https://app.visivo.io' });

    expect(screen.getByTestId('agent-transcript')).toBeInTheDocument();
  });
});

describe('running out of credit mid-turn', () => {
  // The limit applies to a local serve too — core gates every call to the
  // inference proxy, whoever is calling. What was missing was saying so: it
  // arrived as "status_code: 429, model_name: google/gemini-2.5-pro, body:
  // {...}", which reads as Google rate-limiting us.
  const refused = () =>
    session('failed', {
      error: 'This account has used its $30 of free credit.',
      action: 'inference_limit_reached',
      transcript: [said('user', 'build a model')],
    });

  it('reads as a limit, not as a crash', async () => {
    startAgentSession.mockResolvedValue({ session: session('running') });
    fetchAgentSession.mockResolvedValue(refused());
    render(<AgentPrompt />);

    await userEvent.type(screen.getByLabelText('What should the agent do?'), 'build a model');
    await userEvent.click(screen.getByTestId('agent-send'));

    expect(await screen.findByTestId('agent-limit-reached')).toHaveTextContent(
      '$30 of free credit'
    );
    expect(screen.queryByTestId('agent-failed')).not.toBeInTheDocument();
  });

  it('still shows an ordinary failure as a failure', async () => {
    startAgentSession.mockResolvedValue({ session: session('running') });
    fetchAgentSession.mockResolvedValue(
      session('failed', { error: 'something actually broke', action: null })
    );
    render(<AgentPrompt />);

    await userEvent.type(screen.getByLabelText('What should the agent do?'), 'go');
    await userEvent.click(screen.getByTestId('agent-send'));

    expect(await screen.findByTestId('agent-failed')).toHaveTextContent('something actually broke');
    expect(screen.queryByTestId('agent-limit-reached')).not.toBeInTheDocument();
  });
});
