import React, { useState } from 'react';
import Loading from '../common/Loading';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faTimes } from '@fortawesome/free-solid-svg-icons';

const AddStageForm = ({ stages, setStages, setSelectedStage, onClose }) => {
  const [newStageName, setNewStageName] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const resetForm = () => {
    setNewStageName('');
    setError('');
  };

  const handleAddStage = async e => {
    e.preventDefault();
    const trimmedName = newStageName.trim();

    if (!trimmedName) return;

    const stageExists = stages.some(
      stage => stage.name.toLowerCase() === trimmedName.toLowerCase()
    );

    if (stageExists) {
      setError('A stage with this name already exists');
      return;
    }

    setIsSubmitting(true);
    setError('');

    try {
      const response = await fetch('/api/cloud/stages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: trimmedName }),
      });

      if (!response.ok) throw new Error();

      const { stage } = await response.json();
      setStages(prev => [...prev, stage]);
      setSelectedStage(stage.name);
      resetForm();
    } catch {
      setError('Failed to create stage. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="p-4 border border-gray-200 rounded-md bg-gray-50 space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-medium text-gray-900">Add New Stage</h4>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600" type="button">
          <FontAwesomeIcon icon={faTimes} className="w-4 h-4" />
        </button>
      </div>

      <form onSubmit={handleAddStage} className="space-y-3">
        <div>
          <label htmlFor="new-stage-name" className="block text-sm font-medium text-gray-700 mb-1">
            Stage Name
          </label>
          <input
            id="new-stage-name"
            type="text"
            value={newStageName}
            onChange={e => {
              setNewStageName(e.target.value);
              setError('');
            }}
            placeholder="e.g., production, staging, development"
            className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-[#713B57] focus:border-[#713B57] placeholder:text-gray-400"
            disabled={isSubmitting}
            required
          />
          {error && <p className="text-sm text-red-600 mt-1">{error}</p>}
        </div>

        <div className="flex space-x-2">
          <button
            type="submit"
            disabled={!newStageName.trim() || isSubmitting}
            className={`flex-1 py-2 px-3 rounded-md text-sm font-medium transition-colors ${
              !newStageName.trim() || isSubmitting
                ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                : 'bg-[#713B57] hover:bg-[#5A2F46] text-white cursor-pointer'
            }`}
          >
            {isSubmitting ? (
              <div className="flex items-center justify-center gap-2">
                <Loading w="4" h="4" />
                <span>Creating...</span>
              </div>
            ) : (
              'Create Stage'
            )}
          </button>

          <button
            type="button"
            onClick={resetForm}
            disabled={isSubmitting}
            className="flex-1 py-2 px-3 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
};

export default AddStageForm;
