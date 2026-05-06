import React, { useMemo, useEffect, useRef, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { throttle } from 'lodash';
import useStore from '../../../stores/store';
import DashboardNew from './DashboardNew';
import Loading from '../../common/Loading';
import { Container } from '../../styled/Container';
import { HiTemplate } from 'react-icons/hi';
import DashboardSection from '../../project/DashboardSection';
import FilterBar from '../../project/FilterBar';
import { SINGLE_SELECT, MULTI_SELECT } from '../../items/Input';

/**
 * ProjectNew - Container component for the new project view
 * Fetches data from stores and passes to DashboardNew
 * Similar to ProjectContainer but uses stores instead of project_json
 */
function ProjectNew() {
  const { dashboardName } = useParams();
  const [searchParams] = useSearchParams();
  const elementId = searchParams.get('element_id');

  // Store access
  const project = useStore(state => state.project);
  const dashboards = useStore(state => state.dashboards);
  const dashboardsLoading = useStore(state => state.dashboardsLoading);
  const fetchDashboards = useStore(state => state.fetchDashboards);
  const defaults = useStore(state => state.defaults);
  const fetchDefaults = useStore(state => state.fetchDefaults);
  const inputs = useStore(state => state.inputs);
  const fetchInputs = useStore(state => state.fetchInputs);
  const setDefaultInputJobValues = useStore(state => state.setDefaultInputJobValues);

  // Scroll restoration
  const setScrollPosition = useStore(state => state.setScrollPosition);
  const scrollPositions = useStore(state => state.scrollPositions[dashboardName]);
  const throttleRef = useRef();
  const [windowPosition, setWindowPosition] = useState('');

  // Filtering state from store
  const filteredDashboards = useStore(state => state.filteredDashboards);
  const dashboardsByLevel = useStore(state => state.dashboardsByLevel);
  const initializeDashboardView = useStore(state => state.initializeDashboardView);

  // Fetch dashboards + defaults + inputs on mount. Defaults previously came
  // from project.project_json.defaults (legacy bulk blob); now sourced from
  // the dedicated endpoints via the per-resource stores.
  useEffect(() => {
    fetchDashboards();
    fetchDefaults();
    fetchInputs();
  }, [fetchDashboards, fetchDefaults, fetchInputs]);

  // Capture ?element_id= once so subsequent re-renders can scroll to it.
  useEffect(() => {
    if (elementId && windowPosition === '') {
      setWindowPosition(elementId);
    }
  }, [elementId, windowPosition]);

  // Throttled scroll-position recorder, keyed by dashboard name.
  useEffect(() => {
    throttleRef.current = throttle(name => {
      setScrollPosition(name, window.scrollY);
    }, 100);
  }, [setScrollPosition]);

  useEffect(() => {
    const handleScroll = () => throttleRef.current?.(dashboardName);
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, [dashboardName]);

  // Restore scroll on dashboard change (or scroll to element_id if present).
  useEffect(() => {
    const savedPos = scrollPositions || 0;
    if (window.location.hash) return;
    if (windowPosition && windowPosition !== '') {
      requestAnimationFrame(() => {
        window.scrollTo(0, windowPosition);
        setWindowPosition(null);
      });
    } else {
      requestAnimationFrame(() => {
        window.scrollTo(0, savedPos);
      });
    }
  }, [dashboardName, scrollPositions, windowPosition, searchParams]);

  // Prime input default values once inputs have been fetched. Previously
  // this walked project_json.dashboards[].rows[].items[].input.default;
  // now we walk the input store directly and read input.config.display.default.
  useEffect(() => {
    if (!inputs || inputs.length === 0) return;
    const inputDefaults = [];
    for (const input of inputs) {
      const cfg = input?.config;
      if (!cfg) continue;
      const inputType = cfg.type;
      if (inputType !== SINGLE_SELECT && inputType !== MULTI_SELECT) continue;
      const defaultValue = cfg.display?.default;
      if (defaultValue === undefined || defaultValue === null) continue;
      inputDefaults.push({ name: input.name, value: defaultValue, type: inputType });
    }
    if (inputDefaults.length > 0) {
      setDefaultInputJobValues(inputDefaults);
    }
  }, [inputs, setDefaultInputJobValues]);

  // Transform dashboards for navigation (similar to ProjectContainer)
  const dashboardsList = useMemo(() => {
    if (!dashboards) {
      return [];
    }
    return dashboards.map(dashboard => ({
      name: dashboard.name,
      description: dashboard.config.description,
      tags: dashboard.config.tags ?? [],
      level: dashboard.config.level,
      type: dashboard.config.type,
      href: dashboard.config.href ?? null,
      path: '',
    }));
  }, [dashboards]);

  // Initialize dashboard filtering system when dashboards load
  useEffect(() => {
    if (dashboardsList.length > 0) {
      initializeDashboardView(dashboardsList, dashboardName, defaults);
    }
  }, [dashboardsList, dashboardName, defaults, initializeDashboardView]);

  // Loading state
  if (dashboardsLoading) {
    return <Loading />;
  }

  // No project
  if (!project) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-gray-500">No project loaded</div>
      </div>
    );
  }

  // No dashboards
  if (!dashboards || dashboards.length === 0) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-gray-400">No dashboards found</div>
      </div>
    );
  }

  // Render dashboard list when no specific dashboard is selected
  if (!dashboardName) {
    return (
      <Container className="min-h-screen">
        <div className="max-w-[2000px] w-full mx-auto pt-1 px-4 sm:px-6 h-full">
          <FilterBar />

          <div className="flex-1 w-full">
            {Object.entries(dashboardsByLevel).map(([level, dashboards]) => (
              <DashboardSection
                key={level}
                title={level}
                dashboards={dashboards}
                projectId={project.id}
                hasLevels={Object.keys(dashboardsByLevel).length > 1}
                projectDefaults={defaults}
              />
            ))}

            {filteredDashboards.length === 0 && (
              <div className="w-full text-center py-8 bg-white rounded-lg shadow-2xs border border-gray-200">
                <HiTemplate className="mx-auto h-10 w-10 text-gray-400" />
                <h3 className="mt-2 text-sm font-medium text-gray-900">No dashboards found</h3>
                <p className="mt-1 text-sm text-gray-500">
                  No dashboards match your search criteria.
                </p>
              </div>
            )}
          </div>
        </div>
      </Container>
    );
  }

  // Render specific dashboard
  return (
    <DashboardNew
      projectId={project.id}
      dashboardName={dashboardName}
    />
  );
}

export default ProjectNew;
