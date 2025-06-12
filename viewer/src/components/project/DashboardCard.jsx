import React, { useEffect, useState, useRef, useContext } from 'react';
import { Link } from 'react-router-dom';
import { Badge } from 'flowbite-react';
import { HiTemplate, HiExternalLink } from 'react-icons/hi';
import html2canvas from 'html2canvas-pro';
import Dashboard from './Dashboard';
import QueryContext from '../../contexts/QueryContext';
import { useQuery } from '@tanstack/react-query';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { createRoot } from 'react-dom/client';
import md5 from 'md5';
import { useRouteLoaderData } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { QueryProvider } from '../../contexts/QueryContext';
import { SearchParamsProvider } from '../../contexts/SearchParamsContext';
import DashboardThumbnail from './DashboardThumbnail';

function DashboardCard({ projectId, dashboard }) {
  const queryClient = new QueryClient();
  const { fetchDashboardQuery, fetchTracesQuery } = useContext(QueryContext);
  const project = useRouteLoaderData('project');
  const [imageUrl, setImageUrl] = useState(null);
  const [error, setError] = useState(null);
  const [isGeneratingThumbnail, setIsGeneratingThumbnail] = useState(false);
  const cardRef = useRef(null);

  const { data: dashboardData } = useQuery(fetchDashboardQuery(projectId, dashboard.name));

  useEffect(() => {
    const loadThumbnail = async () => {
      if (!dashboardData) {
        return;
      }
      if (dashboardData.signed_thumbnail_file_url) {
        setImageUrl(dashboardData.signed_thumbnail_file_url);
      } else if (!imageUrl && !error && project && !isGeneratingThumbnail && cardRef.current) {
        setIsGeneratingThumbnail(true);
        try {
          const container = document.createElement('div');
          container.style.position = 'absolute';
          // container.style.left = '-9999px';
          container.style.left = '0px';
          container.style.top= '0px';
          container.style.width = '1024px';
          container.style.height = '1024px';
          document.body.appendChild(container);

          const root = createRoot(container);
          root.render(
            <QueryClientProvider client={queryClient}>
              <QueryProvider value={{ fetchTracesQuery, fetchDashboardQuery }}>
                <BrowserRouter>
                  <Routes>
                    <Route
                      path="/project"
                      element={<SearchParamsProvider> <Dashboard project={project} dashboardName={dashboard.name} /> </SearchParamsProvider> }
                    />
                  </Routes>
                </BrowserRouter>
              </QueryProvider>
            </QueryClientProvider>
          );

          console.log('generating thumbnail', container);
          const canvas = await html2canvas(container, {
            width: 1024,
            height: 1024,
            scale: 1,
            backgroundColor: '#ffffff',
          });

          canvas.toBlob(async blob => {
            try {
              const formData = new FormData();
              formData.append('file', blob, `${dashboard.name}.png`);
              const dashboardNameHash = md5(dashboard.name);
              console.log('posting', dashboardNameHash);
              const response = await fetch(`/data/dashboards/${dashboardNameHash}.png`, {
                method: 'POST',
                body: formData,
              });

              const json = await response.json();
              setImageUrl(json.signed_thumbnail_file_url);
            } catch (error) {
              setError(error);
              console.error('Error uploading thumbnail:', error);
            }
          }, 'image/png');

          document.body.removeChild(container);
        } catch (error) {
          setError(error);
          console.error('Error generating thumbnail:', error);
        } finally {
          setIsGeneratingThumbnail(false);
        }
      }
    };

    loadThumbnail();
  }, [dashboard, project, error, imageUrl, isGeneratingThumbnail, dashboardData, fetchTracesQuery, fetchDashboardQuery]);

  const CardContent = () => (
    <div
      ref={cardRef}
      className="h-full bg-white rounded-md shadow-2xs hover:shadow-md transition-all duration-200 hover:scale-[1.02] border border-gray-100 group"
    >
      <div className="aspect-16/10 rounded-t-md overflow-hidden relative bg-gray-50">
        {imageUrl ? (
          <img
            src={imageUrl}
            alt={`Preview of ${dashboard.name}`}
            className="w-full h-full object-cover mix-blend-multiply"
            loading="lazy"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <HiTemplate className="w-8 h-8 text-primary-300" />
          </div>
        )}
        <div className="absolute top-0 left-0 right-0 p-1.5 bg-linear-to-b from-black/50 to-transparent">
          <div className="flex flex-wrap gap-1 justify-end">
            {dashboard.tags?.map(tag => (
              <Badge key={tag} color="gray" size="xs" className="shrink-0 text-[10px]">
                {tag}
              </Badge>
            ))}
          </div>
        </div>
        <div className="absolute bottom-0 left-0 right-0 h-3 bg-linear-to-t from-black/20 to-transparent" />
        {dashboard.type === 'external' && (
          <div className="absolute bottom-0 left-0 p-1.5">
            <Badge
              color="blue"
              size="xs"
              className="shrink-0 text-[10px] flex items-center gap-1 group/badge"
            >
              <HiExternalLink className="w-3 h-3" />
              <span className="max-w-0 overflow-hidden whitespace-nowrap transition-all duration-200 group-hover/badge:max-w-[4rem]">
                External
              </span>
            </Badge>
          </div>
        )}
      </div>

      <div className="p-2">
        <h3 className="text-sm font-medium text-gray-900 line-clamp-2 mb-0">{dashboard.name}</h3>
        {dashboard.description && (
          <p className="text-xs text-gray-600 line-clamp-1">{dashboard.description}</p>
        )}
      </div>
    </div>
  );

  const needThumbnail = !imageUrl && project;

  return dashboard.type === 'external' ? (
    <a href={dashboard.href} target="_blank" rel="noopener noreferrer" className="block h-full">
      <CardContent />
    </a>
  ) : (
    <Link to={encodeURIComponent(dashboard.name)} className="block h-full">
      <CardContent />
      {needThumbnail && <DashboardThumbnail dashboard={dashboard} project={project} onThumbnailGenerated={setImageUrl} />}
    </Link>
  );
}

export default DashboardCard;
