const createSelectorSlice = (set, get) => ({
  // Selector state - keyed by selector name
  selectorValues: {},

  // URL synchronization state
  urlSyncEnabled: true,

  // Actions
  setSelectorValue: (selectorName, value) => {
    const state = get();
    const newSelectorValues = {
      ...state.selectorValues,
      [selectorName]: value,
    };

    set({ selectorValues: newSelectorValues });

    // Sync to URL if enabled
    if (state.urlSyncEnabled && typeof window !== 'undefined') {
      get().syncToUrl(selectorName, value);
    }
  },

  setSelectorValues: values => {
    set({ selectorValues: { ...values } });
  },

  clearSelectorValue: selectorName => {
    const state = get();
    const newSelectorValues = { ...state.selectorValues };
    delete newSelectorValues[selectorName];

    set({ selectorValues: newSelectorValues });

    // Remove from URL if enabled
    if (state.urlSyncEnabled && typeof window !== 'undefined') {
      get().removeFromUrl(selectorName);
    }
  },

  clearAllSelectors: () => {
    set({ selectorValues: {} });

    // Clear URL params if enabled
    if (get().urlSyncEnabled && typeof window !== 'undefined') {
      get().clearUrlParams();
    }
  },

  // URL synchronization methods
  syncToUrl: (selectorName, value) => {
    if (typeof window === 'undefined') return;

    const url = new URL(window.location);

    if (value === null || value === undefined) {
      url.searchParams.delete(selectorName);
    } else if (Array.isArray(value)) {
      if (value.length === 0) {
        url.searchParams.set(selectorName, 'NoCohorts');
      } else {
        url.searchParams.set(selectorName, JSON.stringify(value));
      }
    } else {
      url.searchParams.set(selectorName, String(value));
    }

    // Update URL without triggering navigation
    window.history.replaceState({}, '', url);
  },

  removeFromUrl: selectorName => {
    if (typeof window === 'undefined') return;

    const url = new URL(window.location);
    url.searchParams.delete(selectorName);
    window.history.replaceState({}, '', url);
  },

  clearUrlParams: () => {
    if (typeof window === 'undefined') return;

    const url = new URL(window.location);
    const selectorValues = get().selectorValues;

    // Remove all selector-related params
    Object.keys(selectorValues).forEach(key => {
      url.searchParams.delete(key);
    });

    window.history.replaceState({}, '', url);
  },

  // Load selector values from URL
  loadFromUrl: () => {
    if (typeof window === 'undefined') return;

    const url = new URL(window.location);
    const selectorValues = {};

    // Parse URL search params
    for (const [key, value] of url.searchParams.entries()) {
      try {
        // Try to parse as JSON array first
        if (value.startsWith('[') && value.endsWith(']')) {
          selectorValues[key] = JSON.parse(value);
        } else if (value === 'NoCohorts') {
          selectorValues[key] = [];
        } else {
          selectorValues[key] = value;
        }
      } catch (e) {
        // Fallback to string value
        selectorValues[key] = value;
      }
    }

    set({ selectorValues });
  },

  // Helper methods for selector logic
  getSelectorValue: (selectorName, defaultValue = null) => {
    const { selectorValues } = get();
    return selectorValues[selectorName] ?? defaultValue;
  },

  // Generate selector options based on configuration
  generateSelectorOptions: (selector, parentName, parentType, names) => {
    if (!selector) {
      // Default behavior when no selector config
      return {
        isMulti: parentType !== 'table',
        name: `${parentName} Selector`,
        visible: true,
        options: names.map(name => ({ value: name, label: name })),
      };
    }

    return {
      isMulti: selector.type === 'multiple',
      name: selector.name,
      visible: selector.parent_name === parentName,
      options: names.map(name => ({ value: name, label: name })),
    };
  },

  // Generate new search param value (maintains existing logic)
  generateSearchParamValue: (selectedOptions, defaultOptions, alwaysPush = false) => {
    const getValuesFromOptions = options => {
      if (Array.isArray(options)) {
        return options.map(opt => opt.value);
      } else if (options && options.value) {
        return [options.value];
      }
      return [];
    };

    const selectedValues = getValuesFromOptions(selectedOptions);

    if (!alwaysPush) {
      const defaultValues = getValuesFromOptions(defaultOptions);
      if (
        selectedValues.length === defaultValues.length &&
        defaultValues.every(val => selectedValues.includes(val))
      ) {
        return null;
      }
    }

    if (Array.isArray(selectedOptions)) {
      return selectedOptions.length === 0 ? 'NoCohorts' : selectedValues;
    } else if (selectedOptions && selectedOptions.value) {
      return selectedOptions.value;
    }

    return null;
  },

  setUrlSyncEnabled: enabled => {
    set({ urlSyncEnabled: enabled });
  },
});

export default createSelectorSlice;
