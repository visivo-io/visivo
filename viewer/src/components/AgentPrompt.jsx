import React, { useCallback, useEffect, useRef, useState } from 'react';
import useStore from '../stores/store';
import { FiSend, FiSquare } from 'react-icons/fi';
import {
  cancelAgentSession,
  fetchAgentSession,
  listAgentSessions,
  startAgentSession,
} from '../api/agent';
import AgentToolCalls from './AgentToolCalls';
import AgentAuthorize from './AgentAuthorize';
import useAuthorization from '../hooks/useAuthorization';

/**
 * A conversation with the built-in loop.
 *
 * The loop runs in the background and this polls it, because a model call
 * takes as long as it takes — a request held open for one dies in whatever
 * proxy sits between. What the agent DOES appears in the activity log below;
 * this is what was said.
 *
 * Each turn carries the session id, so "now add a chart to that" has a
 * referent. The transcript comes from the server rather than being accumulated
 * here: a reload, a second tab, or a turn that started before this component
 * mounted all have to show the same conversation.
 *
 * Stop is a first-class control rather than a menu item: a running loop the
 * user cannot stop is not shippable, and the moment they want it is the moment
 * it is doing something they did not intend.
 */

const POLL_MS = 1000;
// Enough that a momentary blip rides through, few enough that something
// structurally broken says so rather than spinning forever.
const POLL_FAILURES_BEFORE_GIVING_UP = 5;
const ACTIVE = ['queued', 'running'];

const isActive = session => Boolean(session) && ACTIVE.includes(session.state);

const FIRST_PLACEHOLDER =
  'Ask for a source, model, insight, chart, table or dashboard, or a change to one.\n' +
  'e.g. “Add a model of revenue by month from the orders source and chart it on the sales dashboard”\n' +
  'Changes land as drafts you review in the Workspace before committing.';

const REPLY_PLACEHOLDER =
  'Reply, or ask for the next change, e.g. “make that a line chart” or “add it to the dashboard”';

const AgentPrompt = () => {
  // Addressed per project, so the same component drives a local loop and a
  // cloud one without knowing which it has.
  const projectId = useStore(state => state.project?.id);
  const [prompt, setPrompt] = useState('');
  const [session, setSession] = useState(null);
  const [notice, setNotice] = useState(null);
  const [starting, setStarting] = useState(false);
  const [modelSource, setModelSource] = useState(null);
  const timer = useRef(null);
  // One idea of "authorized", shared with Deploy (VIS-1377). Until this the
  // tab's answer to a first-time user was the resolver's BYO error.
  const { authorized, host, working: authorizing, message: authMessage, authorize } =
    useAuthorization();
  // Whether this person has started talking. The resume below must never
  // overwrite a conversation they began while it was still asking the server
  // what the last one was.
  const spokeFirst = useRef(false);

  const stopPolling = useCallback(() => {
    if (timer.current) {
      clearInterval(timer.current);
      timer.current = null;
    }
  }, []);

  useEffect(() => stopPolling, [stopPolling]);

  const poll = useCallback(
    sessionId => {
      stopPolling();
      let consecutiveFailures = 0;
      const check = async () => {
        try {
          const latest = await fetchAgentSession(sessionId, projectId);
          consecutiveFailures = 0;
          if (!latest) return;
          setSession(latest);
          if (!isActive(latest)) stopPolling();
        } catch (error) {
          // One failed poll is not a failed session — the next may work. But
          // a poll that keeps failing is not a blip, it is broken, and
          // swallowing it forever is how a bad URL looked like an agent that
          // never answered.
          consecutiveFailures += 1;
          if (consecutiveFailures >= POLL_FAILURES_BEFORE_GIVING_UP) {
            stopPolling();
            setNotice({
              kind: 'error',
              text: `Lost contact with the agent: ${error.message}`,
            });
          }
        }
      };
      // Once immediately: a loop that answers in under a second should not
      // look like it is still working for a second.
      check();
      timer.current = setInterval(check, POLL_MS);
    },
    [stopPolling, projectId]
  );

  // The conversation this project was having, picked up where it left off.
  //
  // Both backends already store it — rows in cloud, the serve process's memory
  // locally — and both already answer with a list. Nothing read it, so a
  // reload or a trip to another tab lost a transcript that was sitting on the
  // server the whole time.
  useEffect(() => {
    let current = true;
    const resume = async () => {
      try {
        const sessions = await listAgentSessions({ projectId });
        if (!current || spokeFirst.current || !sessions?.length) return;
        // An active turn first: a reload mid-turn is exactly the moment this
        // feels like lost work. Otherwise the most recent conversation, shown
        // but not polled — there is nothing to wait for.
        const wanted = sessions.find(candidate => ACTIVE.includes(candidate.state)) || sessions[0];
        // The list omits transcripts by design, so the one being resumed has
        // to be fetched whole.
        const full = await fetchAgentSession(wanted.id, projectId);
        if (!current || spokeFirst.current || !full) return;
        setSession(full);
        if (isActive(full)) poll(full.id);
      } catch {
        // A project with no agent history is the ordinary case, and a list
        // that cannot be read is not worth interrupting someone with: they
        // came here to ask for something, and Send still works.
      }
    };
    resume();
    return () => {
      current = false;
    };
  }, [projectId, poll]);

  const onSend = async () => {
    const asked = prompt.trim();
    if (!asked || starting) return;
    spokeFirst.current = true;
    setStarting(true);
    setNotice(null);
    try {
      const result = await startAgentSession({
        projectId,
        prompt: asked,
        sessionId: session?.id,
      });
      if (result.unconfigured) {
        setNotice({ kind: 'configure', text: result.unconfigured });
        return;
      }
      if (result.limitReached) {
        setNotice({ kind: 'limit', text: result.limitReached });
        return;
      }
      if (result.sessionGone) {
        // Drop the dead id so the next Send starts a conversation rather than
        // failing the same way again.
        setSession(null);
        setNotice({ kind: 'gone', text: `${result.sessionGone} Send again to start a new one.` });
        return;
      }
      if (result.busy) {
        setSession(result.busy);
        setNotice({ kind: 'busy', text: 'An agent is already working. Stop it first.' });
        poll(result.busy.id);
        return;
      }
      setPrompt('');
      setSession(result.session);
      setModelSource(result.session.model_source || null);
      poll(result.session.id);
    } catch (error) {
      setNotice({ kind: 'error', text: error.message });
    } finally {
      setStarting(false);
    }
  };

  const onStop = async () => {
    if (!session) return;
    try {
      const result = await cancelAgentSession(session.id, projectId);
      setSession(result.session);
      stopPolling();
    } catch (error) {
      setNotice({ kind: 'error', text: error.message });
    }
  };

  const running = isActive(session);

  // Not signed in and nothing said yet: offer the one click that fixes it
  // rather than a prompt box that will answer with instructions. Once there
  // IS a conversation the box stays, because hiding someone's transcript
  // behind a login is worse than a Send that explains itself.
  if (authorized === false && !session) {
    return (
      <AgentAuthorize
        host={host}
        working={authorizing}
        message={authMessage}
        onAuthorize={authorize}
      />
    );
  }

  return (
    <div
      className="bg-white border border-gray-200 rounded-lg p-4 mb-4"
      data-testid="agent-prompt"
    >
      <label htmlFor="agent-prompt-input" className="sr-only">
        What should the agent do?
      </label>
      <textarea
        id="agent-prompt-input"
        value={prompt}
        onChange={event => setPrompt(event.target.value)}
        onKeyDown={event => {
          // Enter sends; Shift+Enter is a newline. A prompt is usually one
          // line, and reaching for the mouse to send it is friction.
          if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault();
            onSend();
          }
        }}
        disabled={running}
        rows={3}
        placeholder={session?.transcript?.length ? REPLY_PLACEHOLDER : FIRST_PLACEHOLDER}
        className="w-full resize-y rounded-md border border-gray-300 p-2 text-sm focus:border-primary focus:outline-none disabled:bg-gray-50 disabled:text-gray-400"
      />

      <div className="flex items-center gap-3 mt-2">
        {running ? (
          <button
            onClick={onStop}
            data-testid="agent-stop"
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-highlight rounded-md hover:bg-highlight-700 focus:outline-none"
          >
            <FiSquare size={13} /> Stop
          </button>
        ) : (
          <button
            onClick={onSend}
            disabled={!prompt.trim() || starting}
            data-testid="agent-send"
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-primary rounded-md hover:bg-primary-700 focus:outline-none disabled:bg-gray-300"
          >
            <FiSend size={13} /> {starting ? 'Starting…' : 'Send'}
          </button>
        )}
        {running && (
          <span className="text-sm text-gray-500" data-testid="agent-working">
            Working… every change lands as a draft you can review.
          </span>
        )}
      </div>

      {notice && (
        <div
          className={`mt-3 rounded-md p-3 text-sm ${
            notice.kind === 'configure'
              ? 'bg-blue-50 text-blue-900 whitespace-pre-line'
              : 'bg-highlight-50 text-highlight-900'
          }`}
          data-testid={`agent-notice-${notice.kind}`}
        >
          {notice.text}
        </div>
      )}

      {session && !running && session.state !== 'queued' && session.state !== 'succeeded' && (
        <Outcome session={session} />
      )}

      {session?.transcript?.length > 0 && (
        <Transcript entries={session.transcript} running={running} />
      )}

      {modelSource && (
        <div className="mt-2 text-xs text-gray-400" data-testid="agent-model-source">
          {modelSource === 'visivo_cloud'
            ? 'Using your Visivo account — see Agent Usage for what it costs.'
            : 'Using your own API key.'}
        </div>
      )}
    </div>
  );
};

/**
 * Exchanges newest first, so the latest answer is under the prompt box without
 * scrolling; within an exchange the question stays above its answer.
 */
const exchangesNewestFirst = entries => {
  const exchanges = [];
  entries.forEach((entry, index) => {
    if (entry.role === 'user' || exchanges.length === 0) exchanges.push([]);
    exchanges[exchanges.length - 1].push({ entry, index });
  });
  return exchanges.reverse();
};

function Transcript({ entries, running }) {
  return (
    <div className="mt-3 space-y-2" data-testid="agent-transcript">
      {exchangesNewestFirst(entries).map((exchange, position) => (
        <React.Fragment key={exchange[0].index}>
          {exchange.map(({ entry, index }) => (
            <Turn key={`${entry.at}-${index}`} entry={entry} />
          ))}
          {position === 0 && running && (
            <div className="px-3 text-sm text-gray-400" data-testid="agent-thinking">
              Thinking…
            </div>
          )}
        </React.Fragment>
      ))}
    </div>
  );
}

function Turn({ entry }) {
  return (
    <div
      className={
        entry.role === 'user'
          ? 'rounded-md bg-gray-100 p-3 text-sm text-gray-900'
          : 'rounded-md bg-gray-50 p-3 text-sm text-gray-800'
      }
      data-testid={`agent-turn-${entry.role}`}
    >
      <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-400">
        {entry.role === 'user' ? 'You' : 'Agent'}
      </div>
      {/* Above the answer, so a turn reads as ask -> work -> result. An
          answer with no visible work is what made the agent look like it
          had done nothing. */}
      <AgentToolCalls actions={entry.actions} />
      {entry.text}
    </div>
  );
}

function Outcome({ session }) {
  if (session.state === 'cancelled') {
    return (
      <div className="mt-3 text-sm text-gray-500" data-testid="agent-cancelled">
        Stopped. Anything it had already written is still there as a draft.
      </div>
    );
  }
  // A spend limit is not a broken agent, and the same word arrives whether the
  // turn was refused before it started or ran into the limit mid-way.
  if (session.action === 'inference_limit_reached') {
    return (
      <div
        className="mt-3 rounded-md bg-blue-50 p-3 text-sm text-blue-900"
        data-testid="agent-limit-reached"
      >
        {session.error}
      </div>
    );
  }
  return (
    <div className="mt-3 rounded-md bg-highlight-50 p-3 text-sm text-highlight-900" data-testid="agent-failed">
      {session.error || 'The agent failed.'}
    </div>
  );
}

export default AgentPrompt;
