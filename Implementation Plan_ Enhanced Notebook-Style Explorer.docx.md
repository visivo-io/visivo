# Implementation Plan: Enhanced Notebook-Style Explorer

## Data Model & State Management

* **Extend Worksheet Data Structure**: Modify the internal model for a **Worksheet** to support multiple query cells instead of a single query string. Each Worksheet will contain an ordered list of **QueryCell** objects. Define a **QueryCell** structure with fields for:

* A unique cell ID (within the worksheet).

* SQL query text.

* Associated data source (by name or ID).

* Execution status (idle/running/success/error).

* Result data (with metadata like columns and truncated row count if applicable).

* Current view mode (table or dimension pills).

* **Zustand Store Integration**: Migrate worksheet state from the WorksheetContext into the centralized zustand store for consistent state management across the app. This involves:

* Adding worksheets array and activeWorksheetId to the zustand store state (mirroring what WorksheetContext provides).

* Actions for manipulating worksheets (create, select, rename, close) and cells (add, remove, reorder, update query text, execute).

* Initializing store state by loading existing worksheets from the backend on app load (using the existing /api/worksheet endpoints or a new consolidated one).

* Removing the direct dependency on the React context by using store state in components. For example, the current QueryPanel uses a single query value from store[\[1\]](https://github.com/visivo-io/visivo/blob/f5ce28af81ebd0159232dacd9deb329622ff2646/viewer/src/components/explorer/QueryPanel.jsx#L116-L124); this will be refactored to use the active worksheet’s cells list instead.

* **Session Persistence Layer**: Replace or augment the current session persistence (which uses an API to save session state on unload[\[2\]](https://github.com/visivo-io/visivo/blob/f5ce28af81ebd0159232dacd9deb329622ff2646/viewer/src/contexts/WorksheetContext.jsx#L70-L78)) with continuous auto-save. Potential approaches:

* Continue using the /api/worksheet/session mechanism but call it whenever worksheet or cell state changes (rather than only on unload) to **persist open worksheets and their content**.

* Alternatively, use browser local storage or IndexedDB to auto-save the content of each open cell and active tabs. On application load, restore from this saved state.

* Ensure that the persistence includes each cell’s query text, the selected data source for the worksheet, and view mode per cell (fulfilling **FR-010** and **FR-016** for auto-save and restore).

* **NamedChildStore Sync**: Ensure that any creation or update of models/sources in the UI updates the in-memory namedChildren (or equivalent structure) that tracks all named entities. The store should expose namedChildren or similar, refreshed via the /api/project/named\_children endpoint, so the explorer tree reflects the latest sources and models at all times.

## Frontend UI Components

### Notebook-Style Query Worksheets

* **New NotebookExplorer Component**: Replace the current Explorer.jsx view with a new component (or set of components) that implements the notebook-style interface. The layout remains a split view: left side explorer tree, right side notebook editor.

* **Worksheet Layout with Multiple Cells**: Within each worksheet tab, render a vertical sequence of **QueryCell components**, one per cell in that worksheet. Each QueryCell component will include:

* A Monaco SQL editor (similar to the current single Editor in QueryPanel[\[1\]](https://github.com/visivo-io/visivo/blob/f5ce28af81ebd0159232dacd9deb329622ff2646/viewer/src/components/explorer/QueryPanel.jsx#L116-L124), but one instance per cell).

* A toolbar for the cell with actions: **Run** (execute query), **Save as Model**, and possibly **Delete cell** or **Move cell** (for reordering if not via drag-and-drop).

* The results area for that cell, which should appear immediately below the editor once the query is run.

* **Independent Cell Execution**: Ensure each QueryCell’s Run button (or Cmd/Ctrl+Enter shortcut) triggers execution *only* for that cell’s query (not all cells). Internally, the cell’s state in the store should mark it as running and store its results or error independently (fulfills **FR-022**).

* **Add/Remove Cells**: Provide an **“Add Cell”** button or shortcut (e.g. Alt+Enter) to insert a new query cell below the current one (per **FR-021**). Also allow deleting a cell (via a small delete icon on each cell or a right-click context menu). When a cell is deleted, remove it from the worksheet’s cells array and update the UI accordingly, without affecting other cells (per User Story 1 acceptance criteria).

* **Reordering Cells**: Support reordering of cells within a worksheet (low priority but included in **FR-021**). This could be implemented via drag-and-drop (using a library or HTML5 drag API) or simpler up/down arrow buttons on each cell to move its position. Adjust the worksheet’s cell order in state on reorder.

### Multi-Worksheet Tabs & Navigation

* **Tab Bar UI**: Utilize the existing WorksheetTabManager component (or an enhanced version) to display open worksheets as tabs (fulfills **FR-006**). Ensure it supports:

* A **“+”** button to create a new worksheet (calls a store action to create a new Worksheet with a default name, e.g. “Worksheet 3”)[\[3\]](https://github.com/visivo-io/visivo/blob/f5ce28af81ebd0159232dacd9deb329622ff2646/viewer/src/components/explorer/QueryPanel.jsx#L48-L56).

* Display of each open worksheet’s name, with an editable title (double-click or right-click to rename, triggering a store update and backend call to save the new name).

* An “X” button on each tab to close it. Closing a tab should mark the worksheet as not visible (or remove it from the open list) without deleting it entirely, matching current behavior (the context hides worksheets on close[\[4\]](https://github.com/visivo-io/visivo/blob/f5ce28af81ebd0159232dacd9deb329622ff2646/viewer/src/components/worksheets/WorksheetTabManager.jsx#L31-L40)). If the closed worksheet was active, auto-switch to another open worksheet.

* If a worksheet has unsaved changes (e.g. queries not saved as models), display a subtle indicator (like a dot on the tab title). On attempting to close such a tab, prompt the user to confirm closing, as per **FR-006** and User Story 4 scenario 3\.

* **Active Worksheet Switching**: Implement logic such that selecting a different tab loads that worksheet’s cells and state into the editor area. When activeWorksheetId changes, update the UI to render that worksheet’s cells and update the store’s selectedSource to the worksheet’s saved source. We may reuse the context action setActiveWorksheetId or replicate its effect in the store. The current QueryPanel uses setActiveWorksheetId on tab change[\[3\]](https://github.com/visivo-io/visivo/blob/f5ce28af81ebd0159232dacd9deb329622ff2646/viewer/src/components/explorer/QueryPanel.jsx#L48-L56), and we will extend that to also load the corresponding cells and query content for the active worksheet.

* **Worksheet Creation and Persistence**: When a new worksheet is created via the “+” button or keyboard shortcut (Cmd+T/Ctrl+T), generate a new worksheet object:

* Assign a default name (e.g. “Worksheet N”) and default single empty cell.

* Save it to backend (via an API like /api/worksheet/create) or at least update session state so it’s restored later.

* Immediately switch to this new worksheet tab in the UI (activeWorksheetId updated).

* **Worksheet Renaming**: Hook up tab renaming to backend. The WorksheetTabManager already passes onWorksheetRename to update the name[\[3\]](https://github.com/visivo-io/visivo/blob/f5ce28af81ebd0159232dacd9deb329622ff2646/viewer/src/components/explorer/QueryPanel.jsx#L48-L56). We need to implement updateWorksheet(id, { name }) in the store or context to call the appropriate API (likely /api/worksheet/update if exists, or using ProjectWriter if the name is stored in project files). This fulfills part of **FR-011** (renaming models/worksheets).

* **Restore Tabs on Load**: On application startup, after loading project data, re-open any worksheets that were open in the last session. The existing context uses listWorksheets() and session\_state to restore visible worksheets[\[5\]](https://github.com/visivo-io/visivo/blob/f5ce28af81ebd0159232dacd9deb329622ff2646/viewer/src/contexts/WorksheetContext.jsx#L31-L40)[\[6\]](https://github.com/visivo-io/visivo/blob/f5ce28af81ebd0159232dacd9deb329622ff2646/viewer/src/contexts/WorksheetContext.jsx#L56-L64). We will carry this logic into the zustand store initialization:

* Call the API to list worksheets with their last queries and visibility state.

* Populate the store’s worksheets list with those marked is\_visible, and set the first one as active by default (if any).

* Also restore each worksheet’s cells content. (If previously each worksheet only had one query, it will come as one cell; future sessions will need to save multiple cells, possibly by extending the stored data model or session JSON to include all cells’ queries.)

### Explorer Tree & Data Sources Panel

* **Explorer Tree**: Continue to display the tree of **Sources**, **Models**, and **Traces** on the left panel (per **FR-004**). Reuse the existing ExplorerTree component for now, which relies on explorerData and namedChildren from the store (populated via fetchExplorer() in Explorer.jsx[\[7\]](https://github.com/visivo-io/visivo/blob/f5ce28af81ebd0159232dacd9deb329622ff2646/viewer/src/components/explorer/Explorer.jsx#L137-L145)). Ensure that:

* When a new model is saved or a new source added, the tree is updated. This can be done by re-fetching explorerData (calling fetchExplorer() again) or updating namedChildren state with the new entry.

* The **tabs/switch** for filtering the tree by type (sources, models, traces) remains functional (likely controlled by selectedType in store).

* The tree is still interactive (clicking a model opens it in viewer or sets some state, etc. – outside the scope of this feature, but should not break).

* We hide certain model types in the tree (as done via HIDDEN\_MODEL\_TYPES in Explorer component) to avoid showing internal models[\[8\]](https://github.com/visivo-io/visivo/blob/f5ce28af81ebd0159232dacd9deb329622ff2646/viewer/src/components/explorer/Explorer.jsx#L179-L188)[\[9\]](https://github.com/visivo-io/visivo/blob/f5ce28af81ebd0159232dacd9deb329622ff2646/viewer/src/components/explorer/Explorer.jsx#L182-L190).

* **Selected Data Source per Worksheet**: Allow the user to select which data source each worksheet (or each cell) is querying against. Likely, all cells in a worksheet use the same source for simplicity. We will:

* Include a **Source Dropdown** at the top of each worksheet (perhaps next to the “SQL Query” heading, similar to current UI[\[10\]](https://github.com/visivo-io/visivo/blob/f5ce28af81ebd0159232dacd9deb329622ff2646/viewer/src/components/explorer/QueryPanel.jsx#L88-L95)). This will list all available sources (from namedChildren where type\_key \=== 'sources').

* When the user changes the source in the dropdown, update the active worksheet’s selectedSource in state. All cells in that worksheet will then use this source for execution. (This satisfies the need to choose sources for queries; if needed in future, we could allow per-cell source selection, but per the PRD it seems per worksheet is fine).

* Default the source for a new worksheet to either the project’s default source (if defined in explorerData.default\_source) or the first available source[\[11\]](https://github.com/visivo-io/visivo/blob/f5ce28af81ebd0159232dacd9deb329622ff2646/viewer/src/components/explorer/Explorer.jsx#L152-L160).

* **“Add Data Source” Button**: Implement a button in the bottom-left of the explorer panel (below the tree) labeled e.g. “+ Data Source” (per **FR-005** and User Story 3). This button will trigger a modal or form to collect new data source details:

* **CreateObjectModal Reuse**: The app’s onboarding flow uses a CreateObjectModal for adding sources[\[12\]](https://github.com/visivo-io/visivo/blob/f5ce28af81ebd0159232dacd9deb329622ff2646/viewer/src/components/onboarding/Onboarding.jsx#L2-L5). We can repurpose or refactor a similar modal for the explorer context. When the button is clicked, open a modal dialog with fields: Source Name, Type (dropdown of supported types), and fields specific to that type (host, port, database, etc., or a connection string).

* **Connection Credentials Handling**: When the form is submitted, call the backend API to create the source. Use the existing /api/source/create/ endpoint by constructing a form data payload as done in Onboarding’s createSource function[\[13\]](https://github.com/visivo-io/visivo/blob/f5ce28af81ebd0159232dacd9deb329622ff2646/viewer/src/components/onboarding/Onboarding.jsx#L76-L84). This will attempt to connect and create the source definition in the project (writing to the project YAML and .env file).

* **Connection Validation**: If the API call returns an error (non-200), catch it and display a clear error message to the user (e.g. “Failed to connect: \[details\]”). The Onboarding code already throws an error with data.message if creation fails[\[14\]](https://github.com/visivo-io/visivo/blob/f5ce28af81ebd0159232dacd9deb329622ff2646/viewer/src/components/onboarding/Onboarding.jsx#L98-L105); we will surface that message in our modal.

* **Add to Config**: On success, the API returns the new source object. We should then refresh the explorer tree to include the new source (or insert it directly into the tree state). The new source should also be added to namedChildren and written to the project file via the backend (the create\_source API internally writes to YAML and .env).

* **Duplicate Names**: If the user tries to add a source with a name that already exists, the backend likely returns an error. We’ll ensure the error message (perhaps “Source name already exists”) is shown, so the user can choose a different name (covering an edge case).

* **Supported Source Types**: Populate the “Type” dropdown with supported source types (which could be fetched from an enum like SourceTypeEnum[\[15\]](https://github.com/visivo-io/visivo/blob/f5ce28af81ebd0159232dacd9deb329622ff2646/visivo/server/views/project_views.py#L14-L17) or a predefined list in the frontend). If a type is not supported or not listed, the user shouldn’t be able to select it (fulfills **FR-019**).

* **Credential Storage**: Ensure that sensitive fields (user/password) are handled via environment variable references. The backend create\_source already handles storing credentials as env vars. We just need to ensure we pass the values and then the returned source config will contain env var placeholders (the UI can remain ignorant of actual values after creation).

### Query Cell Editor & Result Display

* **Monaco Editor Instance per Cell**: Create a QueryCell component that internally uses the Monaco Editor (as we do now in QueryPanel). Each cell’s editor should be controlled by that cell’s query state. For example:

* \<Editor value={cell.queryText} onChange={(newVal) \=\> updateCellQuery(cell.id, newVal)} ... /\> for each cell.

* Reuse editor options from current implementation (SQL language, dark theme, certain options like wordWrap and readOnly flag when running)[\[16\]](https://github.com/visivo-io/visivo/blob/f5ce28af81ebd0159232dacd9deb329622ff2646/viewer/src/components/explorer/QueryPanel.jsx#L122-L131).

* The editor should automatically adjust height to content, or at least be scrollable, and not fixed to the entire panel height as it is now.

* **Run Query Action**: Each QueryCell’s Run button (or the global Run if we keep one per worksheet) will:

* Call a store action like executeCellQuery(worksheetId, cellId).

* This action will retrieve the query text and target source, then dispatch the backend API call to run the query (see **Backend Integration** below for details).

* Immediately update UI state: mark that cell as running (to disable its editor input and show a loading spinner on the Run button). The current UI changes the Run button to a loading state when isLoading is true[\[17\]](https://github.com/visivo-io/visivo/blob/f5ce28af81ebd0159232dacd9deb329622ff2646/viewer/src/components/explorer/QueryPanel.jsx#L96-L104). We will adapt this to each cell (e.g., maintain an isRunning flag per cell instead of a global isLoading).

* Keyboard shortcuts: Hook up **Cmd/Ctrl+Enter** to trigger executeCellQuery for the focused cell (fulfills **FR-017** for execute). Implement **Shift+Enter** to run and then focus the next cell (if at last cell, create a new one below and focus it), and **Alt+Enter** to insert a new cell below without running (these behaviors align with typical Jupyter notebook UX).

* **ResultsPanel Integration**: The existing ResultsPanel component is currently a single panel for the whole worksheet’s result[\[18\]](https://github.com/visivo-io/visivo/blob/f5ce28af81ebd0159232dacd9deb329622ff2646/viewer/src/components/explorer/Explorer.jsx#L372-L375). We will not use a single global ResultsPanel; instead, each QueryCell will manage its own results display below its editor. We can refactor the rendering logic from ResultsPanel to a smaller **ResultView** component that takes a result dataset and displays it in the chosen format.

* For table results: likely reuse the table rendering (perhaps they use a library or custom table, not visible in snippet, but ResultsPanel probably renders the data from store.results).

* For dimension pills: implement a new ResultView mode (see **Visual Result Modes** below).

* Ensure that results are properly paginated if large (e.g., show only first 1000 rows at a time with controls to navigate pages, fulfilling **FR-018**).

* If a query returns more than 100,000 rows, truncate the stored results to 100k and set a flag to indicate truncation. Show a warning message in the result area (e.g., “Results truncated to 100,000 rows”).

* **Error Display per Cell**: If a query cell execution fails, display the error message just below that cell’s editor (in place of results). Use a styled error banner similar to the current global error banner in QueryPanel[\[19\]](https://github.com/visivo-io/visivo/blob/f5ce28af81ebd0159232dacd9deb329622ff2646/viewer/src/components/explorer/QueryPanel.jsx#L56-L65)[\[20\]](https://github.com/visivo-io/visivo/blob/f5ce28af81ebd0159232dacd9deb329622ff2646/viewer/src/components/explorer/QueryPanel.jsx#L58-L66), but scoped to the cell. The error message should contain:

* The error type or code (if available).

* The relevant portion of the SQL or an indication of where it failed. If the error from the database includes a line/column, parse and include that (e.g., “Syntax error at line 1: ...”).

* A friendly hint if possible (e.g., if it's a syntax error, suggest checking SQL syntax or missing commas). This addresses **FR-009** with detailed error info.

* Allow the user to dismiss the error message (an “X” button) which simply hides the banner (so they can continue editing).

### Visual Result Modes (Table vs Dimension Pills)

* **Default Table View**: By default, query results will render in a scrollable table format (as currently implemented). Reuse or build upon the existing table rendering logic:

* If the results are stored as an array of row objects and an array of column definitions (as seen in loadWorksheetResults where they construct formattedResults.traces\[0\].data and columns[\[21\]](https://github.com/visivo-io/visivo/blob/f5ce28af81ebd0159232dacd9deb329622ff2646/viewer/src/contexts/WorksheetContext.jsx#L120-L129)[\[22\]](https://github.com/visivo-io/visivo/blob/f5ce28af81ebd0159232dacd9deb329622ff2646/viewer/src/contexts/WorksheetContext.jsx#L130-L138)), we can feed that into a table component (could be a simple HTML table or a library like React Table already in use).

* Ensure the table view supports pagination for large results (show page controls if rows \> 1000).

* For very large results, consider not rendering all cells to the DOM at once for performance – possibly use virtualization or pagination exclusively.

* **Dimension Pills View**: Introduce an alternate result view mode that represents categorical data distribution:

* In each QueryCell, provide a toggle or dropdown to switch the result display mode (Table vs Dimension view). The last selected mode per cell should persist (store it in cell state and restore on re-renders, fulfilling **FR-014**).

* When in **Dimension Pills** mode, for each column in the result that is identified as a “dimension” (likely non-numeric or low-cardinality categorical data), display its unique values as pill-shaped UI elements. Each pill shows the category value and perhaps the count of occurrences in the result set.

* If there are too many unique values (e.g., more than a threshold like 50), consider grouping or indicating that not all are shown.

* Clicking a pill could bring up additional stats: for instance, highlight all rows in the table with that value or show percentage of total – as an interactive enhancement (this is a nice-to-have per User Story 5, not a core requirement).

* If the result has multiple categorical columns, the dimension view could allow selecting which column to visualize as pills (e.g., a dropdown of columns). Otherwise, possibly show pills for each categorical column stacked vertically.

* Make sure switching back to Table view restores the table state (any sorting or filters applied should be retained if possible – per User Story 5 scenario 3).

* **Persistent View per Cell**: As required, store the chosen view mode in the QueryCell state. When a query is re-run in that cell, automatically render the results in the same mode as last time (FR-014 scenario). Also, preserve the mode when saving and restoring session, so that if a user was last viewing dimension pills, it comes back in that mode on reload.

* **UI Implementation**: Possibly add a small toggle button group in the cell’s result header area (e.g., icons for “Table” and “Pills”). The user can click to switch. The component will conditionally render the appropriate view.

### Execution Status & UX Feedback

* **Loading Indicators**: When a cell’s query is running, give clear feedback:

* Disable the cell’s Run button and change its label to a spinner \+ “Running…” (similar to current global Run button change[\[23\]](https://github.com/visivo-io/visivo/blob/f5ce28af81ebd0159232dacd9deb329622ff2646/viewer/src/components/explorer/QueryPanel.jsx#L100-L108), but per cell).

* Optionally, show a small progress bar or spinner in the results area placeholder.

* The cell’s editor can be made read-only while executing (Monaco editor options.readOnly \= true as done globally[\[24\]](https://github.com/visivo-io/visivo/blob/f5ce28af81ebd0159232dacd9deb329622ff2646/viewer/src/components/explorer/QueryPanel.jsx#L126-L131)).

* **Cancel Execution**: Provide a way to cancel a long-running query (FR-013). This could be a “Cancel” button that appears after 30 seconds of execution:

* The frontend can start a timer when a query begins. If it exceeds 30s, display a “Cancel” option next to the spinner.

* If user clicks cancel, invoke a cancellation: for example, call a backend API to cancel the query. If the backend supports cancel (e.g., if using a database connection that can be interrupted), implement that. If not, as a fallback simply mark the cell as cancelled and ignore the result when it eventually returns.

* Upon cancel, stop the spinner and mark the cell state as idle. Show a message like “Query canceled by user.”

* **Query Timeout Warning**: Even if not canceled, after 30s, show a non-intrusive warning icon or message (“This query is taking longer than 30 seconds…”) to inform the user (per edge case).

* **Multiple Query Execution**: The user may execute multiple cells in parallel (by running one cell, then another without waiting). Ensure our state management allows this:

* Each cell has its own isRunning flag. We can have multiple cells running concurrently if needed. The backend likely can handle multiple queries (especially if sources are different or even same source with separate connections).

* If there are limitations (like a single DB connection), consider queueing or warning the user. But given it’s single-user, they can likely handle sequentially themselves.

* **Keyboard Shortcuts**: Implement all shortcuts from **FR-017**:

* **Cmd/Ctrl \+ Enter**: Execute current cell. We can detect the focused editor (Monaco provides an API or we can track focus). Hook into Monaco’s key binding or use a global keydown handler when editor is focused to run the cell’s query.

* **Shift \+ Enter**: Execute current cell, then move focus to the next cell. If at the last cell, create a new cell and focus it (this allows quickly chaining queries).

* **Alt \+ Enter**: Insert a new blank cell *below* the current one without running anything.

* **Cmd/Ctrl \+ S**: If a cell editor is focused, interpret as “Save as model” for that cell (prevent the browser’s default save dialog if any). This should open the save dialog for the query (see below).

* **Cmd/Ctrl \+ T**: Create a new worksheet (already mapped to new tab in many apps – we’ll use it to satisfy new worksheet creation).

* Test and ensure these shortcuts work on Mac/Windows differences and do not conflict with existing ones (Monaco might have default behaviors to override).

## Backend Integration & Services

### Query Execution Workflow

* **Query API**: Determine which backend API or service is used to execute SQL queries. The PRD mentions writing SQL against sources – likely, there is an endpoint like /api/query/execute or similar. In the code, we saw fetchTraceQuery in Explorer imports[\[25\]](https://github.com/visivo-io/visivo/blob/f5ce28af81ebd0159232dacd9deb329622ff2646/viewer/src/components/explorer/Explorer.jsx#L2-L10). We need to confirm how queries are executed:

* Possibly fetchTraceQuery is used to run queries and get results (maybe for lineage traces?). Alternatively, there might be a generic query runner.

* If none exists, implement a new API route (e.g., /api/query/execute) that takes a source and SQL string, runs it, and returns JSON results or error.

* The execution should be done via the source’s connection (e.g., if sources are configured via SQLModel or a DB connection class). For instance, if using DuckDB or Postgres, the server can use the corresponding Python client to run the query.

* **Front-to-Back Call**: From the UI, when executeCellQuery is invoked, perform a fetch call:

* Endpoint: e.g., POST /api/query/execute/ with JSON: { source: "source\_name", query: "SELECT ...;" }.

* The backend should run the query. If the system already has a notion of “traces” or “temp models” for ad-hoc queries, it might reuse that (or we create a transient SqlModel).

* On success, the backend returns a JSON containing at least columns and rows of the result, and possibly query\_stats (execution time, timestamp, etc.). Indeed, loadWorksheetResults expects results\_json and query\_stats\_json[\[26\]](https://github.com/visivo-io/visivo/blob/f5ce28af81ebd0159232dacd9deb329622ff2646/viewer/src/contexts/WorksheetContext.jsx#L114-L123)[\[27\]](https://github.com/visivo-io/visivo/blob/f5ce28af81ebd0159232dacd9deb329622ff2646/viewer/src/contexts/WorksheetContext.jsx#L151-L160).

* Parse the response in the frontend: store the result data in the cell’s state (we can use a similar structure as formattedResults in context, but simpler – an array of row objects and columns).

* On error, the backend likely returns an error message and a 400/500 status. Catch this to update the cell’s error state with the message.

* **Asynchronous Execution & Streaming**: If queries can run long, consider making the API asynchronous. But to keep it simple:

* Use a normal fetch and allow it to wait for response (with the 30s warning in UI, but not actually timing out the HTTP request).

* If needed for very long queries, we could later upgrade to WebSocket or polling for status. Initially, a direct call is fine.

* **Cancel Query Backend**: If we implement cancel, the backend needs a way to terminate the query. This could be:

* If using a Python DB API, store the connection or cursor for the query and attempt a cancellation on user request.

* Or maintain a query job registry to track running queries and allow killing them.

* If this is too complex, we might document that cancellation may not instantly stop the DB query, but will stop waiting for it on the UI side.

* **Query Result Storage**: Decide whether to store query results on the backend or just deliver to frontend:

* The current WorksheetContext.loadWorksheetResults fetches a worksheet by ID and parses results\_json[\[26\]](https://github.com/visivo-io/visivo/blob/f5ce28af81ebd0159232dacd9deb329622ff2646/viewer/src/contexts/WorksheetContext.jsx#L114-L123), implying that when a worksheet query was run, the result was stored in a database or file.

* For the new approach, since we have multiple cells and frequent queries, we might skip persisting every result server-side. Instead, just return the result to the UI and let the UI hold it in memory.

* We can still choose to save the *latest* result of each worksheet in the session DB so that on reload the last results show (nice to have but not core).

* To implement that, after a successful query, call an API like /api/worksheet/save\_results to store the result JSON for that worksheet/cell. However, given auto-save requirements, it might be worth storing ephemeral data for session restore. This can be deferred if time; the primary need is to show immediate results.

### Saving Models to Project Files

* **“Save as Model” Action**: When a user chooses to save a query cell as a named model:

* Open a **Save Model dialog** prompting for the model name. Prepopulate with a suggestion (maybe the worksheet name or “NewModel”).

* Validate the name: must be unique among models. We have access to existing model names via explorer data. If a duplicate is entered, show an error or a confirmation if we plan to allow overwrite.

* On confirmation, construct a representation of the new model for the backend. Likely, we will use the **ProjectWriter** mechanism:

  * Prepare a JSON structure similar to the named\_children entry for a new model. For example:

  * {  
      "\<ModelName\>": {  
        "status": "New",  
        "type\_key": "models",  
        "new\_file\_path": "\<path to project models file\>",  
        "config": {  
          "name": "\<ModelName\>",  
          "query": "\<SQL query text\>",  
          "connection": "\<source name or ref\>"  // if needed to tie the model to a source  
        }  
      }  
    }

  * (The exact fields depend on how SqlModel is defined. We might include the SQL under a key like sql or query. We should consult the SqlModel class and project file format.)

  * Alternatively, use a simpler API: The backend might expose a route to directly save a model. If not, using /api/project/write\_changes with named\_children is viable. We would call GET /api/project/named\_children to get the latest structure, inject our new model entry, then POST to /api/project/write\_changes with the updated named\_children JSON[\[28\]](https://github.com/visivo-io/visivo/blob/f5ce28af81ebd0159232dacd9deb329622ff2646/visivo/server/views/project_views.py#L42-L50). ProjectWriter will write the changes to the appropriate YAML file.

  * *Note:* There might be a higher-level helper on backend to add a model without manual JSON munging (for example, a /api/model/create route could exist), but none was obvious. Using ProjectWriter aligns with how the app tracks unsaved changes generically.

* After saving:

  * Show a success message to the user (“Model saved successfully”).

  * Update the UI: The new model should appear under “Models” in the explorer tree immediately. This likely requires refreshing namedChildren by calling /api/project/named\_children again, or optimistic update: since we know the name, we can insert it into the tree.

  * The cell can also indicate it’s now saved (maybe disable the save button or change its icon to a “saved” state for that query, until it’s edited again).

* **Model File Structure**: Ensure compatibility with the project’s model files. Likely, the project has a YAML for models. The new model definition needs to be appended. If a models YAML per source or a single project YAML is used, ProjectWriter will handle placing it correctly (the new\_file\_path in named\_children should be set to the intended file path – possibly the main project.visivo.yml or a models.yml).

* **Overwrite Existing Model**: If the user chooses to overwrite a model of the same name:

* Back up the old model definition (or rely on version control outside our scope).

* Instead of status "New", use status "Modified" for that named\_children entry and include the updated SQL in config.

* The ProjectWriter will replace the model’s query in the file. After writing, refresh the UI.

* **Deleting/Renaming Models (Explorer)**: Although not the primary goal of this feature, FR-011 requires the ability to rename or delete saved models in the interface:

* We can implement a context menu on model nodes in the explorer tree: options for Rename and Delete.

* Rename Model: On selection, prompt for a new name, ensure uniqueness, then call a similar approach as saving (status "Modified" with new name in config) via write\_changes.

* Delete Model: Confirm, then mark the model’s named\_children entry with status "Deleted" and call write\_changes. The ProjectWriter will remove it from the YAML (or mark it as deleted).

* After such operations, refresh the explorer tree. Also, handle any UI implications (closing any worksheets that might be editing that model’s query, etc., if applicable).

### Real-Time File Sync & External Changes

* **File Watcher Integration**: The backend appears to have a file watcher (hot reload server) that can emit a reload event via SocketIO when project files change[\[29\]](https://github.com/visivo-io/visivo/blob/f5ce28af81ebd0159232dacd9deb329622ff2646/visivo/server/views/project_views.py#L98-L103). We should leverage this:

* Subscribe to the reload signal on the frontend (if not already). When received, it indicates that the underlying project files changed (e.g., user did a git pull or edited a YAML outside the app).

* On reload event, call fetchExplorer() (or a dedicated endpoint) to get updated project structure (sources, models, etc.). Update the store’s namedChildren/explorerData.

* For any open worksheets, we must reconcile if their content was affected:

  * If an open worksheet’s saved model was edited externally, its current query might be outdated. Since our use case is single-user and they presumably know they pulled changes, we can either alert (“The model X was updated externally, please refresh your query”) or auto-update the cell’s content if we can detect it.

  * Simpler: just refresh the explorer tree and leave any open editors as-is. The user can manually reconcile differences.

* Preserve UI state across the reload. The PRD says preserve worksheet state – the auto-reload should not close tabs or clear queries the user is working on. Only update the background data (models, sources list).

* **Periodic Sync**: In addition to event-driven updates, we might also periodically poll named\_children or similar to catch changes (in case the socket missed something or file watcher isn’t available). This can be a low-frequency check.

* **Prevent Conflicts**: Since only one user edits, conflicts are rare. Just ensure that if the user tries to save a model that was concurrently changed on disk, the ProjectWriter might handle merging or will throw an error. If an error on write occurs, show it to the user and advise them to refresh.

## Performance & Edge Cases

* **Large Result Sets**: Queries returning extremely large results should not crash the app:

* Hard cap the display at 100,000 rows. If a query returns more, the backend can truncate the results (e.g., by adding LIMIT 100000 if the user didn’t specify, or simply slicing the result array before JSON response). Include an indicator in the returned data (like truncated: true).

* In the UI, if truncated: true, display a warning banner in the result area: “Result is too large and has been truncated to 100,000 rows.”

* Implement client-side pagination for results. For example, only store/display 1000 rows at a time. If the user scrolls or clicks “Next page”, load the next set of up to 1000 rows from the already fetched data (if we fetched all 100k) or query the backend for a specific page (if we choose not to fetch all at once to save memory).

* Consider using virtualization for the table if needed (render only visible rows to DOM), to keep UI smooth.

* **Long-running Queries**: As discussed, provide user feedback at 30s and option to cancel. Also, consider a reasonable absolute timeout (maybe 2 minutes) after which we auto-cancel to avoid hanging indefinitely (backend could enforce a timeout on query execution).

* **Lost DB Connection**: If a data source connection is lost mid-query or before execution:

* The backend likely throws an error (e.g., “could not connect” or lost connection). Capture that and show it as an error in the cell.

* We may also want to mark the source as disconnected in the UI (could disable it in the dropdown until reconnected).

* The user should try again or check their database. This is more on the DBA side, but our responsibility is to present the error clearly.

* **Unsupported Source Type**: The “Add Data Source” modal should prevent unsupported types, but if somehow an unsupported config is sent, the backend will error. Just handle the error gracefully.

* **Connection Test After Save**: If a source was added successfully but later queries fail (e.g., credentials changed or network down), handle errors per query as normal. We might not proactively ping sources on every use, but a “Test Connection” button in the source modal could be included to verify details before saving.

* **Multiple Users**: The PRD clarified single-user scope, so we do not implement any multi-user concurrency handling beyond file sync. We assume one user modifies the project at a time.

## Testing & Validation

After implementation, thoroughly test each user story scenario and requirement:

1. **Interactive SQL Query Development** (User Story 1):

2. Create a worksheet, connect to a known data source, input a simple SQL query, and execute. Verify results appear in a table with correct data (SC-001: results under 2s for moderate data).

3. Modify the query and re-run; verify results update.

4. Introduce a SQL error (e.g., typo in syntax); run and confirm an error banner shows with the error message and helpful info.

5. Add multiple cells with different queries (including one that depends on the same source). Run them independently (even simultaneously) and confirm each cell shows the correct result or error without affecting the others.

6. Test keyboard shortcuts: Cmd+Enter runs a query, Shift+Enter runs and advances to next cell (creating a cell if at bottom), Alt+Enter inserts a new blank cell.

7. **Save Query Results as Models** (User Story 2):

8. After executing a query in a cell, click “Save as Model”, provide a name, and save. Verify:

   * The model appears under Models in the explorer tree immediately.

   * The model file (YAML) on disk now contains the new model with the correct SQL (SC-009: changes written within \~1s).

   * Refresh the page or restart the app; the model persists (SC-007).

9. Try saving another cell with the same name to trigger the duplicate name warning. Ensure the warning appears and that choosing a new name or confirming overwrite works as expected.

10. Verify that saving one cell doesn’t inadvertently save other cells or the entire worksheet – only the intended query is saved.

11. Ensure a saved model can be used elsewhere (if the app allows referencing models in queries, though not explicitly part of this feature).

12. **Add New Data Sources** (User Story 3):

13. Click the Add Data Source button, fill in a valid new source (e.g., a test database connection), and save. Confirm it connects quickly (SC-010: first try success in 95% cases) and appears in the Sources list.

14. Create a worksheet and run a query on the new source to verify it works.

15. Test invalid credentials: the modal should show an error message from the backend (e.g., “authentication failed”), and the source should not be added.

16. Test adding a duplicate source name: the UI should prevent it or the backend error should be shown, and the user can correct the name.

17. **Multi-Worksheet Management** (User Story 4):

18. Open multiple worksheets (e.g., 3-5), each with some queries and perhaps different selected sources. Populate them with queries and results.

19. Switch between tabs and ensure each retains its state: the queries remain in the editors, results remain visible, and the selected source is as set (SC-004: ensure UI switching is \<200ms).

20. Try closing a worksheet tab: if it has unsaved content, expect a confirmation. After closing, ensure it’s removed from the tab bar and a different tab becomes active.

21. Reload the app: verify that all previously open worksheets (and their cells, queries, view modes) are restored automatically (SC-007).

22. Rename a worksheet via the tab UI; ensure the name updates and persists on reload.

23. **Visual Result Exploration** (User Story 5):

24. Run a query that returns a categorical column (e.g., a small lookup table). Switch the result view to “Dimension Pills”. Verify that pills show unique values and counts, and that clicking them might highlight or detail those values.

25. Switch back to table view and confirm the table shows again with state preserved (e.g., if you sorted page 1, it remains sorted).

26. Run the query again while in pills view; confirm it stays in pills view after refresh (FR-014).

27. Try another cell with numeric data and switch to pills – if a column is purely numeric with high cardinality, the pills view might not be meaningful; ensure the UI handles it (maybe still list them or disable pills view for unsuitable data).

28. **Edge Cases**:

29. Execute a query that returns \>100k rows. Time it and ensure the system doesn’t freeze. Confirm only 100k rows are kept, the rest dropped, and a truncation warning is shown.

30. Execute a query that takes long (simulate by a WAITFOR or heavy aggregation). At \~30s, verify a warning/cancel appears. Test the Cancel button actually stops the process (or at least stops the UI waiting) and shows “canceled” message.

31. Simulate an external change: e.g., manually edit a model file or pull changes while the app is open. Verify the app detects the change (either via an automatic reload prompt or instantaneous update if using file watcher events). Check that open worksheets remain intact.

32. Test the environment variable handling: Add a source with credentials, then inspect the project’s .env file to ensure credentials are stored there and not in plain config. Run a query to ensure the app can read the env values (this tests FR-024).

33. Verify that removing or renaming models via the UI actually updates the underlying files and UI (if implemented).

34. Ensure no data loss: Try a crash scenario – open worksheets, fill queries, then kill the app process or refresh without manually saving. On relaunch, all content should be there (auto-save works).

## Conclusion

By executing the steps above, we will implement the Enhanced Notebook-Style Explorer with full functionality as specified in the PRD. This includes a robust multi-cell querying interface, persistent worksheets, easy source management, one-click model saves, and improved result visualization. The development will touch most parts of the system: front-end UI components, state management (migrating to a unified store), and back-end APIs for query execution and configuration changes. The end result will significantly improve the user experience for data analysts by providing an interactive, notebook-like SQL environment within the application, fulfilling all functional requirements and success criteria outlined.

---

[\[1\]](https://github.com/visivo-io/visivo/blob/f5ce28af81ebd0159232dacd9deb329622ff2646/viewer/src/components/explorer/QueryPanel.jsx#L116-L124) [\[3\]](https://github.com/visivo-io/visivo/blob/f5ce28af81ebd0159232dacd9deb329622ff2646/viewer/src/components/explorer/QueryPanel.jsx#L48-L56) [\[10\]](https://github.com/visivo-io/visivo/blob/f5ce28af81ebd0159232dacd9deb329622ff2646/viewer/src/components/explorer/QueryPanel.jsx#L88-L95) [\[16\]](https://github.com/visivo-io/visivo/blob/f5ce28af81ebd0159232dacd9deb329622ff2646/viewer/src/components/explorer/QueryPanel.jsx#L122-L131) [\[17\]](https://github.com/visivo-io/visivo/blob/f5ce28af81ebd0159232dacd9deb329622ff2646/viewer/src/components/explorer/QueryPanel.jsx#L96-L104) [\[19\]](https://github.com/visivo-io/visivo/blob/f5ce28af81ebd0159232dacd9deb329622ff2646/viewer/src/components/explorer/QueryPanel.jsx#L56-L65) [\[20\]](https://github.com/visivo-io/visivo/blob/f5ce28af81ebd0159232dacd9deb329622ff2646/viewer/src/components/explorer/QueryPanel.jsx#L58-L66) [\[23\]](https://github.com/visivo-io/visivo/blob/f5ce28af81ebd0159232dacd9deb329622ff2646/viewer/src/components/explorer/QueryPanel.jsx#L100-L108) [\[24\]](https://github.com/visivo-io/visivo/blob/f5ce28af81ebd0159232dacd9deb329622ff2646/viewer/src/components/explorer/QueryPanel.jsx#L126-L131) QueryPanel.jsx

[https://github.com/visivo-io/visivo/blob/f5ce28af81ebd0159232dacd9deb329622ff2646/viewer/src/components/explorer/QueryPanel.jsx](https://github.com/visivo-io/visivo/blob/f5ce28af81ebd0159232dacd9deb329622ff2646/viewer/src/components/explorer/QueryPanel.jsx)

[\[2\]](https://github.com/visivo-io/visivo/blob/f5ce28af81ebd0159232dacd9deb329622ff2646/viewer/src/contexts/WorksheetContext.jsx#L70-L78) [\[5\]](https://github.com/visivo-io/visivo/blob/f5ce28af81ebd0159232dacd9deb329622ff2646/viewer/src/contexts/WorksheetContext.jsx#L31-L40) [\[6\]](https://github.com/visivo-io/visivo/blob/f5ce28af81ebd0159232dacd9deb329622ff2646/viewer/src/contexts/WorksheetContext.jsx#L56-L64) [\[21\]](https://github.com/visivo-io/visivo/blob/f5ce28af81ebd0159232dacd9deb329622ff2646/viewer/src/contexts/WorksheetContext.jsx#L120-L129) [\[22\]](https://github.com/visivo-io/visivo/blob/f5ce28af81ebd0159232dacd9deb329622ff2646/viewer/src/contexts/WorksheetContext.jsx#L130-L138) [\[26\]](https://github.com/visivo-io/visivo/blob/f5ce28af81ebd0159232dacd9deb329622ff2646/viewer/src/contexts/WorksheetContext.jsx#L114-L123) [\[27\]](https://github.com/visivo-io/visivo/blob/f5ce28af81ebd0159232dacd9deb329622ff2646/viewer/src/contexts/WorksheetContext.jsx#L151-L160) WorksheetContext.jsx

[https://github.com/visivo-io/visivo/blob/f5ce28af81ebd0159232dacd9deb329622ff2646/viewer/src/contexts/WorksheetContext.jsx](https://github.com/visivo-io/visivo/blob/f5ce28af81ebd0159232dacd9deb329622ff2646/viewer/src/contexts/WorksheetContext.jsx)

[\[4\]](https://github.com/visivo-io/visivo/blob/f5ce28af81ebd0159232dacd9deb329622ff2646/viewer/src/components/worksheets/WorksheetTabManager.jsx#L31-L40) WorksheetTabManager.jsx

[https://github.com/visivo-io/visivo/blob/f5ce28af81ebd0159232dacd9deb329622ff2646/viewer/src/components/worksheets/WorksheetTabManager.jsx](https://github.com/visivo-io/visivo/blob/f5ce28af81ebd0159232dacd9deb329622ff2646/viewer/src/components/worksheets/WorksheetTabManager.jsx)

[\[7\]](https://github.com/visivo-io/visivo/blob/f5ce28af81ebd0159232dacd9deb329622ff2646/viewer/src/components/explorer/Explorer.jsx#L137-L145) [\[8\]](https://github.com/visivo-io/visivo/blob/f5ce28af81ebd0159232dacd9deb329622ff2646/viewer/src/components/explorer/Explorer.jsx#L179-L188) [\[9\]](https://github.com/visivo-io/visivo/blob/f5ce28af81ebd0159232dacd9deb329622ff2646/viewer/src/components/explorer/Explorer.jsx#L182-L190) [\[11\]](https://github.com/visivo-io/visivo/blob/f5ce28af81ebd0159232dacd9deb329622ff2646/viewer/src/components/explorer/Explorer.jsx#L152-L160) [\[18\]](https://github.com/visivo-io/visivo/blob/f5ce28af81ebd0159232dacd9deb329622ff2646/viewer/src/components/explorer/Explorer.jsx#L372-L375) [\[25\]](https://github.com/visivo-io/visivo/blob/f5ce28af81ebd0159232dacd9deb329622ff2646/viewer/src/components/explorer/Explorer.jsx#L2-L10) Explorer.jsx

[https://github.com/visivo-io/visivo/blob/f5ce28af81ebd0159232dacd9deb329622ff2646/viewer/src/components/explorer/Explorer.jsx](https://github.com/visivo-io/visivo/blob/f5ce28af81ebd0159232dacd9deb329622ff2646/viewer/src/components/explorer/Explorer.jsx)

[\[12\]](https://github.com/visivo-io/visivo/blob/f5ce28af81ebd0159232dacd9deb329622ff2646/viewer/src/components/onboarding/Onboarding.jsx#L2-L5) [\[13\]](https://github.com/visivo-io/visivo/blob/f5ce28af81ebd0159232dacd9deb329622ff2646/viewer/src/components/onboarding/Onboarding.jsx#L76-L84) [\[14\]](https://github.com/visivo-io/visivo/blob/f5ce28af81ebd0159232dacd9deb329622ff2646/viewer/src/components/onboarding/Onboarding.jsx#L98-L105) Onboarding.jsx

[https://github.com/visivo-io/visivo/blob/f5ce28af81ebd0159232dacd9deb329622ff2646/viewer/src/components/onboarding/Onboarding.jsx](https://github.com/visivo-io/visivo/blob/f5ce28af81ebd0159232dacd9deb329622ff2646/viewer/src/components/onboarding/Onboarding.jsx)

[\[15\]](https://github.com/visivo-io/visivo/blob/f5ce28af81ebd0159232dacd9deb329622ff2646/visivo/server/views/project_views.py#L14-L17) [\[28\]](https://github.com/visivo-io/visivo/blob/f5ce28af81ebd0159232dacd9deb329622ff2646/visivo/server/views/project_views.py#L42-L50) [\[29\]](https://github.com/visivo-io/visivo/blob/f5ce28af81ebd0159232dacd9deb329622ff2646/visivo/server/views/project_views.py#L98-L103) project\_views.py

[https://github.com/visivo-io/visivo/blob/f5ce28af81ebd0159232dacd9deb329622ff2646/visivo/server/views/project\_views.py](https://github.com/visivo-io/visivo/blob/f5ce28af81ebd0159232dacd9deb329622ff2646/visivo/server/views/project_views.py)