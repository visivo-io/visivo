import { useState, useCallback, useRef } from 'react';

export const useAttributeDropdown = (namedChildren) => {
  const [showDropdown, setShowDropdown] = useState(false);
  const [filteredChildren, setFilteredChildren] = useState([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const dropdownRef = useRef(null);
  const inputRef = useRef(null);

  const handleKeyDown = useCallback(e => {
    if (!showDropdown) return;

    switch (e.key) {
      case 'ArrowDown': {
        e.preventDefault();
        const nextIndex = Math.min(selectedIndex + 1, filteredChildren.length - 1);
        setSelectedIndex(nextIndex);
        break;
      }
      case 'ArrowUp': {
        e.preventDefault();
        const prevIndex = Math.max(selectedIndex - 1, 0);
        setSelectedIndex(prevIndex);
        break;
      }
      case 'Escape':
        setShowDropdown(false);
        break;
      default:
        break;
    }
  }, [showDropdown, selectedIndex, filteredChildren.length]);

  const handleMentionSearch = useCallback((searchTerm) => {
    const filtered = Object.keys(namedChildren).filter(child =>
      child.toLowerCase().includes(searchTerm.toLowerCase())
    );
    setFilteredChildren(filtered);
    setShowDropdown(filtered.length > 0);
    setSelectedIndex(0);
  }, [namedChildren]);

  return {
    showDropdown,
    setShowDropdown,
    filteredChildren,
    selectedIndex,
    setSelectedIndex,
    dropdownRef,
    inputRef,
    handleKeyDown,
    handleMentionSearch
  };
}; 