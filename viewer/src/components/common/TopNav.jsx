import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import logo from '../../images/logo.png';
import Dropdown from './Dropdown';
import { FiChevronDown, FiFolder, FiCheck, FiX, FiSearch, FiClock, FiUser, FiUsers, FiLogOut, FiLayers, FiArrowRight } from 'react-icons/fi';
import { FaStar, FaRocket } from 'react-icons/fa';
import { VscGitCommit } from 'react-icons/vsc';
import { SiSlack } from 'react-icons/si';
import { MdMenuBook } from 'react-icons/md';
import { PiMagnifyingGlass, PiPencil } from 'react-icons/pi';
import { HiTemplate } from 'react-icons/hi';
import { useMediaQuery, useTheme } from '@mui/material';

// ---- design tokens (verbatim from the "Tabs In Core" handoff) ----
const DARK = '#191D33';
const LT = '#cbd0dc';
const HAIR = 'rgba(255,255,255,.14)';
const SUCCESS = '#16a34a';
const PRIMARY = '#713B57';

// visivo serve has no real stages — it is always the single "Local" stage.
const LOCAL_STAGE = {
  id: 'local',
  name: 'Local',
  color: '#6b7280',
  desc: 'Your machine · visivo serve',
  kind: 'CLI',
  flag: 'Default',
  isDefault: true,
};

// Intra-project tools. The Workspace subsumes the legacy Editor and Lineage
// surfaces (both `/editor` and `/lineage` now redirect into `/workspace`), so
// the switcher is three: build (Workspace), explore (Explorer), view
// (Dashboards).
const DEFAULT_TOOLS = [
  { id: 'explorer', label: 'Explorer', to: '/explorer', icon: PiMagnifyingGlass },
  { id: 'workspace', label: 'Workspace', to: '/workspace', icon: PiPencil },
  { id: 'project', label: 'Dashboards', to: '/project', icon: HiTemplate },
];

/* ---------------------------------------------------------------- menu row */
function Row({ children, active, onClick, style }) {
  const [hover, setHover] = React.useState(false);
  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '9px 12px',
        cursor: 'pointer',
        fontSize: 13,
        color: '#111827',
        background: active ? '#e2d7dd' : hover ? '#f3f4f6' : 'transparent',
        transition: 'background .12s',
        ...style,
      }}
    >
      {children}
    </div>
  );
}

const StageDot = ({ color, size = 9 }) => (
  <span style={{ width: size, height: size, borderRadius: 99, background: color, flexShrink: 0, display: 'inline-block' }} />
);

const MenuLabel = ({ children }) => (
  <div style={{ padding: '8px 12px 3px', fontSize: 10, fontWeight: 700, letterSpacing: '.07em', color: '#9ca3af' }}>
    {children}
  </div>
);

/* -------------------------------------------------- STAGE dropdown (cloud) */
function StageRow({ s, active, onPick }) {
  return (
    <Row active={active} onClick={onPick} style={{ borderRadius: 6 }}>
      <StageDot color={s.color} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          <span style={{ fontWeight: 600 }}>{s.name}</span>
          {s.flag && (
            <span style={{ fontSize: 9.5, fontWeight: 700, color: '#5a2f45', background: '#e2d7dd', padding: '1px 6px', borderRadius: 99 }}>
              {s.flag}
            </span>
          )}
        </div>
        <div style={{ fontSize: 11.5, color: '#6b7280', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.desc}</div>
      </div>
      {s.starred && <FaStar size={13} color="#f5c842" />}
      {active && <FiCheck size={15} color="#5a2f45" />}
    </Row>
  );
}

function StageMenu({ stages, currentStage, onPick, onAllStages, close }) {
  const [q, setQ] = React.useState('');
  const starred = stages.filter(s => s.starred);
  const def = stages.filter(s => s.isDefault);
  const results = q
    ? stages.filter(s => `${s.name} ${s.kind || ''} ${s.desc || ''}`.toLowerCase().includes(q.toLowerCase()))
    : null;
  const pick = s => () => {
    onPick(s);
    close();
  };
  return (
    <div>
      <div style={{ padding: '11px 13px 9px', display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', borderBottom: '1px solid #f3f4f6' }}>
        <span style={{ fontSize: 13.5, fontWeight: 600, color: '#111827' }}>Switch stage</span>
        <span style={{ fontSize: 11.5, color: '#9ca3af' }}>{stages.length} stage{stages.length === 1 ? '' : 's'}</span>
      </div>
      {!q && (
        <div style={{ padding: '4px 6px 2px' }}>
          {def.length > 0 && <MenuLabel>DEFAULT</MenuLabel>}
          {def.map(s => <StageRow key={s.id} s={s} active={s.id === currentStage.id} onPick={pick(s)} />)}
          {starred.length > 0 && <MenuLabel>STARRED</MenuLabel>}
          {starred.map(s => <StageRow key={s.id} s={s} active={s.id === currentStage.id} onPick={pick(s)} />)}
        </div>
      )}
      <div style={{ padding: q ? '10px 12px 6px' : '8px 12px 10px', borderTop: q ? 'none' : '1px solid #f3f4f6' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, border: '1px solid #d1d5db', borderRadius: 6, padding: '7px 10px' }}>
          <FiSearch size={14} color="#9ca3af" />
          <input
            autoFocus
            value={q}
            onChange={e => setQ(e.target.value)}
            placeholder="Find a stage…"
            style={{ border: 'none', outline: 'none', fontSize: 13, width: '100%', color: '#111827', background: 'transparent' }}
          />
          {q && <FiX size={14} color="#9ca3af" style={{ cursor: 'pointer' }} onClick={() => setQ('')} />}
        </div>
      </div>
      {q && (
        <div style={{ maxHeight: 232, overflowY: 'auto', padding: '0 6px 6px' }}>
          {results.length
            ? results.map(s => <StageRow key={s.id} s={s} active={s.id === currentStage.id} onPick={pick(s)} />)
            : <div style={{ padding: 12, fontSize: 12.5, color: '#9ca3af' }}>No stage matches “{q}”.</div>}
        </div>
      )}
      {onAllStages && (
        <div
          onClick={() => {
            onAllStages();
            close();
          }}
          style={{ borderTop: '1px solid #f3f4f6', padding: '10px 13px', display: 'flex', alignItems: 'center', gap: 9, cursor: 'pointer', fontSize: 12.5, color: '#5a2f45', fontWeight: 500 }}
        >
          <FiLayers size={15} /> View all stages
          <FiArrowRight size={13} style={{ marginLeft: 'auto' }} />
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------ PROJECT dropdown (list) */
function ProjectMenu({ projects, currentProject, onPick, close }) {
  return (
    <div style={{ padding: 6 }}>
      <div style={{ padding: '6px 8px 5px', fontSize: 10, fontWeight: 700, letterSpacing: '.07em', color: '#9ca3af' }}>PROJECTS</div>
      {projects.map(p => (
        <Row
          key={p.id}
          active={p.id === currentProject.id}
          onClick={() => { onPick(p); close(); }}
          style={{ borderRadius: 6 }}
        >
          <FiFolder size={16} color="#6b7280" />
          <span style={{ flex: 1, fontWeight: p.id === currentProject.id ? 600 : 400 }}>{p.name || p.id}</span>
          {p.objs != null && <span style={{ fontSize: 11, color: '#9ca3af' }}>{p.objs}</span>}
          {p.id === currentProject.id && <FiCheck size={15} color="#5a2f45" />}
        </Row>
      ))}
    </div>
  );
}

/* ----------------------------------------------- VERSION history (cloud) */
function VersionMenu({ versions, currentVersion, onPick, close }) {
  return (
    <div>
      <div style={{ padding: '11px 13px 8px', fontSize: 10, fontWeight: 700, letterSpacing: '.07em', color: '#9ca3af', borderBottom: '1px solid #f3f4f6' }}>
        PROJECT HISTORY <span style={{ color: '#9ca3af', fontWeight: 500, letterSpacing: 0 }}>· cloud only</span>
      </div>
      {versions.map(v => (
        <Row key={v.id} active={v.id === currentVersion.id} onClick={() => { onPick(v); close(); }}>
          <span style={{ width: 7, height: 7, borderRadius: 99, background: v.live ? SUCCESS : '#d1d5db', flexShrink: 0 }} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 12.5 }}>
              {v.ts}
              {v.live && <span style={{ marginLeft: 7, fontSize: 10, fontWeight: 700, color: SUCCESS }}>LIVE</span>}
            </div>
            {(v.msg || v.who) && <div style={{ fontSize: 11.5, color: '#6b7280' }}>{[v.msg, v.who].filter(Boolean).join(' · ')}</div>}
          </div>
        </Row>
      ))}
    </div>
  );
}

/* --------------------------------- the capsule: stage + project segments */
function Capsule({ stages, currentStage, onStageChange, onAllStages, projects, currentProject, onProjectChange, narrow, showProject }) {
  // Defensive: the bar only mounts the capsule when a stage exists, but never
  // crash if rendered without one (account bar / a stale vendored copy).
  if (!currentStage) return null;
  // The stage segment opens a menu to switch stages or jump to "All stages";
  // with a single stage and no onAllStages (local) it's a plain label.
  const stageOpens = stages.length > 1 || Boolean(onAllStages);
  const multiProject = projects.length > 1;
  const stageBtn = (
    <button
      style={{
        display: 'flex', alignItems: 'center', gap: 7, background: currentStage.color, color: '#fff',
        border: 'none', cursor: stageOpens ? 'pointer' : 'default', padding: '7px 12px', fontSize: 12.5,
        fontWeight: 700, whiteSpace: 'nowrap', borderTopLeftRadius: 99, borderBottomLeftRadius: 99,
        ...(showProject ? {} : { borderTopRightRadius: 99, borderBottomRightRadius: 99 }),
      }}
    >
      <span style={{ width: 7, height: 7, borderRadius: 99, background: 'rgba(255,255,255,.92)' }} />
      {currentStage.name}
      {stageOpens && <FiChevronDown size={13} />}
    </button>
  );
  const projectBtn = (
    <button
      style={{
        display: 'flex', alignItems: 'center', gap: 7, background: 'rgba(255,255,255,.06)', color: '#fff',
        border: 'none', borderLeft: `1px solid ${HAIR}`, cursor: multiProject ? 'pointer' : 'default',
        padding: '7px 12px', fontSize: 13.5, fontWeight: 600, overflow: 'hidden',
        borderTopRightRadius: 99, borderBottomRightRadius: 99,
      }}
    >
      <FiFolder size={15} color={LT} />
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{currentProject.name || currentProject.id}</span>
      {multiProject && <FiChevronDown size={13} color={LT} />}
    </button>
  );
  return (
    <div style={{ display: 'inline-flex', alignItems: 'stretch', borderRadius: 99, border: `1px solid ${HAIR}`, maxWidth: narrow ? 210 : 'none' }}>
      {stageOpens ? (
        <Dropdown align="left" width={314} panelStyle={{ marginTop: 2 }} trigger={stageBtn}>
          {close => <StageMenu stages={stages} currentStage={currentStage} onPick={onStageChange} onAllStages={onAllStages} close={close} />}
        </Dropdown>
      ) : stageBtn}
      {showProject &&
        (multiProject ? (
          <Dropdown align="left" width={272} panelStyle={{ marginTop: 2 }} trigger={projectBtn}>
            {close => <ProjectMenu projects={projects} currentProject={currentProject} onPick={onProjectChange} close={close} />}
          </Dropdown>
        ) : (
          projectBtn
        ))}
    </div>
  );
}

/* ----------------------------- tools: pill group, icon-only, active named */
function ToolSwitch({ tools, activeTool }) {
  return (
    <div style={{ display: 'inline-flex', background: 'rgba(255,255,255,.06)', border: `1px solid ${HAIR}`, borderRadius: 99, padding: 3, gap: 2 }}>
      {tools.map(t => {
        const on = t.id === activeTool;
        const Icon = t.icon;
        return (
          <Link
            key={t.id}
            to={t.to}
            title={t.label}
            style={{
              display: 'flex', alignItems: 'center', gap: 7, padding: on ? '6px 14px' : '6px 11px', borderRadius: 99,
              textDecoration: 'none', background: on ? '#fff' : 'transparent', color: on ? '#432334' : LT,
              fontSize: 13, fontWeight: on ? 600 : 500, whiteSpace: 'nowrap', transition: 'background .12s, color .12s',
            }}
          >
            {Icon && <Icon size={16} />} {on && t.label}
          </Link>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------- version pill */
function VersionPill({ versions, currentVersion, onVersionChange, compact }) {
  const viewing = !currentVersion.live;
  const label = compact ? String(currentVersion.ts).split(',')[0] : currentVersion.ts;
  // A single deploy has nothing to switch to — show it as a plain label, no
  // chevron, no dropdown. More than one → it's a dropdown into the history.
  const multi = versions.length > 1;
  const trigger = (
    <button
      style={{
        display: 'flex', alignItems: 'center', gap: 7, background: viewing ? '#a84738' : 'rgba(255,255,255,.06)',
        border: viewing ? 'none' : `1px solid ${HAIR}`, color: '#fff', fontSize: 12.5, fontWeight: 500,
        padding: '6px 11px', borderRadius: 99, cursor: multi ? 'pointer' : 'default', whiteSpace: 'nowrap',
      }}
    >
      <FiClock size={15} /> {label}
      {multi && <FiChevronDown size={13} />}
    </button>
  );
  if (!multi) return trigger;
  return (
    <Dropdown align="right" width={300} panelStyle={{ marginTop: 2 }} trigger={trigger}>
      {close => <VersionMenu versions={versions} currentVersion={currentVersion} onPick={onVersionChange} close={close} />}
    </Dropdown>
  );
}

/* ------------------------------------------------------- commit / deploy */
function CommitButton({ onClick, compact, count = 0 }) {
  const [h, setH] = React.useState(false);
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setH(true)}
      onMouseLeave={() => setH(false)}
      title="Commit changes"
      style={{
        display: 'flex', alignItems: 'center', gap: 7, background: h ? '#15803d' : SUCCESS, color: '#fff',
        border: 'none', fontSize: 13, fontWeight: 600, padding: compact ? '7px 9px' : '7px 13px',
        borderRadius: 99, cursor: 'pointer',
      }}
    >
      <VscGitCommit size={16} /> {!compact && 'Commit'}
      {count > 0 && (
        <span
          style={{
            background: 'rgba(255,255,255,.22)', borderRadius: 99, padding: '0 6px',
            fontSize: 11, fontWeight: 700, lineHeight: '17px', fontVariantNumeric: 'tabular-nums',
          }}
        >
          {count}
        </span>
      )}
    </button>
  );
}

function DeployButton({ onClick, compact }) {
  const [h, setH] = React.useState(false);
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setH(true)}
      onMouseLeave={() => setH(false)}
      title="Deploy"
      style={{
        display: 'flex', alignItems: 'center', gap: 7, background: h ? '#5A2F46' : PRIMARY, color: '#fff',
        border: 'none', fontSize: 13, fontWeight: 600, padding: compact ? '7px 9px' : '7px 14px',
        borderRadius: 99, cursor: 'pointer',
      }}
    >
      <FaRocket size={14} /> {!compact && 'Deploy'}
    </button>
  );
}

/* ------------------------------------------------------------ user menu */
function localMenu(close) {
  const linkStyle = { display: 'block', padding: '8px 10px', borderRadius: 6, color: '#374151', textDecoration: 'none' };
  return (
    <div style={{ padding: 6 }}>
      <a href="https://app.visivo.io/register" target="_blank" rel="noopener noreferrer" onClick={close} style={linkStyle}>
        Log in / Sign up
      </a>
      <a href="https://docs.visivo.io" target="_blank" rel="noopener noreferrer" onClick={close} style={{ ...linkStyle, display: 'flex', alignItems: 'center', gap: 8 }}>
        <MdMenuBook size={16} color="#6b7280" /> Documentation
      </a>
      <a
        href="https://join.slack.com/t/visivo-community/shared_invite/zt-38shh3jmq-1Vl3YkxHlGpD~GlalfiKsQ"
        target="_blank"
        rel="noopener noreferrer"
        onClick={close}
        style={{ ...linkStyle, display: 'flex', alignItems: 'center', gap: 8 }}
      >
        <SiSlack size={15} color="#6b7280" /> Join the Community
      </a>
      <a href="https://github.com/visivo-io/visivo/issues/new/choose" target="_blank" rel="noopener noreferrer" onClick={close} style={linkStyle}>
        Log an Issue
      </a>
    </div>
  );
}

function UserMenu({ user, onSignOut }) {
  const initial = user?.name ? user.name[0].toUpperCase() : 'U';
  const trigger = (
    <span style={{ display: 'inline-flex', cursor: 'pointer' }}>
      <div style={{ width: 28, height: 28, borderRadius: 99, background: PRIMARY, color: '#fff', fontSize: 12, fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {initial}
      </div>
    </span>
  );
  return (
    <Dropdown align="right" width={212} panelStyle={{ marginTop: 2 }} trigger={trigger}>
      {close =>
        user ? (
          <div style={{ padding: 6 }}>
            <div style={{ padding: '8px 10px 6px' }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#111827' }}>{user.name}</div>
              {user.email && <div style={{ fontSize: 11.5, color: '#6b7280' }}>{user.email}</div>}
            </div>
            <Row onClick={close} style={{ borderRadius: 6 }}><FiUser size={15} color="#6b7280" /> Account</Row>
            <Row onClick={close} style={{ borderRadius: 6 }}><FiUsers size={15} color="#6b7280" /> Organization</Row>
            <Row onClick={() => { onSignOut && onSignOut(); close(); }} style={{ borderRadius: 6 }}><FiLogOut size={15} color="#6b7280" /> Sign out</Row>
          </div>
        ) : (
          localMenu(close)
        )
      }
    </Dropdown>
  );
}

/* ============================================================ TopNav bar */
const TopNav = ({
  // intra-project tools (default = local viewer's four)
  tools = DEFAULT_TOOLS,
  activeTool,
  // location switchers (cloud passes real lists; local gets a single Local stage)
  stages = [LOCAL_STAGE],
  currentStage,
  onStageChange = () => {},
  projects,
  currentProject,
  onProjectChange = () => {},
  // cloud-only version history
  versions,
  currentVersion,
  onVersionChange = () => {},
  // commit / deploy — both surface only when there are uncommitted changes
  // (nothing to commit or deploy on a clean project, so the slot is empty).
  hasUncommittedChanges,
  // count of pending (uncommitted) changes — shown as a badge on Commit.
  commitCount = 0,
  onCommitClick,
  onDeployClick,
  // Deploy is only meaningful where deploy exists (local CLI). Cloud has no
  // deploy yet, so it passes showDeploy=false to hide the button entirely.
  showDeploy = true,
  // user (cloud) — absent ⇒ local login/docs/community menu
  user,
  onSignOut,
  // cloud unifiers: a custom logo node (the account menu) and an "All stages"
  // link in the stage dropdown. Absent locally → plain logo, no all-stages.
  renderLogo,
  onAllStages,
}) => {
  const location = useLocation();
  const theme = useTheme();
  const narrow = useMediaQuery(theme.breakpoints.down('md'));

  const resolvedStage = currentStage || stages[0];
  const resolvedProjects = projects && projects.length ? projects : currentProject ? [currentProject] : [{ id: 'project', name: 'Project' }];
  const resolvedProject = currentProject || resolvedProjects[0];
  // Active tool: explicit prop wins; otherwise match the current route's tail.
  const resolvedActive =
    activeTool || (tools.find(t => location.pathname === t.to || location.pathname.endsWith(t.to)) || {}).id;

  // Bar variant by depth — one component, three shapes. Project depth is
  // signalled by having tools (account/stage bars pass tools=[]; local + cloud
  // project bars have the four). A stage is present at stage + project depth.
  //   account (no stage, no tools) → logo + user
  //   stage   (stage, no tools)    → + stage pill
  //   project (stage + tools)      → + project segment, tools, version, commit/deploy
  const showProject = tools.length > 0;
  const showCapsule = Boolean(resolvedStage);

  const showVersions = showProject && Array.isArray(versions) && versions.length > 0 && currentVersion;
  const inHistory = showVersions && !currentVersion.live;

  // Both Commit and Deploy only make sense when there's something to act on,
  // so the action slot is empty on a clean project and shows Commit (+ Deploy
  // where deploy exists) once there are uncommitted changes.
  const action = hasUncommittedChanges ? (
    <>
      <CommitButton onClick={onCommitClick} compact={narrow} count={commitCount} />
      {showDeploy && <DeployButton onClick={onDeployClick} compact={narrow} />}
    </>
  ) : null;

  const banner = inHistory && (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: '#f6ddda', borderBottom: '1px solid #edbcb5', color: '#7e352a', padding: '0 16px', height: 38, flexShrink: 0, fontSize: 13 }}>
      <FiClock size={16} />
      <span><strong style={{ fontWeight: 600 }}>Viewing history</strong> · deployed {currentVersion.ts}{currentVersion.who ? ` by ${currentVersion.who}` : ''} — read only</span>
      <button
        onClick={() => onVersionChange(versions.find(v => v.live) || versions[0])}
        style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6, background: '#fff', border: '1px solid #e49b90', color: '#7e352a', fontSize: 12.5, fontWeight: 600, padding: '4px 11px', borderRadius: 99, cursor: 'pointer' }}
      >
        <FiX size={13} /> Back to live
      </button>
    </div>
  );

  const capsule = (
    <Capsule
      stages={stages}
      currentStage={resolvedStage}
      onStageChange={onStageChange}
      onAllStages={onAllStages}
      projects={resolvedProjects}
      currentProject={resolvedProject}
      onProjectChange={onProjectChange}
      narrow={narrow}
      showProject={showProject}
    />
  );

  if (narrow) {
    return (
      <nav className="sticky top-0 z-50">
        <div style={{ background: DARK, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 12px', height: 54 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, overflow: 'hidden' }}>
            {renderLogo || <Link to="/"><img src={logo} alt="V" style={{ height: 26, width: 26, borderRadius: 6 }} /></Link>}
            {showCapsule && capsule}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            {showVersions && <VersionPill versions={versions} currentVersion={currentVersion} onVersionChange={onVersionChange} compact />}
            {showProject && action}
            <UserMenu user={user} onSignOut={onSignOut} />
          </div>
        </div>
        {banner}
        {showProject && (
          <div style={{ background: DARK, borderTop: `1px solid ${HAIR}`, padding: '8px 12px', display: 'flex', justifyContent: 'center' }}>
            <ToolSwitch tools={tools} activeTool={resolvedActive} />
          </div>
        )}
      </nav>
    );
  }

  return (
    <nav className="sticky top-0 z-50">
      <div style={{ background: DARK, display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: 56, padding: '0 16px', gap: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          {renderLogo || <Link to="/"><img src={logo} alt="V" style={{ height: 30, width: 30, borderRadius: 7 }} /></Link>}
          {showCapsule && capsule}
        </div>
        {showProject && <ToolSwitch tools={tools} activeTool={resolvedActive} />}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {showVersions && <VersionPill versions={versions} currentVersion={currentVersion} onVersionChange={onVersionChange} />}
          {showProject && action}
          <div style={{ width: 1, height: 22, background: HAIR }} />
          <UserMenu user={user} onSignOut={onSignOut} />
        </div>
      </div>
      {banner}
    </nav>
  );
};

export default TopNav;
