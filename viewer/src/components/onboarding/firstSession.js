/* The AI-led first session that a ready source opens (VIS-1759). */

import { readOnboardingState, writeOnboardingState } from './onboardingState';

export const FIRST_SESSION_PARAM = 'first_session';

export function firstSessionPath(source) {
  return `/agent?${FIRST_SESSION_PARAM}=${encodeURIComponent(source)}`;
}

export function firstSessionPrompt(source) {
  return [
    `I just added the source "${source}". This is my first session.`,
    '1. Check the data: list its tables with row counts, columns and types, and tell me about problems such as a wrong header, delimiter or sheet. Ask me before you fix one.',
    '2. Give me two or three short observations about the data, each backed by a query I can open.',
    '3. Ask me what else I want to know, and suggest a few questions this data can answer.',
    'Then build my first dashboard from my answer, as a draft. Do not commit.',
  ].join('\n');
}

export function recordFirstSessionRequest(state, source) {
  return { ...state, first_session: { source, requested_at: new Date().toISOString() } };
}

/** True while the session for `source` has been asked for but not yet sent. */
export function firstSessionPending(source) {
  const session = readOnboardingState()?.first_session;
  return Boolean(source && session?.source === source && !session.started_at);
}

export function markFirstSessionStarted() {
  const state = readOnboardingState() || {};
  if (!state.first_session) return;
  writeOnboardingState({
    ...state,
    first_session: { ...state.first_session, started_at: new Date().toISOString() },
  });
}
