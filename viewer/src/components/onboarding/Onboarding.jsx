import React, { useEffect, useRef } from 'react';
import { Navigate } from 'react-router-dom';

import OnboardingFlow from './OnboardingFlow';
import useStore from '../../stores/store';
import Loading from '../common/Loading';
import { clearOnboardingState, hasCompletedOnboarding } from './onboardingState';

const Onboarding = () => {
  const project = useStore(state => state.project);
  const fetchProject = useStore(state => state.fetchProject);
  const isNewProject = useStore(state => state.isNewProject);
  const isOnBoardingLoading = useStore(state => state.isOnBoardingLoading);

  useEffect(() => {
    if (!project) fetchProject?.();
  }, [project, fetchProject]);

  // If the backend reports a fresh empty project (Home redirects users
  // here when isNewProject is true), wipe any stale completed_at from a
  // previous session. Without this, Home → /onboarding → /
  // → Home → /onboarding becomes an infinite redirect loop the moment
  // a user reuses a browser profile across projects.
  const clearedRef = useRef(false);
  if (isNewProject === true && hasCompletedOnboarding() && !clearedRef.current) {
    clearOnboardingState();
    clearedRef.current = true;
  }

  // Capture once whether onboarding was already completed at mount time.
  // The flow writes `completed_at` during skip/handoff and then calls
  // navigate(destination). Re-evaluating hasCompletedOnboarding() on every
  // render would short-circuit the second render with <Navigate to="/" />
  // and race the navigate('/editor') call from the flow.
  const wasCompletedAtMount = useRef(hasCompletedOnboarding());

  if (isOnBoardingLoading || isNewProject === undefined) {
    return (
      <div className="flex items-center justify-center h-screen w-screen">
        <Loading />
      </div>
    );
  }

  // Only short-circuit when we're sure the user landed on /onboarding
  // for a non-fresh project (someone navigated here manually after
  // already completing it once). When isNewProject is true we always
  // render the flow — Home wouldn't have sent them here otherwise.
  if (wasCompletedAtMount.current && isNewProject === false) {
    return <Navigate to="/" replace />;
  }

  return <OnboardingFlow />;
};

export default Onboarding;
