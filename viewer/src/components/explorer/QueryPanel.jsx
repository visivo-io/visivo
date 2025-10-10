import React from 'react';
import { Panel } from '../styled/Panel';
import useStore from '../../stores/store';
import WorksheetTabManager from '../worksheets/WorksheetTabManager';
import NotebookWorksheet from '../notebook/NotebookWorksheet';

const QueryPanel = () => {
  const { worksheetsError, clearWorksheetError } = useStore();

  const {
    worksheets,
    activeWorksheetId,
    worksheetsLoading,
    createNewWorksheet,
    updateWorksheetData,
    setActiveWorksheet,
  } = useStore();

  const visibleWorksheets = worksheets.filter(w => w.is_visible);

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

  return (
    <Panel style={{ flex: 1 }}>
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
