import React from 'react';
import Chart from '../items/Chart';
import Dashboard from '../project/Dashboard';
import useStore from '../../stores/store';

const selectTabs = state => state.tabs;
const selectActiveTabId = state => state.activeTabId;
const selectNamedChildren = state => state.namedChildren;

const PreviewPanel = ({ project }) => {
  const tabs = useStore(selectTabs);
  const activeTabId = useStore(selectActiveTabId);
  const namedChildren = useStore(selectNamedChildren);

  const activeTab = activeTabId ? tabs.find(tab => tab.id === activeTabId) : null;
  const activeConfig = activeTab ? namedChildren[activeTab.name]?.config : null;
  if (!project) {
    return (
      <div className="h-1/2 bg-white p-4 border-t border-gray-200 overflow-hidden min-h-0">
        <div className="text-gray-500">Preview will appear here for supported objects</div>
      </div>
    );
  }

  // Render preview based on object type
  const renderPreview = () => {
    if (!activeTab) {
      return <div className="text-gray-500">No preview available</div>;
    }
    switch (activeTab.type) {
      case 'Chart':
        return <Chart chart={activeConfig} project={project} height={300} />;

      case 'Trace':
        // Create a temporary chart with just this trace
        const chartConfig = {
          name: `Preview: ${activeTab.name}`,
          traces: [activeConfig],
          layout: {
            showlegend: true,
            margin: { t: 30, r: 10, b: 30, l: 60 },
          },
        };
        return <Chart chart={chartConfig} project={project} height={300} />;

      case 'Dashboard':
        return <Dashboard project={project} dashboardName={activeTab.name} />;

      default:
        return (
          <div className="text-gray-500">Preview not available for {activeTab.type} objects</div>
        );
    }
  };

  return (
    <div className="h-1/2 bg-white p-4 border-t border-gray-200 overflow-hidden flex flex-col min-h-0">
      <div className="text-sm font-medium text-gray-700 mb-2">
        {activeTab ? `Preview: ${activeTab.name}` : ''}
      </div>
      <div className="flex-1 overflow-auto min-h-0">{renderPreview()}</div>
    </div>
  );
};

export default PreviewPanel;
