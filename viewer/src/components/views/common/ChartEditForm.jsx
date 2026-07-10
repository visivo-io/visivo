import React, { useState, useEffect, useRef } from 'react';
import useStore, { ObjectStatus } from '../../../stores/store';
import { Button, ButtonOutline } from '../../styled/Button';
import CircularProgress from '@mui/material/CircularProgress';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import AddIcon from '@mui/icons-material/Add';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import { validateName } from './namedModel';
import { SchemaEditor } from './SchemaEditor';
import { getSchema, isSchemaLoaded } from '../../../schemas/schemas';
import { getTypeByValue } from './objectTypeConfigs';
import { setAtPath } from './embeddedObjectUtils';
import { parseRefValue, formatRef } from '../../../utils/refString';
import { unwrapConfig } from '../workspace/unwrapRecordConfig';
import EmbeddedPill from '../lineage/EmbeddedPill';
import Select from '../../common/Select';
import TracePropsEditor from './TracePropsEditor';
import useRecordSave from '../../../hooks/useRecordSave';

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
const ChartEditForm = ({ chart, isCreate, onClose, onSave, onNavigateToEmbedded }) => {
  const { deleteChart, checkCommitStatus, insights: storeInsights, fetchInsights } = useStore();

  // Form state
  const [name, setName] = useState('');
  const [insights, setInsights] = useState([]);
  const [layoutValues, setLayoutValues] = useState({});

  // The insight whose props are currently being edited via TracePropsEditor.
  // For a ref insight this is its name; for an embedded insight it is the
  // synthetic key `__embedded__:<index>` (so the picker can address either).
  const [selectedInsightName, setSelectedInsightName] = useState('');

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

  // Get available insights from the insight store
  const availableInsights = storeInsights?.map(i => i.name) || [];

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

  // Prefix that marks the picker value of an EMBEDDED insight (vs a ref name).
  const EMBEDDED_PREFIX = '__embedded__:';
  const isEmbeddedSelection =
    typeof selectedInsightName === 'string' && selectedInsightName.startsWith(EMBEDDED_PREFIX);
  const selectedEmbeddedIndex = isEmbeddedSelection
    ? Number(selectedInsightName.slice(EMBEDDED_PREFIX.length))
    : null;

  // The store record for the currently-selected REF insight (envelope-or-bare
  // unwrapped to its config). Used to seed TracePropsEditor and as the base for
  // the persisted insight write.
  const selectedInsightRecord =
    !isEmbeddedSelection && selectedInsightName
      ? storeInsights?.find(i => i.name === selectedInsightName)
      : null;
  const selectedInsightConfig = selectedInsightRecord ? unwrapConfig(selectedInsightRecord) : null;

  // Optimistic + debounced persist for the SELECTED ref insight. The chart record
  // is untouched — we write the insight record through the unified backbone.
  const { scheduleSave: scheduleInsightSave } = useRecordSave('insight', selectedInsightName);

  // Build the props object handed to TracePropsEditor for whichever insight is
  // selected (ref record's config.props, or the embedded insight's props).
  let selectedInsightProps = null;
  if (isEmbeddedSelection && selectedEmbeddedIndex != null) {
    const embedded = rawInsights[selectedEmbeddedIndex];
    selectedInsightProps =
      (embedded && typeof embedded === 'object' ? embedded.props : null) || { type: 'scatter' };
  } else if (selectedInsightConfig) {
    selectedInsightProps = selectedInsightConfig.props || { type: 'scatter' };
  }

  // Persist a props edit for the selected insight. Ref insights write the insight
  // record (backbone); embedded insights edit inline + persist the CHART.
  const handleInsightPropsChange = nextProps => {
    if (isEmbeddedSelection && selectedEmbeddedIndex != null) {
      const updatedInsights = rawInsights.map((insight, index) =>
        index === selectedEmbeddedIndex && typeof insight === 'object'
          ? { ...insight, props: nextProps }
          : insight
      );
      // Inline-edit the embedded insight and persist the chart via its save path.
      const config = { name, insights: updatedInsights };
      if (Object.keys(layoutValues).length > 0) {
        config.layout = layoutValues;
      }
      if (onSave) onSave('chart', name, config);
      return;
    }
    if (selectedInsightRecord) {
      scheduleInsightSave({ ...selectedInsightConfig, props: nextProps });
    }
  };

  // Initialize form when chart changes
  useEffect(() => {
    if (chart) {
      // Edit mode - populate from existing chart
      setName(chart.name || '');

      // Extract insight refs (strings only, not embedded objects)
      const chartInsights = chart.config?.insights || chart.insights || [];
      setInsights(
        chartInsights
          .filter(i => typeof i === 'string')
          .map(i => parseRefValue(i))
      );

      // Layout as object
      const layout = chart.config?.layout || chart.layout || {};
      setLayoutValues(layout);
    } else if (isCreate) {
      // Create mode - reset form
      setName('');
      setInsights([]);
      setLayoutValues({});
    }
    setErrors({});
    setSaveError(null);
  }, [chart, isCreate]);

  // Build the options for the insight props picker: every ref insight by name,
  // plus an entry per embedded insight. Keeps a stable identity so the picker
  // can default-select the lone insight and stay in sync as refs change.
  const insightPickerOptions = [
    ...insights.map(i => ({ value: i, label: i })),
    ...embeddedInsights.map(({ insight, index }) => ({
      value: `${EMBEDDED_PREFIX}${index}`,
      label: insight.name || `(embedded insight ${index + 1})`,
    })),
  ];

  // Default-select the chart's only insight; otherwise keep the selection valid
  // as the refs/embedded lists change (drop a stale selection).
  useEffect(() => {
    const validValues = insightPickerOptions.map(o => o.value);
    if (selectedInsightName && validValues.includes(selectedInsightName)) {
      return; // current selection still valid
    }
    if (insightPickerOptions.length === 1) {
      setSelectedInsightName(insightPickerOptions[0].value);
    } else if (selectedInsightName) {
      // Selection no longer exists (e.g. its ref was removed/swapped).
      setSelectedInsightName('');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [insights, embeddedInsights.length, selectedInsightName]);

  const validateForm = () => {
    const newErrors = {};

    const nameError = validateName(name);
    if (nameError) {
      newErrors.name = nameError;
    }

    if (insights.length === 0 && embeddedInsights.length === 0) {
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
      onClose();
    } else {
      setSaveError(result?.error || 'Failed to delete chart');
      setShowDeleteConfirm(false);
    }
  };

  // Insight management
  const addInsight = () => {
    const availableToAdd = availableInsights.filter(i => !insights.includes(i));
    if (availableToAdd.length > 0) {
      setInsights([...insights, availableToAdd[0]]);
    }
  };

  const removeInsight = index => {
    setInsights(insights.filter((_, i) => i !== index));
  };

  const updateInsight = (index, value) => {
    const updated = [...insights];
    updated[index] = value;
    setInsights(updated);
  };

  return (
    <>
      {/* Scrollable Form Content */}
      <div className="flex-1 overflow-y-auto p-4">
        <div className="space-y-6">
          {/* Basic Fields Section */}
          <div className="space-y-4">
            <h3 className="text-sm font-medium text-gray-700 border-b border-gray-200 pb-2">
              Basic Information
            </h3>

            {/* Name field */}
            <div className="relative">
              <input
                type="text"
                id="chartName"
                value={name}
                onChange={e => setName(e.target.value)}
                disabled={isEditMode}
                placeholder=" "
                className={`
                  block w-full px-3 py-2.5 text-sm text-gray-900
                  bg-white rounded-md border appearance-none
                  focus:outline-none focus:ring-2 focus:border-primary-500
                  peer placeholder-transparent
                  ${isEditMode ? 'bg-gray-100 cursor-not-allowed' : ''}
                  ${errors.name ? 'border-red-500 focus:ring-red-500' : 'border-gray-300 focus:ring-primary-500'}
                `}
              />
              <label
                htmlFor="chartName"
                className={`
                  absolute text-sm duration-200 transform -translate-y-4 scale-75 top-2 z-10 origin-[0]
                  bg-white px-1 left-2
                  peer-placeholder-shown:scale-100 peer-placeholder-shown:-translate-y-1/2
                  peer-placeholder-shown:top-1/2
                  peer-focus:top-2 peer-focus:scale-75 peer-focus:-translate-y-4
                  ${errors.name ? 'text-red-500' : 'text-gray-500 peer-focus:text-primary-500'}
                `}
              >
                Chart Name<span className="text-red-500 ml-0.5">*</span>
              </label>
              {errors.name && <p className="mt-1 text-xs text-red-500">{errors.name}</p>}
            </div>
          </div>

          {/* Insights Section */}
          <div className="space-y-4">
            <div className="flex items-center justify-between border-b border-gray-200 pb-2">
              <h3 className="text-sm font-medium text-gray-700">Insights</h3>
              <button
                type="button"
                onClick={addInsight}
                disabled={availableInsights.filter(i => !insights.includes(i)).length === 0}
                className="flex items-center gap-1 px-2 py-1 text-xs bg-gray-100 hover:bg-gray-200 text-gray-700 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <AddIcon fontSize="small" />
                Add Insight
              </button>
            </div>

            {availableInsights.length === 0 ? (
              <p className="text-sm text-gray-500 italic">
                No insights available. Create insights first to add them to charts.
              </p>
            ) : insights.length === 0 ? (
              <p className="text-sm text-gray-500 italic">
                No insights added. Add insights to visualize data in this chart.
              </p>
            ) : (
              insights.map((insight, index) => (
                <div
                  key={index}
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
                  <Select
                    aria-label={`Change insight ${index + 1}`}
                    data-testid={`change-insight-select-${index}`}
                    size="sm"
                    className="min-w-[160px]"
                    value={insight}
                    options={availableInsights.map(i => ({
                      value: i,
                      label: i,
                      isDisabled: insights.includes(i) && i !== insight,
                    }))}
                    onChange={value => updateInsight(index, value)}
                  />
                </div>
              ))
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

          {/* Insight Props Section — edit the selected insight's Plotly props.
              This is an ADDITION to the chart's own fields (refs + layout); the
              chart record is unchanged for ref insights — the insight record is
              persisted through the unified backbone. */}
          {insightPickerOptions.length > 0 && (
            <div className="space-y-4">
              <h3 className="text-sm font-medium text-gray-700 border-b border-gray-200 pb-2">
                Insight Props
              </h3>

              {/* Insight picker */}
              <div className="relative">
                <Select
                  aria-label="Insight"
                  data-testid="insight-props-select"
                  value={selectedInsightName}
                  options={insightPickerOptions}
                  onChange={value => setSelectedInsightName(value || '')}
                  placeholder="Select an insight to edit…"
                />
                <label className="absolute text-sm duration-200 transform -translate-y-4 scale-75 top-2 z-10 origin-[0] bg-white px-1 left-2 text-gray-500">
                  Insight
                </label>
              </div>

              {/* Selected insight's grouped props editor (controlled). */}
              {selectedInsightName && selectedInsightProps ? (
                <TracePropsEditor
                  ownerName={
                    isEmbeddedSelection
                      ? insightPickerOptions.find(o => o.value === selectedInsightName)?.label ||
                        'insight'
                      : selectedInsightName
                  }
                  props={selectedInsightProps}
                  onChange={handleInsightPropsChange}
                />
              ) : selectedInsightName ? (
                <p className="text-sm text-gray-500 italic" data-testid="insight-props-unloaded">
                  Loading insight…
                </p>
              ) : (
                <p className="text-sm text-gray-500 italic">
                  Select an insight above to edit its visualization props.
                </p>
              )}
            </div>
          )}

          {/* Layout Section */}
          <div className="space-y-4">
            <h3 className="text-sm font-medium text-gray-700 border-b border-gray-200 pb-2">
              Layout Configuration (Optional)
            </h3>

            {schemaLoading ? (
              <div className="flex items-center justify-center py-8">
                <CircularProgress size={24} />
                <span className="ml-2 text-sm text-gray-600">Loading schema...</span>
              </div>
            ) : schemaError ? (
              <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                <p className="text-sm text-red-700">{schemaError}</p>
              </div>
            ) : layoutSchema ? (
              <SchemaEditor
                schema={layoutSchema}
                value={layoutValues}
                onChange={setLayoutValues}
              />
            ) : null}
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
          </div>

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
            <ButtonOutline type="button" onClick={onClose} className="text-sm">
              Cancel
            </ButtonOutline>
            <Button type="button" onClick={handleSave} disabled={saving} className="text-sm">
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
