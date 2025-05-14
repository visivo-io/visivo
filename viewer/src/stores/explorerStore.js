import { executeQuery } from '../services/queryService';

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
});

export default createExplorerSlice;
