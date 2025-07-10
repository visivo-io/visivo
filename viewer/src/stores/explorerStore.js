import { executeQuery } from '../services/queryService';
import { 
  fetchSources, 
  fetchDatabases, 
  fetchSchemas, 
  fetchTables, 
  fetchColumns 
} from '../api/explorer';

const createExplorerSlice = (set, get) => ({
  query: '',
  setQuery: query => set({ query }),

  results: null,
  setResults: results => set({ results }),

  error: null,
  setError: error => set({ error }),

  info: null,
  setInfo: info => {
    set({ info });
    setTimeout(() => set({ info: null }), 5000);
  },

  isLoading: false,
  setIsLoading: isLoading => set({ isLoading }),

  explorerData: null,
  setExplorerData: explorerData => set({ explorerData }),

  sourcesMeta: null,
  setSourcesMeta: sourcesMeta => set({ sourcesMeta }),

  // Lazy-loading state management
  sourcesMetadata: {
    sources: [],
    loadedDatabases: {},    // sourceName -> databases[]
    loadedSchemas: {},      // `${sourceName}.${dbName}` -> schemas[]
    loadedTables: {},       // `${sourceName}.${dbName}.${schemaName}` -> tables[]
    loadedColumns: {},      // `${sourceName}.${dbName}.${tableName}` -> columns[]
  },
  
  // Loading states for each level
  loadingStates: {
    sources: false,
    databases: {},
    schemas: {},
    tables: {},
    columns: {},
  },

  treeData: [],
  setTreeData: treeData => set({ treeData }),

  selectedType: 'models',
  setSelectedType: selectedType => set({ selectedType }),

  selectedSource: null,
  setSelectedSource: selectedSource => set({ selectedSource }),

  queryStats: null,
  setQueryStats: queryStats => set({ queryStats }),

  splitRatio: 0.5,
  setSplitRatio: splitRatio => set({ splitRatio }),

  isDragging: false,
  setIsDragging: isDragging => set({ isDragging }),

  activeWorksheetId: null,
  setActiveWorksheetId: activeWorksheetId => set({ activeWorksheetId }),

  // Query execution
  handleRunQuery: async () => {
    const {
      query,
      selectedSource,
      setError,
      setResults,
      setIsLoading,
      setQueryStats,
      project,
      activeWorksheetId,
    } = get();

    if (!query?.trim()) {
      setError('Please enter a query');
      return;
    }

    setIsLoading(true);
    setError(null);
    setResults(null);

    try {
      const startTime = performance.now();
      const timestamp = new Date();

      const queryResults = await executeQuery(
        query,
        project.id,
        selectedSource?.name,
        activeWorksheetId
      );

      const endTime = performance.now();
      const executionTime = ((endTime - startTime) / 1000).toFixed(2);

      setQueryStats({
        timestamp: timestamp,
        executionTime: executionTime,
        source: selectedSource?.name,
      });

      const formattedResults = {
        name: 'Query Results',
        traces: [
          {
            name: 'results',
            props: {},
            data: queryResults.data.map((row, index) => ({
              id: index,
              ...Object.keys(row).reduce((acc, key) => {
                acc[key] = String(row[key]);
                return acc;
              }, {}),
            })),
            columns: queryResults.columns.map(col => ({
              header: col,
              key: col,
              accessorKey: col,
              markdown: false,
            })),
          },
        ],
      };

      setResults(formattedResults);
    } catch (err) {
      setError(err.message || 'Failed to execute query');
    } finally {
      setIsLoading(false);
    }
  },

  // Lazy-loading methods
  loadSources: async () => {
    const { sourcesMetadata, loadingStates, setError } = get();
    
    // Check if already loaded
    if (sourcesMetadata.sources.length > 0 || loadingStates.sources) {
      return;
    }
    
    set(state => ({
      loadingStates: { ...state.loadingStates, sources: true }
    }));
    
    try {
      const data = await fetchSources();
      if (data && data.sources) {
        set(state => ({
          sourcesMetadata: { ...state.sourcesMetadata, sources: data.sources }
        }));
      }
    } catch (err) {
      setError('Failed to load sources');
    } finally {
      set(state => ({
        loadingStates: { ...state.loadingStates, sources: false }
      }));
    }
  },

  loadDatabases: async (sourceName) => {
    const { sourcesMetadata, loadingStates, setError } = get();
    
    // Check if already loaded or loading
    if (sourcesMetadata.loadedDatabases[sourceName] || loadingStates.databases[sourceName]) {
      return;
    }
    
    set(state => ({
      loadingStates: { 
        ...state.loadingStates, 
        databases: { ...state.loadingStates.databases, [sourceName]: true }
      }
    }));
    
    try {
      const data = await fetchDatabases(sourceName);
      if (data) {
        set(state => ({
          sourcesMetadata: { 
            ...state.sourcesMetadata, 
            loadedDatabases: { 
              ...state.sourcesMetadata.loadedDatabases, 
              [sourceName]: data.databases || []
            }
          }
        }));
        
        // Update source status if connection failed
        if (data.status === 'connection_failed') {
          set(state => ({
            sourcesMetadata: {
              ...state.sourcesMetadata,
              sources: state.sourcesMetadata.sources.map(src => 
                src.name === sourceName 
                  ? { ...src, status: 'connection_failed', error: data.error }
                  : src
              )
            }
          }));
        } else if (data.status === 'connected') {
          // Update source status to connected
          set(state => ({
            sourcesMetadata: {
              ...state.sourcesMetadata,
              sources: state.sourcesMetadata.sources.map(src => 
                src.name === sourceName 
                  ? { ...src, status: 'connected' }
                  : src
              )
            }
          }));
        }
      }
    } catch (err) {
      setError(`Failed to load databases for ${sourceName}`);
      // Mark source as having an error
      set(state => ({
        sourcesMetadata: {
          ...state.sourcesMetadata,
          sources: state.sourcesMetadata.sources.map(src => 
            src.name === sourceName 
              ? { ...src, status: 'connection_failed', error: err.message || 'Failed to load databases' }
              : src
          )
        }
      }));
    } finally {
      set(state => ({
        loadingStates: { 
          ...state.loadingStates, 
          databases: { ...state.loadingStates.databases, [sourceName]: false }
        }
      }));
    }
  },

  loadSchemas: async (sourceName, databaseName) => {
    const { sourcesMetadata, loadingStates, setError } = get();
    const key = `${sourceName}.${databaseName}`;
    
    // Check if already loaded or loading
    if (sourcesMetadata.loadedSchemas[key] !== undefined || loadingStates.schemas[key]) {
      return;
    }
    
    set(state => ({
      loadingStates: { 
        ...state.loadingStates, 
        schemas: { ...state.loadingStates.schemas, [key]: true }
      }
    }));
    
    try {
      const data = await fetchSchemas(sourceName, databaseName);
      if (data) {
        set(state => ({
          sourcesMetadata: { 
            ...state.sourcesMetadata, 
            loadedSchemas: { 
              ...state.sourcesMetadata.loadedSchemas, 
              [key]: data
            }
          }
        }));
      }
    } catch (err) {
      setError(`Failed to load schemas for ${databaseName}`);
    } finally {
      set(state => ({
        loadingStates: { 
          ...state.loadingStates, 
          schemas: { ...state.loadingStates.schemas, [key]: false }
        }
      }));
    }
  },

  loadTables: async (sourceName, databaseName, schemaName = null) => {
    const { sourcesMetadata, loadingStates, setError } = get();
    const key = schemaName 
      ? `${sourceName}.${databaseName}.${schemaName}`
      : `${sourceName}.${databaseName}`;
    
    // Check if already loaded or loading
    if (sourcesMetadata.loadedTables[key] || loadingStates.tables[key]) {
      return;
    }
    
    set(state => ({
      loadingStates: { 
        ...state.loadingStates, 
        tables: { ...state.loadingStates.tables, [key]: true }
      }
    }));
    
    try {
      const data = await fetchTables(sourceName, databaseName, schemaName);
      if (data) {
        if (data.error) {
          // Handle error response from API
          set(state => ({
            sourcesMetadata: { 
              ...state.sourcesMetadata, 
              loadedTables: { 
                ...state.sourcesMetadata.loadedTables, 
                [key]: { error: data.error }
              }
            }
          }));
        } else if (data.tables) {
          set(state => ({
            sourcesMetadata: { 
              ...state.sourcesMetadata, 
              loadedTables: { 
                ...state.sourcesMetadata.loadedTables, 
                [key]: data.tables
              }
            }
          }));
        }
      }
    } catch (err) {
      setError(`Failed to load tables`);
      set(state => ({
        sourcesMetadata: { 
          ...state.sourcesMetadata, 
          loadedTables: { 
            ...state.sourcesMetadata.loadedTables, 
            [key]: { error: err.message || 'Failed to load tables' }
          }
        }
      }));
    } finally {
      set(state => ({
        loadingStates: { 
          ...state.loadingStates, 
          tables: { ...state.loadingStates.tables, [key]: false }
        }
      }));
    }
  },

  loadColumns: async (sourceName, databaseName, tableName, schemaName = null) => {
    const { sourcesMetadata, loadingStates, setError } = get();
    const key = schemaName
      ? `${sourceName}.${databaseName}.${schemaName}.${tableName}`
      : `${sourceName}.${databaseName}.${tableName}`;
    
    // Check if already loaded or loading
    if (sourcesMetadata.loadedColumns[key] || loadingStates.columns[key]) {
      return;
    }
    
    set(state => ({
      loadingStates: { 
        ...state.loadingStates, 
        columns: { ...state.loadingStates.columns, [key]: true }
      }
    }));
    
    try {
      const data = await fetchColumns(sourceName, databaseName, tableName, schemaName);
      if (data && data.columns) {
        set(state => ({
          sourcesMetadata: { 
            ...state.sourcesMetadata, 
            loadedColumns: { 
              ...state.sourcesMetadata.loadedColumns, 
              [key]: data.columns
            }
          }
        }));
      }
    } catch (err) {
      setError(`Failed to load columns for ${tableName}`);
    } finally {
      set(state => ({
        loadingStates: { 
          ...state.loadingStates, 
          columns: { ...state.loadingStates.columns, [key]: false }
        }
      }));
    }
  },
});

export default createExplorerSlice;
