/**
 * Plain copy for an agent failure, in place of the raw error.
 *
 * The raw text is never dropped: it is returned as `details` so the caller can
 * keep it behind a "Show details" control. Local and cloud both use this, so a
 * class must only promise a recovery that the viewer actually offers.
 *
 * Contexts:
 *   - 'turn'  — a session ended in `failed` (the default)
 *   - 'start' — the request to start a turn failed
 *   - 'stop'  — the request to stop a turn failed
 *   - 'poll'  — polling the session failed repeatedly
 */

export const AGENT_FAILURE_COPY = {
  provider_busy: {
    headline: 'The AI model is busy right now.',
    hint: 'Wait a minute, then send your message again. Your drafts are kept.',
  },
  provider_error: {
    headline: 'The AI model service had an error.',
    hint: 'Send your message again. If this continues, the provider can have an outage.',
  },
  timeout: {
    headline: 'The AI model took too long to answer.',
    hint: 'Send your message again. Your drafts are kept.',
  },
  connection: {
    headline: 'Visivo could not reach the AI model.',
    hint: 'Check your network connection, then send your message again.',
  },
  auth: {
    headline: 'The AI provider did not accept the credentials.',
    hint: 'Check the API key that the agent uses, then send your message again.',
  },
  inference_unavailable: {
    headline: 'Visivo-supplied AI is not available on this server.',
    hint: 'Set your own provider key to continue.',
  },
  turn_limit: {
    headline: 'The agent did the maximum work for one message.',
    hint: 'What it finished is in your drafts. Send the next step as a new message. The agent keeps the conversation.',
  },
  too_large: {
    headline: 'This conversation is too long to send.',
    hint: 'The work so far is saved as drafts. Review them in the Workspace.',
  },
  content_filter: {
    headline: 'The AI model did not complete this request.',
    hint: 'Change the words of your request, then send it again.',
  },
  lost_contact: {
    headline: 'Lost contact with the agent.',
    hint: 'The agent can still be working. Reload the page to see its progress.',
  },
  start_failed: {
    headline: 'The agent could not start.',
    hint: 'Send your message again.',
  },
  stop_failed: {
    headline: 'The agent could not be stopped.',
    hint: 'Wait for it to finish, or reload the page and try again.',
  },
  unknown: {
    headline: 'The agent stopped because of an error.',
    hint: 'Send your message again. Your drafts are kept.',
  },
};

const PROGRESS_LINES = {
  queued: 'Waiting for the agent to start…',
  running: 'Working… every change lands as a draft you can review.',
};

export function agentProgressLine(state) {
  return PROGRESS_LINES[state] || null;
}

const TEXT_CLASSES = [
  ['inference_unavailable', /Visivo-supplied inference is/i],
  ['turn_limit', /limit of what one turn may do|reached its budget of \d+ model requests/i],
  ['too_large', /grown too large to send|request entity too large/i],
  ['content_filter', /content.?filter/i],
];

const STATUS_PATTERN = /(?:status[_ ]?code\W{0,3}|error code\W{0,3}|TurnFailed\W{0,3}|HTTP\W{0,3})(\d{3})\b/i;

const FALLBACK_TEXT_CLASSES = [
  ['timeout', /timed? ?out|timeout|deadline exceeded/i],
  [
    'connection',
    /connection|connect error|ECONN|ENOTFOUND|network|failed to fetch|name resolution/i,
  ],
  ['auth', /api[ _-]?key|unauthori[sz]ed|authentication|permission denied/i],
  ['provider_busy', /overloaded|rate limit|too many requests/i],
];

export function statusOf(message) {
  const match = STATUS_PATTERN.exec(message);
  return match ? Number(match[1]) : null;
}

function classifyStatus(status) {
  if (status === 413) return 'too_large';
  if (status === 401 || status === 403) return 'auth';
  if (status === 408 || status === 504) return 'timeout';
  if ([429, 503, 529].includes(status)) return 'provider_busy';
  if (status === 500 || status === 502) return 'provider_error';
  return null;
}

function firstMatch(classes, message) {
  const hit = classes.find(([, pattern]) => pattern.test(message));
  return hit ? hit[0] : null;
}

export function classifyAgentFailure(rawMessage, context = 'turn') {
  const message = rawMessage == null ? '' : String(rawMessage);
  if (context === 'poll') return 'lost_contact';
  if (context === 'stop') return 'stop_failed';
  return (
    firstMatch(TEXT_CLASSES, message) ||
    classifyStatus(statusOf(message)) ||
    firstMatch(FALLBACK_TEXT_CLASSES, message) ||
    (context === 'start' ? 'start_failed' : 'unknown')
  );
}

/**
 * @param {string} rawMessage
 * @param {'turn'|'start'|'stop'|'poll'} [context]
 * @returns {{code: string, headline: string, hint: string, details: string}}
 */
export function describeAgentFailure(rawMessage, context = 'turn') {
  const code = classifyAgentFailure(rawMessage, context);
  return {
    code,
    ...AGENT_FAILURE_COPY[code],
    details: rawMessage == null ? '' : String(rawMessage),
  };
}
