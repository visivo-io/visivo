import React, { useMemo } from 'react';
import Chart from '../../items/Chart';
import Input from '../../items/Input';
import { useInsightsData } from '../../../hooks/useInsightsData';
import { useInputsData } from '../../../hooks/useInputsData';

/**
 * InsightPreviewDashboard - A minimal dashboard for previewing a single insight
 *
 * This component creates a synthetic dashboard configuration with:
 * - Input controls for any inputs referenced in the insight
 * - A single chart displaying the insight
 *
 * It reuses the existing Dashboard data loading patterns and Chart/Input components
 * to avoid duplicating logic.
 *
 * Props:
 * - insightConfig: The insight configuration object
 * - projectId: Project ID for data loading
 * - layoutValues: Optional layout configuration for the chart
 */
const InsightPreviewDashboard = ({ insightConfig, projectId, layoutValues = {} }) => {
  // Extract input names from the insight configuration
  const extractInputNames = (config) => {
    if (!config) return [];

    const inputNames = new Set();
    // More specific regex patterns to identify inputs vs models
    // Pattern 1: ${inputName.value} - simple input reference
    const simpleInputRegex = /\$\{([^.]+)\.(value|values|min|max|first|last)\}/g;
    // Pattern 2: ${ref(inputName).value} - ref-style input reference
    const refInputRegex = /\$\{ref\(([^)]+)\)\.(value|values|min|max|first|last)\}/g;

    // Helper to scan a value for input references
    const scanValue = (value) => {
      if (typeof value === 'string') {
        // Check for ref() style inputs first
        let match;
        while ((match = refInputRegex.exec(value)) !== null) {
          const name = match[1];
          // Skip if it contains a dot (indicates model.field reference)
          if (!name.includes('.')) {
            inputNames.add(name);
          }
        }
        refInputRegex.lastIndex = 0; // Reset regex

        // Then check for simple style inputs
        while ((match = simpleInputRegex.exec(value)) !== null) {
          const name = match[1];
          // Skip if it contains a dot (indicates model.field reference)
          // or if it was already captured as ref() style
          if (!name.includes('.') && !value.includes(`ref(${name})`)) {
            inputNames.add(name);
          }
        }
        simpleInputRegex.lastIndex = 0; // Reset regex
      } else if (typeof value === 'object' && value !== null) {
        Object.values(value).forEach(v => scanValue(v));
      }
    };

    // Scan props
    if (config.props) {
      scanValue(config.props);
    }

    // Scan interactions
    if (config.interactions && Array.isArray(config.interactions)) {
      config.interactions.forEach(interaction => {
        if (interaction) {
          Object.values(interaction).forEach(value => scanValue(value));
        }
      });
    }

    return Array.from(inputNames);
  };

  // Extract required input names
  const inputNames = useMemo(() => {
    return extractInputNames(insightConfig);
  }, [insightConfig]);

  // Create synthetic input configurations
  const inputs = useMemo(() => {
    return inputNames.map(name => {
      // Determine input type based on common patterns
      let inputType = 'single-select';
      let displayType = 'dropdown';
      let label = name.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

      // Special cases for known input types
      if (name === 'sort_direction') {
        return {
          name,
          label: 'Sort Direction',
          type: inputType,
          display: { type: 'radio' },
          options: ['ASC', 'DESC']
        };
      } else if (name.includes('threshold') || name.includes('min') || name.includes('max')) {
        displayType = 'slider';
      }

      return {
        name,
        label,
        type: inputType,
        display: { type: displayType }
      };
    });
  }, [inputNames]);

  // Create synthetic chart configuration
  const chart = useMemo(() => {
    const insightName = insightConfig?.name;

    // Ensure autosize is enabled for preview
    const previewLayout = {
      autosize: true,
      margin: { l: 40, r: 10, t: 20, b: 30 },  // Smaller margins for preview
      ...layoutValues
    };

    // For saved insights, use the name; for unsaved, generate a temporary structure
    if (insightName && insightName !== '__preview__') {
      return {
        name: 'Preview Chart',
        insights: [{ name: insightName }],
        traces: [],
        layout: previewLayout
      };
    }

    // For unsaved insights, we can't use the insight-based approach
    // We'd need to handle this differently or require saving first
    return {
      name: 'Preview Chart',
      insights: [],
      traces: [],
      layout: previewLayout
    };
  }, [insightConfig, layoutValues]);

  // Create synthetic project object
  const project = useMemo(() => ({
    id: projectId,
    project_json: {
      name: 'Preview Project',
      dashboards: []
    }
  }), [projectId]);

  // Determine which data to load
  const insightNamesToLoad = useMemo(() => {
    const name = insightConfig?.name;
    return (name && name !== '__preview__') ? [name] : [];
  }, [insightConfig]);

  // Load insight data (this stores results in Zustand)
  useInsightsData(projectId, insightNamesToLoad);

  // Load input data if needed
  useInputsData(projectId, inputNames);

  // If this is an unsaved insight, we can't preview with real data
  if (!insightConfig?.name || insightConfig.name === '__preview__') {
    return (
      <div className="flex flex-col items-center justify-center h-full p-8 text-center">
        <h3 className="text-lg font-medium text-gray-700 mb-2">Save to Preview with Data</h3>
        <p className="text-sm text-gray-500 max-w-sm">
          Save the insight and run 'visivo run' to generate preview data.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Input Controls */}
      {inputs.length > 0 && (
        <div className="flex flex-wrap gap-2 p-3 border-b border-gray-200 bg-gray-50">
          {inputs.map(input => (
            <Input
              key={input.name}
              input={input}
              project={project}
              itemWidth={1}
            />
          ))}
        </div>
      )}

      {/* Chart */}
      <div className="flex-1 min-h-0 p-4 overflow-hidden">
        <div className="w-full h-full relative" style={{ minWidth: 0 }}>
          <Chart
            chart={chart}
            project={project}
            itemWidth={1}
            height={400}  // Use fixed height for Plotly
            width={undefined}  // Let Plotly handle width with autosize
            shouldLoad={true}
            hideToolbar={true}  // Hide selector and share button in preview
          />
        </div>
      </div>
    </div>
  );
};

export default InsightPreviewDashboard;