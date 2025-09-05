import React, { useState, useEffect, useCallback } from 'react';
import { testSourceConnectionFromConfig } from '../../api/explorer';

const SourceConnectionTest = ({ 
  objectName, 
  selectedSource, 
  attributes, 
  isVisible = true 
}) => {
  const [isTestingConnection, setIsTestingConnection] = useState(false);
  const [connectionTestResult, setConnectionTestResult] = useState(null);
  const [lastTestedConfig, setLastTestedConfig] = useState(null);

  // Check if current config matches last tested config
  const configHasChanged = useCallback(() => {
    if (!lastTestedConfig) return true;
    
    const currentConfig = {
      name: objectName,
      type: selectedSource?.value,
      ...attributes
    };
    
    return JSON.stringify(currentConfig) !== JSON.stringify(lastTestedConfig);
  }, [objectName, selectedSource, attributes, lastTestedConfig]);

  // Clear test result when config changes
  useEffect(() => {
    if (configHasChanged() && connectionTestResult) {
      setConnectionTestResult(null);
    }
  }, [objectName, attributes, selectedSource, configHasChanged, connectionTestResult]);

  const handleTestConnection = async () => {
    if (!objectName) return;
    
    setIsTestingConnection(true);
    setConnectionTestResult(null);
    
    try {
      // Create a source configuration object for testing
      const sourceConfig = {
        name: objectName,
        type: selectedSource?.value,
        ...attributes
      };
      
      // Save the tested config
      setLastTestedConfig(sourceConfig);
      
      // Test the connection using the API
      const result = await testSourceConnectionFromConfig(sourceConfig);
      setConnectionTestResult(result);
      
    } catch (error) {
      setConnectionTestResult({
        status: 'connection_failed',
        error: error.message || 'Failed to test connection'
      });
    } finally {
      setIsTestingConnection(false);
    }
  };

  if (!isVisible) return null;

  return (
    <div className="border-t pt-4 mt-4">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-medium text-gray-700">Connection Status</span>
        <button
          onClick={handleTestConnection}
          disabled={isTestingConnection || !objectName}
          className="px-4 py-1 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isTestingConnection ? 'Testing...' : 'Test Connection'}
        </button>
      </div>
      
      {/* Connection Status Indicator */}
      <div className="flex items-center space-x-2">
        {isTestingConnection ? (
          <>
            <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-600"></div>
            <span className="text-sm text-gray-600">Testing connection...</span>
          </>
        ) : connectionTestResult ? (
          connectionTestResult.status === 'connected' && !configHasChanged() ? (
            <>
              <svg className="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"></path>
              </svg>
              <span className="text-sm text-green-600">Connection successful</span>
            </>
          ) : (
            <>
              <svg className="w-5 h-5 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path>
              </svg>
              <span className="text-sm text-red-600">
                {connectionTestResult.error || 'Connection failed'}
              </span>
            </>
          )
        ) : (
          <span className="text-sm text-gray-500 italic">Connection not tested</span>
        )}
      </div>
    </div>
  );
};

export default SourceConnectionTest;