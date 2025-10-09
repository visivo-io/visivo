import React, { useEffect } from 'react';
import { Panel } from '../styled/Panel';
import useStore from '../../stores/store';
import WorksheetTabManager from '../worksheets/WorksheetTabManager';
import NotebookWorksheet from '../notebook/NotebookWorksheet';
import SourceDropdown from './SourceDropdown';

const QueryPanel = () => {
  const { selectedSource, setSelectedSource, splitRatio, worksheetsError, clearWorksheetError } =
    useStore();

  const {
    worksheets,
    activeWorksheetId,
    worksheetsLoading,
    createNewWorksheet,
    updateWorksheetData,
    setActiveWorksheet,
  } = useStore();

  const visibleWorksheets = worksheets.filter(w => w.is_visible);

  // Update selectedSource when active worksheet changes
  useEffect(() => {
    const activeWorksheet = worksheets.find(w => w.id === activeWorksheetId);
    if (activeWorksheet?.selected_source) {
      // selectedSource will be set from namedChildren in Explorer
    }
  }, [activeWorksheetId, worksheets]);

  const handleWorksheetCreate = async () => {
    try {
      await createNewWorksheet();
    } catch (err) {
      console.error('Failed to create worksheet:', err);
    }
  };

  const handleWorksheetRename = async (id, name) => {
    try {
      await updateWorksheetData(id, { name });
    } catch (err) {
      console.error('Failed to rename worksheet:', err);
    }
  };

  const handleSourceChange = async newSource => {
    setSelectedSource(newSource);
    // Update active worksheet with new source
    if (activeWorksheetId) {
      try {
        await updateWorksheetData(activeWorksheetId, {
          selected_source: newSource?.name,
        });
      } catch (err) {
        console.error('Failed to update worksheet source:', err);
      }
    }
  };

  return (
    <Panel style={{ flex: splitRatio }}>
      <WorksheetTabManager
        worksheets={visibleWorksheets}
        activeWorksheetId={activeWorksheetId}
        onWorksheetSelect={setActiveWorksheet}
        onWorksheetCreate={handleWorksheetCreate}
        onWorksheetRename={handleWorksheetRename}
        isLoading={worksheetsLoading}
      />

      {worksheetsError && (
        <div className="mx-4 mt-2 px-4 py-2 text-sm text-red-800 rounded-lg bg-red-50 shadow-md flex items-center justify-between">
          {worksheetsError}
          <button
            type="button"
            className="ml-2 inline-flex items-center"
            onClick={clearWorksheetError}
          >
            <span className="sr-only">Dismiss</span>
            <svg
              className="w-3 h-3"
              aria-hidden="true"
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 14 14"
            >
              <path
                stroke="currentColor"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="m1 1 6 6m0 0 6 6M7 7l6-6M7 7l-6 6"
              />
            </svg>
          </button>
        </div>
      )}

      <div className="flex justify-between items-center px-6 py-3 border-b border-gray-200 bg-white">
        <h2 className="text-base font-semibold text-gray-700">Notebook</h2>
        <SourceDropdown
          selectedSource={selectedSource}
          onSourceChange={handleSourceChange}
          isLoading={worksheetsLoading}
        />
      </div>

      <div className="flex-1 min-h-0 overflow-auto bg-gray-50">
        {activeWorksheetId ? (
          <NotebookWorksheet worksheetId={activeWorksheetId} />
        ) : (
          <div className="flex items-center justify-center h-full">
            <div className="text-center text-gray-500">
              <p className="mb-4">No worksheet selected</p>
              <button
                type="button"
                className="bg-[#713B57] hover:bg-[#5A2E46] text-white font-medium rounded-lg text-sm px-4 py-2"
                onClick={handleWorksheetCreate}
              >
                Create Worksheet
              </button>
            </div>
          </div>
        )}
      </div>
    </Panel>
  );
};

export default QueryPanel;
