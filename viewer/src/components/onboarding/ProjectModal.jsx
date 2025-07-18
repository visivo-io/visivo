import React from "react";
import logo from '../../images/logo.png';
import { faArrowRight } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";


const ProjectModal = ({ handleProjectNameSubmit, tempProjectName, setTempProjectName }) => {
  const handleKeyPress = (e) => {
    if (e.key === 'Enter') {
      handleProjectNameSubmit();
    }
  };

  return (
    <div className="fixed inset-0 flex items-center justify-center z-50 bg-opacity-50 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl p-8 w-full max-w-md mx-4 transform transition-all">
        <div className="text-center mb-6">
          <div className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <img src={logo} alt="Visivo" className="w-32 h-auto mx-auto mb-6" />
          </div>

          <h2 className="text-2xl font-bold text-gray-900 mb-2">
            Name Your Project
          </h2>
          <p className="text-gray-600">
            Give your project a memorable name to get started.
          </p>
        </div>
        
        <div className="mb-6">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Project Name
          </label>
          <input
            type="text"
            value={tempProjectName}
            onChange={(e) => setTempProjectName(e.target.value)}
            onKeyUp={handleKeyPress}
            placeholder="e.g., Sales Analytics, Marketing Analytics"
            className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-lg"
            autoFocus
          />
        </div>
        
        <div className="flex justify-end space-x-3">
          <button
            onClick={handleProjectNameSubmit}
            disabled={!tempProjectName.trim()}
            className="px-6 py-3 text-sm font-medium px-4 py-2 bg-[#713B57] text-white rounded-lg hover:bg-[#5A2F46] hover:scale-101 disabled:bg-gray-300 disabled:cursor-not-allowed rounded-lg transition-colors duration-200 flex items-center space-x-2"
          >
            <span>Continue</span>
            <FontAwesomeIcon icon={faArrowRight} className="w-4 h-4 ml-1" />
          </button>
        </div>
      </div>
    </div>
  )
}

export default ProjectModal