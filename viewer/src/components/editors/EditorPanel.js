import React from 'react';
import { HiX } from 'react-icons/hi';
import { useState, useEffect } from 'react';
import { fetchSchema } from '../../api/schema';

const EditorPanel = ({ tabs, activeTab, onTabChange, onTabClose, onConfigChange }) => {
  const [schema, setSchema] = useState(null);
  useEffect(() => {
    const loadSchema = async () => {
      try {
        const schemaData = await fetchSchema();
        setSchema(schemaData);
      } catch (error) {
        console.error('Error loading schema:', error);
      }
    };
    loadSchema();
  }, []);
  return (
    <div className="flex-1 bg-white border-b border-gray-200 p-4 overflow-hidden flex flex-col min-h-0">
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
      <div className="flex-1 overflow-y-auto min-h-0">
        {activeTab ? (
          <div className="text-gray-500 text-sm text-center mt-8">
            Replace this with the editor the filtered editor for the active tab object
          </div>
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