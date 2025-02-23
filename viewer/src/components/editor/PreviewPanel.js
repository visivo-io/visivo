import React from 'react';
import Chart from '../items/Chart';
import Dashboard from '../Dashboard';

const PreviewPanel = ({ activeObject, project }) => {
  if (!activeObject || !project) {
    return (
      <div className="h-1/2 bg-white p-4 border-t border-gray-200">
        <div className="text-gray-500 text-sm">Preview will appear here for supported objects</div>
      </div>
    );
  }

  const renderPreview = () => {
    switch (activeObject.type) {
      case 'Chart':
        return (
          <Chart
            chart={activeObject.config}
            project={project}
            height={300}
            width={null}
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
            width={null}
          />
        );

      case 'Dashboard':
        return (
          <div className="h-full overflow-auto">
            <Dashboard
              project={project}
              dashboardName={activeObject.name}
            />
          </div>
        );

      default:
        return (
          <div className="text-gray-500 text-sm">
            Preview not available for {activeObject.type} objects
          </div>
        );
    }
  };

  return (
    <div className="h-1/2 bg-white p-4 border-t border-gray-200 overflow-hidden">
      <div className="text-sm font-medium text-gray-700 mb-2">
        Preview: {activeObject.name}
      </div>
      <div className="h-[calc(100%-2rem)] overflow-auto">
        {renderPreview()}
      </div>
    </div>
  );
};

export default PreviewPanel; 