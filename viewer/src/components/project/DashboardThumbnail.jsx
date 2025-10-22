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

function DashboardThumbnail({ dashboard, project, onThumbnailGenerated }) {
  const containerRef = React.useRef();
  const ASPECT_RATIO = 16 / 10;
  const hasStartedRef = React.useRef(false); // Prevent multiple simultaneous generations

  useEffect(() => {
    if (hasStartedRef.current) {
      return;
    }

    // Track event listeners and timeouts for cleanup
    const eventListeners = [];
    const timeouts = [];

    const waitForChartsToLoad = async () => {
      const container = containerRef.current;
      if (!container) return;

      await yieldToMain();

      // Wait for Plotly charts to finish rendering
      const plotlyPlots = container.querySelectorAll('.js-plotly-plot');
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
        return;
      }

      try {
        await waitForChartsToLoad();

        await yieldToMain();

        if (!containerRef.current) {
          hasStartedRef.current = false;
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
        });
      } catch (error) {
        // Reset the flag on error
        hasStartedRef.current = false;
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
    };
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
