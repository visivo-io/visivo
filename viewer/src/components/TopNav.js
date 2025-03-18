import React from 'react';
import { Link } from 'react-router-dom';
import logo from '../images/logo.png';

const TopNav = () => {
  return (
    <nav className="bg-[#191D33] border-b border-gray-700">
      <div className="flex justify-between items-center h-12 px-4">
        <div className="flex items-center gap-8">
          <Link to="/" className="flex items-center">
            <img src={logo} alt="V" className="h-5" />
          </Link>
          <Link to="/dag" className="text-white hover:text-gray-300">
            DAG
          </Link>
          <Link to="/query" className="text-white hover:text-gray-300">
            Explorer
          </Link>
          <Link to="/editor" className="text-white hover:text-gray-300">
            Editor
          </Link>
          <Link to="/project" className="text-white hover:text-gray-300">
            Project
          </Link>
        </div>
        <div className="flex items-center gap-8">
          <a href="https://docs.visivo.io" target="_blank" rel="noopener noreferrer" className="text-white hover:text-gray-300">
            Docs
          </a>
          <a href="https://app.visivo.io" target="_blank" rel="noopener noreferrer" className="text-white hover:text-gray-300">
            App
          </a>
        </div>
      </div>
    </nav>
  );
};

export default TopNav; 