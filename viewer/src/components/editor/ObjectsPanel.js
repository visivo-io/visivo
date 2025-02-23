import React from 'react';

const ObjectsPanel = () => {
  return (
    <div className="w-64 bg-white border-r border-gray-200 p-4">
      <div className="mb-4">
        <input
          type="text"
          placeholder="Search objects..."
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
        />
      </div>
      <div className="mb-4">
        <select className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500">
          <option value="">All Types</option>
          <option value="trace">Trace</option>
          <option value="model">Model</option>
          <option value="dashboard">Dashboard</option>
        </select>
      </div>
      <div className="overflow-y-auto">
        {/* Object list will go here */}
        <div className="text-gray-500 text-sm">No objects found</div>
      </div>
    </div>
  );
};

export default ObjectsPanel; 