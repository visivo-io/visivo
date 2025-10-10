import React, { useEffect } from 'react';
import ExplorerTree from '../explorerTree/ExplorerTree';
import { fetchTraceQuery } from '../../services/queryService';
import { fetchExplorer } from '../../api/explorer';
import tw from 'tailwind-styled-components';
import { useWorksheets } from '../../contexts/WorksheetContext';
import QueryPanel from './QueryPanel';
import VerticalDivider from './VerticalDivider';
import useStore from '../../stores/store';
import { getAncestors } from '../lineage/graphUtils';

const Container = tw.div`
  flex h-[calc(100vh-50px)] 
  bg-gray-50 
  flex
  flex-col
  overflow-hidden
  m-0
  inset-0
`;

const MainContent = tw.div`
  flex
  flex-1
  min-h-0
  overflow-hidden
  relative
`;

const RightPanel = tw.div`
  flex-1
  min-h-0
  overflow-hidden
`;

const Info = tw.div`
  absolute
  z-10
  bottom-10
  right-10
  flex
  flex-1
  bg-highlight
  text-white
  rounded-md
  p-2
  shadow-md
  overflow-hidden
`;

const HIDDEN_MODEL_TYPES = ['CsvScriptModel', 'LocalMergeModel'];

const QueryExplorer = () => {
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
  } = useStore();

  const [sidebarWidth, setSidebarWidth] = React.useState(300);
  const [isResizingSidebar, setIsResizingSidebar] = React.useState(false);

  const project = useStore(state => state.project);
  const namedChildren = useStore(state => state.namedChildren);
  const info = useStore(state => state.info);
  const explorerData = useStore(state => state.explorerData);
  const selectedSource = useStore(state => state.selectedSource);
  const selectedType = useStore(state => state.selectedType);
  const treeData = useStore(state => state.treeData);

  const {
    worksheets,
    activeWorksheetId,
    actions: { updateWorksheet, loadWorksheetResults },
  } = useWorksheets();

  // Set project and activeWorksheetId in store
  useEffect(() => {
    setActiveWorksheetId(activeWorksheetId);
  }, [activeWorksheetId, setActiveWorksheetId]);

  // Initialize worksheets on mount
  useEffect(() => {
    initializeWorksheets();
  }, [initializeWorksheets]);

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

  // Removed old metadata loading - now using lazy loading in ExplorerTree

  const transformData = React.useCallback(() => {
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

  useEffect(() => {
    setTreeData(transformData());
  }, [transformData, setTreeData]);

  const handleTabChange = type => {
    setSelectedType(type);
  };

  const handleItemClick = async item => {
    let newQuery = '';
    let newSource = selectedSource;

    try {
      switch (item.type) {
        case 'model':
          if (item.config.type === 'CsvScriptModel' || item.config.type === 'LocalMergeModel') {
            const duckdbSource = Object.values(namedChildren || {}).find(
              child => child.type_key === 'sources' && child.type === 'DuckdbSource'
            );
            newSource = duckdbSource ? duckdbSource.config : selectedSource;
          } else if (item.config.source) {
            const matchingSource = Object.values(namedChildren || {}).find(
              child => child.type_key === 'sources' && child.config.name === item.config.source.name
            );
            newSource = matchingSource ? matchingSource.config : selectedSource;
          } else {
            const sources = Object.values(namedChildren || {}).filter(
              child => child.type_key === 'sources'
            );
            newSource = sources.length > 0 ? sources[0].config : selectedSource;
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
          selected_source: newSource?.name,
        });
      }
    } catch (err) {
      console.error('Error in handleItemClick:', err);
      setError(err.message || 'Failed to process item click');
    }
  };

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

  // Effect to load results when active worksheet changes
  useEffect(() => {
    // Clear existing results when worksheet changes
    setResults(null);
    setQueryStats(null);

    if (activeWorksheetId) {
      loadWorksheetResults(activeWorksheetId).then(
        ({ results: loadedResults, queryStats: loadedStats }) => {
          if (loadedResults) {
            setResults(loadedResults);
          }
          if (loadedStats) {
            setQueryStats(loadedStats);
          }
        }
      );
    }
  }, [activeWorksheetId, loadWorksheetResults, setResults, setQueryStats]);

  // Handle sidebar resizing
  useEffect(() => {
    const handleMouseMove = e => {
      if (!isResizingSidebar) return;

      // Calculate new width based on mouse position
      const newWidth = Math.max(200, Math.min(600, e.clientX));
      setSidebarWidth(newWidth);
    };

    const handleMouseUp = () => {
      setIsResizingSidebar(false);
    };

    if (isResizingSidebar) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizingSidebar]);

  return (
    <Container>
      <div className="flex flex-col h-full">
        {info && (
          <Info>
            <p>{info}</p>
          </Info>
        )}
        <MainContent>
          <div style={{ width: `${sidebarWidth}px`, flexShrink: 0, display: 'flex' }}>
            <ExplorerTree
              data={treeData}
              selectedTab={selectedType}
              onTypeChange={handleTabChange}
              onItemClick={handleItemClick}
            />
          </div>

          <VerticalDivider
            isDragging={isResizingSidebar}
            handleMouseDown={e => {
              e.preventDefault();
              setIsResizingSidebar(true);
            }}
          />

          <RightPanel>
            <QueryPanel />
          </RightPanel>
        </MainContent>
      </div>
    </Container>
  );
};

export default QueryExplorer;
