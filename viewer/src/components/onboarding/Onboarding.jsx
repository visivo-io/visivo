import React, { useState, useEffect } from 'react';
import logo from '../../images/logo.png';
import ProjectModal from './ProjectModal';
import CreateObjectModal from '../editors/CreateObjectModal';
import Loading from '../common/Loading';
import { faArrowRight, faPlus } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import useStore from '../../stores/store';
import { Navigate } from 'react-router-dom';
import FeatureCard from './FeatureCard';
import { Toast } from 'flowbite-react';
import { HiExclamation, HiX } from 'react-icons/hi';
import { GiAmericanFootballBall } from 'react-icons/gi';

const ACTIONS = {
  DATA_SOURCE: 'Data Source',
  GITHUB_RELEASE: 'github-releases',
  EV_SALES: 'ev-sales',
  COLLEGE_FOOTBALL: 'college-football',
};

const Onboarding = () => {
  const [projectName, setProjectName] = useState('');
  const [showNameModal, setShowNameModal] = useState(false);
  const [tempProjectName, setTempProjectName] = useState('');
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [loadingText, setLoadingText] = useState('Creating project ...');
  const [loadingAction, setLoadingAction] = useState('');
  const [showErrorToast, setShowErrorToast] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [selectedExample] = useState(ACTIONS.GITHUB_RELEASE);

  const isNewProject = useStore(state => state.isNewProject);
  const isOnBoardingLoading = useStore(state => state.isOnBoardingLoading);
  const project = useStore(state => state.project);
  const projectDir = project?.project_json?.project_dir ?? '';

  useEffect(() => {
    if (!projectName) {
      setShowNameModal(true);
      setTempProjectName('');
    }
  }, [projectName]);

  useEffect(() => {
    if (showErrorToast) {
      const timeout = setTimeout(() => setShowErrorToast(false), 5000);
      return () => clearTimeout(timeout);
    }
  }, [showErrorToast]);

  const closeLoading = () => {
    setLoadingText('');
    setLoadingAction('');
    setIsLoading(false);
  };

  const handleSetProjectName = () => {
    const trimmedName = tempProjectName.trim();
    if (trimmedName) {
      setProjectName(trimmedName);
      setShowNameModal(false);
    }
  };

  const handleToggleSourceModal = () => {
    setIsCreateModalOpen(prev => !prev);
  };

  const safeAppend = (key, value, formData) => {
    formData.append(key, value ?? '');
  };

  const createSource = async config => {
    const formData = new FormData();
    safeAppend('project_name', projectName, formData);
    safeAppend('source_name', config?.name, formData);
    safeAppend('source_type', config?.type, formData);
    safeAppend('port', config?.port, formData);
    safeAppend('database', config?.database, formData);
    safeAppend('host', config?.host, formData);
    safeAppend('username', config?.username, formData);
    safeAppend('password', config?.password, formData);
    safeAppend('account', config?.account, formData);
    safeAppend('warehouse', config?.warehouse, formData);
    safeAppend('credentials_base64', config?.credentials_base64, formData);
    safeAppend('project', config?.project, formData);
    safeAppend('dataset', config?.dataset, formData);
    safeAppend('project_dir', projectDir, formData);

    const res = await fetch('/api/source/create/', {
      method: 'POST',
      body: formData,
    });

    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.message || 'Failed to connect to the data source.');
    }

    return data.source;
  };

  const uploadSourceFile = async config => {
    const formData = new FormData();
    formData.append('file', config.file);
    formData.append('project_dir', projectDir);
    formData.append('source_type', config?.type);

    const res = await fetch('/api/source/upload/', {
      method: 'POST',
      body: formData,
    });

    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.message || 'Failed to upload the file.');
    }

    return data.dashboard;
  };

  const finalizeProject = async (config, source, dashboard) => {
    const res = await fetch('/api/project/finalize/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        project_name: projectName,
        project_dir: projectDir,
        sources: [source],
        dashboards: dashboard ? [dashboard] : [],
      }),
    });

    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.message || 'Failed to finalize the project.');
    }

    return data;
  };

  const handleAddDataSource = async data => {
    const { config } = data;
    setLoadingAction(ACTIONS.DATA_SOURCE);
    setIsLoading(true);

    try {
      setLoadingText('Connecting source...');
      const source = await createSource(config);

      let dashboard = null;

      if (config?.file) {
        setLoadingText('Uploading file...');
        dashboard = await uploadSourceFile(config);
      }

      setLoadingText('Finalizing project...');
      await finalizeProject(config, source, dashboard);
      setIsLoading(true);
      setLoadingText('Preparing dashboards...');
    } catch (err) {
      const message = err?.message ?? 'An unexpected error occurred.';
      setErrorMessage(message);
      setShowErrorToast(true);
    }
  };

  const handleLoadExample = async (exampleType = selectedExample) => {
    setLoadingAction(exampleType);
    setLoadingText('Importing example...');
    setIsLoading(true);

    const response = await fetch('/api/project/load_example/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        project_name: projectName,
        example_type: exampleType,
        project_dir: projectDir,
      }),
    });

    if (!response.ok) {
      const data = await response.json();
      const message = data.message;
      setErrorMessage(message ?? 'Failed to import the example dashboard.');
      setShowErrorToast(true);
      closeLoading();
    } else {
      setLoadingText('Preparing project ...');
    }
  };

  const isLoadingAction = action => isLoading && loadingAction === action;

  if (isOnBoardingLoading) {
    return (
      <div className="flex items-center justify-center h-screen w-screen">
        <Loading />
      </div>
    );
  }

  if (!isNewProject) return <Navigate to="/" replace />;

  return (
    <>
      {showErrorToast && (
        <div className="fixed top-4 left-1/2 transform -translate-x-1/2 z-60">
          <Toast className="bg-[#D25946] text-white border-none">
            <div className="inline-flex items-center">
              <HiExclamation className="h-4 w-4 mr-3" />
              {errorMessage}
              <button onClick={() => setShowErrorToast(false)} className="ml-3 hover:text-gray-200">
                <HiX className="h-4 w-4" />
              </button>
            </div>
          </Toast>
        </div>
      )}
      <CreateObjectModal
        isOpen={isCreateModalOpen}
        onClose={handleToggleSourceModal}
        objSelectedProperty="sources"
        objStep="type"
        onSubmitCallback={handleAddDataSource}
      />

      <div className="fixed top-4 left-4 z-10">
        <div className="inline-flex items-center px-6 py-3 bg-white rounded-full shadow-lg border border-gray-200">
          <div className="w-3 h-3 bg-green-500 rounded-full mr-3 animate-pulse" />
          <span className="text-lg font-semibold text-gray-700">Project: {projectName}</span>
        </div>
      </div>

      <div className="min-h-screen flex flex-col items-center justify-center max-w-5xl mx-auto px-4 pb-2 pt-2">
        <div className="text-center mb-4">
          <img src={logo} alt="Visivo" className="w-32 mx-auto mt-4 mb-4" />
          <h1 className="text-3xl font-bold text-gray-900 mb-6">Welcome to Visivo</h1>
        </div>
        {/* Example Dashboards */}
        <div className="bg-white rounded-2xl shadow-xl p-4 mb-8 w-full">
          <h3 className="text-xl font-semibold text-center text-gray-800 mb-3">
            Jump right in and try an example
          </h3>
          <p className="text-center text-gray-600 mb-6">
            A very easy way to get started and explore what is possible is to try one of our sample
            dashboards.
          </p>

          <div className="grid md:grid-cols-1 lg:grid-cols-3 gap-4">
            {/* GitHub Releases Example */}
            <div className="p-4 border-2 border-gray-200 rounded-xl hover:border-blue-300 bg-gradient-to-r from-gray-50 to-blue-50 hover:from-blue-50 hover:to-indigo-50 transition-all">
              <div className="flex flex-col items-center text-center mb-4">
                <div className="w-16 h-16 bg-gray-800 rounded-lg flex items-center justify-center mb-3">
                  <svg
                    className="w-8 h-8 text-white"
                    fill="currentColor"
                    viewBox="0 0 24 24"
                    aria-hidden="true"
                  >
                    <path
                      fillRule="evenodd"
                      clipRule="evenodd"
                      d="M12 0C5.37 0 0 5.373 0 12c0 5.303 3.438 9.8 8.205 11.387.6.113.82-.258.82-.577
                        0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61-.546-1.387-1.333-1.756-1.333-1.756-1.09-.745.083-.73.083-.73
                        1.205.085 1.84 1.237 1.84 1.237 1.07 1.834 2.807 1.304 3.492.997.108-.775.418-1.304.762-1.604-2.665-.305-5.467-1.334-5.467-5.931
                        0-1.31.467-2.381 1.235-3.221-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23a11.5 11.5 0 0 1 3-.404c1.02.005 2.045.138 3
                        .404 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.911 1.23 3.221 0 4.61-2.807 5.625-5.48 5.921
                        .42.36.81 1.096.81 2.21 0 1.595-.015 2.88-.015 3.275 0 .315.21.69.825.57C20.565 21.795 24 17.295 24 12c0-6.627-5.373-12-12-12z"
                    />
                  </svg>
                </div>
                <div>
                  <h4 className="text-lg font-semibold text-gray-800 mb-2">GitHub Releases</h4>
                  <p className="text-gray-600 text-sm">
                    Explore Visivo's GitHub release data with visualizations and metrics.
                  </p>
                </div>
              </div>
              <div className="flex justify-center">
                <button
                  onClick={() => handleLoadExample(ACTIONS.GITHUB_RELEASE)}
                  className="px-6 py-2 text-sm font-medium bg-[#713B57] text-white rounded-md hover:bg-[#5A2F46]"
                  disabled={isLoading}
                >
                  <div className="flex items-center space-x-2">
                    {isLoadingAction(ACTIONS.GITHUB_RELEASE) ? (
                      <Loading text={loadingText} width={16} />
                    ) : (
                      <>
                        <span>Import</span>
                        <FontAwesomeIcon icon={faArrowRight} />
                      </>
                    )}
                  </div>
                </button>
              </div>
            </div>

            {/* EV Sales Example */}
            <div className="p-4 border-2 border-gray-200 rounded-xl hover:border-green-300 bg-gradient-to-r from-gray-50 to-green-50 hover:from-green-50 hover:to-emerald-50 transition-all">
              <div className="flex flex-col items-center text-center mb-4">
                <div className="w-16 h-16 bg-green-600 rounded-lg flex items-center justify-center mb-3">
                  <svg
                    className="w-8 h-8 text-white"
                    fill="currentColor"
                    viewBox="0 0 24 24"
                    aria-hidden="true"
                  >
                    <path d="M18.92 6.01C18.72 5.42 18.16 5 17.5 5h-11c-.66 0-1.22.42-1.42 1.01L3 12v8c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-1h12v1c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-8l-2.08-5.99zM6.5 16c-.83 0-1.5-.67-1.5-1.5S5.67 13 6.5 13s1.5.67 1.5 1.5S7.33 16 6.5 16zm11 0c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zM5 11l1.5-4.5h11L19 11H5z" />
                  </svg>
                </div>
                <div>
                  <h4 className="text-lg font-semibold text-gray-800 mb-2">EV Sales Data</h4>
                  <p className="text-gray-600 text-sm">
                    Analyze electric vehicle sales trends and market insights.
                  </p>
                </div>
              </div>
              <div className="flex justify-center">
                <button
                  onClick={() => handleLoadExample(ACTIONS.EV_SALES)}
                  className="px-6 py-2 text-sm font-medium bg-[#713B57] text-white rounded-md hover:bg-[#5A2F46]"
                  disabled={isLoading}
                >
                  <div className="flex items-center space-x-2">
                    {isLoadingAction(ACTIONS.EV_SALES) ? (
                      <Loading text={loadingText} width={16} />
                    ) : (
                      <>
                        <span>Import</span>
                        <FontAwesomeIcon icon={faArrowRight} />
                      </>
                    )}
                  </div>
                </button>
              </div>
            </div>

            {/* College Football Example */}
            <div className="p-4 border-2 border-gray-200 rounded-xl hover:border-orange-300 bg-gradient-to-r from-gray-50 to-orange-50 hover:from-orange-50 hover:to-amber-50 transition-all">
              <div className="flex flex-col items-center text-center mb-4">
                <div className="w-16 h-16 bg-orange-600 rounded-lg flex items-center justify-center mb-3">
                  <GiAmericanFootballBall className="w-8 h-8 text-white" />
                </div>
                <div>
                  <h4 className="text-lg font-semibold text-gray-800 mb-2">College Football</h4>
                  <p className="text-gray-600 text-sm">
                    Analyze 2024 season statistics and team performance data.
                  </p>
                </div>
              </div>
              <div className="flex justify-center">
                <button
                  onClick={() => handleLoadExample(ACTIONS.COLLEGE_FOOTBALL)}
                  className="px-6 py-2 text-sm font-medium bg-[#713B57] text-white rounded-md hover:bg-[#5A2F46]"
                  disabled={isLoading}
                >
                  <div className="flex items-center space-x-2">
                    {isLoadingAction(ACTIONS.COLLEGE_FOOTBALL) ? (
                      <Loading text={loadingText} width={16} />
                    ) : (
                      <>
                        <span>Import</span>
                        <FontAwesomeIcon icon={faArrowRight} />
                      </>
                    )}
                  </div>
                </button>
              </div>
            </div>
          </div>
        </div>
        {/* Add Data Source */}
        <div className="w-full max-w-4xl mb-8">
          <div className="bg-white rounded-2xl shadow-xl p-8">
            <h3 className="text-xl font-semibold text-center text-gray-800 mb-3">
              Or connect your data
            </h3>
            <p className="text-center text-gray-600 mb-6">
              Start by adding your first data source. We support databases, APIs, CSV files, and
              more.
            </p>

            <div className="flex justify-center">
              <button
                onClick={handleToggleSourceModal}
                className="px-12 py-3 text-lg font-semibold bg-[#713B57] text-white rounded-md hover:bg-[#5A2F46]"
                disabled={isLoading}
              >
                <div className="flex items-center space-x-2">
                  {isLoadingAction(ACTIONS.DATA_SOURCE) ? (
                    <Loading text={loadingText} />
                  ) : (
                    <>
                      <FontAwesomeIcon icon={faPlus} className="w-6 h-6 ml-1" />
                      <span>Add Data Source</span>
                    </>
                  )}
                </div>
              </button>
            </div>
          </div>
        </div>

        {/* Feature Cards */}
        <FeatureCard />
      </div>

      {showNameModal && (
        <ProjectModal
          handleSetProjectName={handleSetProjectName}
          tempProjectName={tempProjectName}
          setTempProjectName={setTempProjectName}
          projectDir={projectDir}
        />
      )}
    </>
  );
};

export default Onboarding;
