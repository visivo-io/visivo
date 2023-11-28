import { Outlet } from 'react-router-dom';
import Breadcrumbs from './Breadcrumbs';

const Home = () => {
  return (
    <>
      <div className='mx-2'>
        <Breadcrumbs />
        <Outlet />
      </div>
    </>
  );
}

export default Home;
