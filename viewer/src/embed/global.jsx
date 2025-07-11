/**
 * Global entry point for Visivo embed components
 * This file creates a global VisivoEmbed object for script tag usage
 */

import React from 'react';
import { createRoot } from 'react-dom/client';
import { Visivo } from './Visivo';

// Keep track of React roots for cleanup
const roots = new WeakMap();

const VisivoEmbedGlobal = {
  /**
   * Render a Visivo component into a DOM container
   */
  render: (container, props) => {
    // Clean up existing root if it exists
    if (roots.has(container)) {
      roots.get(container).unmount();
    }

    // Create new React root
    const root = createRoot(container);
    roots.set(container, root);

    // Render the component
    root.render(<Visivo {...props} />);
  },

  /**
   * Unmount a Visivo component from a DOM container
   */
  unmount: container => {
    const root = roots.get(container);
    if (root) {
      root.unmount();
      roots.delete(container);
    }
  },
};

// Make it available globally
if (typeof window !== 'undefined') {
  window.VisivoEmbed = VisivoEmbedGlobal;
}

export default VisivoEmbedGlobal;
