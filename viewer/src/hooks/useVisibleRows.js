import { useState, useEffect, useRef, useCallback } from 'react';

/**
 * Hook for viewport-based lazy loading of dashboard rows.
 *
 * Uses IntersectionObserver to track which rows are visible in the viewport,
 * enabling lazy loading of data for rows as they scroll into view.
 *
 * @param {string} dashboardName - Dashboard name (used to reset state on dashboard change)
 * @returns {{ visibleRows: Set<number>, setRowRef: (element: HTMLElement, rowIndex: number) => void }}
 */
export const useVisibleRows = dashboardName => {
  // Track which rows are visible - initially load first 3 rows for immediate content
  const [visibleRows, setVisibleRows] = useState(() => new Set([0, 1, 2]));
  const rowRefs = useRef({});
  const observerRef = useRef(null);

  // Store row ref callback
  const setRowRef = useCallback((element, rowIndex) => {
    rowRefs.current[rowIndex] = element;
  }, []);

  // Set up IntersectionObserver for lazy loading
  useEffect(() => {
    // Disconnect previous observer if exists
    if (observerRef.current) {
      observerRef.current.disconnect();
    }

    observerRef.current = new IntersectionObserver(
      entries => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            const rowIndex = parseInt(entry.target.dataset.rowIndex, 10);
            if (!isNaN(rowIndex)) {
              setVisibleRows(prev => {
                if (prev.has(rowIndex)) return prev;
                const next = new Set(prev);
                next.add(rowIndex);
                return next;
              });
            }
          }
        });
      },
      {
        rootMargin: '200px', // Start loading 200px before row enters viewport
        threshold: 0,
      }
    );

    // Observe all row refs
    Object.entries(rowRefs.current).forEach(([, element]) => {
      if (element) {
        observerRef.current.observe(element);
      }
    });

    return () => {
      if (observerRef.current) {
        observerRef.current.disconnect();
      }
    };
  }, [dashboardName]); // Re-setup when dashboard changes

  return { visibleRows, setRowRef };
};
