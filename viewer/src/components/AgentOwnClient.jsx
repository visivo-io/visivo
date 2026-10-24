import React, { useRef, useState } from 'react';

const DOCS_URL = 'https://docs.visivo.io/ai/mcp/';
const DEFAULT_PORT = '8000';

export const mcpUrl = (port = window.location.port) =>
  `http://localhost:${port || DEFAULT_PORT}/api/mcp/`;

export const buildSnippets = url => [
  {
    id: 'claude',
    label: 'Claude Code',
    hint: 'Run from the project directory.',
    code: `claude mcp add --transport http visivo ${url}`,
  },
  {
    id: 'cursor',
    label: 'Cursor',
    hint: 'Merge into .cursor/mcp.json.',
    code: JSON.stringify({ mcpServers: { visivo: { url } } }, null, 2),
  },
  {
    id: 'gemini',
    label: 'Gemini CLI',
    hint: 'Merge into .gemini/settings.json.',
    code: JSON.stringify({ mcpServers: { visivo: { httpUrl: url } } }, null, 2),
  },
];

const Snippet = ({ snippet }) => {
  const codeRef = useRef(null);
  const [status, setStatus] = useState(null);

  const selectText = () => {
    const selection = window.getSelection?.();
    if (!selection || !codeRef.current) return;
    const range = document.createRange();
    range.selectNodeContents(codeRef.current);
    selection.removeAllRanges();
    selection.addRange(range);
  };

  const handleCopy = () => {
    const fallback = () => {
      selectText();
      setStatus('manual');
    };
    if (!navigator.clipboard?.writeText) {
      fallback();
      return;
    }
    navigator.clipboard
      .writeText(snippet.code)
      .then(() => setStatus('copied'))
      .catch(fallback);
  };

  return (
    <div data-testid={`agent-own-client-${snippet.id}`}>
      <div className="mb-1 flex items-center justify-between gap-2">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-gray-800">{snippet.label}</h3>
          <p className="text-xs text-gray-500">{snippet.hint}</p>
        </div>
        <button
          type="button"
          onClick={handleCopy}
          aria-label={`Copy ${snippet.label} snippet`}
          className="shrink-0 rounded-md border border-gray-300 bg-white px-2.5 py-1 text-xs font-medium text-gray-700 hover:bg-gray-100"
        >
          {status === 'copied' ? 'Copied' : 'Copy'}
        </button>
      </div>
      <pre
        ref={codeRef}
        className="overflow-x-auto rounded-md bg-gray-900 p-3 text-xs text-gray-100"
      >
        <code>{snippet.code}</code>
      </pre>
      {status === 'manual' && (
        <p role="status" className="mt-1 text-xs text-gray-600">
          Could not copy automatically. The snippet is selected: press Ctrl+C or Cmd+C.
        </p>
      )}
    </div>
  );
};

const AgentOwnClient = () => {
  const snippets = buildSnippets(mcpUrl());
  return (
    <section
      aria-labelledby="agent-own-client-heading"
      className="mb-4 rounded-lg border border-gray-200 bg-white p-4"
      data-testid="agent-own-client"
    >
      <h2 id="agent-own-client-heading" className="text-base font-semibold text-gray-800">
        Use your own agent
      </h2>
      <p className="mb-3 mt-1 text-sm text-gray-600">
        Connect Claude Code, Cursor or Gemini CLI to this project over MCP. Keep{' '}
        <code className="rounded bg-gray-100 px-1">visivo serve</code> running while the agent
        works.
      </p>
      <div className="space-y-4">
        {snippets.map(snippet => (
          <Snippet key={snippet.id} snippet={snippet} />
        ))}
      </div>
      <a
        href={DOCS_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-3 inline-block text-sm font-medium text-primary-600 underline"
      >
        Read the MCP guide
      </a>
    </section>
  );
};

export default AgentOwnClient;
