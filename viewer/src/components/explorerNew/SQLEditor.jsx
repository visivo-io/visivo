import React, { useState, useRef, useEffect, useCallback } from 'react';
import Editor from '@monaco-editor/react';
import { PiPlay, PiStop, PiX, PiKeyboard } from 'react-icons/pi';
import { useModelQueryJob } from '../../hooks/useModelQueryJob';
import { useSourceSchema } from '../../hooks/useSourceSchema';
import { createSQLCompletionProvider, disposeCompletionProvider } from '../../utils/sqlAutocomplete';
import { inferColumnTypes } from '../../utils/inferColumnTypes';
import DataTable from '../common/DataTable';

const SQLEditor = ({
  initialValue = '',
  sourceName,
  onSave,
  readOnly = false,
  height = '300px',
  resultsHeight = '400px',
}) => {
  const editorRef = useRef(null);
  const monacoRef = useRef(null);
  const completionProviderRef = useRef(null);

  const [sql, setSql] = useState(initialValue);
  const [showError, setShowError] = useState(true);

  // Results pagination state
  const [resultsPage, setResultsPage] = useState(0);
  const [resultsPageSize, setResultsPageSize] = useState(1000);

  // Query execution hook
  const { result, error, isRunning, progress, progressMessage, executeQuery, cancel } =
    useModelQueryJob();

  // Schema for autocomplete
  const { tables, tableColumns, isLoading: isSchemaLoading } = useSourceSchema(sourceName);

  // Reset results page when new results come in
  useEffect(() => {
    if (result) {
      setResultsPage(0);
    }
  }, [result]);

  // Update SQL when initialValue changes
  useEffect(() => {
    setSql(initialValue);
  }, [initialValue]);

  // Handle query execution
  const handleRun = useCallback(() => {
    if (!sourceName) {
      return;
    }

    // Get selected text if any, otherwise use full query
    const editor = editorRef.current;
    let queryText = sql;

    if (editor) {
      const selection = editor.getSelection();
      if (selection && !selection.isEmpty()) {
        queryText = editor.getModel().getValueInRange(selection);
      }
    }

    if (!queryText.trim()) {
      return;
    }

    setShowError(true);
    executeQuery(sourceName, queryText.trim());
  }, [sourceName, sql, executeQuery]);

  // Handle cancel
  const handleCancel = useCallback(() => {
    cancel();
  }, [cancel]);

  // Handle error dismiss
  const handleDismissError = useCallback(() => {
    setShowError(false);
  }, []);

  // Handle editor changes
  const handleEditorChange = useCallback(
    value => {
      setSql(value || '');
      if (onSave) {
        onSave(value || '');
      }
    },
    [onSave]
  );

  // Handle editor mount
  const handleEditorDidMount = useCallback(
    (editor, monaco) => {
      editorRef.current = editor;
      monacoRef.current = monaco;

      // Register completion provider if we have schema data
      if (tables.length > 0 || Object.keys(tableColumns).length > 0) {
        const provider = createSQLCompletionProvider({ tables, tableColumns }, monaco);
        completionProviderRef.current = monaco.languages.registerCompletionItemProvider(
          'sql',
          provider
        );
      }

      // Keyboard shortcuts
      // Cmd/Ctrl+Enter: Execute query
      editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => {
        if (!isRunning) {
          handleRun();
        }
      });

      // Escape: Cancel query
      editor.addCommand(monaco.KeyCode.Escape, () => {
        if (isRunning) {
          handleCancel();
        }
      });

      // Focus the editor
      editor.focus();
    },
    [tables, tableColumns, isRunning, handleRun, handleCancel]
  );

  // Update completion provider when schema changes
  useEffect(() => {
    if (monacoRef.current && (tables.length > 0 || Object.keys(tableColumns).length > 0)) {
      // Dispose old provider
      disposeCompletionProvider(completionProviderRef.current);

      // Register new provider
      const provider = createSQLCompletionProvider({ tables, tableColumns }, monacoRef.current);
      completionProviderRef.current = monacoRef.current.languages.registerCompletionItemProvider(
        'sql',
        provider
      );
    }

    return () => {
      disposeCompletionProvider(completionProviderRef.current);
    };
  }, [tables, tableColumns]);

  // Transform result for DataTable
  const dataTableColumns = result ? inferColumnTypes(result.columns || [], result.rows || []) : [];
  const tableRows = result?.rows || [];
  const totalRowCount = result?.row_count || tableRows.length;
  const pageCount = Math.ceil(tableRows.length / resultsPageSize);

  // Paginate rows for display
  const paginatedRows = tableRows.slice(
    resultsPage * resultsPageSize,
    (resultsPage + 1) * resultsPageSize
  );

  return (
    <div className="flex flex-col border border-secondary-200 rounded-lg overflow-hidden bg-white">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-secondary-100 bg-secondary-50">
        <div className="flex items-center gap-3">
          {!isRunning ? (
            <button
              type="button"
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-primary hover:bg-primary-600 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              onClick={handleRun}
              disabled={!sourceName || readOnly}
              title="Run query (Cmd/Ctrl+Enter)"
            >
              <PiPlay size={14} />
              Run
            </button>
          ) : (
            <button
              type="button"
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-highlight hover:bg-highlight-600 rounded transition-colors"
              onClick={handleCancel}
              title="Cancel query (Escape)"
            >
              <PiStop size={14} />
              Cancel
            </button>
          )}

          {isRunning && (
            <span className="text-xs text-secondary-500">
              {progressMessage || 'Running...'}
              {progress > 0 && progress < 1 && ` (${Math.round(progress * 100)}%)`}
            </span>
          )}

          {isSchemaLoading && (
            <span className="text-xs text-secondary-400">Loading schema...</span>
          )}
        </div>

        <div className="flex items-center gap-2 text-secondary-400">
          <PiKeyboard size={14} />
          <span className="text-xs hidden sm:inline">Cmd+Enter to run</span>
        </div>
      </div>

      {/* Progress bar */}
      {isRunning && (
        <div className="h-0.5 bg-primary-100 overflow-hidden">
          <div
            className="h-full bg-primary transition-all duration-300 ease-out"
            style={{ width: progress > 0 ? `${progress * 100}%` : '100%' }}
          />
        </div>
      )}

      {/* Editor */}
      <div className="bg-[#1E1E1E]" style={{ height }}>
        <Editor
          height="100%"
          language="sql"
          theme="vs-dark"
          value={sql}
          onChange={handleEditorChange}
          onMount={handleEditorDidMount}
          options={{
            minimap: { enabled: false },
            scrollBeyondLastLine: false,
            fontSize: 13,
            readOnly: readOnly || isRunning,
            automaticLayout: true,
            quickSuggestions: true,
            wordWrap: 'on',
            padding: { top: 12, bottom: 12 },
            lineNumbers: 'on',
            glyphMargin: false,
            folding: true,
            lineDecorationsWidth: 8,
            lineNumbersMinChars: 3,
            scrollbar: {
              vertical: 'auto',
              horizontal: 'auto',
            },
            suggestOnTriggerCharacters: true,
            acceptSuggestionOnEnter: 'on',
            tabCompletion: 'on',
          }}
        />
      </div>

      {/* Error display */}
      {error && showError && (
        <div className="flex items-start justify-between px-4 py-3 bg-highlight-100 border-t border-highlight-200">
          <div className="flex flex-col gap-1">
            <span className="text-sm font-medium text-highlight-700">Error</span>
            <span className="text-sm text-highlight-600 font-mono whitespace-pre-wrap break-words">
              {error}
            </span>
          </div>
          <button
            type="button"
            className="p-1 text-highlight-500 hover:text-highlight-700 transition-colors"
            onClick={handleDismissError}
            title="Dismiss error"
          >
            <PiX size={16} />
          </button>
        </div>
      )}

      {/* Results */}
      {result && !error && (
        <div className="flex flex-col border-t border-secondary-200" style={{ height: resultsHeight }}>
          <div className="flex items-center gap-3 px-3 py-2 bg-secondary-50 border-b border-secondary-100 flex-shrink-0">
            <span className="text-xs text-secondary-600">
              {totalRowCount.toLocaleString()} row{totalRowCount !== 1 ? 's' : ''}
            </span>
            {result.truncated && (
              <span className="text-xs text-secondary-400">(truncated)</span>
            )}
            {result.execution_time_ms && (
              <span className="text-xs text-secondary-400">{result.execution_time_ms}ms</span>
            )}
          </div>
          <div className="flex-1 overflow-hidden">
            <DataTable
              columns={dataTableColumns}
              rows={paginatedRows}
              totalRowCount={totalRowCount}
              page={resultsPage}
              pageSize={resultsPageSize}
              pageCount={pageCount}
              onPageChange={setResultsPage}
              onPageSizeChange={setResultsPageSize}
              isLoading={false}
              height="100%"
            />
          </div>
        </div>
      )}
    </div>
  );
};

export default SQLEditor;
