import React from 'react';
import DashboardCard from './DashboardCard';

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

export default DashboardSection; 