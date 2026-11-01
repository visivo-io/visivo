import React, { useCallback, useEffect, useRef } from 'react';
import { envRefName, toEnvRef } from '../../utils/contextString';

// The `${env.NAME}` grammar lives in utils/contextString.js with the rest of it
// (and mirrors query/patterns.py). Re-exported under the names this corner of
// the app already used, so nothing else has to care where it moved.
export const toSecretRef = toEnvRef;
export const secretRefName = envRefName;

/**
 * Choose which account secret a source field reads from.
 *
 * The config only ever stores a `${env.NAME}` reference; the value itself lives
 * in the account's secret store and is injected into the run.
 *
 * This used to offer "New secret…", which dropped you into a free-text box to
 * type a NAME. It never created anything — it wrote a reference to a secret
 * that might not exist, and the source then failed at run time with nothing on
 * screen to explain why. Creating a secret happens on the secrets page, so that
 * is where this sends you.
 *
 * The list refreshes so the round trip works: open the secrets page in a new
 * tab, add one, come back, and it is in the dropdown. `focus` on the window is
 * what makes that true — it fires when you switch back — and the select's own
 * focus/pointer covers adding one without ever leaving the tab.
 */
const SecretPicker = ({
  field,
  value,
  onChange,
  secretKeys = [],
  error,
  secretsUrl,
  onRefreshSecrets,
}) => {
  const selected = envRefName(value);
  const hasSecrets = secretKeys.length > 0;

  // Held in a ref so the window listener subscribes once rather than
  // re-subscribing whenever the caller passes a new closure.
  const refreshRef = useRef(onRefreshSecrets);
  refreshRef.current = onRefreshSecrets;
  const refresh = useCallback(() => refreshRef.current?.(), []);

  useEffect(() => {
    // Both signals for coming back to the tab. `focus` is the one that fires on
    // an ordinary tab switch; `visibilitychange` is the one that still fires
    // when the window never lost focus in the OS sense (a second monitor, some
    // window managers), and is what headless drivers dispatch.
    const onVisible = () => {
      if (document.visibilityState === 'visible') refresh();
    };
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [refresh]);

  // Match the floating notched-border label used by the other source fields.
  const controlClass = `block w-full px-3 py-2.5 text-sm text-gray-900 bg-white rounded-md border focus:outline-none focus:ring-2 focus:border-primary-500 ${
    error ? 'border-red-500 focus:ring-red-500' : 'border-gray-300 focus:ring-primary-500'
  }`;
  const labelBase = 'absolute left-2 z-10 origin-[0] bg-white px-1 text-sm duration-200 transform';
  const labelColor = error ? 'text-red-500' : 'text-gray-500';

  return (
    <div>
      <div className="relative">
        <select
          id={field.name}
          name={field.name}
          value={selected}
          onChange={e => onChange(field.name, e.target.value ? toEnvRef(e.target.value) : '')}
          onFocus={refresh}
          onMouseDown={refresh}
          className={controlClass}
        >
          <option value="">{hasSecrets ? 'Select a secret…' : 'No secrets yet'}</option>
          {secretKeys.map(key => (
            <option key={key} value={key}>
              {key}
            </option>
          ))}
        </select>
        {/* A select always holds a value, so the label stays notched up. */}
        <label
          htmlFor={field.name}
          className={`${labelBase} ${labelColor} top-2 -translate-y-4 scale-75`}
        >
          {field.label}
          {field.required && <span className="text-red-500 ml-0.5">*</span>}
        </label>
      </div>
      <p className="mt-1 text-xs text-gray-500">
        {hasSecrets
          ? 'Stored as a reference — the value never reaches the project.'
          : 'Add one on the secrets page, then reopen this list.'}
        {secretsUrl && (
          <>
            {' '}
            <a
              href={secretsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-primary-600 hover:underline"
            >
              Manage secrets
            </a>
          </>
        )}
      </p>
      {error && <p className="mt-1 text-xs text-red-500">{error}</p>}
    </div>
  );
};

export default SecretPicker;
