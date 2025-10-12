Data & Persistence Questions

  1. Model Association Storage: Should we add a new field like associated_model or model_name to the
  worksheet_cell table/model to persist which model a cell is associated with?
  ANSWER: Let's store a new field in the worksheet cell to associate it with a given model. We should have some check in place when the record is accessed to make sure that the model still exists in the namedchild store since it could have been deleted in the project outside of this view between sessions.  

  2. Model Data Structure: Looking at how selected_source works with namedChildren, I assume models are
  also in namedChildren? What's the structure of a model object there (particularly, what fields does
  config contain)?
  ANSWER: You can check that out in the schema in the @visivo/models/project.py named_child_nodes() method. That's ultimately where the server gets the data from at the end of the call chain. 

  Opening Models from Explorer

  3. Opening Models from ExplorerTree: When a user clicks on a model in the ExplorerTree, should it:
    - Create a new cell at the bottom of the current worksheet and populate it?
    - Replace the currently selected/focused cell?
    - Something else?
    ANSWER: Something else. It should open a new cell at the bottom of the worksheet IF there's not an existing cell in the worksheet that already has the model open. IF there's already a cell with that model associated to it, it should navigate the user to that cell and place the cursor in the monoco editor of that associated cell. 

  Model Association UI/UX

  4. Model Pill Component: For the model selector/creator pill:
    - Should it be a combobox where you can type to filter existing models OR type a completely new name?
      ANSWER: It should enable you to type a completely new name OR show the model association if one exists. 
    - When typing a new model name, should pressing Enter:
        - Immediately create the model in the backend with the current query_text?
      - Just associate the name locally and create the model on the next save/execute?
    ANSWER: It should add it to the namedchild store with a status that's ready to write back tot he files when the user clicks that button. So basically same behavior that it has now. 
  5. Model Pill Placement: Should the model pill be:
    - Next to the source dropdown in the cell toolbar?
    - Somewhere else?
    ANSWER: Good question. Let's replace the "Cell 1", "Cell 2"... "Cell n" with the model pill. Also let's move the source drop down to the next to the run tab. 

  Editing/Syncing Behavior

  6. Updating Models: When a cell is associated with a model and the user changes the query_text:
    - Should it auto-save to update the model's SQL?
      ANSWER: Yes it should auto save to the namedChild store, ready for the user to write back when they are ready. 
    - Should there be a "Save to Model" button/action to explicitly update?
      ANSWER: No, let's autosave but should indicate that we have modified the model somewhere in the cell view. 
    - Should we show a visual indicator that the cell's SQL differs from the model's SQL?
      ANSWER: yes. 
  7. Model-to-Cell Sync: When opening a model:
    - Should we also load the model's associated source into the cell's selected_source?
      ANSWER: Yes. 
    - What if the cell already has a different source selected?
      Answer: This should not happen because were either creating a new model or opening an existing model in a new cell. 

  Filtering & Display

  8. Model Filtering: Should the model selector:
    - Show all models in the project?
      ANSWER: Yes, show all SQLmodels just like we do now.
    - Filter by source type compatibility?
      ANSWER: No need to do this. 
    - Show models from all sources or just models that match the cell's current source?
      ANSWER: All sources. Model selection is done in the cell so it's possible to have multiple sources open in a worksheet. 

  Let me know your preferences on these points and I'll create a comprehensive implementation plan!