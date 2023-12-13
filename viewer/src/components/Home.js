import { Outlet } from 'react-router-dom';
import Breadcrumbs from './Breadcrumbs';

const Home = () => {
  return (
    <div>
      <div className='mx-2'>
        <Breadcrumbs />
        <Outlet />
      </div>
    </div>
  );
}

export default Home;
