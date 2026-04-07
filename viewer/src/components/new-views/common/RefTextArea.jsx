import React, { useState, useRef, useMemo, useCallback, useEffect } from 'react';
import { createPortal } from 'react-dom';
import useStore from '../../../stores/store';
import { getTypeByValue, DEFAULT_COLORS } from './objectTypeConfigs';
import { parseTextWithRefs } from '../../../utils/contextString';
import { serializeContentEditableToRefString } from '../../../utils/contextString';
import { formatRefExpression } from '../../../utils/refString';

/**
 * RefTextArea - Inline contentEditable editor for expressions with ref() syntax
 *
 * Features:
 * - Always-editable field with pills rendered inline (no mode switching)
 * - Pills are atomic (contentEditable="false") colored spans
 * - Type @ to insert references via filtered dropdown
 * - DnD drops insert at cursor position (or replace if no cursor)
 * - Accessor dropdown for input pill properties
 *
 * Props:
 * - value: Current text value (raw ref string)
 * - onChange: Callback when value changes
 * - allowedTypes: Array of object types that can be referenced
 * - label: Label for the field
 * - error: Error message to display
 * - required: Whether the field is required
 * - disabled: Whether the field is disabled
 * - rows: Number of rows (approximate height)
 * - helperText: Helper text shown below the editor
 * - hideAddButton: Whether to hide add-ref affordances
 */
const RefTextArea = ({
  value = '',
  onChange,
  allowedTypes = ['model', 'dimension', 'metric', 'source'],
  label,
  error,
  required = false,
  disabled = false,
  rows = 4,
  helperText,
  hideAddButton = false,
}) => {
  const editableRef = useRef(null);
  const containerRef = useRef(null);
  const isFocusedRef = useRef(false);
  const savedCursorOffsetRef = useRef(null);
  const isComposingRef = useRef(false);

  // Store access for objects and inputs
  const sources = useStore(state => state.sources);
  const models = useStore(state => state.models);
  const dimensions = useStore(state => state.dimensions);
  const metrics = useStore(state => state.metrics);
  const relations = useStore(state => state.relations);
  const inputs = useStore(state => state.inputs);
  const modelStates = useStore(state => state.explorerModelStates);

  // Build list of available objects based on allowed types
  // For models: show columns as "model.column" entries instead of raw model names
  const availableObjects = useMemo(() => {
    const objects = [];
    if (allowedTypes.includes('source')) {
      (sources || []).forEach(obj => objects.push({ name: obj.name, type: 'source', config: obj.config }));
    }
    if (allowedTypes.includes('model')) {
      (models || []).forEach(obj => {
        // Get columns from the model's query result or enriched result
        const modelState = modelStates?.[obj.name];
        const enriched = modelState?.enrichedResult;
        const queryResult = modelState?.queryResult;
        const columns = enriched?.columns || queryResult?.columns || [];

        if (columns.length > 0) {
          // Show each column as a "model.column" entry
          columns.forEach(colName => {
            objects.push({
              name: obj.name,
              type: 'model',
              property: colName,
              displayName: `${obj.name}.${colName}`,
              config: obj.config,
            });
          });
        } else {
          // No columns available — show model as-is (fallback for API-loaded models)
          objects.push({ name: obj.name, type: 'model', config: obj.config });
        }
      });
    }
    if (allowedTypes.includes('dimension')) {
      (dimensions || []).forEach(obj => objects.push({ name: obj.name, type: 'dimension', config: obj.config }));
    }
    if (allowedTypes.includes('metric')) {
      (metrics || []).forEach(obj => objects.push({ name: obj.name, type: 'metric', config: obj.config }));
    }
    if (allowedTypes.includes('relation')) {
      (relations || []).forEach(obj => objects.push({ name: obj.name, type: 'relation', config: obj.config }));
    }
    if (allowedTypes.includes('input')) {
      (inputs || []).forEach(obj => objects.push({ name: obj.name, type: 'input', config: obj.config }));
    }
    return objects;
  }, [allowedTypes, sources, models, dimensions, metrics, relations, inputs, modelStates]);

  const getObjectTypeByName = useCallback(
    name => {
      const obj = availableObjects.find(o => o.name === name);
      return obj?.type || null;
    },
    [availableObjects]
  );

  // Accessor dropdown for input pills
  const [accessorDropdown, setAccessorDropdown] = useState(null);
  const accessorAnchorRef = useRef(null);

  const getInputAccessors = useCallback((refName) => {
    const input = (inputs || []).find(i => i.name === refName);
    if (!input) return null;
    const inputType = input.config?.type;
    if (inputType === 'multi-select') return ['values', 'first', 'last', 'min', 'max'];
    return ['value'];
  }, [inputs]);

  const handleAccessorChange = useCallback((refName, oldAccessor, newAccessor) => {
    if (oldAccessor === newAccessor) {
      setAccessorDropdown(null);
      return;
    }
    const oldRef = formatRefExpression(refName, oldAccessor);
    const newRef = formatRefExpression(refName, newAccessor);
    const updated = (value || '').replace(oldRef, newRef);
    // Force DOM rebuild since clicking the accessor may have focused the contentEditable
    isFocusedRef.current = false;
    onChange(updated);
    setAccessorDropdown(null);
  }, [value, onChange]);

  // @ mention state
  const [mentionState, setMentionState] = useState({ active: false, query: '', rect: null, selectedIndex: 0 });

  // Filtered objects for @ mention — search against displayName or name
  const mentionFilteredObjects = useMemo(() => {
    if (!mentionState.active) return [];
    const query = mentionState.query.toLowerCase();
    return availableObjects.filter(obj => {
      const searchTarget = (obj.displayName || obj.name).toLowerCase();
      return !query || searchTarget.includes(query);
    });
  }, [mentionState.active, mentionState.query, availableObjects]);

  // Group mention objects by type
  const mentionGroupedObjects = useMemo(() => {
    const groups = {};
    mentionFilteredObjects.forEach(obj => {
      if (!groups[obj.type]) groups[obj.type] = [];
      groups[obj.type].push(obj);
    });
    return groups;
  }, [mentionFilteredObjects]);

  // Flat list for keyboard navigation
  const mentionFlatList = useMemo(() => {
    const list = [];
    Object.entries(mentionGroupedObjects).forEach(([, objects]) => {
      objects.forEach(obj => list.push(obj));
    });
    return list;
  }, [mentionGroupedObjects]);

  // --- DOM Building ---

  const getPillColors = useCallback((name, property) => {
    const type = property
      ? (getObjectTypeByName(property) || getObjectTypeByName(name))
      : getObjectTypeByName(name);
    const typeConfig = type ? getTypeByValue(type) : null;
    return typeConfig?.colors || DEFAULT_COLORS;
  }, [getObjectTypeByName]);

  const createPillElement = useCallback((name, property) => {
    const colors = getPillColors(name, property);
    const inputAccessors = property ? getInputAccessors(name) : null;
    const isAccessorClickable = inputAccessors && inputAccessors.length > 1;

    const pill = document.createElement('span');
    pill.setAttribute('contenteditable', 'false');
    pill.setAttribute('data-ref-name', name);
    if (property) pill.setAttribute('data-ref-property', property);
    pill.className = `inline-flex items-center gap-0.5 px-1.5 py-0.5 mx-0.5 rounded text-xs font-medium cursor-text align-middle ${colors.bg} ${colors.text}`;

    const nameSpan = document.createElement('span');
    nameSpan.textContent = name;
    pill.appendChild(nameSpan);

    if (property) {
      const propSpan = document.createElement('span');
      propSpan.textContent = `.${property}`;
      propSpan.className = `${isAccessorClickable ? 'cursor-pointer hover:underline' : ''} opacity-70`;
      if (isAccessorClickable) {
        propSpan.setAttribute('data-testid', `accessor-${name}`);
        propSpan.setAttribute('data-accessor-name', name);
        propSpan.setAttribute('data-accessor-property', property);
      }
      pill.appendChild(propSpan);
    }

    return pill;
  }, [getPillColors, getInputAccessors]);

  const buildDOMFromValue = useCallback((val) => {
    const el = editableRef.current;
    if (!el) return;

    // Clear existing content
    while (el.firstChild) el.removeChild(el.firstChild);

    if (!val) return;

    const segments = parseTextWithRefs(val);
    // Use zero-width space (\u200B) for cursor positioning around pills
    const ZWS = '\u200B';

    // Ensure there's a text node before the first pill for cursor placement
    if (segments.length > 0 && segments[0].type === 'ref') {
      el.appendChild(document.createTextNode(ZWS));
    }

    segments.forEach((segment, i) => {
      if (segment.type === 'ref') {
        const pill = createPillElement(segment.name, segment.property);
        el.appendChild(pill);
        // Ensure there's a text node after each pill for cursor placement
        const next = segments[i + 1];
        if (!next || next.type === 'ref') {
          el.appendChild(document.createTextNode(ZWS));
        }
      } else {
        const textNode = document.createTextNode(segment.content);
        el.appendChild(textNode);
      }
    });
  }, [createPillElement]);

  // Sync DOM from value prop when not focused
  useEffect(() => {
    if (!isFocusedRef.current) {
      buildDOMFromValue(value);
    }
  }, [value, buildDOMFromValue]);

  // --- Serialization ---

  const serializeAndUpdate = useCallback(() => {
    const el = editableRef.current;
    if (!el) return;
    const serialized = serializeContentEditableToRefString(el);
    onChange(serialized);
  }, [onChange]);

  // --- Event Handlers ---

  const handleInput = useCallback(() => {
    if (isComposingRef.current) return;

    // Check for @ mention trigger
    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0) {
      const range = sel.getRangeAt(0);
      const node = range.startContainer;
      if (node.nodeType === Node.TEXT_NODE) {
        const text = node.textContent;
        const offset = range.startOffset;
        // Walk backward to find @
        let atIndex = -1;
        for (let i = offset - 1; i >= 0; i--) {
          const ch = text[i];
          if (ch === '@') {
            atIndex = i;
            break;
          }
          if (ch === ' ' || ch === '\n') break;
        }
        if (atIndex >= 0) {
          const query = text.slice(atIndex + 1, offset);
          // Get position for dropdown
          const tempRange = document.createRange();
          tempRange.setStart(node, atIndex);
          tempRange.setEnd(node, atIndex + 1);
          const rect = tempRange.getBoundingClientRect();
          setMentionState({ active: true, query, rect, selectedIndex: 0 });
          serializeAndUpdate();
          return;
        }
      }
    }

    // Close mention if open and no @ found
    if (mentionState.active) {
      setMentionState({ active: false, query: '', rect: null, selectedIndex: 0 });
    }

    serializeAndUpdate();
  }, [serializeAndUpdate, mentionState.active]);

  // Ref to hold insertMentionItem so handleKeyDown can call it without circular deps
  const insertMentionItemRef = useRef(null);

  const handleKeyDown = useCallback((e) => {
    // Handle @ mention keyboard navigation
    if (mentionState.active) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setMentionState(prev => ({
          ...prev,
          selectedIndex: Math.min(prev.selectedIndex + 1, mentionFlatList.length - 1),
        }));
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setMentionState(prev => ({
          ...prev,
          selectedIndex: Math.max(prev.selectedIndex - 1, 0),
        }));
        return;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        const selected = mentionFlatList[mentionState.selectedIndex];
        if (selected && insertMentionItemRef.current) {
          insertMentionItemRef.current(selected);
        }
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        setMentionState({ active: false, query: '', rect: null, selectedIndex: 0 });
        return;
      }
    }

    // Handle backspace at pill boundary
    if (e.key === 'Backspace') {
      const sel = window.getSelection();
      if (sel && sel.rangeCount > 0 && sel.isCollapsed) {
        const range = sel.getRangeAt(0);
        const node = range.startContainer;
        const offset = range.startOffset;

        // Check if cursor is at the start of a text node that follows a pill
        if (node.nodeType === Node.TEXT_NODE && offset === 0) {
          const prev = node.previousSibling;
          if (prev && prev.nodeType === Node.ELEMENT_NODE && prev.hasAttribute('data-ref-name')) {
            e.preventDefault();
            prev.remove();
            serializeAndUpdate();
            return;
          }
        }

        // Check if cursor is in the container and the previous child is a pill
        if (node === editableRef.current) {
          const childAtOffset = node.childNodes[offset - 1];
          if (childAtOffset && childAtOffset.nodeType === Node.ELEMENT_NODE && childAtOffset.hasAttribute('data-ref-name')) {
            e.preventDefault();
            childAtOffset.remove();
            serializeAndUpdate();
            return;
          }
        }
      }
    }

    // Prevent Enter for single-line fields
    if (e.key === 'Enter' && rows <= 2) {
      e.preventDefault();
    }
  }, [mentionState, mentionFlatList, rows, serializeAndUpdate]);

  const handleFocus = useCallback(() => {
    isFocusedRef.current = true;
    savedCursorOffsetRef.current = null;
  }, []);

  const handleBlur = useCallback(() => {
    isFocusedRef.current = false;

    // Save cursor offset for potential DnD insertion
    const el = editableRef.current;
    if (el) {
      const sel = window.getSelection();
      if (sel && sel.rangeCount > 0) {
        const range = sel.getRangeAt(0);
        if (el.contains(range.startContainer)) {
          // Compute character offset by serializing up to cursor
          let offset = 0;
          const walkForOffset = (node) => {
            if (node === range.startContainer) {
              if (node.nodeType === Node.TEXT_NODE) {
                offset += range.startOffset;
              }
              return true;
            }
            if (node.nodeType === Node.TEXT_NODE) {
              offset += node.textContent.length;
            } else if (node.nodeType === Node.ELEMENT_NODE && node.hasAttribute('data-ref-name')) {
              const refName = node.getAttribute('data-ref-name');
              const refProp = node.getAttribute('data-ref-property');
              offset += refProp ? `\${ref(${refName}).${refProp}}`.length : `\${ref(${refName})}`.length;
            } else if (node.nodeType === Node.ELEMENT_NODE) {
              for (const child of node.childNodes) {
                if (walkForOffset(child)) return true;
              }
            }
            return false;
          };
          for (const child of el.childNodes) {
            if (walkForOffset(child)) break;
          }
          savedCursorOffsetRef.current = offset;
        }
      }
    }

    // Serialize final state
    serializeAndUpdate();

    // Close mention dropdown on blur (with delay for click events)
    setTimeout(() => {
      if (!isFocusedRef.current) {
        setMentionState({ active: false, query: '', rect: null, selectedIndex: 0 });
      }
    }, 200);
  }, [serializeAndUpdate]);

  const handleCompositionStart = useCallback(() => {
    isComposingRef.current = true;
  }, []);

  const handleCompositionEnd = useCallback(() => {
    isComposingRef.current = false;
    handleInput();
  }, [handleInput]);

  // Handle paste - parse for refs and render as pills
  const handlePaste = useCallback((e) => {
    e.preventDefault();
    const text = e.clipboardData.getData('text/plain');
    if (!text) return;

    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return;

    const range = sel.getRangeAt(0);
    range.deleteContents();

    // Parse pasted text for refs
    const segments = parseTextWithRefs(text);
    segments.forEach(segment => {
      if (segment.type === 'ref') {
        const pill = createPillElement(segment.name, segment.property);
        range.insertNode(pill);
        range.setStartAfter(pill);
      } else {
        const textNode = document.createTextNode(segment.content);
        range.insertNode(textNode);
        range.setStartAfter(textNode);
      }
    });

    range.collapse(false);
    sel.removeAllRanges();
    sel.addRange(range);

    serializeAndUpdate();
  }, [createPillElement, serializeAndUpdate]);

  // Handle copy - serialize pills as ref strings
  const handleCopy = useCallback((e) => {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return;

    const range = sel.getRangeAt(0);
    const fragment = range.cloneContents();

    // Serialize the selected fragment
    const tempDiv = document.createElement('div');
    tempDiv.appendChild(fragment);
    const serialized = serializeContentEditableToRefString(tempDiv);

    e.preventDefault();
    e.clipboardData.setData('text/plain', serialized);
  }, []);

  // Handle click for accessor dropdown
  const handleClick = useCallback((e) => {
    const target = e.target;
    const accessorName = target.getAttribute('data-accessor-name');
    if (accessorName) {
      e.stopPropagation();
      accessorAnchorRef.current = target;
      const property = target.getAttribute('data-accessor-property');
      const isOpen = accessorDropdown?.name === accessorName;
      setAccessorDropdown(isOpen ? null : { name: accessorName, property });
    }
  }, [accessorDropdown]);

  // After any click, if the browser selected a pill as a block or placed the caret
  // at a container-level offset, resolve it to a text node position so the caret is visible.
  useEffect(() => {
    const el = editableRef.current;
    if (!el) return;

    const resolveCursorToTextNode = (clickX) => {
      const sel = window.getSelection();
      if (!sel || sel.rangeCount === 0) return;
      const range = sel.getRangeAt(0);
      const anchor = range.startContainer;

      // Already in a text node outside any pill — browser handled it correctly
      if (anchor.nodeType === Node.TEXT_NODE && el.contains(anchor)) {
        const insidePill = anchor.parentElement?.closest?.('[data-ref-name]');
        if (!insidePill) return; // Valid position in editable text
        // Cursor landed inside a pill's text — fall through to relocate
      }

      // Find the nearest pill to the click and place cursor beside it
      const pills = el.querySelectorAll('[data-ref-name]');
      if (pills.length === 0) return;

      let nearestPill = null;
      let nearestDist = Infinity;
      let nearestSide = 'after';

      pills.forEach(p => {
        const rect = p.getBoundingClientRect();
        const midX = rect.left + rect.width / 2;
        const dist = Math.abs(clickX - midX);
        if (dist < nearestDist) {
          nearestDist = dist;
          nearestPill = p;
          nearestSide = clickX < midX ? 'before' : 'after';
        }
      });

      if (nearestPill) {
        const sibling = nearestSide === 'before'
          ? nearestPill.previousSibling
          : nearestPill.nextSibling;
        if (sibling && sibling.nodeType === Node.TEXT_NODE) {
          const newRange = document.createRange();
          const pos = nearestSide === 'after' && sibling.textContent.startsWith('\u200B') ? 1 : sibling.textContent.length;
          newRange.setStart(sibling, Math.min(pos, sibling.textContent.length));
          newRange.collapse(true);
          sel.removeAllRanges();
          sel.addRange(newRange);
        }
      }
    };

    const handler = (e) => {
      if (e.target.getAttribute?.('data-accessor-name')) return;
      // Microtask to run after browser finalizes selection
      const clickX = e.clientX;
      Promise.resolve().then(() => resolveCursorToTextNode(clickX));
    };

    el.addEventListener('click', handler);
    return () => el.removeEventListener('click', handler);
  }, []);

  // Close accessor dropdown on outside click
  useEffect(() => {
    if (!accessorDropdown) return;
    const handler = (e) => {
      if (accessorAnchorRef.current && !accessorAnchorRef.current.contains(e.target)) {
        setAccessorDropdown(null);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [accessorDropdown]);

  // --- @ Mention Insertion ---

  const insertMentionItem = useCallback((item) => {
    const el = editableRef.current;
    if (!el) return;

    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return;

    const range = sel.getRangeAt(0);
    const node = range.startContainer;

    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent;
      const offset = range.startOffset;

      // Find the @ trigger
      let atIndex = -1;
      for (let i = offset - 1; i >= 0; i--) {
        if (text[i] === '@') { atIndex = i; break; }
        if (text[i] === ' ' || text[i] === '\n') break;
      }

      if (atIndex >= 0) {
        // Remove @query text
        const before = text.slice(0, atIndex);
        const after = text.slice(offset);

        // Build pill
        const pill = createPillElement(item.name, item.property || null);

        // Replace text node content
        node.textContent = before;

        // Insert pill after the remaining text
        if (node.nextSibling) {
          el.insertBefore(pill, node.nextSibling);
        } else {
          el.appendChild(pill);
        }

        // Insert remaining text after pill (use ZWS for cursor positioning)
        const ZWS = '\u200B';
        const afterContent = after || ZWS;
        const afterNode = document.createTextNode(afterContent);
        if (pill.nextSibling) {
          el.insertBefore(afterNode, pill.nextSibling);
        } else {
          el.appendChild(afterNode);
        }
        // Place cursor after ZWS (or at start of after text)
        const cursorPos = after ? 0 : 1;
        const newRange = document.createRange();
        newRange.setStart(afterNode, cursorPos);
        newRange.collapse(true);
        sel.removeAllRanges();
        sel.addRange(newRange);

        // Clean up: if before was empty, also add ZWS before pill for cursor placement
        if (!before) {
          node.textContent = ZWS;
        }
      }
    }

    setMentionState({ active: false, query: '', rect: null, selectedIndex: 0 });
    serializeAndUpdate();
  }, [createPillElement, serializeAndUpdate]);

  // Keep ref in sync with latest insertMentionItem
  insertMentionItemRef.current = insertMentionItem;

  // --- DnD Cursor-Aware Insertion ---

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const handler = (e) => {
      const { refExpr } = e.detail;
      if (!refExpr || !editableRef.current) return;

      // Parse the ref expression to get name and property
      const segments = parseTextWithRefs(refExpr);
      const refSegment = segments.find(s => s.type === 'ref');
      if (!refSegment) return;

      const pill = createPillElement(refSegment.name, refSegment.property);
      const editable = editableRef.current;

      if (savedCursorOffsetRef.current !== null) {
        // Insert at saved cursor position
        const targetOffset = savedCursorOffsetRef.current;
        let currentOffset = 0;
        let inserted = false;

        for (const child of [...editable.childNodes]) {
          if (inserted) break;

          if (child.nodeType === Node.TEXT_NODE) {
            const len = child.textContent.length;
            if (currentOffset + len >= targetOffset) {
              const splitAt = targetOffset - currentOffset;
              if (splitAt < len) {
                const afterText = child.splitText(splitAt);
                editable.insertBefore(pill, afterText);
              } else {
                if (child.nextSibling) {
                  editable.insertBefore(pill, child.nextSibling);
                } else {
                  editable.appendChild(pill);
                }
              }
              inserted = true;
            }
            currentOffset += len;
          } else if (child.nodeType === Node.ELEMENT_NODE && child.hasAttribute('data-ref-name')) {
            const refName = child.getAttribute('data-ref-name');
            const refProp = child.getAttribute('data-ref-property');
            const refLen = refProp ? `\${ref(${refName}).${refProp}}`.length : `\${ref(${refName})}`.length;
            if (currentOffset + refLen >= targetOffset) {
              if (child.nextSibling) {
                editable.insertBefore(pill, child.nextSibling);
              } else {
                editable.appendChild(pill);
              }
              inserted = true;
            }
            currentOffset += refLen;
          }
        }

        if (!inserted) {
          editable.appendChild(pill);
        }

        savedCursorOffsetRef.current = null;
      } else {
        // No cursor — append to end
        editable.appendChild(pill);
      }

      serializeAndUpdate();
    };

    el.addEventListener('ref-insert-at-cursor', handler);
    return () => el.removeEventListener('ref-insert-at-cursor', handler);
  }, [createPillElement, serializeAndUpdate]);

  // --- Render ---

  const editorMinHeight = Math.max(40, rows * 20);
  const hasCursor = isFocusedRef.current || savedCursorOffsetRef.current !== null;

  // Accessor dropdown portal
  const accessorDropdownPortal = accessorDropdown && accessorAnchorRef.current
    ? createPortal(
        <div
          className="fixed bg-white border border-gray-200 rounded shadow-lg min-w-[100px]"
          style={{
            zIndex: 9999,
            top: accessorAnchorRef.current.getBoundingClientRect().bottom + 2,
            left: accessorAnchorRef.current.getBoundingClientRect().left,
          }}
          data-testid={`accessor-dropdown-${accessorDropdown.name}`}
          onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); }}
        >
          {(getInputAccessors(accessorDropdown.name) || []).map(acc => (
            <button
              key={acc}
              type="button"
              className={`block w-full text-left px-3 py-1.5 text-xs hover:bg-gray-100 ${acc === accessorDropdown.property ? 'font-bold bg-gray-50' : ''}`}
              onClick={(e) => {
                e.stopPropagation();
                handleAccessorChange(accessorDropdown.name, accessorDropdown.property, acc);
              }}
              data-testid={`accessor-option-${acc}`}
            >
              .{acc}
            </button>
          ))}
        </div>,
        document.body
      )
    : null;

  // @ mention dropdown portal
  const mentionDropdownPortal = mentionState.active && mentionState.rect
    ? createPortal(
        <div
          className="fixed bg-white border border-gray-200 rounded-lg shadow-lg w-72 max-h-80 overflow-y-auto"
          style={{
            zIndex: 9999,
            top: mentionState.rect.bottom + 4,
            left: mentionState.rect.left,
          }}
          data-testid="mention-dropdown"
          onMouseDown={(e) => e.preventDefault()}
        >
          {mentionFlatList.length === 0 ? (
            <div className="p-3 text-center text-sm text-gray-500">No matching objects</div>
          ) : (
            Object.entries(mentionGroupedObjects).map(([type, objects]) => {
              const typeConfig = getTypeByValue(type);
              const colors = typeConfig?.colors || DEFAULT_COLORS;

              return (
                <div key={type}>
                  <div className={`px-3 py-1.5 text-xs font-medium uppercase tracking-wide sticky top-0 ${colors.bg} ${colors.text}`}>
                    {typeConfig?.label || type}
                  </div>
                  {objects.map(obj => {
                    const flatIdx = mentionFlatList.indexOf(obj);
                    const isSelected = flatIdx === mentionState.selectedIndex;
                    const itemKey = obj.displayName || obj.name;
                    return (
                      <button
                        key={`${type}-${itemKey}`}
                        type="button"
                        onClick={() => insertMentionItem(obj)}
                        className={`w-full px-3 py-2 flex items-center gap-2 text-left transition-colors border-b border-gray-100 last:border-b-0 ${
                          isSelected ? 'bg-primary-50' : 'hover:bg-gray-50'
                        }`}
                        data-testid={`mention-item-${itemKey}`}
                      >
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium text-gray-900 truncate">
                            {obj.property ? (
                              <><span className="text-gray-500">{obj.name}.</span>{obj.property}</>
                            ) : obj.name}
                          </div>
                          {obj.config?.description && (
                            <div className="text-xs text-gray-500 truncate">{obj.config.description}</div>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              );
            })
          )}
        </div>,
        document.body
      )
    : null;

  return (
    <div className="space-y-1" ref={containerRef} data-has-cursor={hasCursor ? 'true' : 'false'}>
      {/* Label */}
      {label && (
        <div className="flex items-center justify-between h-6">
          <label className="block text-sm font-medium text-gray-700">
            {label}
            {required && <span className="text-red-500 ml-0.5">*</span>}
          </label>
        </div>
      )}

      {/* Editable area */}
      <div className="relative">
        <div
          ref={editableRef}
          contentEditable={!disabled}
          suppressContentEditableWarning
          role="textbox"
          aria-label={label || 'expression editor'}
          onClick={handleClick}
          onInput={handleInput}
          onKeyDown={handleKeyDown}
          onFocus={handleFocus}
          onBlur={handleBlur}
          onPaste={handlePaste}
          onCopy={handleCopy}
          onCompositionStart={handleCompositionStart}
          onCompositionEnd={handleCompositionEnd}
          className={`
            p-3 rounded-md font-mono text-sm leading-7
            border ${error ? 'border-red-500' : 'border-gray-300'}
            bg-gray-50 hover:bg-gray-100 transition-colors
            focus:ring-2 focus:ring-primary-500 focus:border-primary-500 focus:bg-white
            outline-none
            ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-text'}
          `}
          style={{
            minHeight: editorMinHeight,
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
          }}
          data-testid="ref-textarea-editable"
          data-placeholder={!value ? 'Type @ to insert a reference' : undefined}
        />

        {/* Empty placeholder */}
        {!value && (
          <div
            className="absolute top-3 left-3 text-gray-400 italic text-sm pointer-events-none"
            aria-hidden="true"
          >
            Type @ to insert a reference
          </div>
        )}
      </div>

      {/* Accessor dropdown */}
      {accessorDropdownPortal}

      {/* @ mention dropdown */}
      {mentionDropdownPortal}

      {/* Helper Text */}
      {helperText && !error && <p className="text-xs text-gray-500">{helperText}</p>}

      {/* Error Message */}
      {error && <p className="text-xs text-red-500">{error}</p>}
    </div>
  );
};

export default RefTextArea;
