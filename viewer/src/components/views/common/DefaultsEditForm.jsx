import React, { useEffect } from 'react';
import useStore from '../../../stores/store';
import SelectionChip from '../workspace/SelectionChip';
import ProjectDefaultsEditForm from './ProjectDefaultsEditForm';

/**
 * DefaultsEditForm — VIS-809 (Track M M-3).
 *
 * The right-rail Edit-tab form for project `Defaults`. Thin wrapper that fronts
 * the existing <ProjectDefaultsEditForm> with a <SelectionChip> (matching every
 * other Edit-tab form) and resolves the singleton `defaults` record from the
 * store. The underlying form edits `source_name`, `threads`, the default alert,
 * telemetry, and the dashboard `levels` list, persisting through the
 * `saveDefaults` action (defaults-cache → publish flow). Theme is v2-deferred.
 *
 * There is no modal to close in the rail, so `onClose` is a no-op.
 */
const DefaultsEditForm = ({ name }) => {
  const defaults = useStore(s => s.defaults);
  const fetchDefaults = useStore(s => s.fetchDefaults);

  useEffect(() => {
    if (!defaults && fetchDefaults) fetchDefaults();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const noop = () => {};

  return (
    <>
      <SelectionChip type="defaults" name={name || 'Project settings'} subtitle="Project Settings" />
      <div data-testid="right-rail-edit-defaults" className="flex flex-1 flex-col overflow-hidden">
        <ProjectDefaultsEditForm defaults={defaults} onSave={noop} onClose={noop} />
      </div>
    </>
  );
};

export default DefaultsEditForm;
