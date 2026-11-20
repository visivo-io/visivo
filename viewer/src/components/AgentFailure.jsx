import React, { useId, useState } from 'react';
import { describeAgentFailure } from '../utils/agentFailureCopy';

const AgentFailure = ({ error, context = 'turn', className = '', testId = 'agent-failure' }) => {
  const [open, setOpen] = useState(false);
  const detailsId = useId();
  const failure = describeAgentFailure(error, context);
  const hasDetails = failure.details.trim().length > 0;

  return (
    <div
      className={`rounded-md bg-highlight-50 p-3 text-sm text-highlight-900 ${className}`}
      data-testid={testId}
      data-failure-code={failure.code}
      role="alert"
    >
      <p className="font-medium">{failure.headline}</p>
      <p className="mt-1">{failure.hint}</p>
      {hasDetails && (
        <>
          <button
            type="button"
            onClick={() => setOpen(value => !value)}
            aria-expanded={open}
            aria-controls={detailsId}
            className="mt-2 text-xs font-medium text-highlight-800 underline hover:text-highlight-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-highlight-400 rounded"
            data-testid={`${testId}-toggle`}
          >
            {open ? 'Hide details' : 'Show details'}
          </button>
          {open && (
            <pre
              id={detailsId}
              className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap break-words rounded bg-white p-2 font-mono text-xs text-gray-800 border border-highlight-100"
              data-testid={`${testId}-details`}
            >
              {failure.details}
            </pre>
          )}
        </>
      )}
    </div>
  );
};

export default AgentFailure;
