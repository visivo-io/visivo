import React, { useState, useMemo, useEffect } from "react";
import { Link } from 'react-router-dom';
import Dashboard from "./Dashboard";
import Loading from "./Loading";
import Heading from "./styled/Heading";
import { Container } from "./styled/Container";
import { TextInput, Badge, Card, Tooltip } from 'flowbite-react';
import { HiSearch, HiTemplate } from 'react-icons/hi';
import html2canvas from 'html2canvas';

// Thumbnail generation component
function DashboardThumbnail({ dashboard, project, onThumbnailGenerated }) {
  const containerRef = React.useRef();
  const ASPECT_RATIO = 16/10;

  useEffect(() => {
    const generateThumbnail = async () => {
      if (containerRef.current) {
        try {
          await new Promise(resolve => setTimeout(resolve, 1000));
          
          const canvas = await html2canvas(containerRef.current, {
            scale: 1,
            logging: false,
            width: 1200,
            height: 1200 / ASPECT_RATIO,
            backgroundColor: '#ffffff',
            useCORS: true,
            onclone: (clonedDoc) => {
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
            }
          });

          const tempCanvas = document.createElement('canvas');
          const TARGET_WIDTH = 800;
          tempCanvas.width = TARGET_WIDTH;
          tempCanvas.height = TARGET_WIDTH / ASPECT_RATIO;
          const ctx = tempCanvas.getContext('2d');
          
          ctx.imageSmoothingEnabled = true;
          ctx.imageSmoothingQuality = 'high';
          
          ctx.drawImage(canvas, 0, 0, canvas.width, canvas.height, 0, 0, tempCanvas.width, tempCanvas.height);
          
          const thumbnail = tempCanvas.toDataURL('image/jpeg', 0.95);
          onThumbnailGenerated(dashboard.name, thumbnail);
        } catch (error) {
          console.error('Error generating thumbnail:', error);
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
          alignItems: 'stretch'
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

function DashboardCard({ dashboard, thumbnail }) {
  return (
    <Tooltip content={dashboard.description || "No description available"}>
      <Link to={dashboard.name} className="block h-full">
        <Card className="h-full transform transition-all duration-200 hover:scale-102 hover:shadow-lg border border-gray-200">
          <div className="aspect-[16/10] bg-gradient-to-br from-gray-50 to-gray-100 rounded-lg mb-4 overflow-hidden">
            {thumbnail ? (
              <div className="w-full h-full">
                <img 
                  src={thumbnail} 
                  alt={`Preview of ${dashboard.name}`}
                  className="w-full h-full object-contain"
                  loading="lazy"
                />
              </div>
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <HiTemplate className="w-12 h-12 text-gray-400" />
              </div>
            )}
          </div>
          <div>
            <h3 className="text-lg font-semibold text-gray-900 mb-2 line-clamp-1">{dashboard.name}</h3>
            {dashboard.description && (
              <p className="text-sm text-gray-600 mb-3 line-clamp-2">
                {dashboard.description}
              </p>
            )}
            <div className="flex flex-wrap gap-2 mt-auto">
              {dashboard.level && (
                <Badge color="info" size="sm" className="flex-shrink-0">
                  Level {dashboard.level}
                </Badge>
              )}
              {dashboard.tags && dashboard.tags.map(tag => (
                <Badge key={tag} color="gray" size="sm" className="flex-shrink-0">
                  {tag}
                </Badge>
              ))}
            </div>
          </div>
        </Card>
      </Link>
    </Tooltip>
  );
}

function DashboardSection({ title, dashboards }) {
  if (!dashboards || dashboards.length === 0) return null;
  
  return (
    <div className="mb-12">
      <h2 className="text-2xl font-bold text-gray-900 mb-6 pb-2 border-b border-gray-200">{title}</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {dashboards.map((dashboard) => (
          <DashboardCard 
            key={dashboard.name} 
            dashboard={dashboard} 
            thumbnail={dashboard.thumbnail}
          />
        ))}
      </div>
    </div>
  );
}

function FilterBar({ searchTerm, setSearchTerm, selectedTags, setSelectedTags, availableTags }) {
  return (
    <div className="mb-8">
      <div className="space-y-4">
        <div className="relative">
          <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none">
            <HiSearch className="h-4 w-4 text-gray-500" />
          </div>
          <input
            type="text"
            placeholder="Search dashboards..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="block w-full pl-10 pr-3 py-2 text-sm bg-gray-50 border border-gray-200 rounded-full focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent placeholder-gray-500"
          />
        </div>
        {availableTags.length > 0 && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Filter by tags
            </label>
            <div className="flex flex-wrap gap-2">
              {availableTags.map(tag => (
                <Badge
                  key={tag}
                  color={selectedTags.includes(tag) ? "info" : "gray"}
                  className="cursor-pointer transform transition-all duration-200 hover:scale-105"
                  onClick={() => {
                    setSelectedTags(prev =>
                      prev.includes(tag)
                        ? prev.filter(t => t !== tag)
                        : [...prev, tag]
                    );
                  }}
                >
                  {tag}
                </Badge>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Project(props) {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedTags, setSelectedTags] = useState([]);
  const [thumbnails, setThumbnails] = useState({});
  const [thumbnailQueue, setThumbnailQueue] = useState([]);
  const [isGeneratingThumbnails, setIsGeneratingThumbnails] = useState(false);

  // Reset scroll position when dashboard changes
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [props.dashboardName]);

  // Initialize thumbnail generation queue
  useEffect(() => {
    if (props.dashboards && props.dashboards.length > 0) {
      const dashboardsToGenerate = props.dashboards
        .filter(d => !thumbnails[d.name])
        .map(d => d.name);
      setThumbnailQueue(dashboardsToGenerate);
    }
  }, [props.dashboards, thumbnails]);

  // Process thumbnail queue with delay
  useEffect(() => {
    let timeoutId;
    
    const processNextThumbnail = () => {
      if (thumbnailQueue.length > 0 && !isGeneratingThumbnails) {
        setIsGeneratingThumbnails(true);
        // Add a small delay between generations
        timeoutId = setTimeout(() => {
          const currentDashboard = props.dashboards.find(d => d.name === thumbnailQueue[0]);
          if (currentDashboard) {
            setThumbnailQueue(prev => prev.slice(1));
          }
        }, 500); // 500ms delay between thumbnails
      }
    };

    processNextThumbnail();

    return () => {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    };
  }, [thumbnailQueue, isGeneratingThumbnails, props.dashboards]);

  const handleThumbnailGenerated = (dashboardName, thumbnail) => {
    console.log('Thumbnail generated for:', dashboardName); // Debug log
    setThumbnails(prev => ({
      ...prev,
      [dashboardName]: thumbnail
    }));
    setIsGeneratingThumbnails(false);
  };

  const availableTags = useMemo(() => {
    if (!props.dashboards) return [];
    const tagSet = new Set();
    props.dashboards.forEach(dashboard => {
      if (dashboard.tags) {
        dashboard.tags.forEach(tag => tagSet.add(tag));
      }
    });
    return Array.from(tagSet);
  }, [props.dashboards]);

  const filteredDashboards = useMemo(() => {
    if (!props.dashboards) return [];
    return props.dashboards.filter(dashboard => {
      const matchesSearch = dashboard.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (dashboard.description && dashboard.description.toLowerCase().includes(searchTerm.toLowerCase()));
      const matchesTags = selectedTags.length === 0 ||
        (dashboard.tags && selectedTags.every(tag => dashboard.tags.includes(tag)));
      return matchesSearch && matchesTags;
    });
  }, [props.dashboards, searchTerm, selectedTags]);

  const dashboardsByLevel = useMemo(() => {
    const levels = {
      L0: [],
      L1: [],
      L2: [],
      L3: [],
      L4: [],
      unassigned: []
    };

    filteredDashboards.forEach(dashboard => {
      if (!dashboard.level) {
        levels.unassigned.push(dashboard);
      } else {
        levels[dashboard.level].push(dashboard);
      }
    });

    return Object.fromEntries(
      Object.entries(levels).filter(([_, dashboards]) => dashboards.length > 0)
    );
  }, [filteredDashboards]);

  const renderLoading = () => {
    return <Loading />;
  };

  const renderDashboardList = () => {
    return (
      <Container>
        <div className="max-w-7xl mx-auto py-8">
          <div className="flex justify-between items-center mb-6">
            <div>
              <Heading>Dashboards</Heading>
            </div>
            <div className="text-sm text-gray-500">
              {filteredDashboards.length} dashboard{filteredDashboards.length !== 1 ? 's' : ''}
            </div>
          </div>
          
          <FilterBar
            searchTerm={searchTerm}
            setSearchTerm={setSearchTerm}
            selectedTags={selectedTags}
            setSelectedTags={setSelectedTags}
            availableTags={availableTags}
          />

          {Object.entries(dashboardsByLevel).map(([level, dashboards]) => (
            <DashboardSection
              key={level}
              title={level === 'unassigned' ? 'Other Dashboards' : `Level ${level} Dashboards`}
              dashboards={dashboards.map(dashboard => ({
                ...dashboard,
                thumbnail: thumbnails[dashboard.name]
              }))}
            />
          ))}

          {filteredDashboards.length === 0 && (
            <div className="text-center py-12 bg-white rounded-lg shadow-sm border border-gray-200">
              <HiTemplate className="mx-auto h-12 w-12 text-gray-400" />
              <h3 className="mt-2 text-sm font-semibold text-gray-900">No dashboards found</h3>
              <p className="mt-1 text-sm text-gray-500">No dashboards match your search criteria.</p>
            </div>
          )}

          {/* Hidden thumbnail generator */}
          {isGeneratingThumbnails && thumbnailQueue[0] && (
            <DashboardThumbnail
              dashboard={props.dashboards.find(d => d.name === thumbnailQueue[0])}
              project={props.project}
              onThumbnailGenerated={handleThumbnailGenerated}
            />
          )}
        </div>
      </Container>
    );
  };

  const renderDashboard = (project) => {
    return (
      <Dashboard project={project} dashboardName={props.dashboardName} />
    );
  };

  if (props.project && !props.dashboardName) {
    return renderDashboardList(props.project);
  } else if (props.project && props.dashboardName) {
    return renderDashboard(props.project);
  } else {
    return renderLoading();
  }
}

export default Project;

