import React, { useState, useEffect } from 'react';
import { useLoaderData } from 'react-router-dom';
import { Box, Paper, Typography, Tabs, Tab, Button, Alert, Snackbar } from '@mui/material';
import { styled } from '@mui/material/styles';
import MonacoEditor from '@monaco-editor/react';
import ExplorerTree from './explorer/ExplorerTree';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import Table from './items/Table';
import { executeQuery } from '../services/queryService';
import tw from "tailwind-styled-components";

const Container = tw.div`
  p-4
  h-screen
  bg-gray-100
`;

const ResizablePanel = styled(Paper)(({ theme }) => ({
  height: 'calc(100vh - 100px)',
  overflow: 'auto',
  padding: theme.spacing(2),
  backgroundColor: theme.palette.background.paper,
}));

const QueryExplorer = () => {
  const project = useLoaderData();
  const [selectedTab, setSelectedTab] = useState(0);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState(null);
  const [treeData, setTreeData] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    // Transform project data into tree structure
    const transformData = () => {
      const data = [];
      switch (selectedTab) {
        case 0: // Sources
          if (project.project_json.sources) {
            data.push(...project.project_json.sources.map((source, index) => ({
              id: `source-${index}`,
              name: source.name,
              type: 'source',
              config: source.config
            })));
          }
          break;
        case 1: // Models
          if (project.project_json.models) {
            data.push(...project.project_json.models.map((model, index) => ({
              id: `model-${index}`,
              name: model.name,
              type: 'model',
              config: model.config
            })));
          }
          break;
        case 2: // Traces
          if (project.project_json.traces) {
            data.push(...project.project_json.traces.map((trace, index) => ({
              id: `trace-${index}`,
              name: trace.name,
              type: 'trace',
              config: trace.config
            })));
          }
          break;
        default:
          break;
      }
      setTreeData(data);
    };

    transformData();
  }, [selectedTab, project]);

  const handleTabChange = (event, newValue) => {
    setSelectedTab(newValue);
  };

  const handleEditorChange = (value) => {
    setQuery(value);
  };

  const handleItemClick = (item) => {
    let newQuery = '';
    switch (item.type) {
      case 'source':
        newQuery = `SELECT * FROM ${item.name} LIMIT 10;`;
        break;
      case 'model':
        newQuery = `WITH model AS (SELECT * FROM ${item.name})\nSELECT * FROM model LIMIT 10;`;
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

  const handleRunQuery = async () => {
    if (!query.trim()) {
      setError('Please enter a query');
      return;
    }

    setIsLoading(true);
    setError(null);
    setResults(null);

    try {
      console.log('Running query...');
      const queryResults = await executeQuery(query, project.id);
      console.log('Query results:', queryResults);
      
      // Format the results to match the expected data structure
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
      
      console.log('Formatted results:', formattedResults);
      setResults(formattedResults);
    } catch (err) {
      console.error('Error in handleRunQuery:', err);
      setError(err.message || 'Failed to execute query');
    } finally {
      setIsLoading(false);
    }
  };

  const handleCloseError = () => {
    setError(null);
  };

  return (
    <Container>
      <Snackbar
        open={!!error}
        autoHideDuration={6000}
        onClose={handleCloseError}
        anchorOrigin={{ vertical: 'top', horizontal: 'right' }}
      >
        <Alert onClose={handleCloseError} severity="error" sx={{ width: '100%' }}>
          {error}
        </Alert>
      </Snackbar>

      <Box sx={{ display: 'flex', gap: 2, height: 'calc(100vh - 32px)' }}>
        {/* Left Panel - Sources/Models/Traces Tree */}
        <ResizablePanel sx={{ width: '300px' }}>
          <Typography variant="h6" gutterBottom>
            Explorer
          </Typography>
          <Tabs
            value={selectedTab}
            onChange={handleTabChange}
            aria-label="explorer tabs"
          >
            <Tab label="Sources" />
            <Tab label="Models" />
            <Tab label="Traces" />
          </Tabs>
          <Box sx={{ mt: 2 }}>
            <ExplorerTree
              data={treeData}
              type={selectedTab === 0 ? 'sources' : selectedTab === 1 ? 'models' : 'traces'}
              onItemClick={handleItemClick}
            />
          </Box>
        </ResizablePanel>

        {/* Right Panel - Query Editor and Results */}
        <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 2 }}>
          <ResizablePanel sx={{ flex: 1 }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
              <Typography variant="h6">
                SQL Query
              </Typography>
              <Button
                variant="contained"
                color="primary"
                startIcon={<PlayArrowIcon />}
                onClick={handleRunQuery}
                disabled={isLoading}
              >
                {isLoading ? 'Running...' : 'Run Query'}
              </Button>
            </Box>
            <MonacoEditor
              height="calc(100% - 60px)"
              language="sql"
              theme="vs-dark"
              value={query}
              onChange={handleEditorChange}
              options={{
                minimap: { enabled: false },
                scrollBeyondLastLine: false,
                fontSize: 14,
                readOnly: isLoading
              }}
            />
          </ResizablePanel>

          <ResizablePanel sx={{ flex: 1 }}>
            <Typography variant="h6" gutterBottom>
              Results
            </Typography>
            {results && (
              <Box sx={{ height: 'calc(100% - 40px)' }}>
                <Table
                  table={results}
                  project={project}
                  height="100%"
                />
              </Box>
            )}
          </ResizablePanel>
        </Box>
      </Box>
    </Container>
  );
};

export default QueryExplorer; 
