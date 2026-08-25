const Error = ({ children }) => {
  // In-flow and BELOW the top nav's z-50 — never `fixed` at the same z-index.
  // The old fixed overlay painted over Commit / Deploy / New object / the tab
  // strip and swallowed their clicks on every parse error, locking the user
  // out of the exact controls they needed to recover (M15).
  return (
    <div role="alert" className="sticky top-0 z-40 mx-1 mt-1 flex justify-center items-center p-4 bg-highlight-100 rounded-lg shadow-md max-h-48 overflow-y-auto">
      <p className="text-highlight-600 font-semibold text-center">{children}</p>
    </div>
  );
};

export default Error;
