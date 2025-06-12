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

function DashboardCard({ dashboard }) {
  const { fetchDashboardQuery } = useContext(QueryContext);
  const [imageUrl, setImageUrl] = useState(null);
  const [isGeneratingThumbnail, setIsGeneratingThumbnail] = useState(false);
  const cardRef = useRef(null);

  const { data: dashboardData } = useQuery(fetchDashboardQuery("project_id", dashboard.name));

  useEffect(() => {
    console.log('dashboardData', dashboardData);
    const loadThumbnail = async () => {
      if (!dashboardData) {
        return;
      }
      if (dashboardData.signed_thumbnail_file_url) {
        setImageUrl(dashboardData.signed_thumbnail_file_url);
      } else if (!isGeneratingThumbnail && cardRef.current) {
        setIsGeneratingThumbnail(true);
        try {
          // Create a clone of the card for thumbnail generation
          // Create a hidden container for the dashboard
          const container = document.createElement('div');
          container.style.position = 'absolute';
          container.style.left = '-9999px';
          container.style.width = '300px';
          container.style.height = '300px';
          document.body.appendChild(container);

          const root = createRoot(container);
          root.render(
            <BrowserRouter>
              <Routes>
                <Route path="/project" element={<Dashboard project={dashboard.project} dashboardName={dashboard.name} />} />
              </Routes>
            </BrowserRouter>
          );

          // Generate thumbnail
          const canvas = await html2canvas(container, {
            width: 300,
            height: 300,
            scale: 1,
            backgroundColor: '#ffffff'
          });

          // Convert to blob and upload
          canvas.toBlob(async (blob) => {
            try {
              const formData = new FormData();
              formData.append('file', blob, `${dashboard.name}.png`);
              const dashboardNameHash = md5(dashboard.name);
              const response = await fetch(`/data/dashboards/${dashboardNameHash}.png`, {
                method: 'POST',
                body: formData
              });

              if (response.ok) {
                setImageUrl(response.signed_thumbnail_file_url);
              }
            } catch (error) {
              console.error('Error uploading thumbnail:', error);
            }
          }, 'image/png');

          document.body.removeChild(container);
        } catch (error) {
          console.error('Error generating thumbnail:', error);
        } finally {
          setIsGeneratingThumbnail(false);
        }
      }
    };

    loadThumbnail();
  }, [dashboard, isGeneratingThumbnail, dashboardData]);

  const CardContent = () => (
    <div ref={cardRef} className="h-full bg-white rounded-md shadow-2xs hover:shadow-md transition-all duration-200 hover:scale-[1.02] border border-gray-100 group">
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

  return dashboard.type === 'external' ? (
    <a href={dashboard.href} target="_blank" rel="noopener noreferrer" className="block h-full">
      <CardContent />
    </a>
  ) : (
    <Link to={encodeURIComponent(dashboard.name)} className="block h-full">
      <CardContent />
    </Link>
  );
}

export default DashboardCard;
