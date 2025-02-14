import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import {
  listWorksheets,
  createWorksheet,
  updateWorksheet,
  deleteWorksheet,
  getSessionState,
  updateSessionState,
  getWorksheet
} from '../api/worksheet';

const WorksheetContext = createContext(null);

export const WorksheetProvider = ({ children }) => {
  const [worksheets, setWorksheets] = useState([]);
  const [activeWorksheetId, setActiveWorksheetId] = useState(null);
  const [sessionState, setSessionState] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [allWorksheets, setAllWorksheets] = useState([]); // Store all worksheets, not just visible ones
  const [worksheetResults, setWorksheetResults] = useState({}); // Cache for worksheet results

  // Load initial state
  useEffect(() => {
    const loadInitialState = async () => {
      console.log('=== Loading Initial Worksheet State ===');
      setIsLoading(true);
      try {
        const [worksheetData, sessionData] = await Promise.all([
          listWorksheets(),
          getSessionState()
        ]);

        console.log('Loaded worksheets:', worksheetData);
        console.log('Loaded session state:', sessionData);

        // Create a map of worksheet IDs to their session states
        const sessionMap = new Map(
          worksheetData.map(w => [w.worksheet.id, w.session_state])
        );
        console.log('Session state map:', Object.fromEntries(sessionMap));

        // Filter and sort visible worksheets
        const visibleWorksheets = worksheetData
          .filter(w => {
            const isVisible = w.session_state.is_visible;
            console.log(`Worksheet ${w.worksheet.id} visibility:`, isVisible);
            return isVisible;
          })
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

        console.log('Filtered visible worksheets:', visibleWorksheets);

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
          const initialActive = visibleWorksheets[0];
          console.log('Setting initial active worksheet:', initialActive);
          setActiveWorksheetId(initialActive.id);
        }
      } catch (err) {
        console.error('Error loading worksheet state:', err);
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
        // Sync call to ensure it completes
        const xhr = new XMLHttpRequest();
        xhr.open('PUT', '/api/worksheet/session', false); // false makes it synchronous
        xhr.setRequestHeader('Content-Type', 'application/json');
        try {
          xhr.send(JSON.stringify(sessionState));
        } catch (err) {
          console.error('Error saving session state:', err);
        }
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [sessionState]);

  // Add effect to handle visibility updates
  useEffect(() => {
    if (sessionState && worksheets.length > 0) {
      // Ensure session state matches current visibility
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
          .catch(err => console.error('Error updating session state:', err));
      }
    }
  }, [worksheets, sessionState]);

  const handleCreateWorksheet = useCallback(async (initialData = {}) => {
    console.log('=== Creating New Worksheet ===');
    try {
      const result = await createWorksheet({
        name: `Worksheet ${worksheets.length + 1}`,
        query: '',
        ...initialData
      });

      console.log('Created worksheet:', result);
      const newWorksheet = result.worksheet;

      // Create new session state
      const newState = {
        worksheet_id: newWorksheet.id,
        is_visible: true,
        tab_order: (sessionState?.length || 0) + 1
      };
      
      console.log('Creating session state:', newState);
      const updatedSessionState = [...(sessionState || []), newState];
      await updateSessionState(updatedSessionState);
      setSessionState(updatedSessionState);

      // Add to visible worksheets
      const worksheetWithState = { ...newWorksheet, is_visible: true, tab_order: newState.tab_order };
      console.log('Adding to visible worksheets:', worksheetWithState);
      setWorksheets(prev => [...prev, worksheetWithState]);
      setAllWorksheets(prev => [...prev, worksheetWithState]);
      setActiveWorksheetId(newWorksheet.id);

      return newWorksheet;
    } catch (err) {
      console.error('Error creating worksheet:', err);
      setError('Failed to create worksheet');
      throw err;
    }
  }, [worksheets, sessionState]);

  // Add function to load worksheet results
  const loadWorksheetResults = useCallback(async (worksheetId) => {
    console.log(`=== Loading Results for Worksheet ${worksheetId} ===`);
    try {
      const worksheet = await getWorksheet(worksheetId);
      console.log('Loaded worksheet:', worksheet);
      
      const results = {
        results: null,
        queryStats: null
      };
      
      if (worksheet?.results?.results_json) {
        try {
          const parsedResults = JSON.parse(worksheet.results.results_json);
          console.log('Parsed results:', parsedResults);
          
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
            console.log('Formatted results for display:', formattedResults);
            setWorksheetResults(prev => ({
              ...prev,
              [worksheetId]: formattedResults
            }));
            results.results = formattedResults;
          }
        } catch (parseError) {
          console.error('Error parsing results JSON:', parseError);
        }
      }

      // Parse query stats if available
      if (worksheet?.results?.query_stats_json) {
        try {
          const queryStats = JSON.parse(worksheet.results.query_stats_json);
          console.log('Parsed query stats:', queryStats);
          
          // Convert the UTC timestamp string to a UTC timestamp
          const utcDate = new Date(queryStats.timestamp + 'Z'); // Append 'Z' to indicate UTC
          
          results.queryStats = {
            timestamp: utcDate.toISOString(), // Store as ISO string with proper UTC designation
            source: queryStats.source,
            executionTime: queryStats.executionTime || '0.00'
          };
        } catch (parseError) {
          console.error('Error parsing query stats JSON:', parseError);
        }
      }

      return results;
    } catch (err) {
      console.error('Error loading worksheet results:', err);
      return { results: null, queryStats: null };
    }
  }, []);

  // Add effect to load results when active worksheet changes
  useEffect(() => {
    if (activeWorksheetId) {
      loadWorksheetResults(activeWorksheetId);
    }
  }, [activeWorksheetId, loadWorksheetResults]);

  // Modify handleUpdateWorksheet to update results cache
  const handleUpdateWorksheet = useCallback(async (worksheetId, updates) => {
    console.log(`=== Updating Worksheet ${worksheetId} ===`);
    console.log('Updates:', updates);
    try {
      // First update the backend
      const response = await updateWorksheet(worksheetId, updates);
      
      // If the update includes results, update the cache
      if (response && response.results) {
        setWorksheetResults(prev => ({
          ...prev,
          [worksheetId]: response.results
        }));
      }

      // If visibility is being updated, update session state
      if ('is_visible' in updates) {
        console.log('Updating visibility in session state');
        const updatedSessionState = sessionState.map(state => 
          state.worksheet_id === worksheetId
            ? { ...state, is_visible: updates.is_visible }
            : state
        );
        await updateSessionState(updatedSessionState);
        setSessionState(updatedSessionState);
      }

      // Update allWorksheets first
      setAllWorksheets(prev => {
        const updatedWorksheets = prev.map(w => 
          w.id === worksheetId
            ? { ...w, ...updates }
            : w
        );
        console.log('Updated allWorksheets:', updatedWorksheets);
        return updatedWorksheets;
      });

      // Update visible worksheets list while preserving order
      setWorksheets(prev => {
        // Sort function to maintain existing order
        const sortByTabOrder = (a, b) => (a.tab_order || 0) - (b.tab_order || 0);
        
        // If this is a visibility update
        if ('is_visible' in updates) {
          if (updates.is_visible) {
            // Add the worksheet to visible list
            const worksheetToAdd = allWorksheets.find(w => w.id === worksheetId);
            if (worksheetToAdd) {
              const updatedWorksheet = { ...worksheetToAdd, ...updates };
              const newWorksheets = [...prev, updatedWorksheet];
              return newWorksheets.sort(sortByTabOrder);
            }
          } else {
            // Remove from visible list
            return prev.filter(w => w.id !== worksheetId);
          }
        }
        
        // For non-visibility updates, preserve order and just update the worksheet
        return prev.map(w => 
          w.id === worksheetId
            ? { ...w, ...updates }
            : w
        );
      });

      // Get the final updated worksheet
      const updatedWorksheet = allWorksheets.find(w => w.id === worksheetId);
      return updatedWorksheet ? { ...updatedWorksheet, ...updates } : null;
    } catch (err) {
      console.error('Error updating worksheet:', err);
      setError('Failed to update worksheet');
      throw err;
    }
  }, [worksheets, sessionState, allWorksheets]);

  const handleDeleteWorksheet = useCallback(async (worksheetId) => {
    console.log(`=== Deleting Worksheet ${worksheetId} ===`);
    try {
      await deleteWorksheet(worksheetId);
      
      // Update local state
      setWorksheets(prev => {
        const newWorksheets = prev.filter(w => w.id !== worksheetId);
        console.log('Updated visible worksheets:', newWorksheets);
        return newWorksheets;
      });
      
      setAllWorksheets(prev => {
        const newWorksheets = prev.filter(w => w.id !== worksheetId);
        console.log('Updated all worksheets:', newWorksheets);
        return newWorksheets;
      });
      
      // Update session state
      const updatedSessionState = sessionState
        .filter(state => state.worksheet_id !== worksheetId)
        .map((state, index) => ({
          ...state,
          tab_order: index + 1
        }));
      
      console.log('Updated session state:', updatedSessionState);
      await updateSessionState(updatedSessionState);
      setSessionState(updatedSessionState);

      // If deleting active worksheet, switch to another one
      if (worksheetId === activeWorksheetId) {
        const remainingWorksheets = worksheets.filter(w => w.id !== worksheetId);
        if (remainingWorksheets.length > 0) {
          console.log('Switching to worksheet:', remainingWorksheets[0]);
          setActiveWorksheetId(remainingWorksheets[0].id);
        } else {
          console.log('No remaining worksheets, clearing active worksheet');
          setActiveWorksheetId(null);
        }
      }
    } catch (err) {
      console.error('Error deleting worksheet:', err);
      setError('Failed to delete worksheet');
      throw err;
    }
  }, [worksheets, sessionState, activeWorksheetId]);

  const handleReorderWorksheets = useCallback(async (newOrder) => {
    try {
      // Create new session state with updated order
      const updatedSessionState = sessionState.map(state => {
        const newPosition = newOrder.indexOf(state.worksheet_id);
        return {
          ...state,
          tab_order: newPosition !== -1 ? newPosition + 1 : state.tab_order
        };
      });

      // Update API
      await updateSessionState(updatedSessionState);
      
      // Update local state
      setSessionState(updatedSessionState);
      
      // Reorder worksheets array
      const orderedWorksheets = newOrder
        .map(id => worksheets.find(w => w.id === id))
        .filter(Boolean);
      setWorksheets(orderedWorksheets);
    } catch (err) {
      console.error('Error reordering worksheets:', err);
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
    worksheetResults, // Add results to context value
    actions: {
      createWorksheet: handleCreateWorksheet,
      updateWorksheet: handleUpdateWorksheet,
      deleteWorksheet: handleDeleteWorksheet,
      reorderWorksheets: handleReorderWorksheets,
      setActiveWorksheetId,
      loadWorksheetResults, // Add results loading function to actions
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