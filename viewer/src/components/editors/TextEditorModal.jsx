import React, { useState, useEffect } from 'react';
import useStore from '../../stores/store';

const TextEditorModal = ({ isOpen, onClose, objectName }) => {
  const [editors, setEditors] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const namedChildren = useStore((state) => state.namedChildren);
  
  useEffect(() => {
    const fetchInstalledEditors = async () => {
      try {
        const response = await fetch('/api/editors/installed');
        if (response.ok) {
          const data = await response.json();
          setEditors(data);
        } else {
          throw new Error('Failed to fetch installed editors');
        }
      } catch (error) {
        setError('Failed to load installed editors');
        console.error('Error:', error);
      }
    };

    if (isOpen) {
      fetchInstalledEditors();
    }
  }, [isOpen]);

  const handleEditorSelect = async (editor) => {
    if (!objectName || !namedChildren[objectName]) return;
    
    const filePath = namedChildren[objectName].file_path;
    setIsLoading(true);
    setError(null);
    
    try {
      const response = await fetch('/api/editors/open', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          editorId: editor.id,
          filePath: filePath
        }),
      });
      
      if (!response.ok) {
        throw new Error('Failed to open editor');
      }
      
      onClose();
    } catch (error) {
      setError('Failed to open editor');
      console.error('Error:', error);
    } finally {
      setIsLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 backdrop-blur-sm bg-black/30 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 max-w-md w-full">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-semibold text-gray-900">Open in Text Editor</h2>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg">
            {error}
          </div>
        )}

        <div className="space-y-2">
          {editors.length === 0 ? (
            <p className="text-gray-500 text-center py-4">
              {isLoading ? 'Loading editors...' : 'No text editors found'}
            </p>
          ) : (
            editors.map((editor) => (
              <button
                key={editor.id}
                onClick={() => handleEditorSelect(editor)}
                disabled={isLoading}
                className="w-full text-left px-4 py-3 rounded-lg hover:bg-gray-100 flex items-center space-x-3 disabled:opacity-50"
              >
                <span className="text-gray-900">{editor.name}</span>
                {isLoading && (
                  <div className="ml-auto">
                    <svg className="animate-spin h-4 w-4 text-gray-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                  </div>
                )}
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
};

export default TextEditorModal; 