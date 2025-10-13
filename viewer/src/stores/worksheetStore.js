import {
  listWorksheets,
  createWorksheet,
  updateWorksheet,
  deleteWorksheet,
  updateSessionState,
  listCells,
  createCell,
  updateCell,
  deleteCell,
  reorderCells,
  executeCell as executeCellAPI,
} from '../api/worksheet';

const createWorksheetSlice = (set, get) => ({
  // Worksheet state
  worksheets: [],
  allWorksheets: [],
  activeWorksheetId: null,
  sessionState: null,
  worksheetsLoading: false,
  worksheetsError: null,

  // Cell state (keyed by worksheet ID)
  worksheetCells: {},
  cellsLoading: {},
  cellsError: {},

  // Execution state
  executingCells: {},

  // Auto-save state
  autoSaveEnabled: true,
  autoSaveDebounceMs: 2000,
  autoSaveTimers: {},

  // Initialize worksheets and session
  initializeWorksheets: async () => {
    set({ worksheetsLoading: true, worksheetsError: null });
    try {
      const worksheetData = await listWorksheets();

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
          tab_order: w.session_state.tab_order,
        }));

      // If no worksheets exist, create a default one
      if (worksheetData.length === 0) {
        const result = await createWorksheet({
          name: 'Worksheet 1',
          query: '',
        });

        if (result?.worksheet) {
          const newWorksheet = result.worksheet;
          const newState = {
            worksheet_id: newWorksheet.id,
            is_visible: true,
            tab_order: 1,
          };
          await updateSessionState([newState]);

          const worksheetWithState = {
            ...newWorksheet,
            is_visible: true,
            tab_order: 1,
          };

          set({
            worksheets: [worksheetWithState],
            allWorksheets: [worksheetWithState],
            sessionState: [newState],
            activeWorksheetId: newWorksheet.id,
            worksheetsLoading: false,
          });

          // Load cells for new worksheet
          await get().loadCells(newWorksheet.id);
          return;
        }
      }

      // Set states for existing worksheets
      set({
        worksheets: visibleWorksheets,
        allWorksheets: worksheetData.map(w => ({
          ...w.worksheet,
          is_visible: w.session_state.is_visible,
          tab_order: w.session_state.tab_order,
        })),
        sessionState: worksheetData.map(w => w.session_state),
        activeWorksheetId: visibleWorksheets.length > 0 ? visibleWorksheets[0].id : null,
        worksheetsLoading: false,
      });
    } catch (err) {
      set({ worksheetsError: 'Failed to load worksheets', worksheetsLoading: false });
    }
  },

  // Load cells for a specific worksheet
  loadCells: async worksheetId => {
    set(state => ({
      cellsLoading: { ...state.cellsLoading, [worksheetId]: true },
      cellsError: { ...state.cellsError, [worksheetId]: null },
    }));

    try {
      const cells = await listCells(worksheetId);
      set(state => ({
        worksheetCells: {
          ...state.worksheetCells,
          [worksheetId]: cells,
        },
        cellsLoading: { ...state.cellsLoading, [worksheetId]: false },
      }));
    } catch (err) {
      set(state => ({
        cellsError: { ...state.cellsError, [worksheetId]: 'Failed to load cells' },
        cellsLoading: { ...state.cellsLoading, [worksheetId]: false },
      }));
    }
  },

  // Add a new cell
  addCell: async (worksheetId, queryText = '', cellOrder = null) => {
    try {
      const newCell = await createCell(worksheetId, {
        query_text: queryText,
        cell_order: cellOrder,
      });
      const currentCells = get().worksheetCells[worksheetId] || [];
      set(state => ({
        worksheetCells: {
          ...state.worksheetCells,
          [worksheetId]: [...currentCells, { cell: newCell, result: null }],
        },
      }));
      return newCell;
    } catch (err) {
      set(state => ({
        cellsError: { ...state.cellsError, [worksheetId]: 'Failed to add cell' },
      }));
      throw err;
    }
  },

  // Update a cell
  updateCellData: async (worksheetId, cellId, updates) => {
    try {
      console.log('[worksheetStore] updateCellData called:', {
        worksheetId,
        cellId,
        updates,
      });

      const currentCells = get().worksheetCells[worksheetId] || [];

      // Update local state immediately for optimistic updates
      set(state => ({
        worksheetCells: {
          ...state.worksheetCells,
          [worksheetId]: currentCells.map(c =>
            c.cell.id === cellId ? { ...c, cell: { ...c.cell, ...updates } } : c
          ),
        },
      }));

      // Determine if this is a batched update (multiple fields) or query-only update
      const updateKeys = Object.keys(updates);
      const isBatchedUpdate = updateKeys.length > 1;
      const isQueryOnlyUpdate = updateKeys.length === 1 && updates.query_text !== undefined;

      if (get().autoSaveEnabled && isQueryOnlyUpdate) {
        // Only debounce for query-only updates (auto-save while typing)
        console.log('[worksheetStore] Triggering auto-save for query_text');
        get().triggerAutoSave(worksheetId, cellId, updates);
      } else {
        // For batched updates or non-query updates, save immediately to ensure atomicity
        console.log('[worksheetStore] Saving immediately:', {
          isBatchedUpdate,
          isQueryOnlyUpdate,
          updateKeys,
        });
        const result = await updateCell(worksheetId, cellId, updates);
        console.log('[worksheetStore] Update cell API result:', result);
      }
    } catch (err) {
      console.error('[worksheetStore] Error updating cell:', err);
      set(state => ({
        cellsError: { ...state.cellsError, [worksheetId]: 'Failed to update cell' },
      }));
      throw err;
    }
  },

  // Delete a cell
  removeCellFromWorksheet: async (worksheetId, cellId) => {
    try {
      await deleteCell(worksheetId, cellId);
      const currentCells = get().worksheetCells[worksheetId] || [];
      set(state => ({
        worksheetCells: {
          ...state.worksheetCells,
          [worksheetId]: currentCells.filter(c => c.cell.id !== cellId),
        },
      }));
    } catch (err) {
      set(state => ({
        cellsError: { ...state.cellsError, [worksheetId]: 'Failed to delete cell' },
      }));
      throw err;
    }
  },

  // Reorder cells
  reorderCellsInWorksheet: async (worksheetId, newCellOrder) => {
    try {
      await reorderCells(worksheetId, newCellOrder);
      const currentCells = get().worksheetCells[worksheetId] || [];

      // Reorder cells in local state
      const orderedCells = newCellOrder
        .map(cellId => currentCells.find(c => c.cell.id === cellId))
        .filter(Boolean);

      set(state => ({
        worksheetCells: {
          ...state.worksheetCells,
          [worksheetId]: orderedCells,
        },
      }));
    } catch (err) {
      set(state => ({
        cellsError: { ...state.cellsError, [worksheetId]: 'Failed to reorder cells' },
      }));
      throw err;
    }
  },

  // Execute a specific cell
  executeCellQuery: async (worksheetId, cellId) => {
    const state = get();
    const currentCells = state.worksheetCells[worksheetId] || [];
    const cell = currentCells.find(c => c.cell.id === cellId);

    console.log('[worksheetStore] executeCellQuery called:', {
      worksheetId,
      cellId,
      cellData: cell?.cell,
    });

    if (!cell || !cell.cell.query_text?.trim()) {
      console.log('[worksheetStore] Skipping execution - no query text');
      return;
    }

    // Mark cell as executing
    set(state => ({
      executingCells: { ...state.executingCells, [cellId]: true },
    }));

    try {
      console.log('[worksheetStore] Calling backend executeCell API...');
      // Use the new backend API that handles cell's selected_source
      const result = await executeCellAPI(worksheetId, cellId);
      console.log('[worksheetStore] Backend execution result:', result);
      console.log('[worksheetStore] Backend query_stats.source:', result.query_stats?.source);

      // Parse the results
      const queryResults = {
        columns: result.columns,
        data: result.rows,
      };

      const queryStats = result.query_stats;
      console.log('[worksheetStore] Query stats source name:', queryStats?.source);

      // Format results for display
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

      // Update cell with results
      set(state => ({
        worksheetCells: {
          ...state.worksheetCells,
          [worksheetId]: currentCells.map(c =>
            c.cell.id === cellId
              ? {
                  ...c,
                  result: {
                    results_json: JSON.stringify({
                      columns: queryResults.columns,
                      rows: queryResults.data,
                    }),
                    query_stats_json: JSON.stringify(queryStats),
                    is_truncated: result.is_truncated || false,
                  },
                  formattedResults,
                  queryStats,
                  error: null, // Clear any previous errors
                }
              : c
          ),
        },
        executingCells: { ...state.executingCells, [cellId]: false },
      }));
    } catch (err) {
      // Update cell with error
      set(state => ({
        worksheetCells: {
          ...state.worksheetCells,
          [worksheetId]: currentCells.map(c =>
            c.cell.id === cellId
              ? {
                  ...c,
                  error: err.message || 'Failed to execute query',
                  result: null,
                }
              : c
          ),
        },
        executingCells: { ...state.executingCells, [cellId]: false },
      }));
    }
  },

  // Execute all cells in sequence
  executeAllCells: async worksheetId => {
    const currentCells = get().worksheetCells[worksheetId] || [];
    for (const cellData of currentCells) {
      await get().executeCellQuery(worksheetId, cellData.cell.id);
    }
  },

  // Auto-save functionality with debouncing
  triggerAutoSave: (worksheetId, cellId, updates) => {
    const state = get();
    const key = `${worksheetId}-${cellId}`;

    // Clear existing timer if any
    if (state.autoSaveTimers[key]) {
      clearTimeout(state.autoSaveTimers[key]);
    }

    // Set new timer
    const timerId = setTimeout(async () => {
      try {
        await updateCell(worksheetId, cellId, updates);
        // Remove timer from state
        set(state => {
          const newTimers = { ...state.autoSaveTimers };
          delete newTimers[key];
          return { autoSaveTimers: newTimers };
        });
      } catch (err) {
        console.error('Auto-save failed:', err);
      }
    }, state.autoSaveDebounceMs);

    set(state => ({
      autoSaveTimers: { ...state.autoSaveTimers, [key]: timerId },
    }));
  },

  // Worksheet management actions (migrated from Context)
  createNewWorksheet: async (initialData = {}) => {
    const state = get();
    try {
      const result = await createWorksheet({
        name: `Worksheet ${state.worksheets.length + 1}`,
        query: '',
        ...initialData,
      });

      if (!result?.worksheet) {
        throw new Error('Invalid response from createWorksheet');
      }

      const newWorksheet = result.worksheet;
      const newState = {
        worksheet_id: newWorksheet.id,
        is_visible: true,
        tab_order: (state.sessionState?.length || 0) + 1,
      };

      const updatedSessionState = [...(state.sessionState || []), newState];
      await updateSessionState(updatedSessionState);

      const worksheetWithState = {
        ...newWorksheet,
        is_visible: true,
        tab_order: newState.tab_order,
      };

      set({
        worksheets: [...state.worksheets, worksheetWithState],
        allWorksheets: [...state.allWorksheets, worksheetWithState],
        activeWorksheetId: newWorksheet.id,
        sessionState: updatedSessionState,
      });

      // Load cells for new worksheet
      await get().loadCells(newWorksheet.id);

      return newWorksheet;
    } catch (err) {
      set({ worksheetsError: 'Failed to create worksheet' });
      throw err;
    }
  },

  updateWorksheetData: async (worksheetId, updates) => {
    const state = get();
    try {
      await updateWorksheet(worksheetId, updates);

      if ('is_visible' in updates && state.sessionState) {
        const updatedSessionState = state.sessionState.map(s =>
          s.worksheet_id === worksheetId ? { ...s, is_visible: updates.is_visible } : s
        );
        await updateSessionState(updatedSessionState);
        set({ sessionState: updatedSessionState });
      }

      set({
        allWorksheets: state.allWorksheets.map(w =>
          w.id === worksheetId ? { ...w, ...updates } : w
        ),
        worksheets:
          'is_visible' in updates
            ? updates.is_visible
              ? [
                  ...state.worksheets.filter(w => w.id !== worksheetId),
                  { ...state.allWorksheets.find(w => w.id === worksheetId), ...updates },
                ].sort((a, b) => (a.tab_order || 0) - (b.tab_order || 0))
              : state.worksheets.filter(w => w.id !== worksheetId)
            : state.worksheets.map(w => (w.id === worksheetId ? { ...w, ...updates } : w)),
      });
    } catch (err) {
      set({ worksheetsError: 'Failed to update worksheet' });
      throw err;
    }
  },

  deleteWorksheetById: async worksheetId => {
    const state = get();
    try {
      await deleteWorksheet(worksheetId);

      const updatedSessionState = state.sessionState
        .filter(s => s.worksheet_id !== worksheetId)
        .map((s, index) => ({
          ...s,
          tab_order: index + 1,
        }));

      await updateSessionState(updatedSessionState);

      const remainingWorksheets = state.worksheets.filter(w => w.id !== worksheetId);

      // Clear all auto-save timers for cells in this worksheet
      const cells = state.worksheetCells[worksheetId] || [];
      cells.forEach(cellData => {
        const timerKey = `${worksheetId}-${cellData.cell.id}`;
        if (state.autoSaveTimers[timerKey]) {
          clearTimeout(state.autoSaveTimers[timerKey]);
        }
      });

      set({
        worksheets: remainingWorksheets,
        allWorksheets: state.allWorksheets.filter(w => w.id !== worksheetId),
        sessionState: updatedSessionState,
        activeWorksheetId:
          worksheetId === state.activeWorksheetId
            ? remainingWorksheets.length > 0
              ? remainingWorksheets[0].id
              : null
            : state.activeWorksheetId,
      });

      // Clean up cell state and timers
      set(state => {
        const newCells = { ...state.worksheetCells };
        delete newCells[worksheetId];

        // Remove timers for this worksheet
        const newTimers = { ...state.autoSaveTimers };
        Object.keys(newTimers).forEach(key => {
          if (key.startsWith(`${worksheetId}-`)) {
            clearTimeout(newTimers[key]);
            delete newTimers[key];
          }
        });

        return { worksheetCells: newCells, autoSaveTimers: newTimers };
      });
    } catch (err) {
      set({ worksheetsError: 'Failed to delete worksheet' });
      throw err;
    }
  },

  reorderWorksheets: async newOrder => {
    const state = get();
    try {
      const updatedSessionState = state.sessionState.map(s => {
        const newPosition = newOrder.indexOf(s.worksheet_id);
        return {
          ...s,
          tab_order: newPosition !== -1 ? newPosition + 1 : s.tab_order,
        };
      });

      await updateSessionState(updatedSessionState);

      const orderedWorksheets = newOrder
        .map(id => state.worksheets.find(w => w.id === id))
        .filter(Boolean);

      set({
        worksheets: orderedWorksheets,
        sessionState: updatedSessionState,
      });
    } catch (err) {
      set({ worksheetsError: 'Failed to reorder worksheets' });
      throw err;
    }
  },

  setActiveWorksheet: worksheetId => {
    set({ activeWorksheetId: worksheetId });
    // Load cells for the active worksheet if not already loaded
    const state = get();
    if (!state.worksheetCells[worksheetId]) {
      get().loadCells(worksheetId);
    }
  },

  clearWorksheetError: () => set({ worksheetsError: null }),
  clearCellError: worksheetId =>
    set(state => ({
      cellsError: { ...state.cellsError, [worksheetId]: null },
    })),

  // Keyboard shortcuts handlers
  handleExecuteCurrentCell: (worksheetId, cellId) => {
    get().executeCellQuery(worksheetId, cellId);
  },

  handleExecuteAndAdvance: async (worksheetId, cellId) => {
    await get().executeCellQuery(worksheetId, cellId);
    // Add logic to focus next cell (will be handled in UI component)
  },

  handleExecuteAndAddBelow: async (worksheetId, cellId) => {
    await get().executeCellQuery(worksheetId, cellId);
    // Add a new cell below
    await get().addCell(worksheetId, '', null);
  },
});

export default createWorksheetSlice;
