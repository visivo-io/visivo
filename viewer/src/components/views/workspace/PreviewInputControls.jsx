import React from 'react';
import Input from '../../items/Input';
import { getTypeColors, getTypeIcon } from '../common/objectTypeConfigs';

/**
 * PreviewInputControls — VIS-1003 / design §5 + §8.3.
 *
 * Pure presentational strip of `<Input>` widgets rendered ABOVE a preview body
 * (chart / table / insight) and OUTSIDE the `<Chart>`/`<Table>` spinner gate, so
 * a value is always suppliable even while the body is loading. Renders `null`
 * when there are no input dependencies — a no-dependency object shows no chrome.
 *
 * The input-type chip (icon + "Input" label) is sourced from the shared
 * `objectTypeConfigs` palette (never hand-rolled colors) so it matches every
 * other input surface in the app.
 *
 * @param {Object} props
 * @param {Object[]} props.inputConfigs - Resolved `<Input>` configs (from usePreviewInputDependencies)
 * @param {string} props.projectId
 */
const PreviewInputControls = ({ inputConfigs, projectId }) => {
  if (!inputConfigs || inputConfigs.length === 0) return null;

  const colors = getTypeColors('input');
  const InputIcon = getTypeIcon('input');

  return (
    <div
      className="flex flex-wrap items-center gap-2 border-b border-gray-200 bg-gray-50 p-3"
      data-testid="input-controls-section"
    >
      <span
        className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs font-medium ${colors.bg} ${colors.text} ${colors.border}`}
        data-testid="preview-input-type-chip"
      >
        <InputIcon sx={{ fontSize: 14 }} />
        Inputs
      </span>
      {inputConfigs.map(input => (
        <Input key={input.name} input={input} projectId={projectId} itemWidth={1} />
      ))}
    </div>
  );
};

export default PreviewInputControls;
