import { Outlet } from 'react-router-dom';
import Breadcrumbs from './Breadcrumbs';
import ProjectHistory from './ProjectHistory';

const Home = () => {
  return (
    <div>
      <div className='mx-2'>
        <div className="flex flex-row justify-between items-center whitespace-nowrap">
          <Breadcrumbs />
          <ProjectHistory />
        </div>
        <Outlet />
      </div>
    </div>
  );
}

export default Home;
