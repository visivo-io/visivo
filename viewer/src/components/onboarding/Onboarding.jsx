import React, { useEffect, useRef } from 'react';
import { Navigate } from 'react-router-dom';

import OnboardingFlow from './OnboardingFlow';
import useStore from '../../stores/store';
import Loading from '../common/Loading';
import { hasCompletedOnboarding } from './onboardingState';

const Onboarding = () => {
  const project = useStore(state => state.project);
  const fetchProject = useStore(state => state.fetchProject);
  const isOnBoardingLoading = useStore(state => state.isOnBoardingLoading);

  // Capture once whether onboarding was already completed at mount time.
  // The flow itself writes `completed_at` during skip/handoff and then
  // calls navigate(destination). If we re-evaluated hasCompletedOnboarding()
  // on every render, the second render after skip would short-circuit with
  // <Navigate to="/" /> and race the navigate('/editor') call from the flow.
  const wasCompletedAtMount = useRef(hasCompletedOnboarding());

  useEffect(() => {
    if (!project) fetchProject?.();
  }, [project, fetchProject]);

  if (isOnBoardingLoading) {
    return (
      <div className="flex items-center justify-center h-screen w-screen">
        <Loading />
      </div>
    );
  }

  if (wasCompletedAtMount.current) {
    return <Navigate to="/" replace />;
  }

  return <OnboardingFlow />;
};

export default Onboarding;
