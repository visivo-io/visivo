import React, { useState } from 'react';
import { HiX } from 'react-icons/hi';
import FriendlyJsonEditor from './FriendlyJsonEditor';

const EditorPanel = ({ tabs, activeTab, onTabChange, onTabClose, onConfigChange }) => {
  return (
    <div className="flex-1 bg-white border-b border-gray-200 p-4 overflow-hidden flex flex-col">
      <div className="flex items-center border-b border-gray-200 mb-4 overflow-x-auto">
        <div className="flex space-x-1">
          {tabs.map((tab) => (
            <div
              key={tab.id}
              className={`flex items-center px-4 py-2 rounded-t-lg cursor-pointer border-b-2 ${
                activeTab?.id === tab.id
                  ? 'text-blue-600 border-blue-600 bg-blue-50'
                  : 'text-gray-500 hover:text-gray-700 border-transparent'
              }`}
              onClick={() => onTabChange(tab)}
            >
              <span className="text-sm font-medium truncate max-w-xs">
                {tab.name}
              </span>
              <button
                className="ml-2 p-1 hover:bg-blue-100 rounded"
                onClick={(e) => {
                  e.stopPropagation();
                  onTabClose(tab.id);
                }}
              >
                <HiX className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      </div>
      <div className="flex-1 overflow-y-auto">
        {activeTab ? (
          <FriendlyJsonEditor
            data={activeTab.config}
            onChange={(newConfig) => onConfigChange(activeTab.id, newConfig)}
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