import { Outlet, useLocation, Link } from 'react-router-dom';
import Breadcrumbs from './common/Breadcrumbs';
import ProjectHistory from './project/ProjectHistory';
import { useLoaderData } from 'react-router-dom';
import Error from './styled/Error';
import { SearchParamsProvider } from '../contexts/SearchParamsContext';
import TopNav from './common/TopNav';
import { HiTemplate, HiOutlineDatabase, HiOutlineSearch } from 'react-icons/hi';

const Home = () => {
  const error = useLoaderData();
  const location = useLocation();
  const isRoot = location.pathname === '/';
  const isProject = location.pathname.startsWith('/project');

  const renderNavigationCards = () => (
    <div className="container mx-auto px-4 py-12">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 gap-8 max-w-5xl mx-auto">
        <Link to="/dag" className="col-span-1">
          <div className="bg-white rounded-lg shadow-2xs hover:shadow-md transition-shadow duration-200">
            <div className="flex flex-col items-center p-8">
              <HiOutlineDatabase className="w-12 h-12 mb-4 text-gray-700" />
              <div className="bg-[#E6EDF8] w-full text-center py-2 rounded-xs">
                <h5 className="text-xl font-medium text-gray-900">DAG Explorer</h5>
              </div>
              <p className="mt-4 text-gray-600 text-center">
                Visualize and explore your data lineage
              </p>
            </div>
          </div>
        </Link>
        <Link to="/query" className="col-span-1">
          <div className="bg-white rounded-lg shadow-2xs hover:shadow-md transition-shadow duration-200">
            <div className="flex flex-col items-center p-8">
              <HiOutlineSearch className="w-12 h-12 mb-4 text-gray-700" />
              <div className="bg-[#E6EDF8] w-full text-center py-2 rounded-xs">
                <h5 className="text-xl font-medium text-gray-900">Query Explorer</h5>
              </div>
              <p className="mt-4 text-gray-600 text-center">Explore and analyze your data</p>
            </div>
          </div>
        </Link>
        <Link to="/project" className="col-span-1 md:col-span-2">
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

  return (
    <SearchParamsProvider>
      <div className="visivo-home min-h-screen bg-gray-50">
        <TopNav />
        <div className={isProject ? '' : 'mx-4'}>
          {isProject && (
            <div className="flex flex-row justify-between items-center whitespace-nowrap py-4">
              <Breadcrumbs />
              <ProjectHistory />
            </div>
          )}
          {error && error.message && <Error>{error.message}</Error>}
          {isRoot ? renderNavigationCards() : <Outlet />}
        </div>
      </div>
    </SearchParamsProvider>
  );
};

export default Home;
