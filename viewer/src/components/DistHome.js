import { Outlet, useLocation, Link } from 'react-router-dom';
import Breadcrumbs from './Breadcrumbs';
import ProjectHistory from './ProjectHistory';
import { useLoaderData } from 'react-router-dom';
import Error from './styled/Error';
import { SearchParamsProvider } from '../contexts/SearchParamsContext';
import TopNav from './TopNav';

const DistHome = () => {
  const error = useLoaderData();

  return (
    <SearchParamsProvider>
      <div className="min-h-screen bg-gray-50">
        <TopNav />
        <div className={"mx-4"}>
            <div className="flex flex-row justify-between items-center whitespace-nowrap py-4">
              <Breadcrumbs />
              <ProjectHistory />
            </div>
          {error && error.message && (
            <Error>{error.message}</Error>
          )}
          <Outlet />
        </div>
      </div>
    </SearchParamsProvider>
  );
}

export default DistHome;
