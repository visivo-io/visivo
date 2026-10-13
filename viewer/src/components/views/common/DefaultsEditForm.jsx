import React, { useEffect, useState } from 'react';
import useStore from '../../../stores/store';
import SelectionChip from '../workspace/SelectionChip';
import ProjectDefaultsEditForm from './ProjectDefaultsEditForm';
import ThemeEditForm from './ThemeEditForm';

const TABS = [
  { key: 'defaults', label: 'Defaults' },
  { key: 'theme', label: 'Theme' },
];

/**
 * Right-rail Edit-tab form for project-level settings: `defaults` and `theme`, each saved
 * as a draft until the next commit. The rail has no modal to close, so `onClose` is a no-op.
 */
const DefaultsEditForm = ({ name, initialTab = 'defaults' }) => {
  const defaults = useStore(s => s.defaults);
  const fetchDefaults = useStore(s => s.fetchDefaults);
  const [tab, setTab] = useState(initialTab);

  useEffect(() => {
    if (!defaults && fetchDefaults) fetchDefaults();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const noop = () => {};

  return (
    <>
      <SelectionChip type="defaults" name={name || 'Project settings'} subtitle="Project Settings" />
      <div role="tablist" aria-label="Project settings" className="flex gap-4 border-b border-gray-200 px-4">
        {TABS.map(({ key, label }) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={tab === key}
            onClick={() => setTab(key)}
            className={`-mb-px border-b-2 py-2 text-sm font-medium ${
              tab === key
                ? 'border-primary-500 text-gray-900'
                : 'border-transparent text-gray-500 hover:text-gray-800'
            }`}
          >
            {label}
          </button>
        ))}
      </div>
      <div data-testid="right-rail-edit-defaults" className="flex flex-1 flex-col overflow-hidden">
        {tab === 'defaults' ? (
          <ProjectDefaultsEditForm defaults={defaults} onSave={noop} onClose={noop} />
        ) : (
          <ThemeEditForm />
        )}
      </div>
    </>
  );
};

export default DefaultsEditForm;
