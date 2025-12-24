import React from 'react';
import { ModalOverlay, ModalWrapper } from '../styled/Modal';
import useStore, { ObjectStatus } from '../../stores/store';
import { getTypeByValue } from '../new-views/common/objectTypeConfigs';

const StatusBadge = ({ status }) => {
  const colorMap = {
    [ObjectStatus.NEW]: 'bg-green-100 text-green-800',
    [ObjectStatus.MODIFIED]: 'bg-amber-100 text-amber-800',
    [ObjectStatus.DELETED]: 'bg-red-100 text-red-800',
  };

  const labelMap = {
    [ObjectStatus.NEW]: 'NEW',
    [ObjectStatus.MODIFIED]: 'MODIFIED',
    [ObjectStatus.DELETED]: 'DELETED',
  };

  return (
    <span className={`px-2 py-1 text-xs font-medium rounded-full ${colorMap[status] || 'bg-gray-100 text-gray-800'}`}>
      {labelMap[status] || status}
    </span>
  );
};

const TypeBadge = ({ type }) => {
  const typeConfig = getTypeByValue(type);
  const Icon = typeConfig?.icon;
  const colors = typeConfig?.colors || { bg: 'bg-gray-100', text: 'text-gray-800' };

  return (
    <span className={`px-2 py-1 text-xs font-medium rounded flex items-center gap-1 ${colors.bg} ${colors.text}`}>
      {Icon && <Icon style={{ fontSize: 14 }} />}
      {typeConfig?.singularLabel || type}
    </span>
  );
};

const PublishModal = () => {
  const publishModalOpen = useStore(state => state.publishModalOpen);
  const closePublishModal = useStore(state => state.closePublishModal);
  const pendingChanges = useStore(state => state.pendingChanges);
  const publishLoading = useStore(state => state.publishLoading);
  const publishError = useStore(state => state.publishError);
  const publishChanges = useStore(state => state.publishChanges);

  if (!publishModalOpen) return null;

  const handlePublish = async () => {
    await publishChanges();
  };

  return (
    <ModalOverlay>
      <ModalWrapper>
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-bold text-gray-900">Publish Changes</h2>
          <button
            onClick={closePublishModal}
            className="hover:text-gray-800 text-gray-500 text-2xl font-bold focus:outline-none cursor-pointer"
            disabled={publishLoading}
          >
            &times;
          </button>
        </div>

        <p className="text-gray-600 mb-4">
          The following changes will be written to your project YAML files:
        </p>

        {publishError && (
          <div className="mb-4 p-3 bg-red-100 text-red-700 rounded-md">
            {publishError}
          </div>
        )}

        <div className="max-h-64 overflow-y-auto mb-6">
          {pendingChanges.length === 0 ? (
            <p className="text-gray-500 text-center py-4">No pending changes to publish.</p>
          ) : (
            <ul className="space-y-2">
              {pendingChanges.map((change, index) => (
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
                  <StatusBadge status={change.status} />
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="flex justify-end gap-3">
          <button
            onClick={closePublishModal}
            className="px-4 py-2 text-gray-700 bg-gray-200 rounded-md hover:bg-gray-300 focus:outline-none"
            disabled={publishLoading}
          >
            Cancel
          </button>
          <button
            onClick={handlePublish}
            disabled={publishLoading || pendingChanges.length === 0}
            className="px-4 py-2 text-white bg-green-600 rounded-md hover:bg-green-700 focus:outline-none disabled:bg-gray-400 disabled:cursor-not-allowed"
          >
            {publishLoading ? 'Publishing...' : 'Publish Changes'}
          </button>
        </div>
      </ModalWrapper>
    </ModalOverlay>
  );
};

export default PublishModal;
