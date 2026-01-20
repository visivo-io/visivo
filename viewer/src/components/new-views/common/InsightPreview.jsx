import React, { useMemo, useState, useCallback } from 'react';
import Plot from 'react-plotly.js';
import CircularProgress from '@mui/material/CircularProgress';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import useStore from '../../../stores/store';
import { useInsightsData } from '../../../hooks/useInsightsData';
import { chartDataFromInsightData, extractInputDependenciesFromProps } from '../../../models/Insight';
import { useDuckDB } from '../../../contexts/DuckDBContext';
import { useShallow } from 'zustand/react/shallow';
import { useEffect } from 'react';
import TextField from '@mui/material/TextField';
import Select from '@mui/material/Select';
import MenuItem from '@mui/material/MenuItem';
import FormControl from '@mui/material/FormControl';
import InputLabel from '@mui/material/InputLabel';

/**
 * InsightPreview - Component for rendering a live preview of an insight
 *
 * This component creates a synthetic chart with a single insight to preview
 * how the insight will look when rendered. It uses the actual insight data
 * pipeline through useInsightsData.
 *
 * Props:
 * - insightConfig: The full insight configuration object including name, props, model, etc.
 * - layoutValues: Optional layout configuration for the chart
 */

// Component to render input controls
const InputControls = ({ inputNames, inputs, onInputChange }) => {
  if (!inputNames || inputNames.length === 0) return null;

  return (
    <div className="p-3 border-b border-gray-200 bg-gray-50">
      <div className="text-xs font-medium text-gray-600 uppercase tracking-wide mb-2">Input Controls</div>
      <div className="flex flex-wrap gap-2">
        {inputNames.map(inputName => {
          const currentValue = inputs[inputName]?.value || '';

          // Special handling for known select inputs
          if (inputName === 'sort_direction') {
            return (
              <FormControl key={inputName} size="small" sx={{ minWidth: 120 }}>
                <InputLabel sx={{ fontSize: '0.75rem' }}>{inputName}</InputLabel>
                <Select
                  value={currentValue}
                  label={inputName}
                  onChange={(e) => onInputChange(inputName, e.target.value)}
                  sx={{ fontSize: '0.75rem' }}
                >
                  <MenuItem value="ASC">ASC</MenuItem>
                  <MenuItem value="DESC">DESC</MenuItem>
                </Select>
              </FormControl>
            );
          }

          // Default to text input for other inputs
          return (
            <TextField
              key={inputName}
              size="small"
              label={inputName}
              value={currentValue}
              onChange={(e) => onInputChange(inputName, e.target.value)}
              variant="outlined"
              sx={{
                '& .MuiInputBase-input': { fontSize: '0.75rem' },
                '& .MuiInputLabel-root': { fontSize: '0.75rem' }
              }}
            />
          );
        })}
      </div>
    </div>
  );
};

const InsightPreview = ({
  insightConfig,
  layoutValues = {},
}) => {
  const { project } = useStore();
  const projectId = project?.id;
  const db = useDuckDB();
  const [error, setError] = useState(null);
  const setDefaultInputValue = useStore(state => state.setDefaultInputValue);
  const setInputValue = useStore(state => state.setInputValue);
  const inputs = useStore(state => state.inputs);

  // Use the insight name if it exists (for saved insights), otherwise don't fetch
  const insightName = insightConfig?.name;
  const shouldFetchData = insightName && insightName !== '__preview__';

  // Extract input dependencies from props using the scan method from Insight.js
  const requiredInputNames = useMemo(() => {
    if (!insightConfig?.props) return [];
    return extractInputDependenciesFromProps(insightConfig.props);
  }, [insightConfig]);

  // Handler for input changes
  const handleInputChange = useCallback((inputName, value) => {
    console.log(`Input changed: ${inputName} = ${value}`);
    setInputValue(inputName, value, 'single-select');
  }, [setInputValue]);

  // Set default values for any missing inputs
  useEffect(() => {
    if (requiredInputNames.length > 0) {
      console.log('InsightPreview - Setting defaults for inputs:', requiredInputNames);
      requiredInputNames.forEach(inputName => {
        // Check if input already has a value with the proper accessor structure
        if (!inputs[inputName] || !inputs[inputName].value) {
          // Set a default value based on common input patterns
          let defaultValue;
          if (inputName === 'sort_direction') {
            defaultValue = 'ASC';
          } else if (inputName.includes('min') || inputName === 'min_x_value' || inputName === 'min_avg_y') {
            defaultValue = 0;
          } else if (inputName.includes('threshold') || inputName === 'split_threshold') {
            defaultValue = 50;
          } else if (inputName.includes('max')) {
            defaultValue = 100;
          } else if (inputName === 'show_markers') {
            defaultValue = 'markers';
          } else {
            // Generic default - use empty string which will be handled properly
            defaultValue = '0';
          }

          console.log(`Setting default for ${inputName}:`, defaultValue);
          setDefaultInputValue(inputName, defaultValue, 'single-select');
        }
      });
    }
  }, [requiredInputNames, inputs, setDefaultInputValue]);

  // Only log if we're fetching data
  if (shouldFetchData) {
    console.log('InsightPreview - Fetching data for:', insightName, {
      projectId,
      dbReady: !!db,
      requiredInputs: requiredInputNames,
      currentInputValues: requiredInputNames.reduce((acc, name) => {
        acc[name] = inputs[name];
        return acc;
      }, {})
    });
  }

  useInsightsData( projectId, shouldFetchData ? [insightName] : []);

  const insightsData = useStore(
    useShallow(state => {
      const data = {};

      if (state.insights[insightName]) data[insightName] = state.insights[insightName];

      return data;
    })
  );
  console.log('insightsData here', insightsData);

  // Get the insight data
  const insightData = shouldFetchData ? insightsData?.[insightName] : null;


  // Check if we have the necessary data
  const hasData = insightData?.data && Array.isArray(insightData.data);
  const isLoading = shouldFetchData ? insightsData[insightName]?.isLoading : false;
  const dataError = insightData?.error;


  // Transform insight data to Plotly format
  const chartData = useMemo(() => {
    if (!hasData || !insightConfig) return [];

    try {
      // For preview mode, we need to use the config passed from the form
      // The insightData might have different props_mapping than what's in the form
      const syntheticInsightData = {
        ...insightData,
        // Override with form config for preview
        type: insightConfig.props?.type || insightData.type,
        static_props: insightConfig.props || insightData.static_props
      };

      // Create a synthetic insights data object for the transformation
      const syntheticInsightsData = {
        [insightName]: syntheticInsightData
      };

      // Use the same transformation logic as the real Chart component
      // Pass inputs to process input refs in static_props
      const data = chartDataFromInsightData(syntheticInsightsData, inputs);
      return data;
    } catch (err) {
      console.error('Error transforming chart data:', err);
      setError(err.message || 'Failed to transform data');
      return [];
    }
  }, [insightData, insightConfig, insightName, hasData, inputs]);

  // Combine errors
  const displayError = error || dataError;

  // Determine what to show
  if (!insightConfig) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-8 text-center">
        <InfoOutlinedIcon className="text-gray-400 mb-2" sx={{ fontSize: 48 }} />
        <h3 className="text-lg font-medium text-gray-700 mb-2">No Insight Configuration</h3>
        <p className="text-sm text-gray-500 max-w-sm">
          Configure the insight properties to see a preview.
        </p>
      </div>
    );
  }

  // For new insights that haven't been saved yet
  if (!shouldFetchData) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-8 text-center">
        <InfoOutlinedIcon className="text-gray-400 mb-2" sx={{ fontSize: 48 }} />
        <h3 className="text-lg font-medium text-gray-700 mb-2">Preview Not Available</h3>
        <p className="text-sm text-gray-500 max-w-sm">
          Save the insight and run 'visivo run' to generate data for preview. The preview will show actual data once the insight job is processed.
        </p>
      </div>
    );
  }

  // Debug logging - only log important state for published insights
  if (shouldFetchData && (hasData || dataError || !isLoading)) {
    console.log('InsightPreview - Final state for', insightName, ':', {
      hasData,
      dataLength: insightData?.data?.length,
      chartDataLength: chartData?.length,
      isLoading,
      dataError,
      projectId
    });
  }

  // Show loading state if DuckDB is initializing or data is loading
  if (!db || isLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-8">
        <CircularProgress size={32} className="mb-2" />
        <p className="text-sm text-gray-600">
          {!db ? 'Initializing database...' : 'Loading preview data...'}
        </p>
      </div>
    );
  }

  if (displayError) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-8 text-center">
        <ErrorOutlineIcon className="text-red-500 mb-2" sx={{ fontSize: 48 }} />
        <h3 className="text-lg font-medium text-gray-700 mb-2">Preview Error</h3>
        <p className="text-sm text-red-600 mb-4 max-w-sm">{displayError}</p>
      </div>
    );
  }

  if (!chartData || chartData.length === 0) {
    // Check if this is a saved insight that should have data
    const isSavedInsight = insightName && insightName !== '__preview__';

    return (
      <div className="flex flex-col items-center justify-center h-full p-8 text-center">
        <InfoOutlinedIcon className="text-gray-400 mb-2" sx={{ fontSize: 48 }} />
        <h3 className="text-lg font-medium text-gray-700 mb-2">No Data Available</h3>
        <p className="text-sm text-gray-500 max-w-sm">
          {isSavedInsight
            ? "This insight needs 'visivo run' to generate preview data. The data will appear after the insight job is processed."
            : "Configure the required fields in the form to see a preview."
          }
        </p>
        {isSavedInsight && (
          <p className="text-xs text-gray-400 mt-2">
            Insight: {insightName}
          </p>
        )}
      </div>
    );
  }

  // Render the chart with input controls
  return (
    <div className="w-full h-full flex flex-col">
      {/* Input Controls */}
      {requiredInputNames.length > 0 && (
        <InputControls
          inputNames={requiredInputNames}
          inputs={inputs}
          onInputChange={handleInputChange}
        />
      )}

      {/* Chart */}
      <div className="flex-1 relative">
        <Plot
          data={chartData}
          layout={{
            autosize: true,
            margin: { l: 50, r: 20, t: 30, b: 40 },
            showlegend: true,
            hovermode: 'closest',
            ...layoutValues, // Include any layout overrides from form
          }}
          config={{
            responsive: true,
            displayModeBar: true,
            displaylogo: false,
            modeBarButtonsToRemove: ['sendDataToCloud'],
          }}
          useResizeHandler={true}
          style={{ width: '100%', height: '100%' }}
        />
      </div>
    </div>
  );
};

export default InsightPreview;