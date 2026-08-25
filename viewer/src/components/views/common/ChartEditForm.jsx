import React, { useState, useEffect, useRef, useCallback } from 'react';
import useStore, { ObjectStatus } from '../../../stores/store';
import useFormBaseline from '../../../hooks/useFormBaseline';
import { Button, ButtonOutline } from '../../styled/Button';
import CircularProgress from '@mui/material/CircularProgress';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import AddIcon from '@mui/icons-material/Add';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import { validateName } from './namedModel';
import ChartEditFormFields from './ChartEditFormFields';
import { getSchema, isSchemaLoaded } from '../../../schemas/schemas';
import { getTypeByValue } from './objectTypeConfigs';
import { setAtPath } from './embeddedObjectUtils';
import { parseRefValue, formatRef } from '../../../utils/refString';
import EmbeddedPill from '../lineage/EmbeddedPill';
import Dropdown from '../../common/Dropdown';
import AddInsightMenu from '../workspace/AddInsightMenu';

/**
 * ChartEditForm - Form component for editing/creating charts
 *
 * Charts combine insights with layout configuration.
 *
 * Props:
 * - chart: Chart object to edit (null for create mode)
 * - isCreate: Whether in create mode
 * - onClose: Callback to close the panel
 * - onSave: Callback after successful save
 * - onNavigateToEmbedded: Callback(type, object) to navigate to embedded objects
 */
const ChartEditForm = ({ chart, isCreate, onClose, onSave, onNavigateToEmbedded, onDirtyChange }) => {
  const { deleteChart, checkCommitStatus, insights: storeInsights, fetchInsights } = useStore();

  // Form state
  const [name, setName] = useState('');
  const [insights, setInsights] = useState([]);
  const [layoutValues, setLayoutValues] = useState({});

  // VIS-1224: "New blank insight" (the Add Insight menu) stages a blank
  // EMBEDDED insight on the chart; staged entries merge into the save and count
  // toward dirty. (The chart no longer edits insight props inline — that's the
  // insight's own edit panel.)
  const [stagedEmbedded, setStagedEmbedded] = useState([]);

  // UI state
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Layout schema loading state
  const [layoutSchema, setLayoutSchema] = useState(null);
  const [schemaLoading, setSchemaLoading] = useState(false);
  const [schemaError, setSchemaError] = useState(null);

  const isEditMode = !!chart && !isCreate;
  const isNewObject = chart?.status === ObjectStatus.NEW;

  // Load layout schema on mount
  useEffect(() => {
    const loadLayoutSchema = async () => {
      // Check if already cached
      if (isSchemaLoaded('layout')) {
        const schema = await getSchema('layout');
        setLayoutSchema(schema);
        return;
      }

      // Load schema asynchronously
      setSchemaLoading(true);
      setSchemaError(null);

      try {
        const schema = await getSchema('layout');
        setLayoutSchema(schema);
      } catch (error) {
        console.error('Failed to load layout schema:', error);
        setSchemaError('Failed to load layout schema');
        setLayoutSchema(null);
      } finally {
        setSchemaLoading(false);
      }
    };

    loadLayoutSchema();
  }, []);

  // Fetch insights on mount if needed. Guarded by a ref: the store writes a
  // FRESH array on every fetch (even an empty one), so gating on emptiness
  // alone re-fires the effect forever in a project with zero insights.
  const insightsFetchedRef = useRef(false);
  useEffect(() => {
    if (insightsFetchedRef.current) return;
    if (!storeInsights || storeInsights.length === 0) {
      insightsFetchedRef.current = true;
      fetchInsights();
    }
  }, [storeInsights, fetchInsights]);

  // Detect embedded insights (objects vs refs)
  const rawInsights = chart?.config?.insights || chart?.insights || [];
  const embeddedInsights = rawInsights
    .map((insight, index) => ({ insight, index }))
    .filter(({ insight }) => typeof insight === 'object');

  // VIS-1133: the values that constitute "the saved chart", as form state.
  // Kept as a pure function so the seeding effect and the dirty check agree by
  // construction rather than by inspection.
  const applyValues = useCallback(values => {
    setName(values.name);
    setInsights(values.insights);
    setLayoutValues(values.layoutValues);
  }, []);
  // VIS-1133 + per-object drafts: unsaved edits survive navigating away and
  // reloads, keyed on this chart. Only a standalone, named record in edit mode
  // has a stable identity to key on.
  const draftKey = isEditMode && chart?.name ? `chart:${chart.name}` : undefined;
  const { seed, discard, isDirtyAgainst } = useFormBaseline(applyValues, draftKey);

  // Initialize form when chart changes
  useEffect(() => {
    if (chart) {
      // Edit mode - populate from existing chart
      const chartInsights = chart.config?.insights || chart.insights || [];
      seed({
        name: chart.name || '',
        // Insight refs only (strings), not embedded objects.
        insights: chartInsights.filter(i => typeof i === 'string').map(i => parseRefValue(i)),
        layoutValues: chart.config?.layout || chart.layout || {},
      });
    } else if (isCreate) {
      seed({ name: '', insights: [], layoutValues: {} });
    }
    setErrors({});
    setSaveError(null);
    // `seed` is stable per `applyValues`; re-running on it would re-seed the
    // form mid-edit and silently discard the user's changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chart, isCreate]);

  const dirty = isDirtyAgainst({ name, insights, layoutValues }) || stagedEmbedded.length > 0;

  // Report upward so the tab strip's unsaved dot and its guarded close reflect
  // real edits (VIS-1133) — the rail clears it on unmount.
  useEffect(() => {
    if (onDirtyChange) onDirtyChange(dirty);
  }, [dirty, onDirtyChange]);

  const validateForm = () => {
    const newErrors = {};

    const nameError = validateName(name);
    if (nameError) {
      newErrors.name = nameError;
    }

    if (insights.length === 0 && embeddedInsights.length === 0 && stagedEmbedded.length === 0) {
      newErrors.data = 'At least one insight is required';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSave = async () => {
    if (!validateForm()) return;

    setSaving(true);
    setSaveError(null);

    // Build config object
    const config = {
      name,
    };

    // Combine ref insights with embedded insights, preserving the original
    // interleaving (insight order drives trace layering / legend order).
    // Embedded objects stay at their original slots; the (possibly edited)
    // refs fill the string slots in order; any newly added refs go at the end.
    const refInsights = insights.map(i => formatRef(i));
    const rebuiltInsights = [];
    let refIdx = 0;
    rawInsights.forEach(item => {
      if (typeof item === 'object' && item !== null) {
        rebuiltInsights.push(item);
      } else if (refIdx < refInsights.length) {
        rebuiltInsights.push(refInsights[refIdx]);
        refIdx += 1;
      }
    });
    for (; refIdx < refInsights.length; refIdx += 1) {
      rebuiltInsights.push(refInsights[refIdx]);
    }

    // VIS-1224: append any "New blank insight" the Add-Insight menu staged.
    stagedEmbedded.forEach(embedded => rebuiltInsights.push(embedded));

    if (rebuiltInsights.length > 0) {
      config.insights = rebuiltInsights;
    }

    // Add layout if there are values (the SchemaEditor emits undefined when
    // its last property is removed).
    if (layoutValues && Object.keys(layoutValues).length > 0) {
      config.layout = layoutValues;
    }

    // Call unified save - parent handles routing and panel close
    const result = await onSave('chart', name, config);

    setSaving(false);

    if (!result?.success) {
      setSaveError(result?.error || 'Failed to save chart');
    }
  };

  const handleDelete = async () => {
    setDeleting(true);
    const result = await deleteChart(chart.name);
    setDeleting(false);

    if (result?.success) {
      await checkCommitStatus();
      // Optional: the right rail supplies it to close the tab, a modal host
      // to dismiss itself. Calling it unguarded threw when neither did.
      onClose?.();
    } else {
      setSaveError(result?.error || 'Failed to delete chart');
      setShowDeleteConfirm(false);
    }
  };

  // Insight management (VIS-1224: add via the AddInsightMenu dropdown — pick an
  // existing project insight, or stage a New blank embedded insight).
  const addExistingInsight = insightName => {
    if (!insightName || insights.includes(insightName)) return;
    setInsights([...insights, insightName]);
  };

  const addBlankInsight = () => {
    setStagedEmbedded([...stagedEmbedded, { props: { type: 'scatter' } }]);
  };

  const removeInsight = index => {
    setInsights(insights.filter((_, i) => i !== index));
  };

  const removeStagedEmbedded = index => {
    setStagedEmbedded(stagedEmbedded.filter((_, i) => i !== index));
  };

  return (
    <>
      {/* Scrollable Form Content */}
      <div className="flex-1 overflow-y-auto p-4">
        <div className="space-y-6">
          {/* Basic Information + Layout are the shared ChartEditFormFields
              panel (VIS-1224); the chart's own insight-selection section (Add
              Insight menu + ref/embedded pills) is passed in as its slot. */}
          <ChartEditFormFields
            showName
            nameId="chartName"
            nameLabel="Chart Name"
            nameValue={name}
            onNameChange={e => setName(e.target.value)}
            nameDisabled={isEditMode}
            nameError={errors.name}
            layoutTitle="Layout Configuration (Optional)"
            layoutSchema={layoutSchema}
            layoutValues={layoutValues}
            onLayoutChange={setLayoutValues}
            layoutLoading={schemaLoading}
            layoutError={schemaError}
            layoutHint={
              <p className="text-xs text-gray-500">
                Plotly layout configuration. See{' '}
                <a
                  href="https://plotly.com/javascript/reference/layout/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary-600 hover:underline"
                >
                  Plotly docs
                </a>{' '}
                for options.
              </p>
            }
            insightsSection={
          <div className="space-y-4">
            <div className="flex items-center justify-between border-b border-gray-200 pb-2">
              <h3 className="text-sm font-medium text-gray-700">Insights</h3>
              <Dropdown
                align="right"
                width={260}
                trigger={
                  <button
                    type="button"
                    data-testid="chart-add-insight"
                    className="flex items-center gap-1 px-2 py-1 text-xs bg-gray-100 hover:bg-gray-200 text-gray-700 rounded transition-colors"
                  >
                    <AddIcon fontSize="small" />
                    Add Insight
                  </button>
                }
              >
                {close => (
                  <AddInsightMenu
                    excludeNames={insights}
                    onPickExisting={addExistingInsight}
                    onCreateNew={addBlankInsight}
                    close={close}
                  />
                )}
              </Dropdown>
            </div>

            {insights.length === 0 && embeddedInsights.length === 0 && stagedEmbedded.length === 0 ? (
              <p className="text-sm text-gray-500 italic">
                No insights yet. Use “Add Insight” to add one.
              </p>
            ) : (
              <div className="space-y-2">
                {insights.map((insight, index) => (
                  <div
                    key={`ref-${index}`}
                    className="flex items-center gap-2"
                    data-testid={`ref-insight-row-${index}`}
                  >
                    <EmbeddedPill
                      objectType="insight"
                      label={insight}
                      size="md"
                      as="div"
                      tooltip={`Insight: ${insight}`}
                      onRemove={() => removeInsight(index)}
                      className="flex-1 min-w-0"
                    />
                  </div>
                ))}
                {stagedEmbedded.map((_, index) => (
                  <div
                    key={`staged-${index}`}
                    className="flex items-center gap-2"
                    data-testid={`staged-insight-row-${index}`}
                  >
                    <EmbeddedPill
                      objectType="insight"
                      label="New insight (blank)"
                      size="md"
                      as="div"
                      tooltip="A new blank embedded insight — saved with the chart"
                      onRemove={() => removeStagedEmbedded(index)}
                      className="flex-1 min-w-0"
                    />
                  </div>
                ))}
              </div>
            )}

            {errors.data && <p className="text-xs text-red-500">{errors.data}</p>}

            {/* Embedded Insights Section */}
            {embeddedInsights.length > 0 && (() => {
              const insightTypeConfig = getTypeByValue('insight');
              const InsightIcon = insightTypeConfig?.icon;
              return (
                <div className="mt-4 pt-4 border-t border-gray-100">
                  <h4 className="text-xs font-medium text-gray-500 uppercase mb-2">Embedded Insights</h4>
                  <div className="space-y-2">
                    {embeddedInsights.map(({ insight, index }) => {
                      const insightConfig = insight;
                      return (
                        <button
                          key={index}
                          type="button"
                          onClick={() => {
                            if (onNavigateToEmbedded) {
                              // Create synthetic insight with embedded marker
                              const syntheticInsight = {
                                name: insightConfig.name || `(embedded insight ${index + 1})`,
                                config: insightConfig,
                                _embedded: { parentType: 'chart', parentName: chart.name, path: `insights[${index}]` },
                              };
                              // Navigate with applyToParent to update chart's insights array on save
                              onNavigateToEmbedded('insight', syntheticInsight, {
                                applyToParent: (parentConfig, newInsightConfig) =>
                                  setAtPath(parentConfig, `insights[${index}]`, newInsightConfig),
                              });
                            }
                          }}
                          className={`w-full flex items-center gap-2 px-3 py-2 rounded-md border transition-colors ${insightTypeConfig?.colors?.node || 'bg-gray-50 border-gray-200'} ${insightTypeConfig?.colors?.bgHover || 'hover:bg-gray-100'}`}
                        >
                          {InsightIcon && <InsightIcon fontSize="small" className={insightTypeConfig?.colors?.text || 'text-gray-600'} />}
                          <span className={`text-sm font-medium ${insightTypeConfig?.colors?.text || 'text-gray-700'}`}>
                            Insight: {insightConfig.name || `${index + 1}`}
                          </span>
                          <ChevronRightIcon fontSize="small" className={`ml-auto ${insightTypeConfig?.colors?.text || 'text-gray-600'}`} />
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })()}
          </div>
            }
          />

          {/* Save Error */}
          {saveError && <div className="p-3 rounded-md bg-red-50 text-red-700 text-sm">{saveError}</div>}
        </div>
      </div>

      {/* Fixed Footer Actions */}
      <div className="border-t border-gray-200 bg-gray-50">
        {/* Delete Confirmation */}
        {showDeleteConfirm && isEditMode && (
          <div className="px-4 py-3 bg-red-50 border-b border-red-200">
            <p className="text-sm text-red-700 mb-2">
              {isNewObject
                ? 'Are you sure you want to delete this chart? This will discard your unsaved changes.'
                : 'Are you sure you want to delete this chart? This will mark it for deletion and remove it from YAML when you commit.'}
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                disabled={deleting}
                className="px-3 py-1 text-sm text-gray-600 bg-white border border-gray-300 rounded hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="px-3 py-1 text-sm text-white bg-red-600 rounded hover:bg-red-700 disabled:opacity-50"
              >
                {deleting ? 'Deleting...' : 'Confirm Delete'}
              </button>
            </div>
          </div>
        )}

        <div className="flex justify-between items-center px-4 py-3">
          <div className="flex gap-2">
            {/* Delete button - only in edit mode */}
            {isEditMode && !showDeleteConfirm && (
              <button
                type="button"
                onClick={() => setShowDeleteConfirm(true)}
                className="p-1.5 text-red-600 hover:text-red-700 border border-red-300 hover:bg-red-50 rounded transition-colors"
                title="Delete chart"
              >
                <DeleteOutlineIcon fontSize="small" />
              </button>
            )}
          </div>

          <div className="flex gap-2">
            {/* VIS-1133: in the rail there is no modal to close, so this
                button reverts to the last saved values instead. In create mode
                (the onboarding modal) it stays a real Cancel. */}
            <ButtonOutline
              type="button"
              onClick={isEditMode ? discard : onClose}
              disabled={isEditMode && (!dirty || saving || deleting)}
              data-testid="chart-form-discard"
              className="text-sm"
            >
              {isEditMode ? 'Discard' : 'Cancel'}
            </ButtonOutline>
            <Button
              type="button"
              onClick={handleSave}
              disabled={saving || (isEditMode && !dirty)}
              className="text-sm"
            >
              {saving ? (
                <>
                  <CircularProgress size={14} className="mr-1" style={{ color: 'white' }} />
                  Saving...
                </>
              ) : (
                'Save'
              )}
            </Button>
          </div>
        </div>
      </div>
    </>
  );
};

export default ChartEditForm;
