import React, { useCallback, useEffect, useRef, useState } from 'react';
import { FiSend, FiSquare } from 'react-icons/fi';
import { cancelAgentSession, fetchAgentSession, startAgentSession } from '../api/agent';

/**
 * Asking the built-in loop for something.
 *
 * The loop runs in the background and this polls it, because a model call
 * takes as long as it takes — a request held open for one dies in whatever
 * proxy sits between. What the agent DOES appears in the activity log below;
 * this is only the ask, the state and the answer.
 *
 * Stop is a first-class control rather than a menu item: a running loop the
 * user cannot stop is not shippable, and the moment they want it is the moment
 * it is doing something they did not intend.
 */

const POLL_MS = 1000;
const ACTIVE = ['queued', 'running'];

const isActive = session => Boolean(session) && ACTIVE.includes(session.state);

const AgentPrompt = () => {
  const [prompt, setPrompt] = useState('');
  const [session, setSession] = useState(null);
  const [notice, setNotice] = useState(null);
  const [starting, setStarting] = useState(false);
  const timer = useRef(null);

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
      const check = async () => {
        try {
          const latest = await fetchAgentSession(sessionId);
          if (!latest) return;
          setSession(latest);
          if (!isActive(latest)) stopPolling();
        } catch {
          // A failed poll is not a failed session — the next one may work.
        }
      };
      // Once immediately: a loop that answers in under a second should not
      // look like it is still working for a second.
      check();
      timer.current = setInterval(check, POLL_MS);
    },
    [stopPolling]
  );

  const onSend = async () => {
    const asked = prompt.trim();
    if (!asked || starting) return;
    setStarting(true);
    setNotice(null);
    try {
      const result = await startAgentSession({ prompt: asked });
      if (result.unconfigured) {
        setNotice({ kind: 'configure', text: result.unconfigured });
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
      const result = await cancelAgentSession(session.id);
      setSession(result.session);
      stopPolling();
    } catch (error) {
      setNotice({ kind: 'error', text: error.message });
    }
  };

  const running = isActive(session);

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
        rows={2}
        placeholder="Ask the agent to build or change something — e.g. “add a model for monthly revenue over the orders source”"
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

      {session && !running && session.state !== 'queued' && (
        <Outcome session={session} />
      )}
    </div>
  );
};

function Outcome({ session }) {
  if (session.state === 'succeeded') {
    return (
      <div className="mt-3 rounded-md bg-gray-50 p-3 text-sm text-gray-800" data-testid="agent-output">
        {session.output}
      </div>
    );
  }
  if (session.state === 'cancelled') {
    return (
      <div className="mt-3 text-sm text-gray-500" data-testid="agent-cancelled">
        Stopped. Anything it had already written is still there as a draft.
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
