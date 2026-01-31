import { useCallback } from 'react';
import useStore from '../stores/store';
import { isEmbeddedObject } from '../components/new-views/common/embeddedObjectUtils';

/**
 * Custom hook for unified object saving logic
 * Handles both standalone and embedded objects across different views
 *
 * @param {Object} currentEdit - Current edit stack entry
 * @param {Function} setEditStack - Function to update edit stack
 * @param {Function} onSuccessfulSave - Callback function to execute after successful save (e.g., close panel, refresh data)
 * @returns {Function} handleObjectSave - Unified save handler function
 */
export const useObjectSave = (currentEdit, setEditStack, onSuccessfulSave) => {
  // Get all save functions from store
  const saveSource = useStore(state => state.saveSource);
  const saveModel = useStore(state => state.saveModel);
  const saveDimension = useStore(state => state.saveDimension);
  const saveMetric = useStore(state => state.saveMetric);
  const saveRelation = useStore(state => state.saveRelation);
  const saveInsight = useStore(state => state.saveInsight);
  const saveMarkdown = useStore(state => state.saveMarkdown);
  const saveChart = useStore(state => state.saveChart);
  const saveTable = useStore(state => state.saveTable);
  const saveDashboard = useStore(state => state.saveDashboard);
  const saveCsvScriptModel = useStore(state => state.saveCsvScriptModel);
  const saveLocalMergeModel = useStore(state => state.saveLocalMergeModel);

  // Unified save handler - handles both standalone and embedded objects
  const handleObjectSave = useCallback(async (type, name, config) => {
    const stackEntry = currentEdit;
    const currentObject = stackEntry?.object;
    const isEmbedded = isEmbeddedObject(currentObject);

    // For embedded objects with applyToParent, update the parent's config in the stack
    // No backend save - that happens when the parent form saves
    if (isEmbedded && stackEntry?.applyToParent) {
      setEditStack(prev => {
        const newStack = [...prev];
        const parentIndex = newStack.length - 2;
        if (parentIndex >= 0) {
          const parentEntry = newStack[parentIndex];
          const updatedParentConfig = stackEntry.applyToParent(parentEntry.object.config, config);
          newStack[parentIndex] = {
            ...parentEntry,
            object: {
              ...parentEntry.object,
              config: updatedParentConfig,
            },
          };
        }
        // Pop the current entry
        return newStack.slice(0, -1);
      });
      return { success: true };
    }

    // Standalone save - save directly to backend
    let result;
    switch (type) {
      case 'source':
        result = await saveSource(name, config);
        break;
      case 'model':
        result = await saveModel(name, config);
        break;
      case 'dimension':
        result = await saveDimension(name, config);
        break;
      case 'metric':
        result = await saveMetric(name, config);
        break;
      case 'relation':
        result = await saveRelation(name, config);
        break;
      case 'insight':
        result = await saveInsight(name, config);
        break;
      case 'markdown':
        result = await saveMarkdown(name, config);
        break;
      case 'chart':
        result = await saveChart(name, config);
        break;
      case 'table':
        result = await saveTable(name, config);
        break;
      case 'dashboard':
        result = await saveDashboard(name, config);
        break;
      case 'csvScriptModel':
        result = await saveCsvScriptModel(name, config);
        break;
      case 'localMergeModel':
        result = await saveLocalMergeModel(name, config);
        break;
      default:
        result = { success: false, error: `Unknown object type: ${type}` };
    }

    // On successful standalone save, execute callback (close panel, refresh data, etc.)
    if (result?.success && onSuccessfulSave) {
      await onSuccessfulSave();
    }

    return result;
  }, [
    currentEdit,
    setEditStack,
    onSuccessfulSave,
    saveSource,
    saveModel,
    saveDimension,
    saveMetric,
    saveRelation,
    saveInsight,
    saveMarkdown,
    saveChart,
    saveTable,
    saveDashboard,
    saveCsvScriptModel,
    saveLocalMergeModel,
  ]);

  return handleObjectSave;
};

export default useObjectSave;