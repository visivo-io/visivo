import React, { useEffect, useState, useRef, useContext } from 'react';
import { Link } from 'react-router-dom';
import { Badge } from 'flowbite-react';
import { HiTemplate, HiExternalLink } from 'react-icons/hi';
import QueryContext from '../../contexts/QueryContext';
import { useQuery } from '@tanstack/react-query';
import md5 from 'md5';
import { useRouteLoaderData } from 'react-router-dom';
import DashboardThumbnail from './DashboardThumbnail';

const GENERATING_THUMBNAIL_URL = 'GENERATING';

function DashboardCard({ projectId, dashboard }) {
  const { fetchDashboardQuery } = useContext(QueryContext);
  const project = useRouteLoaderData('project');
  const [imageUrl, setImageUrl] = useState(null);
  const [thumbnailState, setThumbnailState] = useState('idle'); // idle, loading, generating, uploading, complete, error
  const cardRef = useRef(null);

  const { data: dashboardData } = useQuery(fetchDashboardQuery(projectId, dashboard.name));

  const onThumbnailGenerated = async blob => {
    try {
      setThumbnailState('uploading');
      
      const formData = new FormData();
      formData.append('file', blob, `${dashboard.name}.png`);
      const dashboardNameHash = md5(dashboard.name);
      
      const response = await fetch(`/data/dashboards/${dashboardNameHash}.png`, {
        method: 'POST',
        body: formData,
      });
      
      if (!response.ok) {
        throw new Error(`Upload failed: ${response.status}`);
      }
      
      const json = await response.json();
      setImageUrl(json.signed_thumbnail_file_url);
      setThumbnailState('complete');
      
    } catch (error) {
      console.error('Error uploading thumbnail:', error);
      setThumbnailState('error');
    }
  };

  useEffect(() => {
    if (
      dashboardData &&
      dashboardData.signed_thumbnail_file_url &&
      dashboardData.signed_thumbnail_file_url !== GENERATING_THUMBNAIL_URL
    ) {
      setImageUrl(dashboardData.signed_thumbnail_file_url);
    }
  }, [dashboardData]);

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
          <div className="w-full h-full flex items-center justify-center relative">
            <HiTemplate className="w-8 h-8 text-primary-300" />
            {/* Progress indicator overlay */}
            {(thumbnailState === 'loading' || thumbnailState === 'generating' || thumbnailState === 'uploading') && (
              <div className="absolute inset-0 bg-black/20 flex flex-col items-center justify-center">
                <div className="animate-spin rounded-full h-6 w-6 border-2 border-white border-t-transparent mb-2"></div>
                <span className="text-white text-xs font-medium">
                  {thumbnailState === 'loading' && 'Loading charts...'}
                  {thumbnailState === 'generating' && 'Generating...'}
                  {thumbnailState === 'uploading' && 'Saving...'}
                </span>
              </div>
            )}
            {thumbnailState === 'error' && (
              <div className="absolute inset-0 bg-red-500/10 flex items-center justify-center">
                <span className="text-red-600 text-xs font-medium">Preview failed</span>
              </div>
            )}
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

  const needThumbnail =
    !!dashboardData && !dashboardData.signed_thumbnail_file_url && !imageUrl && !!project;

  return dashboard.type === 'external' ? (
    <a href={dashboard.href} target="_blank" rel="noopener noreferrer" className="block h-full">
      <CardContent />
    </a>
  ) : (
    <Link to={encodeURIComponent(dashboard.name)} className="block h-full">
      <CardContent />
      {needThumbnail && (
        <DashboardThumbnail
          dashboard={dashboard}
          project={project}
          onThumbnailGenerated={onThumbnailGenerated}
          onStateChange={setThumbnailState}
        />
      )}
    </Link>
  );
}

export default DashboardCard;
