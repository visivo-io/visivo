import { create } from "zustand";
import { devtools } from "zustand/middleware";
import { fetchNamedChildren, writeNamedChildren } from "../api/namedChildren";
import { fetchProjectFilePath } from "../api/projectFilePath";
import { updateNestedValue, getRelativePath } from "./utils";
import { fetchSchema } from "../api/schema";

const useStore = create(
  devtools((set, get) => ({
    projectData: {}, // Holds the fetched project data
    setProjectData: (data) => set({ projectData: data }),

    schema: null,
    fetchSchema: async () => {
      try {
        const data = await fetchSchema();
        set({ schema: data });
      } catch (e) {
        console.error("Error fetching schema:", e);
      }
    },

    // New namedChildren state
    namedChildren: {},
    isLoading: false,
    error: null,
    writeError: null,
    projectFilePath: null,
    projectFileObjects: [],

    // New tab-related state
    tabs: [],
    activeTabId: null,

    // Write modified files
    writeModifiedFiles: async () => {
      const state = get();
      const modifiedItems = Object.entries(state.namedChildren).filter(
        ([_, value]) => value.status !== "Unchanged"
      );

      if (modifiedItems.length === 0) return;

      try {
        // Make API call to write files
        const response = await writeNamedChildren(state.namedChildren);
        if (response.status !== 200) {
          throw new Error("Failed to write files");
        }

        // Update status of written items to Unchanged
        const updatedNamedChildren = { ...state.namedChildren };
        modifiedItems.forEach(([key]) => {
          updatedNamedChildren[key] = {
            ...updatedNamedChildren[key],
            status: "Unchanged",
          };
        });

        set({
          namedChildren: updatedNamedChildren,
          isLoading: false,
        });
      } catch (e) {
        console.error("Error writing files:", e);
        set({
          writeError: e.message || "Failed to write files",
          isLoading: false,
        });
      }
    },

    createProjectFileObjects: async () => {
      const state = get();
      const projectFilePath = state.projectFilePath;
      const namedChildren = state.namedChildren;
      // Create a Map to store unique file paths with their objects
      const uniqueFilePaths = new Map();

      // Helper function to create path object and calculate relative path
      const createPathObject = (fullPath) => {
        const relativePath = getRelativePath(projectFilePath, fullPath);
        return {
          status: "existing",
          full_path: fullPath,
          relative_path: relativePath,
        };
      };

      // Add the project file path if it exists
      if (projectFilePath) {
        uniqueFilePaths.set(projectFilePath, createPathObject(projectFilePath));
      }

      // Loop through namedChildren to collect file paths
      for (const key in namedChildren) {
        if (namedChildren.hasOwnProperty(key)) {
          const child = namedChildren[key];

          // Add file_path if it exists
          if (child.file_path) {
            uniqueFilePaths.set(
              child.file_path,
              createPathObject(child.file_path)
            );
          }

          // Add new_file_path if it exists
          if (child.new_file_path) {
            uniqueFilePaths.set(
              child.new_file_path,
              createPathObject(child.new_file_path)
            );
          }
        }
      }

      // Convert Map values to array for easier handling
      const projectFileObjects = Array.from(uniqueFilePaths.values());
      set({ projectFileObjects: projectFileObjects });
    },

    fetchProjectFilePath: async () => {
      const data = await fetchProjectFilePath();
      set({ projectFilePath: data });
    },

    fetchNamedChildren: async () => {
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
          set({ error: "Failed to fetch data", isLoading: false });
        }
      } catch (e) {
        console.error("Error fetching named children", e);
        set({ error: e.message || "An error occurred", isLoading: false });
      }
    },

    // New update attribute for namedChildren
    updateNamedChildAttribute: (path, newValue) =>
      set((state) => {
        const childName = path.shift();
        if (!state.namedChildren.hasOwnProperty(childName)) {
          return {
            error: "Child not found in namedChildren store",
            isLoading: false,
          };
        }

        const childToUpdate = state.namedChildren[childName];
        const configToUpdate =
          typeof childToUpdate.config === "string"
            ? JSON.parse(childToUpdate.config)
            : childToUpdate.config;

        updateNestedValue(configToUpdate, path, newValue);

        return {
          namedChildren: {
            ...state.namedChildren, // Create new object reference
            [childName]: {
              ...childToUpdate,
              config: configToUpdate,
              // Only set status to 'Modified' if it's not already 'New'
              status: childToUpdate.status === "New" ? "New" : "Modified",
            },
          },
        };
      }),

    // New tab management actions
    openTab: (name, type) =>
      set((state) => {
        // Check if tab already exists
        const existingTab = state.tabs.find((tab) => tab.name === name);
        if (existingTab) {
          return { activeTabId: existingTab.id };
        }

        // Create new tab (only storing reference info, not config copy)
        const newTab = {
          id: `${type}-${name}-${Date.now()}`,
          name: name,
          type: type,
        };

        return {
          tabs: [...state.tabs, newTab],
          activeTabId: newTab.id,
        };
      }),

    closeTab: (tabId) =>
      set((state) => {
        const newTabs = state.tabs.filter((tab) => tab.id !== tabId);
        let newActiveTabId = state.activeTabId;

        // If we're closing the active tab, activate the last remaining tab
        if (state.activeTabId === tabId) {
          newActiveTabId =
            newTabs.length > 0 ? newTabs[newTabs.length - 1].id : null;
        }

        return {
          tabs: newTabs,
          activeTabId: newActiveTabId,
        };
      }),

    setActiveTab: (tabId) => set({ activeTabId: tabId }),

    // Selectors (can be used with useStore directly)
    getActiveTab: () => {
      const state = get();
      const activeTab = state.tabs.find((tab) => tab.id === state.activeTabId);
      if (!activeTab) return null;

      // Get current config from namedChildren
      const namedChild = state.namedChildren[activeTab.name];
      if (!namedChild) return null;

      // Return stable reference if nothing changed
      return {
        ...activeTab,
        config: namedChild.config,
      };
    },

    // Add new item to a list
    addListItem: (path, newItem) =>
      set((state) => {
        const childName = path[0];
        if (!state.namedChildren.hasOwnProperty(childName)) {
          return { error: "Child not found in namedChildren store" };
        }

        const childToUpdate = state.namedChildren[childName];
        const configToUpdate =
          typeof childToUpdate.config === "string"
            ? JSON.parse(childToUpdate.config)
            : childToUpdate.config;

        // Remove the child name from path to get the path to the list
        const listPath = path.slice(1);

        // Get the target list using the path
        let targetList = configToUpdate;
        for (let i = 0; i < listPath.length; i++) {
          targetList = targetList[listPath[i]];
        }

        // Ensure targetList is an array
        if (!Array.isArray(targetList)) {
          return { error: "Target path does not point to a list" };
        }

        // Add new item to the list
        targetList.push(newItem);

        return {
          namedChildren: {
            ...state.namedChildren,
            [childName]: {
              ...childToUpdate,
              config: configToUpdate,
              status: childToUpdate.status === "New" ? "New" : "Modified",
            },
          },
        };
      }),

    // Add new property to an object
    addObjectProperty: (path, propertyName, propertyValue) =>
      set((state) => {
        const childName = path[0];
        if (!state.namedChildren.hasOwnProperty(childName)) {
          return { error: "Child not found in namedChildren store" };
        }

        const childToUpdate = state.namedChildren[childName];
        const configToUpdate =
          typeof childToUpdate.config === "string"
            ? JSON.parse(childToUpdate.config)
            : childToUpdate.config;

        // Remove the child name from path to get the path to the object
        const objectPath = path.slice(1);

        // Get the target object using the path
        let targetObject = configToUpdate;
        for (let i = 0; i < objectPath.length; i++) {
          targetObject = targetObject[objectPath[i]];
        }

        // Ensure targetObject is an object
        if (
          typeof targetObject !== "object" ||
          targetObject === null ||
          Array.isArray(targetObject)
        ) {
          return { error: "Target path does not point to an object" };
        }

        // Add new property to the object
        targetObject[propertyName] = propertyValue;

        return {
          namedChildren: {
            ...state.namedChildren,
            [childName]: {
              ...childToUpdate,
              config: configToUpdate,
              status: childToUpdate.status === "New" ? "New" : "Modified",
            },
          },
        };
      }),

    deleteNamedChildAttribute: (path) =>
      set((state) => {
        const childName = path[0];
        if (!state.namedChildren.hasOwnProperty(childName)) {
          console.warn("Child not found in namedChildren store");
          return state;
        }

        const childToUpdate = { ...state.namedChildren[childName] }; // Create a copy
        let configToUpdate =
          typeof childToUpdate.config === "string"
            ? JSON.parse(childToUpdate.config)
            : { ...childToUpdate.config }; // Create a copy

        // Remove the child name from path
        const attributePath = path.slice(1);

        // Handle root level deletion
        if (attributePath.length === 1) {
          delete configToUpdate[attributePath[0]];
        } else {
          // Get the parent object and key to delete
          let parent = configToUpdate;
          for (let i = 0; i < attributePath.length - 1; i++) {
            parent = parent[attributePath[i]];
            if (!parent) {
              console.warn("Invalid path");
              return state;
            }
          }

          const keyToDelete = attributePath[attributePath.length - 1];

          // Handle arrays differently than objects
          if (Array.isArray(parent)) {
            // Don't delete if it's the last item in the array
            if (parent.length <= 1) return state;
            parent.splice(keyToDelete, 1);
          } else {
            delete parent[keyToDelete];
          }
        }

        // Create new namedChildren object with updated config
        const updatedNamedChildren = {
          ...state.namedChildren,
          [childName]: {
            ...childToUpdate,
            config: configToUpdate,
            status: childToUpdate.status === "New" ? "New" : "Modified",
          },
        };

        console.log("Deleting path:", path);
        console.log("Updated config:", configToUpdate);

        return { namedChildren: updatedNamedChildren };
      }),
  }))
);

export default useStore;
