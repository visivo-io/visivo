import { useState, useCallback, useRef } from 'react';

export const useAttributeDropdown = namedChildren => {
  const [showDropdown, setShowDropdown] = useState(false);
  const [filteredChildren, setFilteredChildren] = useState([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const dropdownRef = useRef(null);
  const inputRef = useRef(null);

  const handleKeyDown = useCallback(
    e => {
      if (!showDropdown) return;

      switch (e.key) {
        case 'ArrowDown': {
          e.preventDefault();
          setSelectedIndex(prev => Math.min(prev + 1, filteredChildren.length - 1));
          break;
        }
        case 'ArrowUp': {
          e.preventDefault();
          setSelectedIndex(prev => Math.max(prev - 1, 0));
          break;
        }
        case 'Escape':
          setShowDropdown(false);
          break;
        default:
          break;
      }
    },
    [showDropdown, filteredChildren.length]
  );

  const handleMentionSearch = useCallback(
    searchTerm => {
      const filtered = Object.keys(namedChildren).filter(child =>
        child.toLowerCase().includes(searchTerm.toLowerCase())
      );
      setFilteredChildren(filtered);
      setShowDropdown(filtered.length > 0);
      setSelectedIndex(0);
    },
    [namedChildren]
  );

  return {
    showDropdown,
    setShowDropdown,
    filteredChildren,
    selectedIndex,
    setSelectedIndex,
    dropdownRef,
    inputRef,
    handleKeyDown,
    handleMentionSearch,
  };
};
