import React, { useState, useEffect, useCallback, useRef } from 'react';
import { PiCaretDown, PiCaretRight, PiX, PiPencilSimple } from 'react-icons/pi';
import useStore from '../../../stores/store';
import PanelMenu from '../../common/PanelMenu';
import { getSchema } from '../../../schemas/schemas';
import ChartEditFormFields from '../common/ChartEditFormFields';

/**
 * ChartBuildSection — the Explorer Build-rail chart pane. VIS-1224: renders the
 * SAME standard chart edit panel as the RightRail (`ChartEditFormFields` —
 * Basic Information + Layout). It has NO insight-selection section: in the
 * Explorer the chart's insights ARE the stacked insight panes above it (added
 * via the rail's "+ Add Insight"), so there is nothing to pick or drop here.
 * Name edits write through `setChartName` live (editable only for an unsaved
 * chart; the ⋮ Rename focuses the Basic Information field).
 */
const ChartBuildSection = ({ isExpanded, onToggleExpand }) => {
  const isLoadedChart = useStore(s => (s.charts || []).some(c => c.name === s.explorerChartName));
  const chartName = useStore(s => s.explorerChartName);
  const chartLayout = useStore(s => s.explorerChartLayout);
  const setChartName = useStore(s => s.setChartName);
  const replaceChartLayout = useStore(s => s.replaceChartLayout);
  const closeChart = useStore(s => s.closeChart);

  const [layoutSchema, setLayoutSchema] = useState(null);
  const [renameValue, setRenameValue] = useState(chartName || '');
  const [renameError, setRenameError] = useState(null);
  const [isEditing, setIsEditing] = useState(false);
  const nameInputRef = useRef(null);

  // Keep the name buffer synced to the store while the user isn't actively
  // editing — the chart can be auto-named by ExplorationBuildRail's naming
  // effect (`setChartName`), and the field must reflect that.
  useEffect(() => {
    if (!isEditing) {
      setRenameValue(chartName || '');
      setRenameError(null);
    }
  }, [chartName, isEditing]);

  useEffect(() => {
    let cancelled = false;
    getSchema('layout').then(s => {
      if (!cancelled) setLayoutSchema(s);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // The ⋮ "Rename" action focuses the Basic Information name field.
  const startRename = useCallback(() => {
    nameInputRef.current?.focus();
    nameInputRef.current?.select();
  }, []);

  const commitRename = useCallback(() => {
    setIsEditing(false);
    const trimmed = renameValue.trim();
    if (!trimmed || trimmed === (chartName || '')) {
      setRenameError(null);
      setRenameValue(chartName || '');
      return;
    }
    try {
      setChartName(trimmed);
      setRenameError(null);
    } catch (err) {
      if (err?.code === 'NAME_COLLISION') {
        setRenameError(err.message);
        setIsEditing(true);
        return;
      }
      throw err;
    }
  }, [renameValue, chartName, setChartName]);

  const handleLayoutChange = useCallback(
    newValue => {
      if (!newValue || typeof newValue !== 'object') return;
      replaceChartLayout(newValue);
    },
    [replaceChartLayout]
  );

  const handleToggle = useCallback(
    e => {
      e.stopPropagation();
      onToggleExpand();
    },
    [onToggleExpand]
  );

  const handleClose = useCallback(
    e => {
      e.stopPropagation();
      closeChart?.();
    },
    [closeChart]
  );

  return (
    <div
      data-testid="chart-build-section"
      data-onb-target="chart-crud-section"
      className="border border-gray-200 rounded-lg overflow-hidden"
    >
      {/* VIS-1224: neutral collapsible header (the colored side-bar is gone —
          the body now renders the same standard chart edit panel as the
          RightRail). The editable name lives in the Basic Information field. */}
      <div
        data-testid="chart-header"
        onClick={onToggleExpand}
        className="flex items-center gap-2 px-3 py-2 bg-gray-50 border-b border-gray-200 cursor-pointer hover:bg-gray-100 transition-colors duration-150"
      >
        <button
          data-testid="chart-toggle"
          onClick={handleToggle}
          className="flex-shrink-0 text-gray-500 hover:text-gray-700"
        >
          {isExpanded ? <PiCaretDown size={14} /> : <PiCaretRight size={14} />}
        </button>

        <span className="flex-1 truncate text-sm font-medium text-secondary-900" data-testid="chart-header-label">
          {chartName ? `Chart: ${chartName}` : 'Chart'}
        </span>

        <PanelMenu
          testId="chart"
          ariaLabel="Chart options"
          items={[
            {
              id: 'rename',
              label: 'Rename',
              icon: PiPencilSimple,
              disabled: isLoadedChart,
              onSelect: startRename,
            },
          ]}
        />

        <button
          data-testid="chart-close"
          onClick={handleClose}
          className="flex-shrink-0 text-gray-400 hover:text-highlight-500 transition-colors"
          title="Close chart"
        >
          <PiX size={14} />
        </button>
      </div>

      {isExpanded && (
        <div className="p-3 space-y-4">
          <ChartEditFormFields
            showName
            nameId="chart-name-field"
            nameLabel="Chart Name"
            nameValue={renameValue}
            onNameChange={e => {
              setRenameValue(e.target.value);
              if (renameError) setRenameError(null);
            }}
            onNameFocus={() => setIsEditing(true)}
            onNameBlur={commitRename}
            onNameKeyDown={e => {
              if (e.key === 'Enter') {
                e.preventDefault();
                commitRename();
              } else if (e.key === 'Escape') {
                setRenameError(null);
                setRenameValue(chartName || '');
                setIsEditing(false);
              }
            }}
            nameDisabled={isLoadedChart}
            nameError={renameError}
            nameErrorTestId="chart-rename-error"
            nameInputRef={nameInputRef}
            nameTestId="chart-name-input"
            layoutTitle="Layout Properties"
            layoutSchema={layoutSchema}
            layoutValues={chartLayout}
            onLayoutChange={handleLayoutChange}
            layoutEditorProps={{
              excludeProperties: [],
              initiallyExpanded: Object.keys(chartLayout || {}),
              droppable: false,
              hidePropertyCount: true,
            }}
          />
        </div>
      )}
    </div>
  );
};

export default ChartBuildSection;
