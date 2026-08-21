import React, { useState, useEffect, useCallback, useRef } from 'react';
import { PiCaretDown, PiCaretRight, PiPlus, PiX, PiPencilSimple } from 'react-icons/pi';
import { useDroppable } from '@dnd-kit/core';
import EmbeddedPill from '../lineage/EmbeddedPill';
import useStore from '../../../stores/store';
import PanelMenu from '../../common/PanelMenu';
import { selectInsightStatus } from '../../../stores/explorerStore';
import { getSchema } from '../../../schemas/schemas';
import ChartEditFormFields from '../common/ChartEditFormFields';
import { recordOnboardingAction } from '../../onboarding/onboardingState';

const InsightPillItem = ({ name, isActive, onRemove, onClick }) => {
  const status = useStore(selectInsightStatus(name));
  return (
    <span data-testid={`chart-insight-pill-${name}`}>
      <EmbeddedPill
        objectType="insight"
        label={name}
        isActive={isActive}
        onClick={onClick}
        onRemove={onRemove}
        statusDot={status}
      />
    </span>
  );
};

/**
 * ChartBuildSection — the Explorer Build-rail chart pane. VIS-1224: the colored
 * side-bar body is gone; it now renders the SAME standard chart edit panel as
 * the RightRail (`ChartEditFormFields` — Basic Information + Layout) with the
 * Explorer's own insight-selection section (drop zone + activate-on-click pills
 * + Add Insight) passed in as the shared panel's `insightsSection` slot. Name
 * edits write through `setChartName` live (no Save button); the ⋮ menu's
 * "Rename" focuses the Basic Information name field (disabled for a loaded/saved
 * chart — that rename is VIS-1209's project-wide ${ref()} rewrite).
 */
const ChartBuildSection = ({ isExpanded, onToggleExpand }) => {
  const isLoadedChart = useStore(s => (s.charts || []).some(c => c.name === s.explorerChartName));
  const chartName = useStore(s => s.explorerChartName);
  const chartLayout = useStore(s => s.explorerChartLayout);
  const chartInsightNames = useStore(s => s.explorerChartInsightNames);
  const activeInsightName = useStore(s => s.explorerActiveInsightName);
  const setChartName = useStore(s => s.setChartName);
  const replaceChartLayout = useStore(s => s.replaceChartLayout);
  const createInsight = useStore(s => s.createInsight);
  const removeInsightFromChart = useStore(s => s.removeInsightFromChart);
  const setActiveInsight = useStore(s => s.setActiveInsight);
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

  const { setNodeRef: setInsightDropRef, isOver: isInsightOver } = useDroppable({
    id: 'chart-insight-zone',
    data: { type: 'insight-zone' },
  });

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

  const handleAddInsight = useCallback(() => {
    createInsight();
    recordOnboardingAction('insight_added');
  }, [createInsight]);

  const handleRemoveInsight = useCallback(
    (e, name) => {
      e.stopPropagation();
      removeInsightFromChart(name);
    },
    [removeInsightFromChart]
  );

  const handleInsightClick = useCallback(
    name => {
      setActiveInsight(name);
    },
    [setActiveInsight]
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

  // The Explorer-specific insight selection — a drop zone (chart-insight-zone),
  // activate-on-click pills, and Add Insight — handed to the shared panel as
  // its insight-selection slot.
  const insightsSection = (
    <div
      ref={setInsightDropRef}
      data-testid="chart-insight-drop-zone"
      className={`space-y-1 rounded p-2 transition-all ${
        isInsightOver ? 'ring-2 ring-primary-400 ring-offset-1 bg-primary-50/50' : ''
      }`}
    >
      <h3 className="text-sm font-medium text-gray-700 border-b border-gray-200 pb-2">Insights</h3>
      {chartInsightNames.length === 0 ? (
        <p className="text-xs text-gray-400 py-2">
          No insights added yet. Drag from the Library or click below.
        </p>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {chartInsightNames.map(name => (
            <InsightPillItem
              key={name}
              name={name}
              isActive={name === activeInsightName}
              onClick={() => handleInsightClick(name)}
              onRemove={e => handleRemoveInsight(e, name)}
            />
          ))}
        </div>
      )}
      <button
        data-testid="chart-add-insight"
        onClick={handleAddInsight}
        className="flex items-center gap-1 mt-2 text-xs text-primary-600 hover:text-primary-800 transition-colors"
      >
        <PiPlus size={12} />
        Add Insight
      </button>
    </div>
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
            insightsSection={insightsSection}
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
