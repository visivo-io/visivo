import React, { useEffect, useState, useRef } from 'react';
import { Link } from 'react-router-dom';
import { Badge } from 'flowbite-react';
import { HiTemplate, HiExternalLink } from 'react-icons/hi';
import { useQuery } from '@tanstack/react-query';
import { useRouteLoaderData } from 'react-router-dom';
import DashboardThumbnail from './DashboardThumbnail';
import { useFetchDashboard } from '../../contexts/QueryContext';
import { getUrl } from '../../contexts/URLContext';
import { acquireThumbnailSlot } from './thumbnailQueue';

const GENERATING_THUMBNAIL_URL = 'GENERATING';

function DashboardCard({ projectId, dashboard }) {
  const project = useRouteLoaderData('project');
  const [imageUrl, setImageUrl] = useState(null);
  const [shouldStartThumbnail, setShouldStartThumbnail] = useState(false);
  const cardRef = useRef(null);
  const releaseSlotRef = useRef(null);
  const fetchDashboard = useFetchDashboard();

  const releaseSlot = () => {
    if (releaseSlotRef.current) {
      releaseSlotRef.current();
      releaseSlotRef.current = null;
    }
  };

  const { data: dashboardData } = useQuery({
    queryKey: ['dashboard', projectId, dashboard.name],
    queryFn: () => fetchDashboard(projectId, dashboard.name),
  });

  const onThumbnailGenerated = async blob => {
    try {
      const formData = new FormData();
      formData.append('file', blob, `${dashboard.name}.png`);

      let url = getUrl('dashboardThumbnail', { name: dashboard.name });
      const response = await fetch(url, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        throw new Error(`Upload failed: ${response.status}`);
      }

      const json = await response.json();
      setImageUrl(json.signed_thumbnail_file_url);
    } catch (error) {
      // Error uploading thumbnail
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

  // Acquire a slot from the shared thumbnail queue before kicking off
  // generation. The slot is released when the thumbnail finishes (success or
  // error) or when the card unmounts.
  useEffect(() => {
    if (
      shouldStartThumbnail ||
      !dashboardData ||
      dashboardData.signed_thumbnail_file_url ||
      imageUrl ||
      !project ||
      // External dashboards don't render <DashboardThumbnail> (see render
      // branch below), so they have no flow that would release the slot.
      // Skipping acquisition entirely keeps the strictly-serial queue moving.
      dashboard.type === 'external'
    ) {
      return undefined;
    }

    let cancelled = false;
    const schedule = () => {
      acquireThumbnailSlot().then(release => {
        if (cancelled) {
          release();
          return;
        }
        releaseSlotRef.current = release;
        setShouldStartThumbnail(true);
      });
    };

    if (typeof requestIdleCallback !== 'undefined') {
      requestIdleCallback(schedule, { timeout: 1000 });
    } else {
      setTimeout(schedule, 500);
    }

    return () => {
      cancelled = true;
    };
  }, [shouldStartThumbnail, dashboardData, imageUrl, project, dashboard.name, dashboard.type]);

  // Release the slot whenever generation has settled — either we got an image
  // back from the upload, or the card is going away.
  useEffect(() => {
    if (imageUrl) {
      releaseSlot();
    }
  }, [imageUrl]);

  useEffect(() => {
    return () => {
      releaseSlot();
    };
  }, []);

  const needThumbnail =
    shouldStartThumbnail &&
    !!dashboardData &&
    !dashboardData.signed_thumbnail_file_url &&
    !imageUrl &&
    !!project;

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
            {/* No progress indicators shown - thumbnails generate silently in background */}
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
      {needThumbnail && (
        <DashboardThumbnail
          dashboard={dashboard}
          project={project}
          onThumbnailGenerated={onThumbnailGenerated}
          onSettled={releaseSlot}
        />
      )}
    </Link>
  );
}

export default DashboardCard;
