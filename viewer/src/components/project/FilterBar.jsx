import React from 'react';
import { Badge } from 'flowbite-react';
import { HiSearch } from 'react-icons/hi';

function FilterBar({
  searchTerm,
  setSearchTerm,
  selectedTags,
  setSelectedTags,
  availableTags,
  totalCount,
}) {
  return (
    <div className="mb-4">
      <div className="space-y-3">
        <div className="relative">
          <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none">
            <HiSearch className="h-4 w-4 text-primary-400" />
          </div>
          <input
            type="text"
            placeholder="Search dashboards..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="block w-full pl-10 pr-3 py-2 text-sm bg-white border border-gray-200 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-primary-500 focus:border-transparent placeholder-gray-400 transition-colors duration-200"
          />
        </div>
        {availableTags.length > 0 && (
          <div className="flex justify-between items-center">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Filter by tags</label>
              <div className="flex flex-wrap gap-1.5">
                {availableTags.map(tag => (
                  <Badge
                    key={tag}
                    color={selectedTags.includes(tag) ? 'purple' : 'gray'}
                    className={`cursor-pointer transform transition-all duration-200 hover:scale-105 ${
                      selectedTags.includes(tag) ? 'bg-primary-500' : 'bg-gray-100'
                    }`}
                    size="xs"
                    onClick={() => {
                      setSelectedTags(prev =>
                        prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]
                      );
                    }}
                  >
                    {tag}
                  </Badge>
                ))}
              </div>
            </div>
            <div className="text-sm text-gray-500 ml-4">
              {totalCount} dashboard{totalCount !== 1 ? 's' : ''}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default FilterBar;
