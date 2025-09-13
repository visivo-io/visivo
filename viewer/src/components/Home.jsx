import { Outlet, useLocation, Link, Navigate } from 'react-router-dom';
import Breadcrumbs from './common/Breadcrumbs';
import ProjectHistory from './project/ProjectHistory';
import { useLoaderData } from 'react-router-dom';
import Error from './styled/Error';
import TopNav from './common/TopNav';
import { HiTemplate } from 'react-icons/hi';
import { PiTreeStructure, PiMagnifyingGlass, PiPencil } from 'react-icons/pi';
import useStore from '../stores/store';
import Loading from './common/Loading';
import DeployModal from './deploy/DeployModal';
import { useState } from 'react';

const Home = () => {
  const error = useLoaderData();
  const location = useLocation();
  const isRoot = location.pathname === '/';
  const isProject = location.pathname.startsWith('/project');
  const [isDeployOpen, setIsDeployOpen] = useState(false);

  const isNewProject = useStore(state => state.isNewProject);

  if (isNewProject === undefined) {
    return (
      <div className="flex items-center justify-center h-screen w-screen">
        <Loading />
      </div>
    );
  }

  if (isNewProject && isRoot) return <Navigate to="/onboarding" />;

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

  return (
    <div className="visivo-home min-h-screen bg-gray-50">
      <TopNav onDeployClick={onDeployClick} />
      <DeployModal isOpen={isDeployOpen} setIsOpen={setIsDeployOpen} />
      <div className={'pt-14'}>
        {isProject && (
          <div className="flex flex-row justify-between items-center whitespace-nowrap py-1">
            <Breadcrumbs />
            <ProjectHistory />
          </div>
        )}
        {error && error.message && <Error>{error.message}</Error>}
        {isRoot ? renderNavigationCards() : <Outlet />}
      </div>
    </div>
  );
};

export default Home;
