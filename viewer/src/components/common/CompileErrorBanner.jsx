import React from 'react';
import { useLoaderData } from 'react-router-dom';
import { HiOutlineExclamationTriangle } from 'react-icons/hi2';

const MAX_ERRORS_SHOWN = 5;

/**
 * Renders a banner at the top of the viewer when target/error.json indicates
 * the latest compile failed. The banner explains that the dashboard below is
 * the last-known-good state and lists up to the first 5 validation errors
 * (file:line included when the YAML parser was able to resolve them).
 *
 * Returns null when there is no compile failure so it's safe to drop into any
 * route element unconditionally.
 */
const CompileErrorBanner = () => {
  // The route loader (`loadError`) hands us the parsed error.json. When the
  // file is empty {} this contract still returns an object, just one without
  // `compile_failed`.
  const errorData = useLoaderData();

  if (!errorData || !errorData.compile_failed) {
    return null;
  }

  const errors = Array.isArray(errorData.errors) ? errorData.errors : [];
  const visibleErrors = errors.slice(0, MAX_ERRORS_SHOWN);
  const hiddenCount = errors.length - visibleErrors.length;

  return (
    <div
      role="alert"
      data-testid="compile-error-banner"
      className="mx-4 my-3 rounded-lg border-l-4 border-highlight-500 bg-highlight-100 p-4 shadow-md"
    >
      <div className="flex items-start space-x-3">
        <HiOutlineExclamationTriangle
          className="mt-0.5 h-6 w-6 flex-shrink-0 text-highlight-600"
          aria-hidden="true"
        />
        <div className="flex-1 min-w-0">
          <h3 className="text-base font-semibold text-highlight-900">
            Project compile failed — last good state shown below
          </h3>
          {errorData.summary && (
            <p className="mt-1 text-sm text-highlight-800">{errorData.summary}</p>
          )}
          {visibleErrors.length > 0 && (
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-highlight-800">
              {visibleErrors.map((err, i) => (
                <li key={i}>
                  <code className="rounded bg-highlight-200 px-1 py-0.5 text-highlight-900">
                    {Array.isArray(err.loc) ? err.loc.join('.') : ''}
                  </code>
                  : {(err.msg || '').replace(/^Value error,\s*/, '')}
                  {err.file && err.line && (
                    <span className="ml-1 text-highlight-700">
                      ({err.file.split('/').pop()}:{err.line})
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
          {hiddenCount > 0 && (
            <p className="mt-2 text-sm text-highlight-700">
              ... and {hiddenCount} more. See terminal for full list.
            </p>
          )}
        </div>
      </div>
    </div>
  );
};

export default CompileErrorBanner;
