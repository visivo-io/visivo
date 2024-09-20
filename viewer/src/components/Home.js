import { Outlet } from 'react-router-dom';
import Breadcrumbs from './Breadcrumbs';
import ProjectHistory from './ProjectHistory';
import { useLoaderData } from 'react-router-dom';

const Home = () => {
  const error = useLoaderData()
  return (
    <div>
      <div className='mx-2'>
        <div className="flex flex-row justify-between items-center whitespace-nowrap">
          <Breadcrumbs />
          <ProjectHistory />
          {error && error.message && <div>{error.message}</div>}
        </div>
        <Outlet />
      </div>
    </div>
  );
}

export default Home;
