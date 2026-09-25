import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { fetchAgentActions } from '../api/agent';
import { subscribe, canDeliver } from '../events/eventSource';
import { AGENT_ACTIONS } from '../events/topics';
import { getTypeColors, getTypeIcon } from './views/common/objectTypeConfigs';

/**
 * What agents have done to this project.
 *
 * An activity log, not a transcript. The value is seeing what an agent
 * changed and being able to reach it — so every object reference is a link,
 * addressed the way the rest of the app addresses objects (`type:name`, the
 * identity the rename flow and the workspace edit param already use).
 *
 * Both producers land here: an external client over the serve-hosted MCP
 * endpoint and, later, the built-in loop. They share a log because they share
 * the registry — if only one of them appeared, the registry would be being
 * bypassed.
 *
 * Subscribed through the event-source seam rather than a timer of its own, so
 * when `visivo serve` starts emitting on its socket this view does not change.
 */

const topic = AGENT_ACTIONS(fetchAgentActions);

const when = timestamp =>
  timestamp ? new Date(timestamp * 1000).toLocaleTimeString() : '';

/** An object reference, rendered as somewhere you can go. */
function ObjectLink({ object }) {
  const { bg, text, border } = getTypeColors(object.type);
  const Icon = getTypeIcon(object.type);
  return (
    <Link
      to={`/workspace?edit=${encodeURIComponent(`${object.type}:${object.name}`)}`}
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded border text-xs font-medium ${bg} ${text} ${border} hover:underline`}
      data-testid={`agent-action-object-${object.name}`}
    >
      {Icon && <Icon className="shrink-0" size={12} />}
      {object.name}
    </Link>
  );
}

function Action({ action }) {
  const failed = action.outcome === 'error';
  return (
    <li
      className="flex items-start gap-3 px-4 py-3 border-b border-gray-100 last:border-0"
      data-testid={`agent-action-${action.id}`}
    >
      <span
        className={`mt-0.5 inline-block rounded-full px-2 py-0.5 text-xs font-medium shrink-0 ${
          failed ? 'bg-highlight-100 text-highlight-700' : 'bg-green-100 text-green-800'
        }`}
      >
        {failed ? 'failed' : 'ok'}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <code className="text-sm text-gray-900">{action.tool}</code>
          {action.object && <ObjectLink object={action.object} />}
        </div>
        {failed && action.error && (
          <p className="mt-1 text-xs text-highlight-700 break-words">{action.error}</p>
        )}
      </div>
      <span className="text-xs text-gray-400 shrink-0">{when(action.timestamp)}</span>
    </li>
  );
}

const AgentView = () => {
  const [actions, setActions] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!canDeliver(topic)) {
      // A dist build has no server for an agent to have worked through.
      setActions([]);
      return undefined;
    }
    let current = true;

    // Fetched once directly before subscribing, because the seam swallows a
    // failed poll on purpose — "a failed poll is not a failed subscription".
    // That is right for keeping a live view alive, but it means an unreachable
    // server and an empty log look identical, and they mean opposite things.
    // The first read is the one that can tell them apart.
    fetchAgentActions()
      .then(fetched => current && setActions(fetched))
      .catch(() => current && setError('Could not read agent activity.'));

    const unsubscribe = subscribe(topic, fetched => {
      if (!current) return;
      setActions(fetched);
      setError(null);
    });

    return () => {
      current = false;
      unsubscribe();
    };
  }, []);

  if (error) {
    return (
      <div className="min-h-full bg-gray-50 p-6 text-highlight-700" data-testid="agent-view-error">
        {error}
      </div>
    );
  }

  if (actions === null) {
    return (
      <div className="min-h-full bg-gray-50 p-6 text-gray-500" data-testid="agent-view-loading">
        Loading agent activity…
      </div>
    );
  }

  return (
    <div className="min-h-full bg-gray-50 p-6">
      <h1 className="text-lg font-medium text-gray-900 mb-1">Agent activity</h1>
      <p className="text-sm text-gray-500 mb-4">
        What agents have done in this session. Changes land as uncommitted
        drafts — review them in the Workspace before committing.
      </p>
      {actions.length === 0 ? (
        <div
          className="bg-white border border-gray-200 rounded-lg p-8 text-center text-gray-500"
          data-testid="agent-view-empty"
        >
          No agent activity yet. Connect an MCP client to this server and its
          work will appear here.
        </div>
      ) : (
        <ul
          className="bg-white border border-gray-200 rounded-lg overflow-hidden"
          data-testid="agent-actions"
        >
          {actions.map(action => (
            <Action key={action.id} action={action} />
          ))}
        </ul>
      )}
    </div>
  );
};

export default AgentView;
