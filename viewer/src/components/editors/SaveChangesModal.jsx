import React from 'react';
import useStore from '../../stores/store';
import ObjectPill from './ObjectPill';
import { Toast } from 'flowbite-react';
import { HiCheck, HiX, HiExclamation } from 'react-icons/hi';

const SaveChangesModal = ({ isOpen, onClose }) => {
  const namedChildren = useStore((state) => state.namedChildren);
  const isLoading = useStore((state) => state.isLoading);
  const writeError = useStore((state) => state.writeError);
  const writeModifiedFiles = useStore((state) => state.writeModifiedFiles);
  const [showSavingToast, setShowSavingToast] = React.useState(false);
  const [showSuccessToast, setShowSuccessToast] = React.useState(false);
  const [showErrorToast, setShowErrorToast] = React.useState(false);
  
  // Filter only modified items
  const modifiedItems = Object.entries(namedChildren).filter(
    ([_, value]) => value.status !== "Unchanged"
  );

  const handleWriteFiles = async () => {
    setShowSavingToast(true);
    try {
      await writeModifiedFiles();
      setShowSavingToast(false);
      if (!writeError) {
        onClose();
        setShowSuccessToast(true);
        setTimeout(() => {
          setShowSuccessToast(false);
        }, 1000);
      } else {
        onClose();
        setShowErrorToast(true);
      }
    } catch (error) {
      setShowSavingToast(false);
      setShowErrorToast(true);
    }
  };

  if (!isOpen) return null;

  return (
    <>
      {/* Saving Toast */}
      {showSavingToast && (
        <div className="fixed top-4 left-1/2 transform -translate-x-1/2 z-[60]">
          <Toast className="bg-[#713B57] text-white border-none">
            <div className="inline-flex items-center">
              <div className="h-4 w-4 mr-3 animate-spin rounded-full border-2 border-solid border-white border-r-transparent" />
              Saving changes...
            </div>
          </Toast>
        </div>
      )}

      {/* Success Toast */}
      {showSuccessToast && (
        <div className="fixed top-4 left-1/2 transform -translate-x-1/2 z-[60]">
          <Toast className="bg-[#713B57] text-white border-none">
            <div className="inline-flex items-center">
              <HiCheck className="h-4 w-4 mr-3" />
              Changes saved successfully!
            </div>
          </Toast>
        </div>
      )}

      {/* Error Toast */}
      {showErrorToast && (
        <div className="fixed top-4 left-1/2 transform -translate-x-1/2 z-[60]">
          <Toast className="bg-[#D25946] text-white border-none">
            <div className="inline-flex items-center">
              <HiExclamation className="h-4 w-4 mr-3" />
              Error saving changes
              <button 
                onClick={() => setShowErrorToast(false)}
                className="ml-3 hover:text-gray-200"
              >
                <HiX className="h-4 w-4" />
              </button>
            </div>
          </Toast>
        </div>
      )}

      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div className="bg-white rounded-lg p-6 max-w-2xl w-full max-h-[80vh] flex flex-col">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-semibold text-gray-900">Modified Items</h2>
            <button
              onClick={onClose}
              className="text-gray-500 hover:text-gray-700"
              disabled={isLoading}
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          
          <div className="flex-1 overflow-y-auto mb-4">
            {writeError && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-4">
                {writeError}
              </div>
            )}
            
            {modifiedItems.length === 0 ? (
              <p className="text-gray-500 text-center py-4">No modified items to save</p>
            ) : (
              <div className="space-y-3">
                {modifiedItems.map(([key, value]) => (
                  <div key={key} className="p-3 bg-gray-50 rounded-lg">
                    <div className="font-medium text-gray-900">
                      <ObjectPill name={key} inline={value.is_inline_defined} />
                    </div>
                    <div className="text-sm text-gray-500">Status: {value.status}</div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="flex justify-end">
            <button
              onClick={onClose}
              disabled={isLoading}
              className="mr-3 px-4 py-2 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg disabled:bg-gray-100 disabled:text-gray-400"
            >
              Cancel
            </button>
            <button
              onClick={handleWriteFiles}
              disabled={modifiedItems.length === 0 || isLoading}
              className="px-4 py-2 bg-[#713B57] text-white rounded-lg hover:bg-[#5A2F46] disabled:bg-gray-300 disabled:cursor-not-allowed flex items-center"
            >
              {isLoading ? (
                <>
                  <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Saving...
                </>
              ) : (
                'Write To Files'
              )}
            </button>
          </div>
        </div>
      </div>
    </>
  );
};

export default SaveChangesModal; 