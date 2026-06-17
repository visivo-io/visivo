import { Outlet, useLocation, Link, Navigate } from 'react-router-dom';
import ProjectHistory from './project/ProjectHistory';
import { useLoaderData } from 'react-router-dom';
import Error from './styled/Error';
import TopNav from './common/TopNav';
import { HiTemplate } from 'react-icons/hi';
import { PiTreeStructure, PiMagnifyingGlass, PiPencil } from 'react-icons/pi';
import useStore from '../stores/store';
import Loading from './common/Loading';
import DeployModal from './deploy/DeployModal';
import CommitModal from './commit/CommitModal';
import CloudEditControls from './common/CloudEditControls';
import OnboardingChecklist from './onboarding/OnboardingChecklist';
import OnboardingCoach from './onboarding/OnboardingCoach';
import ProjectVisitTracker from './onboarding/ProjectVisitTracker';
import { hasCompletedOnboarding } from './onboarding/onboardingState';
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
  const checkCommitStatus = useStore(state => state.checkCommitStatus);
  const openCommitModal = useStore(state => state.openCommitModal);
  // Cloud-editing (core only): the capabilities probe drives the Edit/Branch
  // entry and the viewer's tool gating. In local serve the probe 404s, so
  // isCloud stays false and none of this engages.
  const projectId = useStore(state => state.project?.id);
  const isCloud = useStore(state => state.isCloud);
  const capabilities = useStore(state => state.capabilities);
  const fetchCapabilities = useStore(state => state.fetchCapabilities);

  // Check commit status on mount
  useEffect(() => {
    checkCommitStatus();
  }, [checkCommitStatus]);

  // Probe cloud capabilities whenever the active project changes.
  useEffect(() => {
    if (projectId) fetchCapabilities();
  }, [projectId, fetchCapabilities]);

  // A pure viewer in the cloud (no edit, no branch) sees Dashboards only;
  // everyone who can edit/branch keeps the full toolset. Undefined => TopNav
  // uses its default tools (local serve, or any editor/maintainer).
  const restrictedToDashboards =
    isCloud && capabilities && !capabilities.can_edit && !capabilities.can_branch;
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
        <Link to="/lineage" className="col-span-1">
          <div className="bg-white rounded-lg shadow-2xs hover:shadow-md transition-shadow duration-200 min-h-60">
            <div className="flex flex-col items-center p-8">
              <PiTreeStructure className="w-12 h-12 mb-4 text-gray-700" />
              <div className="bg-[#E6EDF8] w-full text-center py-2 rounded-xs">
                <h5 className="text-xl font-medium text-gray-900">Lineage</h5>
              </div>
              <p className="mt-4 text-gray-600 text-center">
                Visualize and explore your data lineage
              </p>
            </div>
          </div>
        </Link>
        <Link to="/explorer" className="col-span-1">
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
        <Link to="/editor" className="col-span-1">
          <div className="bg-white rounded-lg shadow-2xs hover:shadow-md transition-shadow duration-200 min-h-60">
            <div className="flex flex-col items-center p-8">
              <PiPencil className="w-12 h-12 mb-4 text-gray-700" />
              <div className="bg-[#E6EDF8] w-full text-center py-2 rounded-xs">
                <h5 className="text-xl font-medium text-gray-900">Editor</h5>
              </div>
              <p className="mt-4 text-gray-600 text-center">
                Modify your project and preview changes
              </p>
            </div>
          </div>
        </Link>
        <Link to="/project" className="col-span-1 md:col-span-3">
          <div className="bg-white rounded-lg shadow-2xs hover:shadow-md transition-shadow duration-200">
            <div className="flex flex-col items-center p-8">
              <HiTemplate className="w-12 h-12 mb-4 text-gray-700" />
              <div className="bg-[#E6EDF8] w-full text-center py-2 rounded-xs">
                <h5 className="text-xl font-medium text-gray-900">Project</h5>
              </div>
              <p className="mt-4 text-gray-600 text-center">
                View your project's dashboards and visualizations. Get live updates when you change
                your configurations.
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
        tools={tools}
        editControls={<CloudEditControls />}
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
