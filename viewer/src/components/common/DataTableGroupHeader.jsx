import React from 'react';

const DataTableGroupHeader = ({ label }) => (
  <div className="flex items-center justify-center px-3 py-1.5 text-sm font-semibold text-secondary-700">
    {label}
  </div>
);

export default React.memo(DataTableGroupHeader);
