import { useState, useCallback, useRef, useEffect } from 'react';

export const useAttributeDropdown = (namedChildren) => {
  const [showDropdown, setShowDropdown] = useState(false);
  const [filteredChildren, setFilteredChildren] = useState([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [dropdownPosition, setDropdownPosition] = useState({ top: 0, left: 0 });
  const dropdownRef = useRef(null);
  const inputRef = useRef(null);

  const scrollSelectedIntoView = useCallback(index => {
    if (!dropdownRef.current) return;

    const dropdown = dropdownRef.current;
    const selectedElement = dropdown.children[index];

    if (!selectedElement) return;

    const dropdownRect = dropdown.getBoundingClientRect();
    const selectedRect = selectedElement.getBoundingClientRect();

    if (selectedRect.bottom > dropdownRect.bottom) {
      selectedElement.scrollIntoView({ block: 'nearest' });
    } else if (selectedRect.top < dropdownRect.top) {
      selectedElement.scrollIntoView({ block: 'nearest' });
    }
  }, []);

  const handleKeyDown = useCallback(e => {
    if (!showDropdown) return;

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        const nextIndex = Math.min(selectedIndex + 1, filteredChildren.length - 1);
        setSelectedIndex(nextIndex);
        scrollSelectedIntoView(nextIndex);
        break;
      case 'ArrowUp':
        e.preventDefault();
        const prevIndex = Math.max(selectedIndex - 1, 0);
        setSelectedIndex(prevIndex);
        scrollSelectedIntoView(prevIndex);
        break;
      case 'Escape':
        setShowDropdown(false);
        break;
      default:
        break;
    }
  }, [showDropdown, selectedIndex, filteredChildren.length, scrollSelectedIntoView]);

  const updateDropdownPosition = useCallback(() => {
    if (showDropdown && inputRef.current) {
      const rect = inputRef.current.getBoundingClientRect();
      setDropdownPosition({
        top: rect.bottom,
        left: rect.left,
        width: rect.width + 10,
      });
    }
  }, [showDropdown]);

  useEffect(() => {
    updateDropdownPosition();
  }, [showDropdown, updateDropdownPosition]);

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
    dropdownPosition,
    dropdownRef,
    inputRef,
    handleKeyDown,
    handleMentionSearch,
    updateDropdownPosition
  };
}; 