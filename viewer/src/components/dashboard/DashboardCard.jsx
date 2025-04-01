import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Badge } from 'flowbite-react';
import { HiTemplate, HiExternalLink } from 'react-icons/hi';

function DashboardCard({ dashboard, thumbnail }) {
  const [imageUrl, setImageUrl] = useState(null);

  useEffect(() => {
    if (thumbnail instanceof Blob) {
      const url = URL.createObjectURL(thumbnail);
      setImageUrl(url);
      return () => URL.revokeObjectURL(url);
    }
  }, [thumbnail]);

  const CardContent = () => (
    <div className="h-full bg-white rounded-md shadow-2xs hover:shadow-md transition-all duration-200 hover:scale-[1.02] border border-gray-100 group">
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
              <Badge key={tag} color="gray" size="xs" className="shrink-0 text-[10px]">{tag}</Badge>
            ))}
          </div>
        </div>
        <div className="absolute bottom-0 left-0 right-0 h-3 bg-linear-to-t from-black/20 to-transparent" />
        {dashboard.type === 'external' && (
          <div className="absolute bottom-0 left-0 p-1.5">
            <Badge color="blue" size="xs" className="shrink-0 text-[10px] flex items-center gap-1 group/badge">
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