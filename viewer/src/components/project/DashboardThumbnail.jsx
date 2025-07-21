import React, { useEffect } from 'react';
import html2canvas from 'html2canvas-pro';
import Dashboard from './Dashboard';

function DashboardThumbnail({ dashboard, project, onThumbnailGenerated, onStateChange }) {
  const containerRef = React.useRef();
  const ASPECT_RATIO = 16 / 10;

  useEffect(() => {
    const waitForChartsToLoad = async () => {
      const container = containerRef.current;
      if (!container) return;

      // Wait for Plotly charts to finish rendering
      const plotlyPlots = container.querySelectorAll('.js-plotly-plot');
      if (plotlyPlots.length > 0) {
        await Promise.all(
          Array.from(plotlyPlots).map(plot => 
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
                
                // Fallback timeout in case event doesn't fire
                setTimeout(resolve, 2000);
              }
            })
          )
        );
      }

      // Wait for any images to load
      const images = container.querySelectorAll('img');
      if (images.length > 0) {
        await Promise.all(
          Array.from(images).map(img => 
            new Promise(resolve => {
              if (img.complete) {
                resolve();
              } else {
                img.onload = resolve;
                img.onerror = resolve; // Don't block on broken images
                setTimeout(resolve, 1000); // Fallback timeout
              }
            })
          )
        );
      }

      // Small delay to ensure DOM is stable after all async operations
      await new Promise(resolve => setTimeout(resolve, 100));
    };

    const generateThumbnail = async () => {
      if (containerRef.current) {
        try {
          // Notify parent that we're starting chart loading
          onStateChange?.('loading');
          
          // Wait for charts and images to be ready instead of hardcoded delay
          await waitForChartsToLoad();
          
          // Notify parent that we're generating the thumbnail
          onStateChange?.('generating');

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

          tempCanvas.toBlob(blob => {
            if (blob) {
              onThumbnailGenerated(blob);
            } else {
              console.error('Failed to generate thumbnail blob');
              onStateChange?.('error');
            }
          });
        } catch (error) {
          console.error('Error generating thumbnail:', error);
          onStateChange?.('error');
        }
      }
    };

    generateThumbnail();
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
