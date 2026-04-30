import React, { useEffect, startTransition } from 'react';
import html2canvas from 'html2canvas-pro';
import Dashboard from './Dashboard';

const yieldToMain = () => {
  return new Promise(resolve => {
    if (typeof requestIdleCallback !== 'undefined') {
      requestIdleCallback(resolve);
    } else {
      setTimeout(resolve, 0);
    }
  });
};

function DashboardThumbnail({ dashboard, project, onThumbnailGenerated, onSettled }) {
  const containerRef = React.useRef();
  const ASPECT_RATIO = 16 / 10;
  const hasStartedRef = React.useRef(false); // Prevent multiple simultaneous generations
  const settledRef = React.useRef(false);
  const onSettledRef = React.useRef(onSettled);
  React.useEffect(() => {
    onSettledRef.current = onSettled;
  }, [onSettled]);

  const settleOnce = () => {
    if (settledRef.current) return;
    settledRef.current = true;
    if (onSettledRef.current) onSettledRef.current();
  };

  // Release any WebGL/canvas resources held by the offscreen Plotly plots so
  // they don't keep contributing to the browser's WebGL-context cap.
  const purgeOffscreenPlots = () => {
    const container = containerRef.current;
    if (!container || !window.Plotly) return;
    container.querySelectorAll('.js-plotly-plot').forEach(plot => {
      try {
        window.Plotly.purge(plot);
      } catch (e) {
        // ignore — plot may already be torn down
      }
    });
  };

  useEffect(() => {
    if (hasStartedRef.current) {
      return;
    }

    // Track event listeners and timeouts for cleanup
    const eventListeners = [];
    const timeouts = [];

    // Hard watchdog: even if html2canvas hangs (no built-in timeout) or some
    // upstream wait deadlocks, force-settle after this window so the strictly
    // serial queue keeps moving instead of wedging on one card.
    const WATCHDOG_MS = 30000;
    const watchdogId = setTimeout(() => {
      hasStartedRef.current = false;
      purgeOffscreenPlots();
      settleOnce();
    }, WATCHDOG_MS);
    timeouts.push(watchdogId);

    const waitForChartsToLoad = async () => {
      const container = containerRef.current;
      if (!container) return;

      await yieldToMain();

      // Wait for Chart loading spinners to clear — those are the placeholders
      // rendered before trace/insight data arrives. Without this, the offscreen
      // container has 0 .js-plotly-plot nodes (data not back yet) and we'd
      // capture the spinner state.
      const SPINNER_TIMEOUT_MS = 8000;
      const SPINNER_POLL_MS = 100;
      const spinnerStart = Date.now();
      while (Date.now() - spinnerStart < SPINNER_TIMEOUT_MS) {
        if (!containerRef.current) return;
        if (containerRef.current.querySelectorAll('.loading-spinner').length === 0) break;
        await new Promise(resolve => {
          const id = setTimeout(resolve, SPINNER_POLL_MS);
          timeouts.push(id);
        });
      }

      await yieldToMain();
      if (!containerRef.current) return;

      // Wait for Plotly charts to finish rendering
      const plotlyPlots = containerRef.current.querySelectorAll('.js-plotly-plot');
      if (plotlyPlots.length > 0) {
        // Process charts in smaller batches to avoid blocking
        const batchSize = 2;
        for (let i = 0; i < plotlyPlots.length; i += batchSize) {
          const batch = Array.from(plotlyPlots).slice(i, i + batchSize);
          await Promise.all(
            batch.map(
              plot =>
                new Promise(resolve => {
                  // Check if plot is already rendered
                  if (plot._fullLayout && plot._fullData) {
                    resolve();
                  } else {
                    // Wait for plotly_afterplot event
                    const handler = () => {
                      plot.removeEventListener('plotly_afterplot', handler);
                      resolve();
                    };
                    plot.addEventListener('plotly_afterplot', handler);
                    eventListeners.push({ element: plot, event: 'plotly_afterplot', handler });

                    // Fallback timeout in case event doesn't fire
                    const timeoutId = setTimeout(resolve, 2000);
                    timeouts.push(timeoutId);
                  }
                })
            )
          );

          // Yield control between batches
          if (i + batchSize < plotlyPlots.length) {
            await yieldToMain();
          }
        }
      }

      // Yield control before processing images
      await yieldToMain();

      // Wait for any images to load
      const images = container.querySelectorAll('img');
      if (images.length > 0) {
        await Promise.all(
          Array.from(images).map(
            img =>
              new Promise(resolve => {
                if (img.complete) {
                  resolve();
                } else {
                  const handleLoad = () => {
                    img.removeEventListener('load', handleLoad);
                    img.removeEventListener('error', handleLoad);
                    resolve();
                  };
                  img.addEventListener('load', handleLoad);
                  img.addEventListener('error', handleLoad);
                  eventListeners.push({ element: img, event: 'load', handler: handleLoad });
                  eventListeners.push({ element: img, event: 'error', handler: handleLoad });

                  const timeoutId = setTimeout(resolve, 1000);
                  timeouts.push(timeoutId);
                }
              })
          )
        );
      }

      // Final yield before thumbnail generation
      await yieldToMain();
    };

    const generateThumbnail = async () => {
      // Mark as started to prevent multiple simultaneous generations
      hasStartedRef.current = true;

      const container = containerRef.current;
      if (!container) {
        hasStartedRef.current = false;
        settleOnce();
        return;
      }

      try {
        await waitForChartsToLoad();

        await yieldToMain();

        if (!containerRef.current) {
          hasStartedRef.current = false;
          settleOnce();
          return;
        }

        const canvas = await html2canvas(containerRef.current, {
          scale: 1,
          logging: false,
          width: 1200,
          height: 1200 / ASPECT_RATIO,
          backgroundColor: '#ffffff',
          useCORS: true,
          onclone: clonedDoc => {
            const clonedElement = clonedDoc.querySelector('.preview-container');
            if (clonedElement) {
              clonedElement.style.width = '1200px';
              clonedElement.style.height = `${1200 / ASPECT_RATIO}px`;
              clonedElement.style.transform = 'none';
              clonedElement.style.display = 'flex';
              clonedElement.style.flexDirection = 'column';
              clonedElement.style.alignItems = 'stretch';

              // Ensure all rows are positioned at the top
              const rows = clonedElement.querySelectorAll('.dashboard-row');
              rows.forEach(row => {
                row.style.marginTop = '0';
                row.style.marginBottom = '8px';
              });

              // Resize any Plotly charts
              Array.from(clonedElement.getElementsByClassName('js-plotly-plot')).forEach(plot => {
                if (window.Plotly) {
                  window.Plotly.Plots.resize(plot);
                }
              });
            }
          },
        });

        // Yield after html2canvas completes
        await yieldToMain();

        // Free WebGL contexts now — html2canvas has already captured pixels
        // into a 2D canvas, so the live offscreen Plotly plots aren't needed
        // anymore. This is the main lever for keeping context usage in check
        // when many cards are generating thumbnails in sequence.
        purgeOffscreenPlots();

        const tempCanvas = document.createElement('canvas');
        const TARGET_WIDTH = 800;
        tempCanvas.width = TARGET_WIDTH;
        tempCanvas.height = TARGET_WIDTH / ASPECT_RATIO;
        const ctx = tempCanvas.getContext('2d');

        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';

        ctx.drawImage(
          canvas,
          0,
          0,
          canvas.width,
          canvas.height,
          0,
          0,
          tempCanvas.width,
          tempCanvas.height
        );

        // Yield before blob generation
        await yieldToMain();

        tempCanvas.toBlob(blob => {
          if (blob) {
            onThumbnailGenerated(blob);
          }
          // Reset the flag when done (success or failure)
          hasStartedRef.current = false;
          settleOnce();
        });
      } catch (error) {
        // Reset the flag on error
        hasStartedRef.current = false;
        purgeOffscreenPlots();
        settleOnce();
      }
    };

    // Use startTransition to mark thumbnail generation as non-urgent
    startTransition(() => {
      generateThumbnail();
    });

    // Cleanup function
    return () => {
      // Clean up all event listeners
      eventListeners.forEach(({ element, event, handler }) => {
        element.removeEventListener(event, handler);
      });

      // Clear all timeouts
      timeouts.forEach(timeoutId => {
        clearTimeout(timeoutId);
      });

      // If we unmount before settling (e.g. user navigates away mid-capture),
      // free contexts and release the queue slot.
      purgeOffscreenPlots();
      settleOnce();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dashboard, onThumbnailGenerated, ASPECT_RATIO]);

  return (
    <div
      style={{
        position: 'absolute',
        left: '-9999px',
        width: '1200px',
        height: `${1200 / ASPECT_RATIO}px`,
        overflow: 'hidden',
        backgroundColor: '#ffffff',
      }}
    >
      <div
        ref={containerRef}
        className="preview-container"
        style={{
          width: '1200px',
          height: `${1200 / ASPECT_RATIO}px`,
          overflow: 'hidden',
          backgroundColor: '#ffffff',
          padding: '16px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'stretch',
        }}
      >
        <Dashboard
          project={project}
          dashboardName={dashboard.name}
          isPreview={true}
          previewWidth={1200}
          previewHeight={1200 / ASPECT_RATIO}
        />
      </div>
    </div>
  );
}

export default DashboardThumbnail;
