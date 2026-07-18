import { Outlet, useLocation, Link, Navigate } from 'react-router-dom';
import ProjectHistory from './project/ProjectHistory';
import { useLoaderData } from 'react-router-dom';
import Error from './styled/Error';
import TopNav from './common/TopNav';
import { HiTemplate } from 'react-icons/hi';
import { PiMagnifyingGlass, PiPencil } from 'react-icons/pi';
import useStore from '../stores/store';
import Loading from './common/Loading';
import DeployModal from './deploy/DeployModal';
import CommitModal from './commit/CommitModal';
import BranchingControls from './common/BranchingControls';
import OnboardingChecklist from './onboarding/OnboardingChecklist';
import OnboardingCoach from './onboarding/OnboardingCoach';
import ProjectVisitTracker from './onboarding/ProjectVisitTracker';
import { hasCompletedOnboarding } from './onboarding/onboardingState';
import { useRunPolling } from '../hooks/useRunPolling';
import { useState, useEffect } from 'react';

const Home = () => {
  const error = useLoaderData();
  const location = useLocation();
  const isRoot = location.pathname === '/';
  const isProject = location.pathname.startsWith('/project');
  const [isDeployOpen, setIsDeployOpen] = useState(false);

  const isNewProject = useStore(state => state.isNewProject);
  const isOnboardingRequested = useStore(state => state.isOnboardingRequested);
  const hasUncommittedChanges = useStore(state => state.hasUncommittedChanges);
  const pendingCount = useStore(state => state.pendingCount);
  const checkCommitStatus = useStore(state => state.checkCommitStatus);
  const openCommitModal = useStore(state => state.openCommitModal);
  // The capabilities endpoint drives the Edit/Branch entry and the viewer's
  // tool gating. Both servers answer it (Flask local + Django cloud), so the
  // viewer needs no local-vs-cloud branching.
  const projectId = useStore(state => state.project?.id);
  const capabilities = useStore(state => state.capabilities);
  const fetchCapabilities = useStore(state => state.fetchCapabilities);

  // Poll run status so on-save runs refresh rendered data (runDataVersion) and
  // the toolbar run indicator updates. Self-gates on project.status === 'draft'
  // (local serve reports it; published projects stay off). Mounted here at the
  // shell so it's active across every project sub-view.
  useRunPolling();

  // Check commit status on mount
  useEffect(() => {
    checkCommitStatus();
  }, [checkCommitStatus]);

  // Probe capabilities whenever the active project changes, then refresh the
  // commit badge — both come from the project's endpoints (Flask + Django).
  useEffect(() => {
    if (!projectId) return;
    (async () => {
      await fetchCapabilities();
      await checkCommitStatus();
    })();
  }, [projectId, fetchCapabilities, checkCommitStatus]);

  // The full editor (Explorer/Lineage/Editor) only unlocks when you're on an
  // editable draft. A published project — or any non-draft view — is
  // Dashboards-only; you click Edit/Branch to enter a draft first. Undefined
  // capabilities => TopNav uses its default tools (no gating).
  const restrictedToDashboards = capabilities && !capabilities.is_draft;
  const tools = restrictedToDashboards
    ? [{ id: 'project', label: 'Dashboards', to: '/project', icon: HiTemplate }]
    : undefined;

  if (isNewProject === undefined) {
    return (
      <div className="flex items-center justify-center h-screen w-screen">
        <Loading />
      </div>
    );
  }

  if ((isNewProject || isOnboardingRequested) && isRoot && !hasCompletedOnboarding())
    return <Navigate to="/onboarding" replace />;

  const renderNavigationCards = () => (
    <div className="container mx-auto px-4 py-12">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-5xl mx-auto">
        <Link to="/workspace/exploration" className="col-span-1">
          <div className="bg-white rounded-lg shadow-2xs hover:shadow-md transition-shadow duration-200 min-h-60">
            <div className="flex flex-col items-center p-8">
              <PiMagnifyingGlass className="w-12 h-12 mb-4 text-gray-700" />
              <div className="bg-[#E6EDF8] w-full text-center py-2 rounded-xs">
                <h5 className="text-xl font-medium text-gray-900">Explorer</h5>
              </div>
              <p className="mt-4 text-gray-600 text-center">Explore and analyze your data</p>
            </div>
          </div>
        </Link>
        <Link to="/workspace" className="col-span-1">
          <div className="bg-white rounded-lg shadow-2xs hover:shadow-md transition-shadow duration-200 min-h-60">
            <div className="flex flex-col items-center p-8">
              <PiPencil className="w-12 h-12 mb-4 text-gray-700" />
              <div className="bg-[#E6EDF8] w-full text-center py-2 rounded-xs">
                <h5 className="text-xl font-medium text-gray-900">Workspace</h5>
              </div>
              <p className="mt-4 text-gray-600 text-center">
                Build dashboards, edit your project, and explore lineage
              </p>
            </div>
          </div>
        </Link>
        <Link to="/project" className="col-span-1">
          <div className="bg-white rounded-lg shadow-2xs hover:shadow-md transition-shadow duration-200 min-h-60">
            <div className="flex flex-col items-center p-8">
              <HiTemplate className="w-12 h-12 mb-4 text-gray-700" />
              <div className="bg-[#E6EDF8] w-full text-center py-2 rounded-xs">
                <h5 className="text-xl font-medium text-gray-900">Dashboards</h5>
              </div>
              <p className="mt-4 text-gray-600 text-center">
                View your project's dashboards and visualizations
              </p>
            </div>
          </div>
        </Link>
      </div>
    </div>
  );

  const onDeployClick = () => {
    setIsDeployOpen(!isDeployOpen);
  };

  const onCommitClick = () => {
    openCommitModal();
  };

  return (
    <div className="visivo-home min-h-screen bg-gray-50">
      <TopNav
        onDeployClick={onDeployClick}
        onCommitClick={onCommitClick}
        hasUncommittedChanges={hasUncommittedChanges}
        commitCount={pendingCount}
        tools={tools}
        branchControls={<BranchingControls />}
      />
      <DeployModal isOpen={isDeployOpen} setIsOpen={setIsDeployOpen} />
      <CommitModal />
      <div>
        {isProject && (
          <div className="flex flex-row justify-end items-center whitespace-nowrap py-1">
            <ProjectHistory />
          </div>
        )}
        {error && error.message && <Error>{error.message}</Error>}
        {isRoot ? renderNavigationCards() : <Outlet />}
      </div>
      <OnboardingChecklist />
      <OnboardingCoach />
      <ProjectVisitTracker />
    </div>
  );
};

export default Home;
