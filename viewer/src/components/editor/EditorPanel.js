import React from 'react';

const EditorPanel = () => {
  return (
    <div className="flex-1 bg-white border-b border-gray-200 p-4">
      <div className="flex items-center border-b border-gray-200 mb-4">
        {/* Tabs */}
        <div className="flex space-x-2">
          <button className="px-4 py-2 text-sm font-medium text-blue-600 border-b-2 border-blue-600">
            Object 1
          </button>
          <button className="px-4 py-2 text-sm font-medium text-gray-500 hover:text-gray-700">
            Object 2
          </button>
        </div>
      </div>
      <div className="text-gray-500 text-sm">Select an object to edit</div>
    </div>
  );
};

export default EditorPanel; 