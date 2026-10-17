import React, { useState } from 'react';

/**
 * A screenshot the agent took, under the tool call that took it.
 *
 * Without this the transcript says "the legend overlaps the title, moving it
 * below" and you have to take its word for it. With it you can see what it
 * saw when it decided that.
 *
 * Small by default — the capture is evidence beside the work, not the work —
 * and click to open it at full size, since the whole point of a full-page
 * capture is detail a thumbnail cannot carry.
 */
function AgentCapture({ src, dashboard }) {
  const [open, setOpen] = useState(false);
  const [broken, setBroken] = useState(false);

  // A capture is served off the serve output dir, which a `visivo run` can
  // clear. A dead <img> in the transcript reads as a bug in the agent rather
  // than a file that is no longer there.
  if (!src || broken) return null;

  const label = dashboard ? `Screenshot of ${dashboard}` : 'Screenshot the agent took';

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="block mt-1 rounded border border-gray-200 overflow-hidden hover:border-gray-400"
        title="Open at full size"
        data-testid="agent-capture"
      >
        <img
          src={src}
          alt={label}
          onError={() => setBroken(true)}
          className="block max-h-24 w-auto"
        />
      </button>
      {open && (
        <div
          role="dialog"
          aria-label={label}
          onClick={() => setOpen(false)}
          className="fixed inset-0 z-50 flex items-start justify-center overflow-auto bg-black/70 p-4"
          data-testid="agent-capture-full"
        >
          <img src={src} alt={label} className="max-w-full h-auto" />
        </div>
      )}
    </>
  );
}

export default AgentCapture;
