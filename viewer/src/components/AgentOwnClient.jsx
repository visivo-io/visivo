import React, { useRef, useState } from 'react';
import { HiChevronRight } from 'react-icons/hi';

const DOCS_URL = 'https://docs.visivo.io/ai/mcp/';
const DEFAULT_ORIGIN = 'http://localhost:8000';

const VISIVO_HOST = /(^|\.)visivo\.io$/i;

/**
 * Whether to offer a bring-your-own-client setup at all.
 *
 * TEMPORARY, and removed by VIS-1665. The snippets below are built from the
 * page origin, so in cloud they hand out `https://app.visivo.io/api/mcp/` --
 * a route core does not serve. Telling someone to point Claude Code at an
 * endpoint that 404s is worse than not mentioning it, so cloud says nothing
 * until that endpoint exists. Local `visivo serve` is unaffected.
 */
export const offersOwnClient = (hostname = window.location.hostname) =>
  !VISIVO_HOST.test(hostname || '');

export const mcpUrl = (origin = window.location.origin) =>
  `${origin && origin !== 'null' ? origin : DEFAULT_ORIGIN}/api/mcp/`;

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

// Collapsed until asked for: the panel is help, and leaving it open made
// wiring up a third-party client look like the expected way to start rather
// than one option. An inline disclosure rather than a layer over the page, so
// Escape has nothing to close here.
const AgentOwnClient = ({ hostname }) => {
  const [open, setOpen] = useState(false);

  // `hostname` is for tests; undefined reads window.location.
  if (!offersOwnClient(hostname)) return null;

  const snippets = buildSnippets(mcpUrl());
  return (
    <section
      aria-labelledby="agent-own-client-heading"
      className="mb-4"
      data-testid="agent-own-client"
    >
      <h2>
        <button
          type="button"
          onClick={() => setOpen(current => !current)}
          aria-expanded={open}
          aria-controls="agent-own-client-panel"
          className="flex items-center gap-1.5 py-1 text-left text-gray-500 hover:text-gray-700"
        >
          <span id="agent-own-client-heading" className="text-sm">Use your own agent</span>
          <HiChevronRight
            aria-hidden="true"
            className={`h-4 w-4 shrink-0 transition-transform duration-200 ${
              open ? 'rotate-90' : ''
            }`}
          />
        </button>
      </h2>
      {open && (
        <div id="agent-own-client-panel" className="mt-2">
          <p className="mb-3 text-sm text-gray-600">
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
        </div>
      )}
    </section>
  );
};

export default AgentOwnClient;
