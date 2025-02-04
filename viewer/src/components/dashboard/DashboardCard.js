import React from 'react';
import { Link } from 'react-router-dom';
import { Badge } from 'flowbite-react';
import { HiTemplate } from 'react-icons/hi';

function DashboardCard({ dashboard, thumbnail }) {
  return (
    <Link to={dashboard.name} className="block h-full">
      <div className="h-full bg-white rounded-lg shadow-sm hover:shadow-lg transition-shadow duration-200">
        <div className="aspect-[16/10] rounded-t-lg overflow-hidden relative">
          {thumbnail ? (
            <div className="w-full h-full">
              <img 
                src={thumbnail} 
                alt={`Preview of ${dashboard.name}`}
                className="w-full h-full object-contain mix-blend-multiply"
                loading="lazy"
              />
            </div>
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <HiTemplate className="w-12 h-12 text-white/500" />
            </div>
          )}
          <div className="absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-black/50 to-transparent">
            <h3 className="text-lg font-semibold text-white line-clamp-1">
              {dashboard.name}
            </h3>
          </div>
        </div>
        
        <div className="p-4">
          {dashboard.description && (
            <p className="text-sm text-gray-600 mb-3 line-clamp-2">
              {dashboard.description}
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            {dashboard.type && (
              <Badge color="purple" size="sm" className="flex-shrink-0">
                {dashboard.type}
              </Badge>
            )}
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
      </div>
    </Link>
  );
}

export default DashboardCard; 