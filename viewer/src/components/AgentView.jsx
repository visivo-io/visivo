import React, { useEffect, useMemo, useState } from 'react';
import useStore from '../stores/store';
import AgentPrompt from './AgentPrompt';
import { fetchAgentActions } from '../api/agent';
import { subscribe, canDeliver } from '../events/eventSource';
import { AGENT_ACTIONS } from '../events/topics';
import AgentToolCalls from './AgentToolCalls';

/**
 * The Agent tab: any calls an external MCP client made, then the conversation
 * with the built-in loop, with its prompt box last.
 *
 * The loop's calls already sit under the turn that made them, so only calls the
 * server attributes to MCP are listed here, grouped the same way. Calls with no
 * attribution — the cloud runner's — are the loop's and are never repeated.
 *
 * Subscribed through the event-source seam rather than a timer of its own, so
 * when `visivo serve` starts emitting on its socket this view does not change.
 */

function ExternalCalls({ actions }) {
  return (
    <section
      aria-labelledby="agent-external-calls-heading"
      className="bg-white border border-gray-200 rounded-lg p-4 mb-4"
      data-testid="agent-external-calls"
    >
      <div className="rounded-md bg-gray-50 p-3 text-sm text-gray-800">
        <h2
          id="agent-external-calls-heading"
          className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-400"
        >
          External MCP calls
        </h2>
        <AgentToolCalls actions={actions} />
      </div>
    </section>
  );
}

const AgentView = () => {
  const projectId = useStore(state => state.project?.id);
  const topic = useMemo(() => AGENT_ACTIONS(fetchAgentActions, projectId), [projectId]);
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
    fetchAgentActions({ projectId })
      .then(fetched => current && setActions(fetched))
      .catch(() => current && setError('Could not read external MCP activity.'));

    const unsubscribe = subscribe(topic, fetched => {
      if (!current) return;
      setActions(fetched);
      setError(null);
    });

    return () => {
      current = false;
      unsubscribe();
    };
  }, [topic, projectId]);

  // The log is newest first; a group of calls reads in the order they happened.
  const external = (actions || []).filter(action => action.source === 'mcp').reverse();

  return (
    <div className="min-h-full bg-gray-50 p-6">
      <h1 className="sr-only">Agent</h1>
      {error && (
        <p className="mb-4 text-sm text-highlight-700" data-testid="agent-view-error">
          {error}
        </p>
      )}
      {external.length > 0 && <ExternalCalls actions={external} />}
      <AgentPrompt />
    </div>
  );
};

export default AgentView;
