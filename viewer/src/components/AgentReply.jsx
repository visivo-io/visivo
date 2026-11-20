import React from 'react';
import MarkdownRenderer from 'react-markdown';
import remarkGfm from 'remark-gfm';

const ELEMENTS = {
  p: props => <p className="my-2 first:mt-0 last:mb-0" {...props} />,
  ul: props => <ul className="my-2 list-disc space-y-1 pl-5" {...props} />,
  ol: props => <ol className="my-2 list-decimal space-y-1 pl-5" {...props} />,
  h1: ({ children, ...props }) => (
    <h3 className="mb-1 mt-3 text-base font-semibold" {...props}>
      {children}
    </h3>
  ),
  h2: ({ children, ...props }) => (
    <h3 className="mb-1 mt-3 text-base font-semibold" {...props}>
      {children}
    </h3>
  ),
  h3: ({ children, ...props }) => (
    <h4 className="mb-1 mt-3 font-semibold" {...props}>
      {children}
    </h4>
  ),
  h4: ({ children, ...props }) => (
    <h4 className="mb-1 mt-3 font-semibold" {...props}>
      {children}
    </h4>
  ),
  a: ({ children, ...props }) => (
    <a
      className="text-primary underline hover:text-primary-700"
      target="_blank"
      rel="noopener noreferrer"
      {...props}
    >
      {children}
    </a>
  ),
  code: props => <code className="rounded bg-gray-100 px-1 font-mono text-[0.85em]" {...props} />,
  pre: props => (
    <pre
      className="my-2 overflow-x-auto rounded bg-gray-100 p-2 font-mono text-xs [&>code]:bg-transparent [&>code]:p-0"
      {...props}
    />
  ),
  blockquote: props => (
    <blockquote className="my-2 border-l-2 border-gray-300 pl-3 text-gray-600" {...props} />
  ),
  table: props => (
    <div className="my-2 overflow-x-auto">
      <table className="min-w-full border-collapse text-xs" {...props} />
    </div>
  ),
  th: props => (
    <th className="border border-gray-200 bg-gray-100 px-2 py-1 text-left font-semibold" {...props} />
  ),
  td: props => <td className="border border-gray-200 px-2 py-1" {...props} />,
};

const withoutNode = Component =>
  function Element({ node, ...rest }) {
    return Component(rest);
  };

const COMPONENTS = Object.fromEntries(
  Object.entries(ELEMENTS).map(([tag, render]) => [tag, withoutNode(render)])
);

/** The agent's words, as the Markdown the model writes. Raw HTML stays text. */
export default function AgentReply({ text, ...rest }) {
  if (!text) return null;
  return (
    <div className="break-words" {...rest}>
      <MarkdownRenderer remarkPlugins={[remarkGfm]} components={COMPONENTS}>
        {text}
      </MarkdownRenderer>
    </div>
  );
}
