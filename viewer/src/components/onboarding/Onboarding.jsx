import React, { useEffect, useRef } from 'react';
import { Navigate } from 'react-router-dom';

import OnboardingFlow from './OnboardingFlow';
import useStore from '../../stores/store';
import Loading from '../common/Loading';
import { hasOptedOutOfOnboarding } from './onboardingState';

const Onboarding = () => {
  const project = useStore(state => state.project);
  const fetchProject = useStore(state => state.fetchProject);
  const isNewProject = useStore(state => state.isNewProject);
  const isOnBoardingLoading = useStore(state => state.isOnBoardingLoading);

  useEffect(() => {
    if (!project) fetchProject?.();
  }, [project, fetchProject]);

  // Read once the project is known: "Start with an empty project" writes the
  // opt-out and then navigates itself, and a re-render must not race it.
  const optedOut = useRef(null);
  const loading = isOnBoardingLoading || isNewProject === undefined;
  if (!loading && optedOut.current === null) optedOut.current = hasOptedOutOfOnboarding();

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen w-screen">
        <Loading />
      </div>
    );
  }

  if (optedOut.current) return <Navigate to="/" replace />;

  return <OnboardingFlow />;
};

export default Onboarding;
