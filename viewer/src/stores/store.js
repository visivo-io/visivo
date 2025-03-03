import { create } from 'zustand';
import { devtools } from 'zustand/middleware'
import { fetchNamedChildren } from '../api/namedChildren';

const useStore = create(devtools((set, get) => ({
  projectData: {}, // Holds the fetched project data
  setProjectData: (data) => set({ projectData: data }),
  
  // New namedChildren state
  namedChildren: [],
  isLoading: false,
  error: null,
  
  // Fetch actions for namedChildren
  fetchNamedChildren: async () => {
    set({ isLoading: true, error: null });
    try {
      const data = await fetchNamedChildren();
      if (data) {
        const objectsArray = Object.entries(data).map(([name, details]) => ({
            name,
            type: details.type,
            updated: false, //will use this to set the object as updated when the user makes changes
            config: JSON.parse(details.config)
          }));
          const cleanedNamedChildren = objectsArray.sort((a, b) => a.name.localeCompare(b.name));
        set({ namedChildren: cleanedNamedChildren, isLoading: false });
      } else {
        set({ error: 'Failed to fetch data', isLoading: false });
      }
    } catch (error) {
      set({ error: error.message || 'An error occurred', isLoading: false });
    }
  },
  
 
  
  // Original update attribute function - keeping for backward compatibility
  updateAttribute: (path, newValue) =>
    set((state) => {
      const newData = { ...state.projectData };
      let current = newData;
      for (let i = 0; i < path.length - 1; i++) {
        current = current[path[i]];
      }
      current[path[path.length - 1]] = newValue;
      return { projectData: newData };
    }),
    
  // New update attribute for namedChildren
  updateNamedChildAttribute: (path, newValue) => 
    set((state) => {
      // Create a deep clone of the namedChildren array
      const newNamedChildren = JSON.parse(JSON.stringify(state.namedChildren));
      
      // Find the object to update
      let current = newNamedChildren;
      for (let i = 0; i < path.length - 1; i++) {
        current = current[path[i]];
      }
      
      // Update the specific attribute
      current[path[path.length - 1]] = newValue;
      
      return { namedChildren: newNamedChildren };
    }),
})));

export default useStore;