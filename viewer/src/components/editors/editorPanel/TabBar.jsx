import React from 'react';
import { HiX } from 'react-icons/hi';

const TabBar = ({ tabs, activeTabId, setActiveTab, closeTab }) => {
  return (
    <div className="flex-1 min-w-0">
      <div className="flex space-x-1 overflow-x-auto">
        {tabs.map(tab => (
          <div
            key={tab.id}
            className={`flex items-center px-4 py-2 rounded-t-lg cursor-pointer border-b-2 ${
              activeTabId === tab.id
                ? 'text-blue-600 border-blue-600 bg-blue-50'
                : 'text-gray-500 hover:text-gray-700 border-transparent'
            }`}
            onClick={() => setActiveTab(tab.id)}
          >
            <span className="text-sm font-medium truncate max-w-xs">{tab.name}</span>
            <button
              className="ml-2 p-1 hover:bg-blue-100 rounded-xs"
              onClick={e => {
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
  );
};

export default TabBar; 