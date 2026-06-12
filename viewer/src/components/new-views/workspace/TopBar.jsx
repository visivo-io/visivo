import React, { useState } from 'react';
import { SiSlack } from 'react-icons/si';
import { MdMenuBook } from 'react-icons/md';
import { FaUserCircle } from 'react-icons/fa';
import { HiOutlineCloudUpload } from 'react-icons/hi';
import { PiCaretRight } from 'react-icons/pi';
import logo from '../../../images/logo.png';
import useStore from '../../../stores/store';
import CommitCluster from './CommitCluster';
import DeployModal from '../../deploy/DeployModal';

/**
 * TopBar — h-12 navy top bar for the Workspace shell (VIS-775 / Track B B2).
 *
 * Per the delivered B-1 design (`design/cofounder-mockups/`):
 *   LEFT  — brand mark + breadcrumb (`Workspace › <projectName>`).
 *   RIGHT — save/commit cluster (H-1: status pill + Discard + `Commit · N`)
 *           → `Deploy` → utility icons (Slack, Docs, Account).
 *
 * No mode toggle, no lens picker. The route split (`/workspace` = editing,
 * `/project` = consumer) is the mode toggle. The save-state pill + Commit +
 * Discard cluster is `CommitCluster` (VIS-806 / Track H H-1).
 */
const IconButton = ({ children, title, href, onClick, testId }) => {
  const cls =
    'inline-flex h-8 w-8 items-center justify-center rounded-md text-white/80 transition-colors hover:bg-white/10 hover:text-white';
  if (href) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        title={title}
        aria-label={title}
        data-testid={testId}
        className={cls}
      >
        {children}
      </a>
    );
  }
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-label={title}
      data-testid={testId}
      className={cls}
    >
      {children}
    </button>
  );
};

const TopBar = () => {
  // Reads directly from the store — no prop-drilling from the route container.
  const project = useStore(s => s.project);

  const projectName = project?.project_json?.name || project?.name || 'project';
  const canBuild = true; // Phase 0 — every Workspace user can build.

  // The Workspace overlay sits above Home's TopNav (z-[60] > z-50), so this
  // bar's Deploy is the only reachable one in Build mode — it opens the same
  // DeployModal Home uses, just with bar-local open state.
  const [isDeployOpen, setIsDeployOpen] = useState(false);
  const handleDeployClick = () => setIsDeployOpen(true);

  return (
    <header
      data-testid="workspace-top-bar"
      className="flex h-12 shrink-0 items-center gap-3 border-b border-white/10 bg-dark px-3 text-white"
    >
      <div className="flex min-w-0 items-center gap-3">
        <img
          src={logo}
          alt="Visivo"
          className="h-7 w-7 rounded-md"
          data-testid="workspace-top-bar-logo"
        />
        <nav
          aria-label="Workspace breadcrumb"
          className="flex min-w-0 shrink items-center gap-1.5 text-[13px]"
        >
          <span className="text-white/55">Workspace</span>
          <PiCaretRight
            aria-hidden="true"
            className="h-3.5 w-3.5 shrink-0 text-white/30"
          />
          <span
            className="truncate font-medium text-white"
            data-testid="workspace-top-bar-project-name"
          >
            {projectName}
          </span>
        </nav>
      </div>

      <div className="ml-auto flex shrink-0 items-center gap-2">
        {canBuild && <CommitCluster />}
        <button
          type="button"
          onClick={handleDeployClick}
          data-testid="workspace-top-bar-deploy"
          className="inline-flex h-8 items-center gap-1.5 rounded-md bg-primary px-3 text-[13px] font-semibold text-white shadow-sm transition-colors hover:bg-primary-600"
        >
          Deploy
          <HiOutlineCloudUpload className="h-4 w-4" />
        </button>
        <span className="mx-1 h-5 w-px bg-white/15" />
        <IconButton
          title="Join the Community"
          href="https://join.slack.com/t/visivo-community/shared_invite/zt-38shh3jmq-1Vl3YkxHlGpD~GlalfiKsQ"
          testId="workspace-top-bar-slack"
        >
          <SiSlack className="h-[18px] w-[18px]" />
        </IconButton>
        <IconButton
          title="Documentation"
          href="https://docs.visivo.io"
          testId="workspace-top-bar-docs"
        >
          <MdMenuBook className="h-[18px] w-[18px]" />
        </IconButton>
        <IconButton title="Account" testId="workspace-top-bar-account">
          <FaUserCircle className="h-5 w-5" />
        </IconButton>
      </div>
      <DeployModal isOpen={isDeployOpen} setIsOpen={setIsDeployOpen} />
    </header>
  );
};

export default TopBar;
