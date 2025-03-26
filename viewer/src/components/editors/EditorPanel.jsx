import React from 'react';
import { HiX } from 'react-icons/hi';
import ObjectComponent from './ObjectComponent';
import SaveChangesModal from './SaveChangesModal';
import useStore from '../../stores/store';

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
  
  // Add state for modal
  const [isModalOpen, setIsModalOpen] = React.useState(false);
  
  const activeTab = activeTabId ? tabs.find(tab => tab.id === activeTabId) : null;
  const activeConfig = activeTab && namedChildren[activeTab.name]?.config;

  // Add ref for scroll container
  const scrollRef = React.useRef(null);
  const [scrollPosition, setScrollPosition] = React.useState(0);

  // Save scroll position before update
  const handleScroll = React.useCallback(() => {
    if (scrollRef.current) {
      setScrollPosition(scrollRef.current.scrollTop);
    }
  }, []);

  // Restore scroll position after update
  React.useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollPosition;
    }
  }, [scrollPosition, activeConfig]);

  return (
    <div className="flex-1 bg-white border-b border-gray-200 p-2 overflow-hidden flex flex-col min-h-0">
      <div className="flex items-center justify-between border-b border-gray-200">
        <div className="flex space-x-1 overflow-x-auto">
          {tabs.map((tab) => (
            <div
              key={tab.id}
              className={`flex items-center px-4 py-2 rounded-t-lg  cursor-pointer border-b-2 ${
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
        <div className="pl-2 pb-4">
          <button
            onClick={() => setIsModalOpen(true)}
            className="px-4 py-2 bg-[#713B57] text-white rounded-lg hover:bg-[#5A2F46] hover:scale-105 flex items-center"
          >
            Save
          </button>
        </div>
      </div>
      <div 
        ref={scrollRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto min-h-0"
      >
        {activeTabId && activeConfig ? (
          <ObjectComponent 
            key={activeTab.name}
            data={activeConfig} 
            path={[activeTab.name]} 
          />
        ) : (
          <div className="text-gray-500 text-sm text-center mt-8">
            Double-click an object from the left panel to edit its configuration
          </div>
        )}
      </div>
      
      <SaveChangesModal 
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
      />
    </div>
  );
};

export default EditorPanel; 