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

  // Check commit status on mount
  useEffect(() => {
    checkCommitStatus();
  }, [checkCommitStatus]);

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
