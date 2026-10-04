import React from 'react';
import AgentObjectLink from './AgentObjectLink';

/**
 * Tool calls, collapsed: under the agent turn that made them, or under
 * "External MCP calls" for a client's.
 *
 * Collapsed because the answer is the point and fifteen tool calls above it
 * bury that — but present, because an answer with no evidence of work is
 * indistinguishable from one that did none.
 */
function AgentToolCalls({ actions }) {
  if (!actions?.length) return null;
  const failed = actions.filter(action => action.outcome === 'error').length;
  return (
    <details className="mb-2 rounded border border-gray-200 bg-white" data-testid="agent-turn-actions">
      <summary className="cursor-pointer select-none px-2 py-1 text-xs text-gray-500 hover:text-gray-700">
        {actions.length} tool call{actions.length === 1 ? '' : 's'}
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
            className="flex items-center gap-2 flex-wrap px-2 py-1 text-xs border-b border-gray-50 last:border-0"
            data-testid="agent-turn-action"
          >
            {action.outcome === 'error' && (
              <span className="text-highlight-700 font-medium">failed</span>
            )}
            <code className="text-gray-700">{action.tool}</code>
            {action.object && <AgentObjectLink object={action.object} />}
            {action.outcome === 'error' && action.error && (
              <span className="text-highlight-700 break-words">{action.error}</span>
            )}
          </li>
        ))}
      </ul>
    </details>
  );
}

export default AgentToolCalls;
