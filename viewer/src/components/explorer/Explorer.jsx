import React, { useEffect, useCallback } from "react";
import { useLoaderData } from "react-router-dom";
import ExplorerTree from "./ExplorerTree";
import { executeQuery, fetchTraceQuery } from "../../services/queryService";
import { fetchExplorer } from "../../api/explorer";
import tw from "tailwind-styled-components";
import { useWorksheets } from "../../contexts/WorksheetContext";
import { useQueryHotkeys } from "../../hooks/useQueryHotkeys";
import QueryPanel from "./QueryPanel";
import Divider from "./Divider";
import ResultsPanel from "./ResultsPanel";
import useExplorerStore from "../../stores/explorerStore";
import useStore from "../../stores/store";
import { getAncestors } from "../lineage/graphUtils";

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
`;

const RightPanel = tw.div`
  flex-1
  flex
  flex-col
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

const HIDDEN_MODEL_TYPES = ["CsvScriptModel", "LocalMergeModel"];

const QueryExplorer = () => {
  const project = useLoaderData();
  const editorRef = React.useRef(null);
  const monacoRef = React.useRef(null);

  const {
    // State values
    isDragging,
    explorerData,
    selectedType,
    treeData,
    selectedSource,
    query,
    info,
    isLoading,
    // State setters
    setQuery,
    setError,
    setResults,
    setIsLoading,
    setTreeData,
    setSelectedType,
    setExplorerData,
    setSelectedSource,
    setQueryStats,
    setSplitRatio,
    setIsDragging,
    setProject,
    setActiveWorksheetId,
  } = useExplorerStore();

  const { namedChildren } = useStore();

  const {
    worksheets,
    activeWorksheetId,
    actions: { updateWorksheet, loadWorksheetResults },
  } = useWorksheets();

  // Set project and activeWorksheetId in store
  useEffect(() => {
    setProject(project);
    setActiveWorksheetId(activeWorksheetId);
  }, [project, activeWorksheetId, setProject, setActiveWorksheetId]);

  const handleMouseDown = (e) => {
    setIsDragging(true);
    e.preventDefault();
  };

  useEffect(() => {
    const handleMouseMove = (e) => {
      if (!isDragging) return;

      const container = document.getElementById("right-panel");
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
      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
    }

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isDragging, setIsDragging, setSplitRatio]);

  useEffect(() => {
    const loadExplorerData = async () => {
      try {
        const data = await fetchExplorer();
        if (data) {
          setExplorerData(data);
          if (data.sources && data.sources.length > 0) {
            if (data.default_source) {
              const defaultSource = data.sources.find(
                (s) => s.name === data.default_source
              );
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
        console.error("Error loading explorer data:", err);
        setError("Failed to load explorer data");
      }
    };
    loadExplorerData();
  }, [setExplorerData, setSelectedSource, setError]);

  const transformData = React.useCallback(() => {
    if (!explorerData) return [];

    const data = [];

    switch (selectedType) {
      case "models":
        if (explorerData.models) {
          const modelItems = explorerData.models
            .filter((model) => model && typeof model === "object" && model.name)
            .filter(
              (model) =>
                !HIDDEN_MODEL_TYPES.includes(namedChildren[model.name]?.type)
            )
            .map((model, index) => ({
              id: `model-${model.name}-${index}`,
              name: model.name,
              type: "model",
              config: model,
            }));
          data.push(...modelItems);
        }
        break;
      case "traces":
        if (explorerData.traces) {
          const traceItems = explorerData.traces
            .filter((trace) => trace && typeof trace === "object" && trace.name)
            .filter((trace) => {
              const ancestors = getAncestors(trace.name, namedChildren);
              return ![...ancestors].some((ancestor) =>
                HIDDEN_MODEL_TYPES.includes(namedChildren[ancestor]?.type)
              );
            })
            .map((trace, index) => ({
              id: `trace-${trace.name}-${index}`,
              name: trace.name,
              type: "trace",
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

  const handleTabChange = (type) => {
    setSelectedType(type);
  };

  const handleItemClick = async (item) => {
    let newQuery = "";
    let newSource = selectedSource;

    try {
      switch (item.type) {
        case "model":
          if (
            item.config.type === "CsvScriptModel" ||
            item.config.type === "LocalMergeModel"
          ) {
            newSource =
              explorerData?.sources?.find((s) => s.type === "duckdb") ||
              selectedSource;
          } else if (item.config.source) {
            newSource =
              explorerData?.sources?.find(
                (s) => s.name === item.config.source.name
              ) || selectedSource;
          } else {
            newSource = explorerData?.sources?.[0] || selectedSource;
          }
          newQuery = `WITH model AS (${item.config.sql})\nSELECT * FROM model LIMIT 10;`;
          break;
        case "trace":
          try {
            newQuery = await fetchTraceQuery(item.name);
          } catch (err) {
            console.error("Failed to fetch trace query:", err);
            setError(`Failed to fetch trace query: ${err.message}`);
            return;
          }
          break;
        default:
          newQuery = "";
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
      console.error("Error in handleItemClick:", err);
      setError(err.message || "Failed to process item click");
    }
  };

  const executeQueryWithStats = React.useCallback(
    async (queryString) => {
      const startTime = performance.now();
      const timestamp = new Date();

      try {
        const queryResults = await executeQuery(
          queryString,
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

        return queryResults;
      } catch (err) {
        throw err;
      }
    },
    [selectedSource, project.id, activeWorksheetId, setQueryStats]
  );

  const executeQueryAndUpdateState = useCallback(
    async (queryString) => {
      if (!queryString?.trim()) {
        setError("Please enter a query");
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
            selected_source: selectedSource?.name,
          });
        }

        setQuery(queryString);
        const formattedResults = {
          name: "Query Results",
          traces: [
            {
              name: "results",
              props: {},
              data: queryResults.data.map((row, index) => ({
                id: index,
                ...row,
              })),
              columns: queryResults.columns.map((col) => ({
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
        setError(err.message || "Failed to execute query");
      } finally {
        setIsLoading(false);
      }
    },
    [
      executeQueryWithStats,
      activeWorksheetId,
      selectedSource?.name,
      updateWorksheet,
      setQuery,
      setError,
      setResults,
      setIsLoading,
    ]
  );

  const handleRunQuery = useCallback(() => {
    executeQueryAndUpdateState(query);
  }, [executeQueryAndUpdateState, query]);

  // Use the new hook for hotkeys
  useQueryHotkeys(handleRunQuery, isLoading, editorRef, monacoRef);

  // Effect to update query when active worksheet changes
  useEffect(() => {
    const activeWorksheet = worksheets.find((w) => w.id === activeWorksheetId);
    if (activeWorksheet) {
      setQuery(activeWorksheet.query || "");
      if (activeWorksheet.selected_source) {
        const source = explorerData?.sources?.find(
          (s) => s.name === activeWorksheet.selected_source
        );
        if (source) setSelectedSource(source);
      }
    }
  }, [
    activeWorksheetId,
    worksheets,
    explorerData?.sources,
    setQuery,
    setSelectedSource,
  ]);

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

  return (
    <Container>
      <div className="flex flex-col h-full">
        {info && (
          <Info>
            <p>{info}</p>
          </Info>
        )}
        <MainContent>
          <ExplorerTree
            data={treeData}
            selectedTab={selectedType}
            onTypeChange={handleTabChange}
            onItemClick={handleItemClick}
          />

          <RightPanel id="right-panel">
            <QueryPanel editorRef={editorRef} monacoRef={monacoRef} />
            <Divider
              isDragging={isDragging}
              handleMouseDown={handleMouseDown}
            />
            <ResultsPanel project={project} />
          </RightPanel>
        </MainContent>
      </div>
    </Container>
  );
};

export default QueryExplorer;
