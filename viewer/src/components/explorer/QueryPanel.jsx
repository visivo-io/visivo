import React from "react";
import Editor from "@monaco-editor/react";
import { Panel } from "../styled/Panel";
import useStore from "../../stores/store";
import WorksheetTabManager from "../worksheets/WorksheetTabManager";
import { useWorksheets } from "../../contexts/WorksheetContext";
import PlayArrowIcon from "@mui/icons-material/PlayArrow";

const QueryPanel = ({ editorRef, monacoRef }) => {
  const {
    query,
    setQuery,
    error,
    setError,
    isLoading,
    explorerData,
    selectedSource,
    setSelectedSource,
    handleRunQuery,
    splitRatio,
  } = useStore();

  // Use the worksheet context
  const {
    worksheets,
    activeWorksheetId,
    error: worksheetError,
    isLoading: isWorksheetLoading,
    actions: {
      createWorksheet,
      updateWorksheet,
      setActiveWorksheetId,
      clearError: clearWorksheetError,
    },
  } = useWorksheets();

  const visibleWorksheets = worksheets.filter((w) => w.is_visible);
  const combinedError = worksheetError || error;

  const handleEditorChange = (value) => {
    if (value !== undefined) {
      setQuery(value);
    }
  };

  return (
    <Panel style={{ flex: splitRatio }}>
      <WorksheetTabManager
        worksheets={visibleWorksheets}
        activeWorksheetId={activeWorksheetId}
        onWorksheetSelect={setActiveWorksheetId}
        onWorksheetCreate={createWorksheet}
        onWorksheetRename={(id, name) => updateWorksheet(id, { name })}
        isLoading={isLoading || isWorksheetLoading}
      />
      <div className="flex justify-between items-center mb-4 mt-1">
        <div className="flex-1 flex items-center justify-between min-w-0 relative">
          <h2 className="text-lg font-semibold">SQL Query</h2>
          {combinedError && (
            <div className="absolute left-32 right-32 px-4 py-2 text-sm text-red-800 rounded-lg bg-red-50 shadow-lg z-10 flex items-center justify-between">
              {combinedError}
              <button
                type="button"
                className="ml-2 inline-flex items-center"
                onClick={() => {
                  setError(null);
                  clearWorksheetError();
                }}
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
          <div className="flex items-center gap-1.5 mx-4">
            {explorerData?.sources?.map((source) => (
              <button
                key={source.name}
                onClick={() => {
                  setSelectedSource(source);
                }}
                className={`px-2 py-1 text-xs font-medium rounded-md ${
                  selectedSource?.name === source.name
                    ? "bg-highlight text-white"
                    : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                }`}
              >
                {source.name}
              </button>
            ))}
          </div>
          <button
            type="button"
            className={`text-white ${
              isLoading ? "bg-[#A06C86]" : "bg-[#713B57] hover:bg-[#5A2E46]"
            } focus:ring-4 focus:ring-[#A06C86] font-medium rounded-lg text-sm px-5 py-2.5 focus:outline-hidden`}
            onClick={handleRunQuery}
            disabled={isLoading}
          >
            {isLoading ? (
              <div className="flex items-center">
                <div className="animate-spin h-4 w-4 mr-2 border-2 border-white border-t-transparent rounded-full"></div>
                Running...
              </div>
            ) : (
              <div className="flex items-center">
                <PlayArrowIcon className="mr-2" />
                Run Query
              </div>
            )}
          </button>
        </div>
      </div>
      <div className="flex-1 min-h-0 bg-[#1E1E1E] rounded-md ring-1 ring-gray-700/10 overflow-hidden">
        <Editor
          height="100%"
          language="sql"
          theme="vs-dark"
          value={query}
          onChange={handleEditorChange}
          options={{
            minimap: { enabled: false },
            scrollBeyondLastLine: false,
            fontSize: 14,
            readOnly: isLoading,
            automaticLayout: true,
            quickSuggestions: true,
            wordWrap: "on",
            padding: { top: 16, bottom: 8 },
            fixedOverflowWidgets: true,
          }}
          onMount={(editor, monaco) => {
            editorRef.current = editor;
            monacoRef.current = monaco;

            // Add resize handler
            const resizeHandler = () => {
              editor.layout();
            };
            window.addEventListener("resize", resizeHandler);

            // Return cleanup for resize handler
            editor.onDidDispose(() => {
              window.removeEventListener("resize", resizeHandler);
            });
          }}
        />
      </div>
    </Panel>
  );
};

export default QueryPanel;
