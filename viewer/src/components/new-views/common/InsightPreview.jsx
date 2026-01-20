import React, { useMemo, useState } from 'react';
import Plot from 'react-plotly.js';
import CircularProgress from '@mui/material/CircularProgress';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import useStore from '../../../stores/store';
import { useInsightsData } from '../../../hooks/useInsightsData';
import { chartDataFromInsightData } from '../../../models/Insight';
import { useDuckDB } from '../../../contexts/DuckDBContext';

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
const InsightPreview = ({
  insightConfig,
  layoutValues = {},
}) => {
  const { project } = useStore();
  const projectId = project?.id;
  const db = useDuckDB();
  const [error, setError] = useState(null);

  // Use the insight name if it exists (for saved insights), otherwise don't fetch
  const insightName = insightConfig?.name;
  const shouldFetchData = insightName && insightName !== '__preview__';

  // Only log if we're fetching data
  if (shouldFetchData) {
    console.log('InsightPreview - Fetching data for:', insightName, {
      projectId,
      dbReady: !!db
    });
  }

  // Fetch data for the insight if it's a saved insight
  const { insightsData, isInsightsLoading, hasAllInsightData } = useInsightsData(
    projectId,
    shouldFetchData ? [insightName] : []
  );


  // Get the insight data
  const insightData = shouldFetchData ? insightsData?.[insightName] : null;


  // Check if we have the necessary data
  const hasData = insightData?.data && Array.isArray(insightData.data);
  const isLoading = shouldFetchData ? isInsightsLoading : false;
  const dataError = insightData?.error;


  // Transform insight data to Plotly format
  const chartData = useMemo(() => {
    if (!hasData || !insightConfig) return [];

    try {
      // Create a synthetic insights data object for the transformation
      const syntheticInsightsData = {
        [insightName]: insightData
      };

      // Use the same transformation logic as the real Chart component
      const data = chartDataFromInsightData(syntheticInsightsData, layoutValues);
      return data;
    } catch (err) {
      console.error('Error transforming chart data:', err);
      setError(err.message || 'Failed to transform data');
      return [];
    }
  }, [insightData, insightConfig, insightName, hasData, layoutValues]);

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

  // Render the chart
  return (
    <div className="w-full h-full relative">
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
  );
};

export default InsightPreview;