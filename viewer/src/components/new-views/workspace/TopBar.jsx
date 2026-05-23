import React from 'react';
import { SiSlack } from 'react-icons/si';
import { MdMenuBook } from 'react-icons/md';
import { FaUserCircle } from 'react-icons/fa';
import { HiOutlineCloudUpload } from 'react-icons/hi';
import { PiCaretRight } from 'react-icons/pi';
import logo from '../../../images/logo.png';
import useStore from '../../../stores/store';

/**
 * TopBar — h-12 navy top bar for the Workspace shell (VIS-775 / Track B B2).
 *
 * Per the delivered B-1 design (`design/cofounder-mockups/`):
 *   LEFT  — brand mark + breadcrumb (`Workspace › <projectName>`).
 *   RIGHT — `Publish · N` (visible only when `dirty > 0 && canBuild`) →
 *           `Deploy` → utility icons (Slack, Docs, Account).
 *
 * No mode toggle, no lens picker, no save-state pill. The Publish button's
 * presence IS the save state (saved ⇒ no Publish; unsaved ⇒ `Publish · N`).
 * The route split (`/workspace` = editing, `/project` = consumer) is the
 * mode toggle.
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
  const hasUnpublishedChanges = useStore(s => s.hasUnpublishedChanges);
  const openPublishModal = useStore(s => s.openPublishModal);

  const projectName = project?.project_json?.name || project?.name || 'project';
  const dirty = hasUnpublishedChanges ? 1 : 0;
  const canBuild = true; // Phase 0 — every Workspace user can build.

  // Phase 0 stub — the full deploy modal lives in Home.jsx today. Track O /
  // Track G will wire the deploy CTA from the Workspace TopBar.
  const handleDeployClick = () => {};

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
        {dirty > 0 && canBuild && (
          <button
            type="button"
            onClick={openPublishModal}
            data-testid="workspace-top-bar-publish"
            className="inline-flex h-8 items-center gap-1.5 rounded-md bg-primary px-3 text-[13px] font-semibold text-white shadow-sm transition-colors hover:bg-primary-600"
          >
            Publish
            <span className="rounded-sm bg-white/20 px-1.5 py-px text-[11px] font-bold tabular-nums">
              {dirty}
            </span>
          </button>
        )}
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
    </header>
  );
};

export default TopBar;
