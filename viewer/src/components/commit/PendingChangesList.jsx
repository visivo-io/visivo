import React, { useState } from 'react';
import { ObjectStatus } from '../../stores/store';
import { getTypeByValue } from '../views/common/objectTypeConfigs';

/**
 * What a commit would publish, as a list (VIS-1396).
 *
 * Shared between local and cloud. Both backends answer `/changes/` with the
 * same `[{name, type, status}]` entries — core's `pending_changes` mirrors the
 * local shape deliberately — so the only honest way to keep the two panels
 * looking alike is one component, vendored into core with the rest of the
 * viewer rather than reimplemented there.
 *
 * Takes its changes as a prop rather than reading the store: cloud's top bar
 * already holds them in a react-query, and a component with two sources of
 * truth would show a count that disagrees with the button that opened it.
 *
 * `onRestore` is optional. Undo is offered only on deletions, and only where
 * something can act on it — a new or modified object is recovered by editing it
 * back, but a deleted one cannot be reached at all once it leaves the Library
 * (VIS-1234).
 */

// Built at RENDER time, not import time. Keying a module-level object off
// `ObjectStatus` reads the store as the module loads, which throws in any
// suite that mocks it — and this file is vendored into core, where the store
// is mocked differently again.
export const StatusBadge = ({ status }) => {
  const styles = {
    [ObjectStatus.NEW]: 'bg-green-100 text-green-800',
    [ObjectStatus.MODIFIED]: 'bg-amber-100 text-amber-800',
    [ObjectStatus.DELETED]: 'bg-red-100 text-red-800',
  };
  const labels = {
    [ObjectStatus.NEW]: 'NEW',
    [ObjectStatus.MODIFIED]: 'MODIFIED',
    [ObjectStatus.DELETED]: 'DELETED',
  };

  return (
    <span
      className={`px-2 py-1 text-xs font-medium rounded-full ${
        styles[status] || 'bg-gray-100 text-gray-800'
      }`}
    >
      {labels[status] || status}
    </span>
  );
};

export const TypeBadge = ({ type }) => {
  const typeConfig = getTypeByValue(type);
  const Icon = typeConfig?.icon;
  const colors = typeConfig?.colors || { bg: 'bg-gray-100', text: 'text-gray-800' };

  return (
    <span
      className={`px-2 py-1 text-xs font-medium rounded flex items-center gap-1 ${colors.bg} ${colors.text}`}
    >
      {Icon && <Icon style={{ fontSize: 14 }} />}
      {typeConfig?.singularLabel || type}
    </span>
  );
};

const PendingChangesList = ({ changes = [], onRestore, emptyMessage = 'No pending changes to commit.' }) => {
  // Keyed by `type:name` rather than a boolean so only the row being restored
  // shows its pending state — the list can hold several deletions at once.
  const [restoringKey, setRestoringKey] = useState(null);

  const handleRestore = async (type, name) => {
    if (!onRestore) return;
    setRestoringKey(`${type}:${name}`);
    await onRestore(type, name);
    setRestoringKey(null);
  };

  if (changes.length === 0) {
    return <p className="text-gray-500 text-center py-4">{emptyMessage}</p>;
  }

  return (
    <ul className="space-y-2" data-testid="pending-changes-list">
      {changes.map((change, index) => (
        <li
          key={`${change.type}-${change.name}-${index}`}
          className="flex items-center justify-between p-3 bg-gray-50 rounded-md"
        >
          <div className="flex items-center gap-3">
            <TypeBadge type={change.type} />
            <span className="font-medium text-gray-900">{change.name}</span>
            {change.source_type && (
              <span className="text-gray-500 text-sm">({change.source_type})</span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {onRestore && change.status === ObjectStatus.DELETED && (
              <button
                type="button"
                onClick={() => handleRestore(change.type, change.name)}
                disabled={restoringKey === `${change.type}:${change.name}`}
                data-testid={`commit-modal-restore-${change.type}-${change.name}`}
                className="rounded-md px-2 py-1 text-xs font-medium text-gray-700 ring-1 ring-gray-300 transition-colors hover:bg-gray-100 disabled:opacity-50"
              >
                {restoringKey === `${change.type}:${change.name}` ? 'Restoring…' : 'Undo'}
              </button>
            )}
            <StatusBadge status={change.status} />
          </div>
        </li>
      ))}
    </ul>
  );
};

export default PendingChangesList;
