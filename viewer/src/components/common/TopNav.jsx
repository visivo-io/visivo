import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import logo from '../../images/logo.png';
import { Tooltip } from 'flowbite-react';
import { SiSlack } from 'react-icons/si';
import { MdMenuBook } from 'react-icons/md';
import { FaUserCircle } from 'react-icons/fa';
import { PiTreeStructure, PiMagnifyingGlass, PiPencil } from 'react-icons/pi';
import { HiTemplate } from 'react-icons/hi';
import { FiAlertCircle } from 'react-icons/fi';
import { HiOutlineCloudUpload } from 'react-icons/hi';
import TumblerNavItem from './TumblerNavItem';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faCloudArrowUp } from '@fortawesome/free-solid-svg-icons';
import { useMediaQuery, useTheme } from '@mui/material';

const TopNav = ({ onDeployClick, onPublishClick, hasUnpublishedChanges }) => {
  const [profileOpen, setProfileOpen] = useState(false);
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 bg-[#191D33] border-b border-gray-700">
      <div className="flex justify-between items-center h-12 px-4">
        <div className="flex items-center gap-1 sm:gap-8">
          <Link to="/" className="flex items-center">
            <img src={logo} alt="V" className="h-7" />
          </Link>
          <TumblerNavItem
            icon={PiTreeStructure}
            label="Lineage"
            to="/lineage"
            tooltip="Visualize your project's dag to understand dependencies"
          />
          <TumblerNavItem
            icon={PiMagnifyingGlass}
            label="Explorer"
            to="/explorer"
            tooltip="Drill into your data with sql to create new models or explore existing ones"
          />
          <TumblerNavItem
            icon={PiPencil}
            label="Editor"
            to="/editor"
            tooltip="Edit project objects and create new charts, traces, and more"
          />
          <TumblerNavItem
            icon={HiTemplate}
            label="Project"
            to="/project"
            tooltip="View your project as it will look deployed"
          />
        </div>
        <div className="flex items-center gap-5 sm:gap-8">
          {hasUnpublishedChanges && (
            <Tooltip content="Publish changes to YAML files" placement="bottom" trigger="hover">
              <button
                onClick={onPublishClick}
                className="px-2 py-2 sm:py-0.5 text-md font-semibold bg-green-600 text-white rounded-md hover:bg-green-700 cursor-pointer"
              >
                <div className="flex items-center space-x-1">
                  {!isMobile ? <span>Publish</span> : null}
                  <HiOutlineCloudUpload className="w-5 h-5 ml-1" />
                </div>
              </button>
            </Tooltip>
          )}
          <button
            onClick={onDeployClick}
            className="px-2 py-2 sm:py-0.5 text-md font-semibold bg-[#713B57] text-white rounded-md hover:bg-[#5A2F46] cursor-pointer"
          >
            <div className="flex items-center space-x-1">
              {!isMobile ? <span>Deploy</span> : null}
              <FontAwesomeIcon icon={faCloudArrowUp} className="w-5 h-5 ml-1" />
            </div>
          </button>
          {!isMobile ? (
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
          ) : null}
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
              onClick={() => setProfileOpen(open => !open)}
            >
              <FaUserCircle className="w-6 h-6" />
            </button>
            {profileOpen && (
              <div className="absolute right-0 mt-2 w-56 bg-white rounded-md shadow-lg z-50 flex flex-col items-center transition-all duration-200 ease-out opacity-100 translate-y-0 animate-dropdown">
                <ul className="py-1 w-full flex flex-col items-center">
                  <li className="w-full flex justify-center">
                    <Tooltip
                      content={
                        <span className="text-xs">
                          Create a Visivo cloud account for fast & easy deployments{' '}
                          <a
                            href="https://docs.visivo.io/topics/deployments/"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline align-middle text-sky-500"
                          >
                            <MdMenuBook
                              className="inline w-4 h-4 align-text-bottom"
                              aria-label="Documentation"
                            />
                          </a>
                        </span>
                      }
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
                  <li className="w-full flex justify-center">
                    <Tooltip
                      content={
                        <span className="text-xs">
                          Found a bug or have feedback? Log an issue on GitHub{' '}
                          <a
                            href="https://github.com/visivo-io/visivo?tab=readme-ov-file#contributing"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline align-middle text-sky-500"
                          >
                            <MdMenuBook
                              className="inline w-4 h-4 align-text-bottom"
                              aria-label="Documentation"
                            />
                          </a>
                        </span>
                      }
                      placement="left"
                      trigger="hover"
                    >
                      <a
                        href="https://github.com/visivo-io/visivo/issues/new/choose"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="block px-4 py-2 text-gray-700 hover:bg-gray-100 w-full text-center flex items-center justify-center gap-2"
                      >
                        <FiAlertCircle className="w-4 h-4 text-rose-500" />
                        Log an Issue
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
