import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import {
  listWorksheets,
  createWorksheet,
  updateWorksheet,
  deleteWorksheet,
  updateSessionState,
  getWorksheet
} from '../api/worksheet';

const WorksheetContext = createContext(null);

export const WorksheetProvider = ({ children }) => {
  const [worksheets, setWorksheets] = useState([]);
  const [activeWorksheetId, setActiveWorksheetId] = useState(null);
  const [sessionState, setSessionState] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [allWorksheets, setAllWorksheets] = useState([]);
  const [worksheetResults, setWorksheetResults] = useState({});


  // Load initial state
  useEffect(() => {
    const loadInitialState = async () => {
      setIsLoading(true);
      try {
        const [worksheetData] = await Promise.all([
          listWorksheets()
        ]);

        // Create a map of worksheet IDs to their session states
        

        // Filter and sort visible worksheets
        const visibleWorksheets = worksheetData
          .filter(w => w.session_state.is_visible)
          .sort((a, b) => {
            const aOrder = a.session_state.tab_order || 0;
            const bOrder = b.session_state.tab_order || 0;
            return aOrder - bOrder;
          })
          .map(w => ({
            ...w.worksheet,
            is_visible: true,
            tab_order: w.session_state.tab_order
          }));

        // Set states
        setWorksheets(visibleWorksheets);
        setAllWorksheets(worksheetData.map(w => ({
          ...w.worksheet,
          is_visible: w.session_state.is_visible,
          tab_order: w.session_state.tab_order
        })));
        setSessionState(worksheetData.map(w => w.session_state));

        // Set initial active worksheet
        if (visibleWorksheets.length > 0) {
          setActiveWorksheetId(visibleWorksheets[0].id);
        }
      } catch (err) {
        setError('Failed to load worksheets');
      } finally {
        setIsLoading(false);
      }
    };

    loadInitialState();
  }, []);

  // Save session state before unload
  useEffect(() => {
    const handleBeforeUnload = (e) => {
      if (sessionState) {
        const xhr = new XMLHttpRequest();
        xhr.open('PUT', '/api/worksheet/session', false);
        xhr.setRequestHeader('Content-Type', 'application/json');
        try {
          xhr.send(JSON.stringify(sessionState));
        } catch (err) {
          // Error handling is silent for unload events
        }
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [sessionState]);

  // Add effect to handle visibility updates
  useEffect(() => {
    if (sessionState && worksheets.length > 0) {
      const updatedSessionState = sessionState.map(state => {
        const isVisible = worksheets.some(w => w.id === state.worksheet_id);
        return {
          ...state,
          is_visible: isVisible
        };
      });

      if (JSON.stringify(updatedSessionState) !== JSON.stringify(sessionState)) {
        updateSessionState(updatedSessionState)
          .then(() => setSessionState(updatedSessionState))
          .catch(() => setError('Failed to update session state'));
      }
    }
  }, [worksheets, sessionState]);

  const loadWorksheetResults = useCallback(async (worksheetId) => {
    try {
      const worksheet = await getWorksheet(worksheetId);
      const results = {
        results: null,
        queryStats: null
      };
      
      if (worksheet?.results?.results_json) {
        try {
          const parsedResults = JSON.parse(worksheet.results.results_json);
          
          if (parsedResults.columns && parsedResults.rows) {
            const formattedResults = {
              name: 'Query Results',
              traces: [{
                name: 'results',
                props: {},
                data: parsedResults.rows.map((row, index) => ({
                  id: index,
                  ...row
                })),
                columns: parsedResults.columns.map(col => ({
                  header: col,
                  key: col,
                  accessorKey: col,
                  markdown: false
                }))
              }]
            };
            setWorksheetResults(prev => ({
              ...prev,
              [worksheetId]: formattedResults
            }));
            results.results = formattedResults;
          }
        } catch (parseError) {
          // Silent error for parsing results
        }
      }

      if (worksheet?.results?.query_stats_json) {
        try {
          const queryStats = JSON.parse(worksheet.results.query_stats_json);
          const utcDate = new Date(queryStats.timestamp + 'Z');
          
          results.queryStats = {
            timestamp: utcDate.toISOString(),
            source: queryStats.source,
            executionTime: queryStats.executionTime || '0.00'
          };
        } catch (parseError) {
          // Silent error for parsing stats
        }
      }

      return results;
    } catch (err) {
      return { results: null, queryStats: null };
    }
  }, []);

  // Restore the effect to load results when active worksheet changes
  useEffect(() => {
    if (activeWorksheetId) {
      loadWorksheetResults(activeWorksheetId);
    }
  }, [activeWorksheetId, loadWorksheetResults]);

  const handleCreateWorksheet = useCallback(async (initialData = {}) => {
    try {
      const result = await createWorksheet({
        name: `Worksheet ${worksheets.length + 1}`,
        query: '',
        ...initialData
      });

      if (!result?.worksheet) {
        throw new Error('Invalid response from createWorksheet');
      }

      const newWorksheet = result.worksheet;
      const newState = {
        worksheet_id: newWorksheet.id,
        is_visible: true,
        tab_order: (sessionState?.length || 0) + 1
      };
      
      const updatedSessionState = [...(sessionState || []), newState];
      await updateSessionState(updatedSessionState);
      setSessionState(updatedSessionState);

      const worksheetWithState = { ...newWorksheet, is_visible: true, tab_order: newState.tab_order };
      setWorksheets(prev => [...prev, worksheetWithState]);
      setAllWorksheets(prev => [...prev, worksheetWithState]);
      setActiveWorksheetId(newWorksheet.id);

      return newWorksheet;
    } catch (err) {
      setError('Failed to create worksheet');
      throw err;
    }
  }, [worksheets, sessionState]);

  const handleUpdateWorksheet = useCallback(async (worksheetId, updates) => {
    try {
      const response = await updateWorksheet(worksheetId, updates);
      
      if (response && response.results) {
        setWorksheetResults(prev => ({
          ...prev,
          [worksheetId]: response.results
        }));
      }

      if ('is_visible' in updates && sessionState) {
        const updatedSessionState = sessionState.map(state => 
          state.worksheet_id === worksheetId
            ? { ...state, is_visible: updates.is_visible }
            : state
        );
        await updateSessionState(updatedSessionState);
        setSessionState(updatedSessionState);
      }

      setAllWorksheets(prev => {
        const updatedWorksheets = prev.map(w => 
          w.id === worksheetId
            ? { ...w, ...updates }
            : w
        );
        return updatedWorksheets;
      });

      setWorksheets(prev => {
        const sortByTabOrder = (a, b) => (a.tab_order || 0) - (b.tab_order || 0);
        
        if ('is_visible' in updates) {
          if (updates.is_visible) {
            const worksheetToAdd = allWorksheets.find(w => w.id === worksheetId);
            if (worksheetToAdd) {
              const updatedWorksheet = { ...worksheetToAdd, ...updates };
              const newWorksheets = [...prev, updatedWorksheet];
              return newWorksheets.sort(sortByTabOrder);
            }
          } else {
            return prev.filter(w => w.id !== worksheetId);
          }
        }
        
        return prev.map(w => 
          w.id === worksheetId
            ? { ...w, ...updates }
            : w
        );
      });

      const updatedWorksheet = allWorksheets.find(w => w.id === worksheetId);
      return updatedWorksheet ? { ...updatedWorksheet, ...updates } : null;
    } catch (err) {
      setError('Failed to update worksheet');
      throw err;
    }
  }, [sessionState, allWorksheets]);

  const handleDeleteWorksheet = useCallback(async (worksheetId) => {
    try {
      await deleteWorksheet(worksheetId);
      
      setWorksheets(prev => prev.filter(w => w.id !== worksheetId));
      setAllWorksheets(prev => prev.filter(w => w.id !== worksheetId));
      
      const updatedSessionState = sessionState
        .filter(state => state.worksheet_id !== worksheetId)
        .map((state, index) => ({
          ...state,
          tab_order: index + 1
        }));
      
      await updateSessionState(updatedSessionState);
      setSessionState(updatedSessionState);

      if (worksheetId === activeWorksheetId) {
        const remainingWorksheets = worksheets.filter(w => w.id !== worksheetId);
        setActiveWorksheetId(remainingWorksheets.length > 0 ? remainingWorksheets[0].id : null);
      }
    } catch (err) {
      setError('Failed to delete worksheet');
      throw err;
    }
  }, [worksheets, sessionState, activeWorksheetId]);

  const handleReorderWorksheets = useCallback(async (newOrder) => {
    try {
      const updatedSessionState = sessionState.map(state => {
        const newPosition = newOrder.indexOf(state.worksheet_id);
        return {
          ...state,
          tab_order: newPosition !== -1 ? newPosition + 1 : state.tab_order
        };
      });

      await updateSessionState(updatedSessionState);
      setSessionState(updatedSessionState);
      
      const orderedWorksheets = newOrder
        .map(id => worksheets.find(w => w.id === id))
        .filter(Boolean);
      setWorksheets(orderedWorksheets);
    } catch (err) {
      setError('Failed to reorder worksheets');
      throw err;
    }
  }, [worksheets, sessionState]);

  const value = {
    worksheets,
    allWorksheets,
    activeWorksheetId,
    sessionState,
    isLoading,
    error,
    worksheetResults,
    actions: {
      createWorksheet: handleCreateWorksheet,
      updateWorksheet: handleUpdateWorksheet,
      deleteWorksheet: handleDeleteWorksheet,
      reorderWorksheets: handleReorderWorksheets,
      setActiveWorksheetId,
      loadWorksheetResults,
      clearError: () => setError(null)
    }
  };

  return (
    <WorksheetContext.Provider value={value}>
      {children}
    </WorksheetContext.Provider>
  );
};

export const useWorksheets = () => {
  const context = useContext(WorksheetContext);
  if (!context) {
    throw new Error('useWorksheets must be used within a WorksheetProvider');
  }
  return context;
};

export default WorksheetContext; 