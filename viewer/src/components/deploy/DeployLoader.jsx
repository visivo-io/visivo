import React from 'react';
import Loading from '../common/Loading';

const DeployLoader = ({ message = 'Loading ...' }) => {
  return (
    <div className="text-center space-y-6">
      <div className="mx-auto w-20 h-20 bg-gradient-to-br from-gray-100 to-blue-100 rounded-full flex items-center justify-center mb-6">
        <div className="w-8 h-8">
          <Loading />
        </div>
      </div>
      <div className="space-y-3">
        <h3 className="text-xl font-semibold text-gray-900">{message}</h3>
        <p className="text-gray-600">Fetching available deployment environments</p>
      </div>
    </div>
  );
};

export default DeployLoader;
