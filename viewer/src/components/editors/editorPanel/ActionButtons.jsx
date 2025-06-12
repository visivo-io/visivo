import React from 'react';
import { HiDotsVertical, HiSave } from 'react-icons/hi';

const ActionButtons = ({
  activeTabId,
  isMenuOpen,
  setIsMenuOpen,
  setIsTextEditorModalOpen,
  setIsMoveModalOpen,
  setIsDeleteModalOpen,
  setIsModalOpen,
}) => {
  return (
    <div className="flex items-center space-x-2 md:space-x-0 flex-shrink-0 pb-2">
      {activeTabId && (
        <div className="relative">
          <button
            onClick={() => setIsMenuOpen(!isMenuOpen)}
            className="hidden md:flex px-1 hover:bg-gray-100 rounded-lg"
          >
            <HiDotsVertical className="w-5 h-5 text-gray-600" />
          </button>
          <button
            onClick={() => setIsMenuOpen(!isMenuOpen)}
            className="md:hidden flex px-0 hover:bg-gray-100 rounded-sm"
          >
            <HiDotsVertical className="w-5 h-5 text-gray-600" />
          </button>

          {isMenuOpen && (
            <div className="absolute right-0 mt-2 w-48 bg-white rounded-lg shadow-lg border border-gray-200 z-50">
              <ul className="py-2">
                <li>
                  <button
                    onClick={() => {
                      setIsMenuOpen(false);
                      setIsTextEditorModalOpen(true);
                    }}
                    className="w-full px-4 py-2 text-left text-gray-700 hover:bg-gray-100"
                  >
                    Open in Text Editor
                  </button>
                </li>
                <li>
                  <button
                    onClick={() => {
                      setIsMenuOpen(false);
                      setIsMoveModalOpen(true);
                    }}
                    className="w-full px-4 py-2 text-left text-gray-700 hover:bg-gray-100"
                  >
                    Move Object
                  </button>
                </li>
                <li>
                  <button
                    onClick={() => {
                      setIsMenuOpen(false);
                      setIsDeleteModalOpen(true);
                    }}
                    className="w-full px-4 py-2 text-left text-red-600 hover:bg-gray-100"
                  >
                    Delete Object
                  </button>
                </li>
              </ul>
            </div>
          )}
        </div>
      )}

      <button
        onClick={() => setIsModalOpen(true)}
        className="hidden md:flex px-4 py-2 bg-[#713B57] text-white rounded-lg hover:bg-[#5A2F46] hover:scale-101 items-center"
      >
        View Changes
      </button>
      <button
        onClick={() => setIsModalOpen(true)}
        className="flex md:hidden px-2 py-2 bg-[#713B57] text-white rounded-md hover:bg-[#5A2F46] hover:scale-101 items-center"
        aria-label="Save Changes"
      >
        <HiSave className="w-5 h-5" />
      </button>
    </div>
  );
};

export default ActionButtons;
