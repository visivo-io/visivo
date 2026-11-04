import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import './onboarding.css';
import { CONCEPTS } from './concepts';
import Role from './screens/Role';
import Concept from './screens/Concept';
import Start from './screens/Start';
import { fireEvent } from './telemetry';
import { readOnboardingState, writeOnboardingState } from './onboardingState';
import SourceEditForm from '../views/common/SourceEditForm';
import useStore from '../../stores/store';
import logo from '../../images/logo.png';
import { useViewerNavigate } from '../../hooks/useViewerNavigate';
import useEscapeToClose from '../../hooks/useEscapeToClose';

function buildSteps() {
  return [
    { kind: 'start' },
    { kind: 'role' },
    ...CONCEPTS.map((c, i) => ({ kind: 'concept', concept: c, idx: i + 1 })),
  ];
}

export function sampleDestination(sample) {
  return sample?.dashboard ? `/project/${encodeURIComponent(sample.dashboard)}` : '/project';
}

export default function OnboardingFlow() {
  const navigate = useViewerNavigate();
  const project = useStore(s => s.project);
  const fetchProject = useStore(s => s.fetchProject);

  const projectDir = project?.project_dir ?? '';
  const projectName = project?.name || 'Quickstart Visivo';

  const persisted = useRef(readOnboardingState() || {});
  const startTs = useRef(Date.now());

  const steps = useMemo(buildSteps, []);
  const [stepIdx, setStepIdx] = useState(0);
  const [role, setRoleRaw] = useState(persisted.current.role ?? '');
  // Wrapping setRole so that switching role mid-flow clears the per-item
  // coach_dismissed set. Otherwise a user who picks "Other" first and
  // dismisses the deploy hint would never see analytics_engineer's
  // `define_metric` hint after switching, even though it's a brand-new
  // item they've never been shown.
  const setRole = useCallback(nextRole => {
    setRoleRaw(prev => {
      if (nextRole !== prev) {
        const ps = persisted.current;
        if (ps && Array.isArray(ps.coach_dismissed) && ps.coach_dismissed.length > 0) {
          persisted.current = { ...ps, coach_dismissed: [] };
          writeOnboardingState(persisted.current);
        }
      }
      return nextRole;
    });
  }, []);
  const [showSourceModal, setShowSourceModal] = useState(false);
  const [sampleLoading, setSampleLoading] = useState(false);
  const [sampleLoadingText, setSampleLoadingText] = useState('');
  const [errorMessage, setErrorMessage] = useState(null);
  const [sourceSaving, setSourceSaving] = useState(false);

  useEscapeToClose(showSourceModal, () => !sourceSaving && setShowSourceModal(false));

  // Loading a sample makes the server broadcast `reload`; a hard page reload
  // here would drop the pending navigation to the sample's dashboard.
  useEffect(() => {
    const previous = window.__VISIVO_SOFT_RELOAD__;
    window.__VISIVO_SOFT_RELOAD__ = true;
    return () => {
      window.__VISIVO_SOFT_RELOAD__ = previous;
    };
  }, []);

  const fire = useCallback((event, props = {}) => {
    fireEvent(event, { role: role || null, ...props });
  }, [role]);

  const persistProgress = useCallback(
    extra => {
      const next = {
        ...persisted.current,
        last_step_idx: stepIdx,
        role,
        ...extra,
      };
      persisted.current = next;
      writeOnboardingState(next);
    },
    [stepIdx, role]
  );

  useEffect(() => {
    persistProgress();
  }, [stepIdx, role, persistProgress]);

  const current = steps[stepIdx];
  const isLastStep = stepIdx >= steps.length - 1;
  const goNext = () => setStepIdx(i => (i >= steps.length - 1 ? 0 : i + 1));
  const handleBack = () => {
    if (stepIdx === 0) return;
    if (current?.kind === 'concept') {
      fire('onboarding_concept_back_clicked', { concept: current.concept.id });
    }
    setStepIdx(stepIdx - 1);
  };

  const goToConcept = useCallback(
    conceptId => {
      const idx = steps.findIndex(s => s.kind === 'concept' && s.concept.id === conceptId);
      if (idx >= 0) {
        fire('onboarding_concept_back_clicked', { concept: conceptId, via: 'dag' });
        setStepIdx(idx);
      }
    },
    [steps, fire]
  );

  // keyboard nav: ← goes back a step in the concept tour
  useEffect(() => {
    const onKey = e => {
      // Skip while the source dialog is open or a field has focus, so ← never
      // moves the flow behind an open form.
      if (showSourceModal) return;
      const el = e.target;
      const tag = el?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el?.isContentEditable) return;
      if (e.key === 'ArrowLeft' && stepIdx > 0) handleBack();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stepIdx, current, showSourceModal]);

  const completeAndNavigate = useCallback(
    ({ destination, path, sample = null, sourceConnected = false }) => {
      const totalDurationMs = Date.now() - startTs.current;
      fire('onboarding_completed', {
        path,
        total_duration_ms: totalDurationMs,
        source_connected: sourceConnected,
        cloud_connected: false,
      });
      writeOnboardingState({
        ...persisted.current,
        completed_at: new Date().toISOString(),
        path,
        sample,
        source_connected: sourceConnected,
        cloud_connected: false,
        total_duration_ms: totalDurationMs,
        destination,
      });
      // Refresh the project so isNewProject flips and Home renders the real app
      const refreshed = fetchProject ? fetchProject() : Promise.resolve();
      Promise.resolve(refreshed).finally(() => {
        navigate(destination, { replace: true });
      });
    },
    [navigate, fetchProject, fire]
  );

  const handleSkip = useCallback(() => {
    fire('onboarding_opt_out_clicked');
    writeOnboardingState({
      ...persisted.current,
      role: role || null,
      completed_at: new Date().toISOString(),
      path: 'skipped',
      checklist_dismissed: true,
    });
    navigate('/editor', { replace: true });
  }, [fire, role, navigate]);

  const handleSamplePick = useCallback(
    async sample => {
      setSampleLoading(true);
      setSampleLoadingText(`Building ${sample.title}…`);
      setErrorMessage(null);
      try {
        const res = await fetch('/api/project/load_example/', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            project_name: projectName,
            project_dir: projectDir,
            example_type: sample.apiKey,
          }),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.message || 'Failed to import the example dashboard.');
        }
        setSampleLoadingText('Opening the dashboard…');
        completeAndNavigate({
          destination: sampleDestination(sample),
          path: 'sample',
          sample: sample.name,
        });
      } catch (err) {
        setErrorMessage(err.message || 'Failed to import sample.');
        setSampleLoading(false);
      }
    },
    [projectDir, projectName, completeAndNavigate]
  );

  const handleConnected = useCallback(
    sourceType => {
      fire('onboarding_data_connect_succeeded', { source_type: sourceType });
      setShowSourceModal(false);
      completeAndNavigate({
        destination: '/workspace/exploration',
        path: 'data',
        sourceConnected: true,
      });
    },
    [fire, completeAndNavigate]
  );

  const handleSourceFormSave = useCallback(
    async (_type, _name, config) => {
      setSourceSaving(true);
      setErrorMessage(null);
      try {
        const sourceForm = new FormData();
        const appendField = (k, v) => sourceForm.append(k, v ?? '');
        appendField('project_name', projectName);
        appendField('source_name', config?.name);
        appendField('source_type', config?.type);
        appendField('port', config?.port);
        appendField('database', config?.database);
        appendField('host', config?.host);
        appendField('username', config?.username);
        appendField('password', config?.password);
        appendField('account', config?.account);
        appendField('warehouse', config?.warehouse);
        appendField('credentials_base64', config?.credentials_base64);
        appendField('project', config?.project);
        appendField('dataset', config?.dataset);
        appendField('project_dir', projectDir);
        const sourceRes = await fetch('/api/source/create/', {
          method: 'POST',
          body: sourceForm,
        });
        const sourceData = await sourceRes.json().catch(() => ({}));
        if (!sourceRes.ok) {
          throw new Error(sourceData.message || 'Failed to connect to the data source.');
        }
        const source = sourceData.source;

        let dashboard = null;
        if (config?.file) {
          const uploadForm = new FormData();
          uploadForm.append('file', config.file);
          uploadForm.append('project_dir', projectDir);
          uploadForm.append('source_type', config?.type);
          const uploadRes = await fetch('/api/source/upload/', {
            method: 'POST',
            body: uploadForm,
          });
          const uploadData = await uploadRes.json().catch(() => ({}));
          if (!uploadRes.ok) {
            throw new Error(uploadData.message || 'Failed to upload the file.');
          }
          dashboard = uploadData.dashboard;
        }

        const finalizeRes = await fetch('/api/project/finalize/', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            project_name: projectName,
            project_dir: projectDir,
            sources: [source],
            dashboards: dashboard ? [dashboard] : [],
          }),
        });
        if (!finalizeRes.ok) {
          const data = await finalizeRes.json().catch(() => ({}));
          throw new Error(data.message || 'Failed to finalize the project.');
        }

        handleConnected(config?.type || 'unknown');
        return { success: true };
      } catch (err) {
        setErrorMessage(err.message || 'Failed to connect the source.');
        return { success: false, message: err.message };
      } finally {
        setSourceSaving(false);
      }
    },
    [projectDir, projectName, handleConnected]
  );

  // Render current step
  let body = null;
  if (current.kind === 'start') {
    body = (
      <Start
        role={role}
        onConnectClick={() => setShowSourceModal(true)}
        onSamplePick={handleSamplePick}
        onStartEmpty={handleSkip}
        onTakeTour={goNext}
        fire={fire}
        isLoadingSample={sampleLoading}
        loadingText={sampleLoadingText}
      />
    );
  } else if (current.kind === 'role') {
    body = <Role role={role} onPick={setRole} onContinue={goNext} fire={fire} />;
  } else if (current.kind === 'concept') {
    body = (
      <Concept
        concept={current.concept}
        step={current.idx}
        role={role || 'other'}
        onNavigate={goToConcept}
        fire={fire}
      />
    );
  }

  const progress = Math.min(stepIdx / (steps.length - 1), 1);
  const isTour = current.kind !== 'start';

  return (
    <div className="onb-frame" data-testid="onboarding-frame">
      <div className="onb-branch">
        {isTour && (
          <div className="onb-progress">
            <div
              className="onb-progress__fill"
              style={{ width: `${progress * 100}%` }}
              data-testid="onboarding-progress"
            />
          </div>
        )}

        {isTour && (
          <div className="onb-meta">
            <button
              className="onb-meta__back"
              onClick={handleBack}
              disabled={stepIdx === 0}
              data-testid="onb-back"
            >
              <span style={{ fontSize: 14 }}>←</span> Back
            </button>
            <span className="onb-meta__brand">
              <img src={logo} alt="Visivo" />
              Visivo onboarding
            </span>
            <span className="onb-meta__step" data-testid="onb-step-label">
              {current.kind === 'concept'
                ? `Concept ${current.idx} of ${CONCEPTS.length}`
                : 'Concept tour'}
            </span>
          </div>
        )}

        <div
          className="onb-screen"
          key={`${current?.kind}-${current?.idx || ''}-${stepIdx}`}
          data-testid={`onb-step-${current?.kind}${current?.idx ? `-${current.idx}` : ''}`}
        >
          {body}
        </div>

        {current?.kind === 'concept' && (
          <div className="onb-concept-cta">
            <button
              className="onb-btn onb-btn--primary"
              onClick={goNext}
              data-testid="onb-concept-continue"
              style={{ boxShadow: '0 10px 30px -12px rgba(0,0,0,0.25)' }}
            >
              {isLastStep ? 'Pick a sample' : 'Continue'}{' '}
              <span style={{ opacity: 0.7 }}>→</span>
            </button>
          </div>
        )}

        {errorMessage && (
          <div
            style={{
              position: 'absolute',
              top: 14,
              left: '50%',
              transform: 'translateX(-50%)',
              background: '#d25946',
              color: '#fff',
              padding: '10px 18px',
              borderRadius: 9999,
              fontSize: 13,
              zIndex: 70,
              boxShadow: '0 6px 16px -8px rgba(0,0,0,0.25)',
            }}
            role="alert"
          >
            {errorMessage}
            <button
              onClick={() => setErrorMessage(null)}
              style={{
                background: 'transparent',
                border: 0,
                color: '#fff',
                marginLeft: 12,
                cursor: 'pointer',
              }}
            >
              ✕
            </button>
          </div>
        )}

        {showSourceModal && (
          <div
            className="onb-modal-backdrop"
            onClick={() => !sourceSaving && setShowSourceModal(false)}
          >
            <div
              className="onb-modal"
              onClick={e => e.stopPropagation()}
              data-testid="onb-source-modal"
            >
              <div className="onb-modal__head">
                <div>
                  <h3 className="onb-modal__title">Add a Source</h3>
                  <div style={{ fontSize: 12, color: 'var(--onb-fg-muted)', marginTop: 2 }}>
                    Credentials are saved to a local <code>.env</code> file and referenced securely
                    — never written into your project.
                  </div>
                </div>
                <button
                  className="onb-modal__close"
                  onClick={() => !sourceSaving && setShowSourceModal(false)}
                  aria-label="Close"
                >
                  ✕
                </button>
              </div>
              <div className="onb-modal__body">
                <SourceEditForm
                  isCreate
                  onClose={() => !sourceSaving && setShowSourceModal(false)}
                  onSave={handleSourceFormSave}
                />
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
