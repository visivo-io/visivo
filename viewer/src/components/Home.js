import { Outlet } from 'react-router-dom';
import Breadcrumbs from './Breadcrumbs';
import ProjectHistory from './ProjectHistory';
import { useLoaderData } from 'react-router-dom';
import Error from './styled/Error';
import { SearchParamsProvider } from '../contexts/SearchParamsContext';

const Home = () => {
  const error = useLoaderData()
  return (
    <SearchParamsProvider>
      <div>
        <div className='mx-2'>
          <div className="flex flex-row justify-between items-center whitespace-nowrap">
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

export default Home;
