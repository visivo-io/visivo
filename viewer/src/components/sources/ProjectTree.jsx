import React, { useEffect } from 'react';
import useStore from '../../stores/store';
import AddIcon from '@mui/icons-material/Add';
import StorageIcon from '@mui/icons-material/Storage';

// Status indicator colors
const STATUS_COLORS = {
  new: 'bg-green-500',
  modified: 'bg-amber-500',
  published: '', // No indicator
};

const StatusDot = ({ status }) => {
  if (!status || status === 'published') return null;

  return (
    <span
      className={`
        inline-block w-2 h-2 rounded-full ml-2
        ${STATUS_COLORS[status] || ''}
      `}
      title={status === 'new' ? 'New (unsaved)' : 'Modified'}
    />
  );
};

const ProjectTree = () => {
  const {
    sources,
    sourcesLoading,
    sourcesError,
    fetchSources,
    openEditModal,
    openCreateModal,
  } = useStore();

  // Fetch sources on mount
  useEffect(() => {
    fetchSources();
  }, [fetchSources]);

  const handleSourceClick = source => {
    openEditModal(source);
  };

  const handleCreateClick = () => {
    openCreateModal();
  };

  return (
    <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-gray-50 border-b border-gray-200">
        <div className="flex items-center gap-2">
          <StorageIcon fontSize="small" className="text-gray-500" />
          <span className="text-sm font-medium text-gray-700">Sources</span>
          <span className="text-xs text-gray-400">({sources.length})</span>
        </div>
        <button
          onClick={handleCreateClick}
          className="p-1 rounded hover:bg-gray-200 transition-colors"
          title="Add new source"
        >
          <AddIcon fontSize="small" className="text-gray-600" />
        </button>
      </div>

      {/* Content */}
      <div className="p-2">
        {sourcesLoading && (
          <div className="py-4 text-center text-sm text-gray-500">
            Loading sources...
          </div>
        )}

        {sourcesError && (
          <div className="py-4 text-center text-sm text-red-500">
            Error: {sourcesError}
          </div>
        )}

        {!sourcesLoading && !sourcesError && sources.length === 0 && (
          <div className="py-4 text-center text-sm text-gray-500">
            No sources configured.
            <button
              onClick={handleCreateClick}
              className="block mx-auto mt-2 text-primary-500 hover:text-primary-600"
            >
              Add your first source
            </button>
          </div>
        )}

        {!sourcesLoading && sources.length > 0 && (
          <ul className="space-y-1">
            {sources.map(source => (
              <li key={source.name}>
                <button
                  onClick={() => handleSourceClick(source)}
                  className="
                    w-full text-left px-3 py-2 rounded-md text-sm
                    flex items-center justify-between
                    hover:bg-gray-100 transition-colors
                    focus:outline-none focus:ring-2 focus:ring-primary-500
                  "
                >
                  <span className="flex items-center">
                    <span className="text-gray-700">{source.name}</span>
                    <StatusDot status={source.status} />
                  </span>
                  <span className="text-xs text-gray-400">{source.type}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
};

export default ProjectTree;
