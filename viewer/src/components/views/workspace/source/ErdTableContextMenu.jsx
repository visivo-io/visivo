import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { PiPlusCircle, PiCopySimple } from 'react-icons/pi';
import useStore from '../../../../stores/store';
import { getTypeIcon } from '../../common/objectTypeConfigs';
import { formatRefExpression } from '../../../../utils/refString';
import { generateUniqueName } from '../../../../utils/uniqueName';

/**
 * ErdTableContextMenu — right-click menu for a Source-ERD table node (VIS-1005).
 *
 * Actions:
 *   - "Create a model to query this table" — builds `SELECT * FROM <schema>.<table>`,
 *     mints a unique model name, saves a SqlModel (`source: ${ref(<sourceName>)}`)
 *     via the model store, then opens it as a workspace tab.
 *   - "Copy qualified name" — copies the dotted qualified name to the clipboard.
 *
 * The SELECT string is CONSTRUCTED in JS (trivial identifier quoting) — this is
 * generation, not parsing, so no sqlglot is involved. Identifiers are quoted with
 * double quotes ONLY when they aren't a plain `snake_case` identifier, with any
 * embedded double quote doubled per the SQL standard.
 *
 * Mounted through a portal at viewport coords (`x`/`y` = clientX/clientY) so it
 * escapes the React-Flow pane's overflow clipping; dismisses on outside
 * pointer-down, Escape, or scroll — matching OpenObjectContextMenu.
 */

const MULBERRY = '#713b57';

// A bare identifier (letters/digits/underscore, not starting with a digit) needs
// no quoting; anything else is double-quoted with embedded quotes doubled.
const quoteIdentifier = name => {
  const raw = String(name ?? '');
  if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(raw)) return raw;
  return `"${raw.replace(/"/g, '""')}"`;
};

/** Build the dotted qualified name (schema.table) for display / copy. */
export const buildQualifiedName = ({ schema, table }) =>
  [schema, table].filter(v => v != null && v !== '').join('.');

/** Build `SELECT * FROM <schema>.<table>` with per-part identifier quoting. */
export const buildSelectStar = ({ schema, table }) => {
  const parts = [schema, table].filter(v => v != null && v !== '').map(quoteIdentifier);
  return `SELECT * FROM ${parts.join('.')}`;
};

const MenuItem = ({ testid, icon: Icon, label, disabled, onClick }) => (
  <button
    type="button"
    role="menuitem"
    data-testid={testid}
    disabled={disabled}
    onClick={e => {
      e.stopPropagation();
      if (!disabled && onClick) onClick(e);
    }}
    className="flex w-full items-center gap-2 rounded px-2.5 py-1.5 text-left text-[12.5px] text-gray-700 transition-colors hover:bg-[#f9f6f8] focus:bg-[#f9f6f8] focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
  >
    {Icon && <Icon className="shrink-0 text-gray-500" style={{ fontSize: 14 }} />}
    <span className="font-medium">{label}</span>
  </button>
);

const ErdTableContextMenu = ({ x, y, sourceName, target, onDismiss }) => {
  const menuRef = useRef(null);
  const models = useStore(s => s.models);
  const saveModel = useStore(s => s.saveModel);
  const openWorkspaceTab = useStore(s => s.openWorkspaceTab);
  const SourceIcon = getTypeIcon('source');

  useEffect(() => {
    const onDocPointer = e => {
      if (menuRef.current && menuRef.current.contains(e.target)) return;
      onDismiss && onDismiss();
    };
    const onKey = e => {
      if (e.key === 'Escape') onDismiss && onDismiss();
    };
    const onScroll = () => onDismiss && onDismiss();
    document.addEventListener('pointerdown', onDocPointer, true);
    document.addEventListener('keydown', onKey);
    window.addEventListener('scroll', onScroll, true);
    return () => {
      document.removeEventListener('pointerdown', onDocPointer, true);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('scroll', onScroll, true);
    };
  }, [onDismiss]);

  if (!target) return null;

  const qualifiedName = buildQualifiedName(target);

  const handleCreateModel = async () => {
    const sql = buildSelectStar(target);
    const existingNames = (models || []).map(m => m.name);
    const baseName = `${target.table}_model`;
    const modelName = generateUniqueName(baseName, existingNames);
    const config = {
      name: modelName,
      sql,
      source: formatRefExpression(sourceName),
    };
    if (saveModel) {
      const result = await saveModel(modelName, config);
      // Only surface the new model when the save succeeded. saveModel returns
      // `{ success }`; treat a missing flag as success for simpler test mocks.
      if (result && result.success === false) return;
    }
    if (openWorkspaceTab) {
      openWorkspaceTab({ id: `model:${modelName}`, type: 'model', name: modelName });
    }
  };

  const handleCopyQualifiedName = () => {
    try {
      navigator?.clipboard?.writeText?.(qualifiedName);
    } catch {
      // Clipboard may be unavailable (insecure context / test env) — no-op.
    }
  };

  return createPortal(
    <div
      ref={menuRef}
      role="menu"
      aria-label={`${qualifiedName} actions`}
      data-testid="erd-table-ctx-menu"
      className="fixed z-[80] min-w-[230px] rounded-lg border border-[#e5e0e3] bg-white p-1 shadow-lg"
      style={{ top: y, left: x }}
      onPointerDown={e => e.stopPropagation()}
      onClick={e => e.stopPropagation()}
    >
      <div className="flex items-center gap-1.5 px-2.5 pb-1 pt-1 text-[10px] font-semibold uppercase tracking-wide text-gray-400">
        {SourceIcon && <SourceIcon aria-hidden="true" style={{ fontSize: 12 }} />}
        <span className="truncate">{qualifiedName}</span>
      </div>
      <MenuItem
        testid="erd-table-ctx-create-model"
        icon={PiPlusCircle}
        label="Create a model to query this table"
        onClick={async () => {
          await handleCreateModel();
          onDismiss && onDismiss();
        }}
      />
      <MenuItem
        testid="erd-table-ctx-copy-name"
        icon={PiCopySimple}
        label="Copy qualified name"
        onClick={() => {
          handleCopyQualifiedName();
          onDismiss && onDismiss();
        }}
      />
      <span
        aria-hidden="true"
        className="pointer-events-none absolute -left-px top-2 h-4 w-[3px] rounded-r"
        style={{ background: MULBERRY }}
      />
    </div>,
    document.body
  );
};

export default ErdTableContextMenu;
