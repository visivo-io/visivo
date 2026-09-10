import React, { useState } from 'react';
import Loading from '../common/Loading';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faTimes } from '@fortawesome/free-solid-svg-icons';

const AddBranchForm = ({ branches, setBranches, setSelectedBranch, onClose }) => {
  const [newBranchName, setNewBranchName] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const resetForm = () => {
    setNewBranchName('');
    setError('');
  };

  const handleAddBranch = async e => {
    e.preventDefault();
    const trimmedName = newBranchName.trim();

    if (!trimmedName) return;

    const branchExists = branches.some(
      branch => branch.name.toLowerCase() === trimmedName.toLowerCase()
    );

    if (branchExists) {
      setError('A branch with this name already exists');
      return;
    }

    setIsSubmitting(true);
    setError('');

    try {
      const response = await fetch('/api/cloud/branches/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: trimmedName }),
      });

      if (!response.ok) throw new Error();

      const { branch } = await response.json();
      setBranches(prev => [...prev, branch]);
      setSelectedBranch(branch.name);
      resetForm();
    } catch {
      setError('Failed to create branch. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="p-4 border border-gray-200 rounded-md bg-gray-50 space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-medium text-gray-900">Add New Branch</h4>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600" type="button">
          <FontAwesomeIcon icon={faTimes} className="w-4 h-4" />
        </button>
      </div>

      <form onSubmit={handleAddBranch} className="space-y-3">
        <div>
          <label htmlFor="new-branch-name" className="block text-sm font-medium text-gray-700 mb-1">
            Branch Name
          </label>
          <input
            id="new-branch-name"
            type="text"
            value={newBranchName}
            onChange={e => {
              setNewBranchName(e.target.value);
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
            disabled={!newBranchName.trim() || isSubmitting}
            className={`flex-1 py-2 px-3 rounded-md text-sm font-medium transition-colors ${
              !newBranchName.trim() || isSubmitting
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
              'Create Branch'
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

export default AddBranchForm;
