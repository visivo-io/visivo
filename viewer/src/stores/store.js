import { create } from 'zustand';
import { devtools } from 'zustand/middleware'
import { fetchNamedChildren, writeNamedChildren } from '../api/namedChildren';
import { updateNestedValue } from './utils';

// Add this function to get unique file paths from existing named children
const getUniqueFilePaths = (state) => {
  const paths = new Set();
  Object.values(state.namedChildren).forEach(child => {
    if (child.file_path) {
      paths.add(child.file_path);
    }
  });
  return Array.from(paths);
};

const useStore = create(devtools((set, get) => ({
  projectData: {}, // Holds the fetched project data
  setProjectData: (data) => set({ projectData: data }),
  
  // New namedChildren state
  namedChildren: {},
  isLoading: false,
  error: null,
  writeError: null,
  
  // New tab-related state
  tabs: [],
  activeTabId: null,
  
  // Write modified files
  writeModifiedFiles: async () => {
    const state = get();
    const modifiedItems = Object.entries(state.namedChildren)
      .filter(([_, value]) => value.status !== "Unchanged");
      
    if (modifiedItems.length === 0) return;
    
    try {
      // Make API call to write files
      const response = await writeNamedChildren(state.namedChildren);
      console.log('writeNamedChildren response', response);
      console.log('writeNamedChildren response', response.status);
      
      if (response.status !== 200) {
        throw new Error('Failed to write files');
      }
      
      // Update status of written items to Unchanged
      const updatedNamedChildren = { ...state.namedChildren };
      modifiedItems.forEach(([key]) => {
        updatedNamedChildren[key] = {
          ...updatedNamedChildren[key],
          status: "Unchanged"
        };
      });
      
      set({ 
        namedChildren: updatedNamedChildren,
        isLoading: false 
      });
      
    } catch (e) {
      console.error('Error writing files:', e);
      set({ writeError: e.message || 'Failed to write files', isLoading: false });
    }
  },
  
  // Fetch actions for namedChildren
  fetchNamedChildren: async () => {
    console.log('fetchNamedChildren called');
    set({ isLoading: true, error: null });
    try {
      const data = await fetchNamedChildren();
      //set named children updated to false for all children so we can quickly figure out which need to write back.
      if (data) {
        for (const key in data) {
            if (data.hasOwnProperty(key)) {
                data[key].status = "Unchanged";
            }
        }
        set({ namedChildren: data, isLoading: false });
      } else {
        set({ error: 'Failed to fetch data', isLoading: false });
      }
    } catch (e) {
      console.error('Error fetching named children', e);
      set({ error: e.message || 'An error occurred', isLoading: false });
    }
  },
  
    
  // New update attribute for namedChildren
  updateNamedChildAttribute: (path, newValue) => 
    set((state) => {
      console.log('updateNamedChildAttribute called', path, newValue);
      const childName = path.shift();
      if (!state.namedChildren.hasOwnProperty(childName)) {
        console.log(`childName:${childName} not found in namedChildren store`, state.namedChildren);
        return { error: 'Child not found in namedChildren store', isLoading: false };
      }
      
      const childToUpdate = state.namedChildren[childName];
      const configToUpdate = typeof childToUpdate.config === 'string' 
        ? JSON.parse(childToUpdate.config)
        : childToUpdate.config;

      updateNestedValue(configToUpdate, path, newValue);
      console.log('post update configToUpdate', configToUpdate);
      
      return { 
        namedChildren: {
          ...state.namedChildren,  // Create new object reference
          [childName]: {
            ...childToUpdate,
            config: configToUpdate,
            // Only set status to 'Modified' if it's not already 'New'
            status: childToUpdate.status === 'New' ? 'New' : 'Modified'
          }
        }
      };
    }),

  // New tab management actions
  openTab: (name, type) => set((state) => {
    // Check if tab already exists
    const existingTab = state.tabs.find(tab => tab.name === name);
    if (existingTab) {
      return { activeTabId: existingTab.id };
    }

    // Create new tab (only storing reference info, not config copy)
    const newTab = {
      id: `${type}-${name}-${Date.now()}`,
      name: name,
      type: type
    };

    return {
      tabs: [...state.tabs, newTab],
      activeTabId: newTab.id
    };
  }),

  closeTab: (tabId) => set((state) => {
    const newTabs = state.tabs.filter(tab => tab.id !== tabId);
    let newActiveTabId = state.activeTabId;

    // If we're closing the active tab, activate the last remaining tab
    if (state.activeTabId === tabId) {
      newActiveTabId = newTabs.length > 0 ? newTabs[newTabs.length - 1].id : null;
    }

    return {
      tabs: newTabs,
      activeTabId: newActiveTabId
    };
  }),

  setActiveTab: (tabId) => set({ activeTabId: tabId }),

  // Selectors (can be used with useStore directly)
  getActiveTab: () => {
    const state = get();
    const activeTab = state.tabs.find(tab => tab.id === state.activeTabId);
    console.log('getActiveTab called', activeTab);
    if (!activeTab) return null;
    
    // Get current config from namedChildren
    const namedChild = state.namedChildren[activeTab.name];
    if (!namedChild) return null;
    
    // Return stable reference if nothing changed
    return {
      ...activeTab,
      config: namedChild.config
    };
  },

  // Add getter for file paths
  getUniqueFilePaths: () => getUniqueFilePaths(get()),
})));

export default useStore;