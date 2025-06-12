import React from 'react';
import ObjectComponent from './components/ObjectComponent';

const EditorContent = ({ scrollRef, handleScroll, activeTabId, activeConfig, activeTab }) => {
  return (
    <div ref={scrollRef} onScroll={handleScroll} className="flex-1 overflow-y-auto min-h-0">
      {activeTabId && activeConfig ? (
        <ObjectComponent key={activeTab.name} data={activeConfig} path={[activeTab.name]} />
      ) : (
        <div className="text-gray-500 text-sm text-center mt-8">
          Double-click an object from the left panel to edit its configuration
        </div>
      )}
    </div>
  );
};

export default EditorContent;
