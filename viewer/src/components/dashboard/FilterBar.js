import React from 'react';
import { Badge } from 'flowbite-react';
import { HiSearch } from 'react-icons/hi';

function FilterBar({ searchTerm, setSearchTerm, selectedTags, setSelectedTags, availableTags }) {
  return (
    <div className="mb-8">
      <div className="space-y-4">
        <div className="relative">
          <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none">
            <HiSearch className="h-4 w-4 text-gray-500" />
          </div>
          <input
            type="text"
            placeholder="Search dashboards..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="block w-full pl-10 pr-3 py-2 text-sm bg-gray-50 border border-gray-200 rounded-full focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent placeholder-gray-500"
          />
        </div>
        {availableTags.length > 0 && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Filter by tags
            </label>
            <div className="flex flex-wrap gap-2">
              {availableTags.map(tag => (
                <Badge
                  key={tag}
                  color={selectedTags.includes(tag) ? "info" : "gray"}
                  className="cursor-pointer transform transition-all duration-200 hover:scale-105"
                  onClick={() => {
                    setSelectedTags(prev =>
                      prev.includes(tag)
                        ? prev.filter(t => t !== tag)
                        : [...prev, tag]
                    );
                  }}
                >
                  {tag}
                </Badge>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default FilterBar; 