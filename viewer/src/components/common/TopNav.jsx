import React from 'react';
import { Link } from 'react-router-dom';
import logo from '../../images/logo.png';
import { Tooltip } from 'flowbite-react';
import { SiSlack } from 'react-icons/si';
import { MdMenuBook } from "react-icons/md";

const TopNav = () => {
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
          <a
            href="https://app.visivo.io"
            target="_blank"
            rel="noopener noreferrer"
            className="text-white hover:text-gray-300"
          >
            App
          </a>
        </div>
      </div>
    </nav>
  );
};

export default TopNav;
