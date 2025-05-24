import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import debounce from 'lodash/debounce';
import useStore from '../../../../stores/store';
import ObjectPill from '../../ObjectPill';
import QueryPill from '../../QueryPill';
import ContextMenu from '../ContextMenu';
import Input from '../../../styled/Input';
import InputShell from '../../../common/InputShell';
import { useAttributeParser } from './attribute/useAttributeParser';
import { useAttributeDropdown } from './attribute/useAttributeDropdown';
import { useAttributeContextMenu } from './attribute/useAttributeContextMenu';
import AttributeDropdown from './attribute/AttributeDropdown';

function AttributeComponent({ name, value, path }) {
  const updateNamedChildAttribute = useStore(state => state.updateNamedChildAttribute);
  const namedChildren = useStore(state => state.namedChildren);
  const deleteNamedChildAttribute = useStore(state => state.deleteNamedChildAttribute);
  
  const [localValue, setLocalValue] = useState(value);
  const [clickTimeout, setClickTimeout] = useState(null);
  const pillRef = useRef(null);
  const inputShellRef = useRef(null);

  const {
    isJsonObject,
    parsedObject,
    isQueryValue,
    queryType,
    checkAndParseJson,
    setIsQueryValue,
    setQueryType,
    setIsJsonObject,
    setParsedObject
  } = useAttributeParser();

  const {
    showDropdown,
    setShowDropdown,
    filteredChildren,
    selectedIndex,
    setSelectedIndex,
    dropdownRef,
    inputRef,
    handleKeyDown,
    handleMentionSearch
  } = useAttributeDropdown(namedChildren);

  const {
    contextMenu,
    setContextMenu,
    handleContextMenu,
    handleDelete
  } = useAttributeContextMenu(() => deleteNamedChildAttribute(path));

  // Create a debounced update function
  const debouncedUpdate = useCallback(
    newValue => {
      updateNamedChildAttribute(path, newValue);
    },
    [path, updateNamedChildAttribute]
  );

  const debouncedUpdateFn = useMemo(() => debounce(debouncedUpdate, 300), [debouncedUpdate]);

  const handleChange = e => {
    const newValue = e.target.value;
    setLocalValue(newValue);

    if (newValue.includes('@')) {
      const searchTerm = newValue.split('@').pop()?.toLowerCase() || '';
      handleMentionSearch(searchTerm);
    } else {
      setShowDropdown(false);
    }

    checkAndParseJson(newValue);
    debouncedUpdateFn(newValue);
  };

  const handlePillClick = e => {
    e.preventDefault();

    if (clickTimeout) {
      clearTimeout(clickTimeout);
      setClickTimeout(null);
    } else {
      const timeout = setTimeout(() => {
        if (isJsonObject && parsedObject) {
          const atReference = `@${parsedObject.name}`;
          setLocalValue(atReference);
          setIsJsonObject(false);
          setParsedObject(null);
          debouncedUpdateFn(atReference);

          handleMentionSearch(parsedObject.name.toLowerCase());
          const currentIndex = filteredChildren.findIndex(child => 
            child.toLowerCase() === parsedObject.name.toLowerCase()
          );
          setSelectedIndex(currentIndex >= 0 ? currentIndex : 0);

          setShowDropdown(true);

          setTimeout(() => {
            if (inputRef.current) {
              inputRef.current.focus();
              const length = atReference.length;
              inputRef.current.setSelectionRange(length, length);
            }
          }, 0);
        }
        setClickTimeout(null);
      }, 200);

      setClickTimeout(timeout);
    }
  };

  const handleQueryChange = newValue => {
    if (newValue === 'none') {
      setIsQueryValue(false);
      setQueryType(null);
      setLocalValue('');
      debouncedUpdateFn('');
    } else {
      setLocalValue(newValue);
      debouncedUpdateFn(newValue);
    }
  };

  const handleDropdownSelect = (child) => {
    const reference = JSON.stringify({
      name: child,
      is_inline_defined: false,
      original_value: `\${ref(${child})}`,
    });
    setLocalValue(reference);
    checkAndParseJson(reference);
    debouncedUpdateFn(reference);
    setShowDropdown(false);
  };

  useEffect(() => {
    setLocalValue(value);
    checkAndParseJson(value);
  }, [value, checkAndParseJson]);

  useEffect(() => {
    return () => {
      debouncedUpdateFn.cancel();
    };
  }, [debouncedUpdateFn]);

  useEffect(() => {
    return () => {
      if (clickTimeout) {
        clearTimeout(clickTimeout);
      }
    };
  }, [clickTimeout]);

  const flexDirection = typeof name === 'string' ? 'flex-col' : 'flex-row';

  return (
    <div className={`flex ${flexDirection} items-center`} onContextMenu={handleContextMenu}>
      {isJsonObject && parsedObject ? (
        <InputShell label={name} hasContent={!!parsedObject}>
          <div onClick={handlePillClick} className="cursor-text w-full overflow-hidden whitespace-nowrap text-ellipsis" ref={pillRef}>
            <ObjectPill name={parsedObject.name} inline={parsedObject.is_inline_defined} className="w-full overflow-hidden whitespace-nowrap text-ellipsis" />
          </div>
        </InputShell>
      ) : isQueryValue ? (
        <InputShell label={name} hasContent={!!localValue} containerRef={inputShellRef}>
          <QueryPill
            value={localValue}
            onChange={handleQueryChange}
            isQueryFunction={queryType === 'function'}
            inputShellRef={inputShellRef}
          />
        </InputShell>
      ) : (
        <div className="relative w-full">
          <Input
            ref={inputRef}
            value={localValue}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            name={name}
            label={name}
          />
          <AttributeDropdown
            showDropdown={showDropdown}
            anchorRef={isJsonObject && parsedObject ? pillRef : inputRef}
            dropdownRef={dropdownRef}
            filteredChildren={filteredChildren}
            selectedIndex={selectedIndex}
            onSelect={handleDropdownSelect}
          />
        </div>
      )}

      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          onDelete={handleDelete}
          onClose={() => setContextMenu(null)}
        />
      )}
    </div>
  );
}

export default AttributeComponent;
