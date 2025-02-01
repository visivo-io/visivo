import React, { useState, useEffect } from 'react';
import { useLoaderData } from 'react-router-dom';
import MonacoEditor from '@monaco-editor/react';
import ExplorerTree from './explorer/ExplorerTree';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import Table from './items/Table';
import { executeQuery } from '../services/queryService';
import { fetchExplorer } from '../api/project';
import tw from "tailwind-styled-components";

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
  gap-4
  flex-1
  min-h-0
  overflow-hidden
  p-4
`;

const LeftPanel = tw.div`
  w-72
  bg-white
  rounded-lg
  shadow-md
  p-4
  flex
  flex-col
  overflow-hidden
  min-h-0
`;

const RightPanel = tw.div`
  flex-1
  flex
  flex-col
  gap-4
  min-h-0
  overflow-hidden
`;

const Panel = tw.div`
  bg-white
  rounded-lg
  shadow-md
  p-4
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
      case 0: // Sources
        if (explorerData.sources) {
          const sourceItems = explorerData.sources
            .filter(source => source && typeof source === 'object' && source.name)
            .map((source, index) => ({
              id: `source-${source.name}-${index}`,
              name: source.name,
              type: 'source',
              config: source
            }));
          data.push(...sourceItems);
        }
        break;
      case 1: // Models
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
      case 2: // Traces
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

  const handleItemClick = (item) => {
    let newQuery = '';
    switch (item.type) {
      case 'source':
        newQuery = `SELECT * FROM ${item.name} LIMIT 10;`;
        break;
      case 'model':
        newQuery = `WITH model AS (${item.config.sql})\nSELECT * FROM model LIMIT 10;`;
        break;
      case 'trace':
        newQuery = `WITH trace AS (SELECT * FROM ${item.name})\nSELECT * FROM trace LIMIT 10;`;
        break;
      default:
        newQuery = '';
        break;
    }
    setQuery(newQuery);
  };

  const executeQueryWithStats = async (queryString) => {
    const startTime = performance.now();
    const timestamp = new Date();
    
    try {
      const queryResults = await executeQuery(queryString, project.id);
      const endTime = performance.now();
      const executionTime = ((endTime - startTime) / 1000).toFixed(2); // Convert to seconds
      
      setQueryStats({
        timestamp: timestamp,
        executionTime: executionTime
      });
      
      return queryResults;
    } catch (err) {
      throw err;
    }
  };

  const handleRunQuery = async () => {
    console.log('handleRunQuery called with query:', query);
    if (!query?.trim()) {
      setError('Please enter a query');
      return;
    }

    setIsLoading(true);
    setError(null);
    setResults(null);

    try {
      const queryResults = await executeQueryWithStats(query);
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
  };

  return (
    <Container>
      <MainContent>
        <LeftPanel>
          <h2 className="text-lg font-semibold mb-4">Explorer</h2>
          <div className="border-b border-gray-200">
            <ul className="flex flex-wrap -mb-px text-sm font-medium text-center text-gray-500">
              <li className="mr-2">
                <button
                  className={`inline-flex items-center justify-center p-4 border-b-2 rounded-t-lg group ${
                    selectedTab === 0
                      ? 'text-blue-600 border-blue-600'
                      : 'hover:text-gray-600 hover:border-gray-300'
                  }`}
                  onClick={() => handleTabChange(0)}
                >
                  Sources
                </button>
              </li>
              <li className="mr-2">
                <button
                  className={`inline-flex items-center justify-center p-4 border-b-2 rounded-t-lg group ${
                    selectedTab === 1
                      ? 'text-blue-600 border-blue-600'
                      : 'hover:text-gray-600 hover:border-gray-300'
                  }`}
                  onClick={() => handleTabChange(1)}
                >
                  Models
                </button>
              </li>
              <li>
                <button
                  className={`inline-flex items-center justify-center p-4 border-b-2 rounded-t-lg group ${
                    selectedTab === 2
                      ? 'text-blue-600 border-blue-600'
                      : 'hover:text-gray-600 hover:border-gray-300'
                  }`}
                  onClick={() => handleTabChange(2)}
                >
                  Traces
                </button>
              </li>
            </ul>
          </div>
          <div className="mt-4 flex-1 min-h-0">
            <ExplorerTree
              data={treeData}
              type={selectedTab === 0 ? 'sources' : selectedTab === 1 ? 'models' : 'traces'}
              onItemClick={handleItemClick}
            />
          </div>
        </LeftPanel>

        <RightPanel id="right-panel">
          <Panel style={{ flex: splitRatio }}>
            <div className="flex justify-between items-center mb-4">
              <div className="flex-1 flex items-center justify-between min-w-0">
                <h2 className="text-lg font-semibold">SQL Query</h2>
                {error && (
                  <div className="mx-4 flex-1 px-4 py-2 text-sm text-red-800 rounded-lg bg-red-50">
                    {error}
                    <button
                      type="button"
                      className="ml-2 inline-flex items-center"
                      onClick={() => setError(null)}
                    >
                      <span className="sr-only">Dismiss</span>
                      <svg className="w-3 h-3" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 14 14">
                        <path stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="m1 1 6 6m0 0 6 6M7 7l6-6M7 7l-6 6"/>
                      </svg>
                    </button>
                  </div>
                )}
                <button
                  type="button"
                  className={`text-white ${
                    isLoading ? 'bg-[#A06C86]' : 'bg-[#713B57] hover:bg-[#5A2E46]'
                  } focus:ring-4 focus:ring-[#A06C86] font-medium rounded-lg text-sm px-5 py-2.5 focus:outline-none ml-4`}
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
                  editor.setValue(query || '');
                  
                  // Add resize handler
                  const resizeHandler = () => {
                    editor.layout();
                  };
                  window.addEventListener('resize', resizeHandler);
                  
                  // Add command
                  editor.addCommand(
                    monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter,
                    async () => {
                      const currentValue = editor.getValue();
                      
                      if (!currentValue?.trim()) {
                        setError('Please enter a query');
                        return;
                      }

                      // Set all states before starting the query
                      await Promise.resolve(); // Ensure state updates are processed
                      setQuery(currentValue);
                      setIsLoading(true);
                      setError(null);
                      setResults(null);

                      // Wait for loading state to be applied
                      await Promise.resolve();

                      try {
                        const queryResults = await executeQueryWithStats(currentValue);
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
                        
                        // Ensure states are updated in sequence
                        await Promise.resolve();
                        setResults(formattedResults);
                      } catch (err) {
                        setError(err.message || 'Failed to execute query');
                      } finally {
                        setIsLoading(false);
                      }
                    }
                  );

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
                  {`Last Run at ${queryStats.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} • ${queryStats.executionTime}s`}
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
    </Container>
  );
};

export default QueryExplorer; 
