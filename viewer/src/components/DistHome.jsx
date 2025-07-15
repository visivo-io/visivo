import { Outlet } from 'react-router-dom';
import Breadcrumbs from './common/Breadcrumbs';
import { useLoaderData } from 'react-router-dom';
import Error from './styled/Error';
import ProjectHistory from './project/ProjectHistory';

const DistHome = () => {
  const error = useLoaderData();

  return (
    <div className="min-h-screen bg-gray-50">
      <div className={'mx-4'}>
        <div className="flex flex-row justify-between items-center whitespace-nowrap py-4">
          <Breadcrumbs />
          <ProjectHistory />
        </div>
        {error && error.message && <Error>{error.message}</Error>}
        <Outlet />
      </div>
    </div>
  );
};

export default DistHome;
