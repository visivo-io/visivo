import { useEffect, useCallback } from 'react';
import useStore from '../stores/store';
import { fetchTraceQuery } from '../services/queryService';
import { fetchExplorer } from '../api/explorer';
import { getAncestors } from '../components/lineage/graphUtils';

const HIDDEN_MODEL_TYPES = ['CsvScriptModel', 'LocalMergeModel'];

export const useExplorerLogic = () => {
  // Store state
  const {
    setQuery,
    setError,
    setResults,
    setTreeData,
    setSelectedType,
    setExplorerData,
    setSelectedSource,
    setQueryStats,
    setActiveWorksheetId,
    initializeWorksheets,
    worksheets,
    activeWorksheetId,
    updateWorksheetData,
    worksheetCells,
    addCell,
  } = useStore();

  const namedChildren = useStore(state => state.namedChildren);
  const info = useStore(state => state.info);
  const explorerData = useStore(state => state.explorerData);
  const selectedSource = useStore(state => state.selectedSource);
  const selectedType = useStore(state => state.selectedType);
  const treeData = useStore(state => state.treeData);

  // Set project and activeWorksheetId in store
  useEffect(() => {
    setActiveWorksheetId(activeWorksheetId);
  }, [activeWorksheetId, setActiveWorksheetId]);

  // Initialize worksheets on mount
  useEffect(() => {
    initializeWorksheets();
  }, [initializeWorksheets]);

  // Load explorer data
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
  }, [setExplorerData, setError]);

  // Set default source from namedChildren when available
  useEffect(() => {
    if (namedChildren && Object.keys(namedChildren).length > 0 && !selectedSource) {
      const sources = Object.values(namedChildren).filter(item => item.type_key === 'sources');
      if (sources.length > 0) {
        // Check if there's a default source from explorerData
        if (explorerData?.default_source) {
          const defaultSource = sources.find(s => s.config.name === explorerData.default_source);
          if (defaultSource) {
            setSelectedSource(defaultSource.config);
          } else {
            setSelectedSource(sources[0].config);
          }
        } else {
          setSelectedSource(sources[0].config);
        }
      }
    }
  }, [namedChildren, selectedSource, explorerData, setSelectedSource]);

  // Transform data based on selected type
  const transformData = useCallback(() => {
    if (!explorerData) return [];

    const data = [];

    switch (selectedType) {
      case 'models':
        if (explorerData.models) {
          const modelItems = explorerData.models
            .filter(model => model && typeof model === 'object' && model.name)
            .filter(model => !HIDDEN_MODEL_TYPES.includes(namedChildren[model.name]?.type))
            .map((model, index) => ({
              id: `model-${model.name}-${index}`,
              name: model.name,
              type: 'model',
              config: model,
            }));
          data.push(...modelItems);
        }
        break;
      case 'traces':
        if (explorerData.traces) {
          const traceItems = explorerData.traces
            .filter(trace => trace && typeof trace === 'object' && trace.name)
            .filter(trace => {
              const ancestors = getAncestors(trace.name, namedChildren);
              return ![...ancestors].some(ancestor =>
                HIDDEN_MODEL_TYPES.includes(namedChildren[ancestor]?.type)
              );
            })
            .map((trace, index) => ({
              id: `trace-${trace.name}-${index}`,
              name: trace.name,
              type: 'trace',
              config: trace,
            }));
          data.push(...traceItems);
        }
        break;
      default:
        break;
    }
    return data;
  }, [selectedType, explorerData, namedChildren]);

  // Update tree data when transform changes
  useEffect(() => {
    setTreeData(transformData());
  }, [transformData, setTreeData]);

  // Handle tab change
  const handleTabChange = useCallback(
    type => {
      setSelectedType(type);
    },
    [setSelectedType]
  );

  // Handle item click
  const handleItemClick = useCallback(
    async item => {
      try {
        switch (item.type) {
          case 'model': {
            // Get the model's source
            let newSource = selectedSource;
            if (item.config.type === 'CsvScriptModel' || item.config.type === 'LocalMergeModel') {
              const duckdbSource = Object.values(namedChildren || {}).find(
                child => child.type_key === 'sources' && child.type === 'DuckdbSource'
              );
              newSource = duckdbSource ? duckdbSource.config : selectedSource;
            } else if (item.config.source) {
              const matchingSource = Object.values(namedChildren || {}).find(
                child =>
                  child.type_key === 'sources' && child.config.name === item.config.source.name
              );
              newSource = matchingSource ? matchingSource.config : selectedSource;
            } else {
              const sources = Object.values(namedChildren || {}).filter(
                child => child.type_key === 'sources'
              );
              newSource = sources.length > 0 ? sources[0].config : selectedSource;
            }

            // Check if any cell in the current worksheet already has this model associated
            if (activeWorksheetId && worksheetCells[activeWorksheetId]) {
              const cells = worksheetCells[activeWorksheetId];
              const existingCell = cells.find(
                cellData => cellData.cell.associated_model === item.name
              );

              if (existingCell) {
                // Cell with this model exists - scroll to it and focus the editor
                console.log('[useExplorerLogic] Found existing cell with model:', item.name);
                // Use setTimeout to allow React to render, then scroll and focus
                setTimeout(() => {
                  const cellElement = document.getElementById(`cell-${existingCell.cell.id}`);
                  if (cellElement) {
                    cellElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    // Find the Monaco editor within the cell and focus it
                    const editorTextarea = cellElement.querySelector('.monaco-editor textarea');
                    if (editorTextarea) {
                      editorTextarea.focus();
                    }
                  }
                }, 100);
                return;
              }
            }

            // No cell with this model - create a new cell
            console.log('[useExplorerLogic] Creating new cell for model:', item.name);
            if (activeWorksheetId && addCell) {
              const modelSql = item.config.sql || '';
              // Create a new cell at the end with the model's data
              await addCell(activeWorksheetId, modelSql, null);

              // Get the newly created cell and update it with model association and source
              setTimeout(async () => {
                const cells = worksheetCells[activeWorksheetId];
                if (cells && cells.length > 0) {
                  const newCell = cells[cells.length - 1];
                  // Update the cell with the model association and source
                  await useStore.getState().updateCellData(activeWorksheetId, newCell.cell.id, {
                    associated_model: item.name,
                    selected_source: newSource?.name,
                  });

                  // Scroll to the new cell
                  setTimeout(() => {
                    const cellElement = document.getElementById(`cell-${newCell.cell.id}`);
                    if (cellElement) {
                      cellElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
                      const editorTextarea = cellElement.querySelector('.monaco-editor textarea');
                      if (editorTextarea) {
                        editorTextarea.focus();
                      }
                    }
                  }, 100);
                }
              }, 200);
            }
            break;
          }
          case 'trace': {
            let newQuery = '';
            try {
              newQuery = await fetchTraceQuery(item.name);
            } catch (err) {
              console.error('Failed to fetch trace query:', err);
              setError(`Failed to fetch trace query: ${err.message}`);
              return;
            }

            setQuery(newQuery);
            if (selectedSource) {
              setSelectedSource(selectedSource);
            }

            // Update active worksheet with new query
            if (activeWorksheetId) {
              await updateWorksheetData(activeWorksheetId, {
                query: newQuery,
                selected_source: selectedSource?.name,
              });
            }
            break;
          }
          default:
            break;
        }
      } catch (err) {
        console.error('Error in handleItemClick:', err);
        setError(err.message || 'Failed to process item click');
      }
    },
    [
      selectedSource,
      namedChildren,
      setQuery,
      setSelectedSource,
      setError,
      activeWorksheetId,
      updateWorksheetData,
      worksheetCells,
      addCell,
    ]
  );

  // Update query and source when active worksheet changes
  useEffect(() => {
    const activeWorksheet = worksheets.find(w => w.id === activeWorksheetId);
    if (activeWorksheet) {
      setQuery(activeWorksheet.query || '');
      if (activeWorksheet.selected_source && namedChildren) {
        const sourceData = Object.values(namedChildren).find(
          item =>
            item.type_key === 'sources' && item.config.name === activeWorksheet.selected_source
        );
        if (sourceData) setSelectedSource(sourceData.config);
      }
    }
  }, [activeWorksheetId, worksheets, namedChildren, setQuery, setSelectedSource]);

  // Clear results when active worksheet changes
  // Results are now loaded per-cell by NotebookWorksheet component
  useEffect(() => {
    setResults(null);
    setQueryStats(null);
  }, [activeWorksheetId, setResults, setQueryStats]);

  return {
    // State
    info,
    treeData,
    selectedType,
    // Handlers
    handleTabChange,
    handleItemClick,
  };
};
