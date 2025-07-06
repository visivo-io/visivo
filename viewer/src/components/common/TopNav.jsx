import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import logo from '../../images/logo.png';
import { Tooltip } from 'flowbite-react';
import { SiSlack } from 'react-icons/si';
import { MdMenuBook } from "react-icons/md";
import { FaUserCircle } from 'react-icons/fa';

const TopNav = () => {
  const [profileOpen, setProfileOpen] = useState(false);

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 bg-[#191D33] border-b border-gray-700">
      <div className="flex justify-between items-center h-12 px-4">
        <div className="flex items-center gap-8">
          <Link to="/" className="flex items-center">
            <img src={logo} alt="V" className="h-7" />
          </Link>
          <Link to="/lineage" className="text-white hover:text-gray-300">
            Lineage
          </Link>
          <Link to="/explorer" className="text-white hover:text-gray-300">
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
          <Tooltip content="Join the Community" placement="bottom" trigger="hover">
            <a
              href="https://join.slack.com/t/visivo-community/shared_invite/zt-38shh3jmq-1Vl3YkxHlGpD~GlalfiKsQ"
              target="_blank"
              rel="noopener noreferrer"
              className="text-white hover:text-gray-300 flex items-center"
              aria-label="Join the Community"
            >
              <SiSlack className="w-5 h-5" />
            </a>
          </Tooltip>
          <Tooltip content="Documentation" placement="bottom" trigger="hover">
            <a
              href="https://docs.visivo.io"
              target="_blank"
              rel="noopener noreferrer"
              className="text-white hover:text-gray-300 flex items-center"
              aria-label="Documentation"
            >
              <MdMenuBook className="w-6 h-6" />
            </a>
          </Tooltip>
          <div className="relative">
            <button
              className="text-white hover:text-gray-300 flex items-center focus:outline-none"
              aria-haspopup="true"
              aria-expanded={profileOpen}
              type="button"
              onClick={() => setProfileOpen((open) => !open)}
            >
              <FaUserCircle className="w-6 h-6" />
            </button>
            {profileOpen && (
              <div className="absolute right-0 mt-2 w-56 bg-white rounded-md shadow-lg z-50 flex flex-col items-center transition-all duration-200 ease-out opacity-100 translate-y-0 animate-dropdown">
                <ul className="py-1 w-full flex flex-col items-center">
                  <li className="w-full flex justify-center">
                    <Tooltip
                      content={<span className="text-xs">Create a Visivo cloud account for fast & easy deployments  <a href="https://docs.visivo.io/topics/deployments/" target="_blank" rel="noopener noreferrer" className="inline align-middle text-sky-500"><MdMenuBook className="inline w-4 h-4 align-text-bottom" aria-label="Documentation" /></a></span>}
                      placement="left"
                      trigger="hover"
                    >
                      <a
                        href="https://app.visivo.io/register"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="block px-4 py-2 text-gray-700 hover:bg-gray-100 w-full text-center"
                      >
                        Log in / Sign up
                      </a>
                    </Tooltip>
                  </li>
                </ul>
              </div>
            )}
          </div>
        </div>
      </div>
    </nav>
  );
};

export default TopNav;
