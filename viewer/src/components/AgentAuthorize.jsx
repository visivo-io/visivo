import React from 'react';
import { FiArrowRight } from 'react-icons/fi';

/**
 * What the Agent tab shows before this serve has been authorized (VIS-1377).
 *
 * It used to show the resolver's error — "Set ANTHROPIC_API_KEY, or add
 * `agent: api_key:` to ~/.visivo/profile.yml" — which is accurate and asks a
 * first-time user to go and acquire a provider account, in a terminal, for
 * something this page can do itself in one click.
 *
 * So the trial leads and BYO follows. Bringing your own key stays because it
 * is real, it is what keeps working when the credit is gone, and it is what a
 * team that will not send prompts through us needs. It is just not the first
 * thing to ask of someone who has not seen the agent work yet.
 */
const AgentAuthorize = ({ host, working, message, onAuthorize }) => (
  <div
    className="bg-white border border-gray-200 rounded-lg p-6 mb-4"
    data-testid="agent-authorize"
  >
    <h2 className="text-base font-medium text-gray-900">Build with the agent</h2>
    <p className="mt-1 text-sm text-gray-600">
      Ask for a model, a chart, a dashboard. Everything it writes lands as an
      uncommitted draft for you to review before anything is committed.
    </p>

    <button
      onClick={onAuthorize}
      disabled={working}
      data-testid="agent-authorize-button"
      className="mt-4 inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-primary rounded-md hover:bg-primary-700 focus:outline-none disabled:bg-gray-300"
    >
      {working ? 'Authorizing…' : 'Connect your Visivo account'}
      {!working && <FiArrowRight size={14} />}
    </button>

    {host && (
      <p className="mt-2 text-xs text-gray-400" data-testid="agent-authorize-host">
        Connects this project to {host}.
      </p>
    )}

    {message && (
      <p className="mt-2 text-sm text-gray-500" data-testid="agent-authorize-message">
        {message}
      </p>
    )}

    {/* Below, and quieter. A real option — the one that keeps working when
        the credit runs out, and the one a team that will not send prompts
        through us needs — just not the first ask. Stated rather than waiting
        on a failed request to reveal it: the prompt box is not on screen
        here, so nothing can fail to produce the instructions. */}
    <details className="mt-4 border-t border-gray-100 pt-3" data-testid="agent-authorize-byo">
      <summary className="cursor-pointer select-none text-xs text-gray-500 hover:text-gray-700">
        Or use your own API key
      </summary>
      <div className="mt-2 space-y-1 text-xs text-gray-500">
        <p>Set a provider key in your environment before starting the server:</p>
        <code className="block rounded bg-gray-50 px-2 py-1 text-gray-700">
          export ANTHROPIC_API_KEY=…
        </code>
        <p>
          Or add one to <code className="text-gray-700">~/.visivo/profile.yml</code> under{' '}
          <code className="text-gray-700">agent: api_key:</code>.
        </p>
      </div>
    </details>
  </div>
);

export default AgentAuthorize;
