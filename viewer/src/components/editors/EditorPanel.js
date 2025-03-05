import React, { useEffect } from 'react';
import { HiX } from 'react-icons/hi';
import ObjectComponent from './ObjectComponent';
import useStore from '../../stores/store';
import { shallow } from 'zustand/shallow';

// Split into smaller, more focused selectors
const selectTabs = state => state.tabs;
const selectActiveTabId = state => state.activeTabId;
const selectNamedChildren = state => state.namedChildren;

const EditorPanel = () => {
  // Get basic tab state
  const tabs = useStore(selectTabs);
  const activeTabId = useStore(selectActiveTabId);
  const namedChildren = useStore(selectNamedChildren);
  
  // Get actions directly
  const setActiveTab = useStore(state => state.setActiveTab);
  const closeTab = useStore(state => state.closeTab);
  
  // Compute active tab data only when needed
  useEffect(() => {
    console.log('EditorPanel render with namedChildren update:', 
      activeTab?.name, 
      activeConfig
    );
  }, [namedChildren, activeTabId]);
  
  const activeTab = activeTabId ? tabs.find(tab => tab.id === activeTabId) : null;
  const activeConfig = activeTab && namedChildren[activeTab.name]?.config;
  return (
    <div className="flex-1 bg-white border-b border-gray-200 p-4 overflow-hidden flex flex-col min-h-0">
      <div className="flex items-center border-b border-gray-200 mb-4 overflow-x-auto">
        <div className="flex space-x-1">
          {tabs.map((tab) => (
            <div
              key={tab.id}
              className={`flex items-center px-4 py-2 rounded-t-lg cursor-pointer border-b-2 ${
                activeTabId === tab.id
                  ? 'text-blue-600 border-blue-600 bg-blue-50'
                  : 'text-gray-500 hover:text-gray-700 border-transparent'
              }`}
              onClick={() => setActiveTab(tab.id)}
            >
              <span className="text-sm font-medium truncate max-w-xs">
                {tab.name}
              </span>
              <button
                className="ml-2 p-1 hover:bg-blue-100 rounded"
                onClick={(e) => {
                  e.stopPropagation();
                  closeTab(tab.id);
                }}
              >
                <HiX className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      </div>
      <div className="flex-1 overflow-y-auto min-h-0">
        {activeTabId && activeConfig ? (
          <ObjectComponent 
            key={`${activeTab.name}-${JSON.stringify(activeConfig)}`}
            data={activeConfig} 
            path={[activeTab.name]} 
          />
        ) : (
          <div className="text-gray-500 text-sm text-center mt-8">
            Double-click an object from the left panel to edit its configuration
          </div>
        )}
      </div>
    </div>
  );
};

export default EditorPanel; 