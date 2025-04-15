import React, { useState, useEffect, useCallback } from 'react';
import { useLoaderData } from 'react-router-dom';
import MonacoEditor from '@monaco-editor/react';
import ExplorerTree from './explorer/ExplorerTree';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import Table from './items/Table';
import { executeQuery, fetchTraceQuery } from '../services/queryService';
import { fetchExplorer } from '../api/explorer';
import tw from "tailwind-styled-components";
import TopNav from './TopNav';
import { useWorksheets } from '../contexts/WorksheetContext';
import { useQueryHotkeys } from '../hooks/useQueryHotkeys';
import WorksheetTabManager from './worksheets/WorksheetTabManager';
import { Sidebar } from './styled/Sidebar';
const Container = tw.div`
  h-screen
  bg-gray-100
  flex
  flex-col
  overflow-hidden
  m-0
  fixed
  inset-0
`;

const MainContent = tw.div`
  flex
  flex-1
  min-h-0
  overflow-hidden
`;

const RightPanel = tw.div`
  flex-1
  flex
  flex-col
  min-h-0
  overflow-hidden
`;

const Panel = tw.div`
  bg-white
  p-2
  flex-1
  flex
  flex-col
  relative
  min-h-0
  overflow-hidden
`;

const QueryExplorer = () => {
  const project = useLoaderData();
  const [selectedTab, setSelectedTab] = useState(0);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState(null);
  const [treeData, setTreeData] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [explorerData, setExplorerData] = useState(null);
  const [queryStats, setQueryStats] = useState(null);
  const [splitRatio, setSplitRatio] = useState(0.5);
  const [isDragging, setIsDragging] = useState(false);
  const [selectedSource, setSelectedSource] = useState(null);
  const editorRef = React.useRef(null);
  const monacoRef = React.useRef(null);

  // Use the worksheet context
  const {
    worksheets,
    activeWorksheetId,
    isLoading: isWorksheetLoading,
    error: worksheetError,
    actions: {
      createWorksheet,
      updateWorksheet,
      setActiveWorksheetId,
      loadWorksheetResults,
      clearError: clearWorksheetError
    }
  } = useWorksheets();

  // Filter visible worksheets for the tab manager
  const visibleWorksheets = worksheets.filter(w => w.is_visible);

  const handleMouseDown = (e) => {
    setIsDragging(true);
  e.preventDefault();
  };

  useEffect(() => {
    const handleMouseMove = (e) => {
      if (!isDragging) return;

      const container = document.getElementById('right-panel');
      if (!container) return;

      const containerRect = container.getBoundingClientRect();
      const containerHeight = containerRect.height;
      const mouseY = e.clientY - containerRect.top;
      
      // Calculate ratio (constrain between 0.2 and 0.8)
      const newRatio = Math.max(0.2, Math.min(0.8, mouseY / containerHeight));
      setSplitRatio(newRatio);
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging]);

  useEffect(() => {
    const loadExplorerData = async () => {
      try {
        const data = await fetchExplorer();
        if (data) {
          setExplorerData(data);
          if (data.sources && data.sources.length > 0) {
            if (data.default_source) {
              const defaultSource = data.sources.find(s => s.name === data.default_source);
              if (defaultSource) {
                setSelectedSource(defaultSource);
              } else {
                setSelectedSource(data.sources[0]);
              }
            } else {
              setSelectedSource(data.sources[0]);
            }
          }
        }
      } catch (err) {
        console.error('Error loading explorer data:', err);
        setError('Failed to load explorer data');
      }
    };
    loadExplorerData();
  }, []);

  const transformData = React.useCallback(() => {
    if (!explorerData) return [];
    
    const data = [];

    switch (selectedTab) {
      case 0: // Models
        if (explorerData.models) {
          const modelItems = explorerData.models
            .filter(model => model && typeof model === 'object' && model.name)
            .map((model, index) => ({
              id: `model-${model.name}-${index}`,
              name: model.name,
              type: 'model',
              config: model
            }));
          data.push(...modelItems);
        }
        break;
      case 1: // Traces
        if (explorerData.traces) {
          const traceItems = explorerData.traces
            .filter(trace => trace && typeof trace === 'object' && trace.name)
            .map((trace, index) => ({
              id: `trace-${trace.name}-${index}`,
              name: trace.name,
              type: 'trace',
              config: trace
            }));
          data.push(...traceItems);
        }
        break;
      default:
        break;
    }
    return data;
  }, [selectedTab, explorerData]);

  useEffect(() => {
    setTreeData(transformData());
  }, [transformData]);

  const handleTabChange = (tab) => {
    setSelectedTab(tab);
  };

  const handleEditorChange = (value) => {
    if (value !== undefined) {
      setQuery(value);
    }
  };

  const handleItemClick = async (item) => {
    let newQuery = '';
    let newSource = selectedSource;

    try {
      switch (item.type) {
        case 'model':
          if (item.config.type === 'CsvScriptModel' || item.config.type === 'LocalMergeModel') {
            newSource = explorerData?.sources?.find(s => s.type === 'duckdb') || selectedSource;
          } else if (item.config.source) {
            newSource = explorerData?.sources?.find(s => s.name === item.config.source.name) || selectedSource;
          } else {
            newSource = explorerData?.sources?.[0] || selectedSource;
          }
          newQuery = `WITH model AS (${item.config.sql})\nSELECT * FROM model LIMIT 10;`;
          break;
        case 'trace':
          try {
            newQuery = await fetchTraceQuery(item.name);
          } catch (err) {
            console.error('Failed to fetch trace query:', err);
            setError(`Failed to fetch trace query: ${err.message}`);
            return;
          }
          break;
        default:
          newQuery = '';
          break;
      }
      
      setQuery(newQuery);
      if (newSource) {
        setSelectedSource(newSource);
      }

      // Update active worksheet with new query
      if (activeWorksheetId) {
        await updateWorksheet(activeWorksheetId, {
          query: newQuery,
          selected_source: newSource?.name
        });
      }
    } catch (err) {
      console.error('Error in handleItemClick:', err);
      setError(err.message || 'Failed to process item click');
    }
  };

  const executeQueryWithStats = React.useCallback(async (queryString) => {
    const startTime = performance.now();
    const timestamp = new Date();
    
    try {
      const queryResults = await executeQuery(queryString, project.id, selectedSource?.name, activeWorksheetId);
      const endTime = performance.now();
      const executionTime = ((endTime - startTime) / 1000).toFixed(2);
      
      setQueryStats({
        timestamp: timestamp,
        executionTime: executionTime,
        source: selectedSource?.name
      });
      
      return queryResults;
    } catch (err) {
      throw err;
    }
  }, [selectedSource, project.id, activeWorksheetId]);

  const executeQueryAndUpdateState = useCallback(async (queryString) => {
    if (!queryString?.trim()) {
      setError('Please enter a query');
      return;
    }

    setIsLoading(true);
    setError(null);
    setResults(null);

    try {
      const queryResults = await executeQueryWithStats(queryString);
      
      if (activeWorksheetId) {
        await updateWorksheet(activeWorksheetId, {
          query: queryString,
          selected_source: selectedSource?.name
        });
      }

      setQuery(queryString);
      const formattedResults = {
        name: 'Query Results',
        traces: [{
          name: 'results',
          props: {},
          data: queryResults.data.map((row, index) => ({
            id: index,
            ...row
          })),
          columns: queryResults.columns.map(col => ({
            header: col,
            key: col,
            accessorKey: col,
            markdown: false
          }))
        }]
      };
      
      setResults(formattedResults);
    } catch (err) {
      setError(err.message || 'Failed to execute query');
    } finally {
      setIsLoading(false);
    }
  }, [executeQueryWithStats, activeWorksheetId, selectedSource?.name, updateWorksheet]);

  const handleRunQuery = useCallback(() => {
    executeQueryAndUpdateState(query);
  }, [executeQueryAndUpdateState, query]);

  // Use the new hook for hotkeys
  useQueryHotkeys(handleRunQuery, isLoading, editorRef, monacoRef);

  // Add this useEffect hook to track source changes
  useEffect(() => {
    if (editorRef.current) {
      editorRef.current.getModel()?.deltaDecorations([], []);
      const resizeHandler = () => {
        editorRef.current?.layout();
      };
      window.addEventListener('resize', resizeHandler);
      
      return () => {
        window.removeEventListener('resize', resizeHandler);
      };
    }
  }, []);

  // Effect to update query when active worksheet changes
  useEffect(() => {
    const activeWorksheet = worksheets.find(w => w.id === activeWorksheetId);
    if (activeWorksheet) {
      setQuery(activeWorksheet.query || '');
      if (activeWorksheet.selected_source) {
        const source = explorerData?.sources?.find(s => s.name === activeWorksheet.selected_source);
        if (source) setSelectedSource(source);
      }
    }
  }, [activeWorksheetId, worksheets, explorerData?.sources]);

  // Effect to load results when active worksheet changes
  useEffect(() => {
    // Clear existing results when worksheet changes
    setResults(null);
    setQueryStats(null);
    
    if (activeWorksheetId) {
      loadWorksheetResults(activeWorksheetId).then(({ results: loadedResults, queryStats: loadedStats }) => {
        if (loadedResults) {
          setResults(loadedResults);
        }
        if (loadedStats) {
          setQueryStats(loadedStats);
        }
      });
    }
  }, [activeWorksheetId, loadWorksheetResults]);

  // Combine errors from both worksheet context and local state
  const combinedError = worksheetError || error;

  return (
    <Container>
      <div className="flex flex-col h-full">
        <div className="flex-none">
          <TopNav project={project} />
          <div className="mx-2">
            
          </div>
        </div>
        <MainContent>
          <Sidebar>
            <select
              className="w-full px-3 py-2 border border-gray-300 rounded-lg mb-3"
              value={selectedTab}
              onChange={(e) => handleTabChange(e.target.value)}
            >
              <option value="model">Models</option>
              <option value="trace">Traces</option>
            </select>
            <ExplorerTree
              data={treeData}
              type={selectedTab === 0 ? 'models' : 'traces'}
              onItemClick={handleItemClick}
            />
          </Sidebar>

          <RightPanel id="right-panel">
            <Panel style={{ flex: splitRatio }}>
              <WorksheetTabManager
                worksheets={visibleWorksheets}
                activeWorksheetId={activeWorksheetId}
                onWorksheetSelect={setActiveWorksheetId}
                onWorksheetCreate={createWorksheet}
                onWorksheetRename={(id, name) => updateWorksheet(id, { name })}
                isLoading={isLoading || isWorksheetLoading}
              />
              <div className="flex justify-between items-center mb-4">
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
                        <svg className="w-3 h-3" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 14 14">
                          <path stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="m1 1 6 6m0 0 6 6M7 7l6-6M7 7l-6 6"/>
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
                            ? 'bg-[#D25946] text-white'
                            : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                        }`}
                      >
                        {source.name}
                      </button>
                    ))}
                  </div>
                  <button
                    type="button"
                    className={`text-white ${
                      isLoading ? 'bg-[#A06C86]' : 'bg-[#713B57] hover:bg-[#5A2E46]'
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
                <MonacoEditor
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
                    wordWrap: 'on',
                    padding: { top: 16, bottom: 8 },
                    fixedOverflowWidgets: true
                  }}
                  onMount={(editor, monaco) => {
                    editorRef.current = editor;
                    monacoRef.current = monaco;
                    
                    // Add resize handler
                    const resizeHandler = () => {
                      editor.layout();
                    };
                    window.addEventListener('resize', resizeHandler);
                    
                    // Return cleanup for resize handler
                    editor.onDidDispose(() => {
                      window.removeEventListener('resize', resizeHandler);
                    });
                  }}
                />
              </div>
            </Panel>

            <div
              className={`h-1 bg-gray-200 hover:bg-gray-300 cursor-ns-resize flex items-center justify-center group ${
                isDragging ? 'bg-gray-400' : ''
              }`}
              onMouseDown={handleMouseDown}
            >
              <div className="w-8 h-1 bg-gray-400 group-hover:bg-gray-500 rounded-full"></div>
            </div>

            <Panel style={{ flex: 1 - splitRatio }}>
              <div className="flex justify-between items-center mb-4 w-full">
                <h2 className="text-lg font-semibold">Results</h2>
                {queryStats && (
                  <div className="text-sm text-gray-600 font-medium">
                    {queryStats && (
                      <>
                        {`Last Run at ${new Date(queryStats.timestamp).toLocaleTimeString([], { 
                          hour: 'numeric',
                          minute: '2-digit',
                          hour12: true
                        })} • ${queryStats.executionTime}s`}
                        {queryStats.source && ` • Source: ${queryStats.source}`}
                      </>
                    )}
                  </div>
                )}
              </div>
              <div className="flex-1 min-h-0 overflow-auto">
                {results && (
                  <Table
                    table={results}
                    project={project}
                    height="100%"
                  />
                )}
              </div>
            </Panel>
          </RightPanel>
        </MainContent>
      </div>
    </Container>
  );
};

export default QueryExplorer; 
