import React from 'react';
import AgentCapture from './AgentCapture';
import AgentObjectLink from './AgentObjectLink';

/**
 * Tool calls, collapsed: under the agent turn that made them, or under
 * "External MCP calls" for a client's.
 *
 * Collapsed because the answer is the point and fifteen tool calls above it
 * bury that — but present, because an answer with no evidence of work is
 * indistinguishable from one that did none.
 */
function AgentToolCalls({ actions, open }) {
  if (!actions?.length) return null;
  const failed = actions.filter(action => action.outcome === 'error').length;
  const running = actions.filter(action => action.outcome === 'pending').length;
  return (
    <details
      className="mb-2 rounded border border-gray-200 bg-white"
      // Open while the turn is working, so the work is visible without a
      // click; collapsed once it is done, because then the answer is the
      // point and fifteen tool calls above it bury that.
      open={open}
      data-testid="agent-turn-actions"
    >
      <summary className="cursor-pointer select-none px-2 py-1 text-xs text-gray-500 hover:text-gray-700">
        {actions.length} tool call{actions.length === 1 ? '' : 's'}
        {running > 0 && (
          <span className="ml-2 text-gray-400" data-testid="agent-turn-actions-running">
            working…
          </span>
        )}
        {failed > 0 && (
          <span className="ml-2 text-highlight-700" data-testid="agent-turn-actions-failed">
            {failed} failed
          </span>
        )}
      </summary>
      <ul className="border-t border-gray-100">
        {actions.map((action, index) => (
          <li
            key={action.id ?? index}
            className="px-2 py-1 text-xs border-b border-gray-50 last:border-0"
            data-testid="agent-turn-action"
          >
            <div className="flex items-center gap-2 flex-wrap">
              {action.outcome === 'error' && (
                <span className="text-highlight-700 font-medium">failed</span>
              )}
              {action.outcome === 'pending' && (
                <span
                  className="inline-block h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-gray-400"
                  data-testid="agent-action-pending"
                  aria-label="running"
                />
              )}
              <code className="text-gray-700">{action.tool}</code>
              {action.object && <AgentObjectLink object={action.object} />}
              {action.outcome === 'error' && action.error && (
                <span className="text-highlight-700 break-words">{action.error}</span>
              )}
            </div>
            {action.image_url && (
              <AgentCapture src={action.image_url} dashboard={action.object?.name} />
            )}
          </li>
        ))}
      </ul>
    </details>
  );
}

export default AgentToolCalls;
