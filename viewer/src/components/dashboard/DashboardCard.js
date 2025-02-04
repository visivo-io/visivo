import React from 'react';
import { Link } from 'react-router-dom';
import { Badge } from 'flowbite-react';
import { HiTemplate } from 'react-icons/hi';

function DashboardCard({ dashboard, thumbnail }) {
  return (
    <Link to={dashboard.name} className="block h-full">
      <div className="h-full bg-white rounded-md shadow-sm hover:shadow-md transition-all duration-200 hover:scale-[1.02] border border-gray-100 group">
        <div className="aspect-[16/10] rounded-t-md overflow-hidden relative bg-gray-50">
          {thumbnail ? (
            <div className="w-full h-full">
              <img 
                src={thumbnail} 
                alt={`Preview of ${dashboard.name}`}
                className="w-full h-full object-cover mix-blend-multiply"
                loading="lazy"
              />
            </div>
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <HiTemplate className="w-8 h-8 text-primary-300" />
            </div>
          )}
          <div className="absolute top-0 left-0 right-0 p-1.5 bg-gradient-to-b from-black/50 to-transparent">
            <div className="flex flex-wrap gap-1">
              {dashboard.type && (
                <Badge color="purple" size="xs" className="flex-shrink-0 bg-primary-500 text-[10px]">
                  {dashboard.type}
                </Badge>
              )}
              {dashboard.tags && dashboard.tags.map(tag => (
                <Badge key={tag} color="gray" size="xs" className="flex-shrink-0 text-[10px]">
                  {tag}
                </Badge>
              ))}
            </div>
          </div>
        </div>
        
        <div className="p-2">
          <h3 className="text-sm font-medium text-gray-900 line-clamp-2 min-h-[2.0rem] mb-0">
            {dashboard.name}
          </h3>
          {dashboard.description && (
            <p className="text-xs text-gray-600 line-clamp-1 group-hover:line-clamp-none transition-all duration-200 min-h-[1.0rem]">
              {dashboard.description}
            </p>
          )}
        </div>
      </div>
    </Link>
  );
}

export default DashboardCard; 