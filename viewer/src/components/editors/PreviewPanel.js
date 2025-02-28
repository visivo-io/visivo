import React from 'react';
import Chart from '../items/Chart';
import Dashboard from '../Dashboard';

const PreviewPanel = ({ activeObject, project }) => {
  if (!activeObject || !project) {
    return (
      <div className="h-1/2 bg-white p-4 border-t border-gray-200 overflow-hidden min-h-0">
        <div className="text-gray-500">Preview will appear here for supported objects</div>
      </div>
    );
  }

  // Render preview based on object type
  const renderPreview = () => {
    switch (activeObject.type) {
      case 'Chart':
        return (
          <Chart
            chart={activeObject.config}
            project={project}
            height={300}
          />
        );

      case 'Trace':
        // Create a temporary chart with just this trace
        const chartConfig = {
          name: `Preview: ${activeObject.name}`,
          traces: [activeObject.config],
          layout: {
            showlegend: true,
            margin: { t: 30, r: 10, b: 30, l: 60 }
          }
        };
        return (
          <Chart
            chart={chartConfig}
            project={project}
            height={300}
          />
        );

      case 'Dashboard':
        return (
          <Dashboard
            project={project}
            dashboardName={activeObject.name}
          />
        );

      default:
        return (
          <div className="text-gray-500">
            Preview not available for {activeObject.type} objects
          </div>
        );
    }
  };

  return (
    <div className="h-1/2 bg-white p-4 border-t border-gray-200 overflow-hidden flex flex-col min-h-0">
      <div className="text-sm font-medium text-gray-700 mb-2">
        Preview: {activeObject.name}
      </div>
      <div className="flex-1 overflow-auto min-h-0">
        {renderPreview()}
      </div>
    </div>
  );
};

export default PreviewPanel; 