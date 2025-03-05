import { create } from 'zustand';
import { devtools } from 'zustand/middleware'
import { fetchNamedChildren } from '../api/namedChildren';
import { updateNestedValue } from './utils';
const useStore = create(devtools((set, get) => ({
  projectData: {}, // Holds the fetched project data
  setProjectData: (data) => set({ projectData: data }),
  
  // New namedChildren state
  namedChildren: {},
  isLoading: false,
  error: null,
  
  // New tab-related state
  tabs: [],
  activeTabId: null,
  
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
                data[key].updated = false;
                data[key].config = JSON.parse(data[key].config);
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
      // Parse the config if it's a string
      const configToUpdate = typeof childToUpdate.config === 'string' 
        ? JSON.parse(childToUpdate.config)
        : childToUpdate.config;

      updateNestedValue(configToUpdate, path, newValue);
      console.log('post update configToUpdate', configToUpdate);
      
      
      let newNamedChildren = state.namedChildren;
      newNamedChildren[childName] = {
        ...childToUpdate,
        config: configToUpdate,  // Store as object, not string
        updated: true
      };
      console.log('newNamedChildren', newNamedChildren);
      return { namedChildren: newNamedChildren };
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
  }
})));

export default useStore;