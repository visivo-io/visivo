import { useState, useMemo, useCallback } from 'react';
import { PiCaretDown, PiCaretUp, PiSliders } from 'react-icons/pi';
import useStore from '../../stores/store';
import Input from '../items/Input';

const ExplorerInputsToolbar = ({ projectId }) => {
  const chartInputNames = useStore((s) => s.explorerChartInputNames);
  const storeInputs = useStore((s) => s.inputs || []);
  const [collapsed, setCollapsed] = useState(false);

  const inputConfigs = useMemo(
    () =>
      chartInputNames
        .map((name) => {
          const storeInput = storeInputs.find((i) => i.name === name);
          if (!storeInput) return null;
          // Flatten config into the input object so Input.jsx can read input.type, input.display, etc.
          return { name: storeInput.name, ...storeInput.config };
        })
        .filter(Boolean),
    [chartInputNames, storeInputs]
  );

  const handleToggle = useCallback(() => {
    setCollapsed((prev) => !prev);
    // Trigger Plotly resize after the toolbar expands/collapses
    requestAnimationFrame(() => {
      window.dispatchEvent(new Event('resize'));
    });
  }, []);

  if (inputConfigs.length === 0) return null;

  return (
    <div
      className="border-b border-gray-200 bg-gray-50 flex-shrink-0 relative z-1000"
      data-testid="explorer-inputs-toolbar"
    >
      <button
        type="button"
        onClick={handleToggle}
        className="flex items-center justify-between w-full px-3 py-1.5 text-xs font-medium text-gray-600 hover:text-gray-800 transition-colors"
      >
        <span className="flex items-center gap-1">
          <PiSliders size={12} />
          Inputs ({inputConfigs.length})
        </span>
        {collapsed ? <PiCaretDown size={12} /> : <PiCaretUp size={12} />}
      </button>
      {!collapsed && (
        <div className="flex flex-wrap gap-3 px-3 pb-2">
          {inputConfigs.map((input) => (
            <div key={input.name} className="min-w-[140px] max-w-[240px]">
              <Input input={input} projectId={projectId} itemWidth={1} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default ExplorerInputsToolbar;
