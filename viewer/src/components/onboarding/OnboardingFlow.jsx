import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import './onboarding.css';
import { CONCEPTS } from './concepts';
import Welcome from './screens/Welcome';
import Role from './screens/Role';
import Concept from './screens/Concept';
import Data from './screens/Data';
import Cloud from './screens/Cloud';
import Handoff from './screens/Handoff';
import { fireEvent } from './telemetry';
import { readOnboardingState, writeOnboardingState } from './onboardingState';
import { createSource, finalizeProject, loadExample, uploadSourceFile } from './onboardingApi';
import SourceEditForm from '../new-views/common/SourceEditForm';
import useStore from '../../stores/store';
import logo from '../../images/logo.png';

function buildSteps() {
  return [
    { kind: 'welcome' },
    { kind: 'role' },
    ...CONCEPTS.map((c, i) => ({ kind: 'concept', concept: c, idx: i + 1 })),
    { kind: 'data' },
    { kind: 'cloud' },
    { kind: 'handoff' },
  ];
}

export default function OnboardingFlow() {
  const navigate = useNavigate();
  const project = useStore(s => s.project);
  const fetchProject = useStore(s => s.fetchProject);

  const projectDir = project?.project_json?.project_dir ?? '';
  const projectName = project?.project_json?.name || 'Quickstart Visivo';

  const persisted = useRef(readOnboardingState() || {});
  const startTs = useRef(Date.now());

  const steps = useMemo(buildSteps, []);
  const [stepIdx, setStepIdx] = useState(() => persisted.current.last_step_idx ?? 0);
  const [role, setRole] = useState(persisted.current.role ?? '');
  const [showSourceModal, setShowSourceModal] = useState(false);
  const [showSkipConfirm, setShowSkipConfirm] = useState(false);
  const [outcome, setOutcome] = useState({
    path: null,
    sample: null,
    sourceConnected: false,
    cloudConnected: false,
  });
  const [sampleLoading, setSampleLoading] = useState(false);
  const [sampleLoadingText, setSampleLoadingText] = useState('');
  const [errorMessage, setErrorMessage] = useState(null);
  const [sourceSaving, setSourceSaving] = useState(false);

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
  const goNext = () => setStepIdx(i => Math.min(i + 1, steps.length - 1));
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

  // keyboard nav: ← goes back, except on welcome/handoff
  useEffect(() => {
    const onKey = e => {
      if (e.key === 'ArrowLeft' && stepIdx > 0 && current?.kind !== 'handoff') handleBack();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stepIdx, current]);

  const completeAndNavigate = useCallback(
    destination => {
      const completedAt = new Date().toISOString();
      const totalDurationMs = Date.now() - startTs.current;
      writeOnboardingState({
        ...persisted.current,
        completed_at: completedAt,
        path: outcome.path,
        sample: outcome.sample,
        source_connected: outcome.sourceConnected,
        cloud_connected: outcome.cloudConnected,
        total_duration_ms: totalDurationMs,
        destination,
      });
      // Refresh the project so isNewProject flips and Home renders the real app
      fetchProject?.().finally(() => {
        navigate(destination, { replace: true });
      });
    },
    [navigate, outcome, fetchProject]
  );

  const handleSkip = useCallback(() => {
    fire('onboarding_opt_out_clicked');
    writeOnboardingState({
      ...persisted.current,
      role: role || null,
      completed_at: new Date().toISOString(),
      path: 'skipped',
    });
    navigate('/editor', { replace: true });
  }, [fire, role, navigate]);

  const handleSamplePick = useCallback(
    async sample => {
      setSampleLoading(true);
      setSampleLoadingText('Importing example…');
      setErrorMessage(null);
      try {
        await loadExample({
          projectName,
          projectDir,
          exampleType: sample.apiKey,
        });
        setSampleLoadingText('Preparing project…');
        setOutcome(o => ({ ...o, path: 'sample', sample: sample.name }));
        // Skip cloud screen if we want? Brief says cloud comes after data either way.
        // Move to cloud step.
        const cloudIdx = steps.findIndex(s => s.kind === 'cloud');
        setStepIdx(cloudIdx);
      } catch (err) {
        setErrorMessage(err.message || 'Failed to import sample.');
      } finally {
        setSampleLoading(false);
      }
    },
    [projectDir, projectName, steps]
  );

  const handleConnected = useCallback(
    sourceType => {
      fire('onboarding_data_connect_succeeded', { source_type: sourceType });
      setShowSourceModal(false);
      setOutcome(o => ({ ...o, path: 'data', sourceConnected: true }));
      const cloudIdx = steps.findIndex(s => s.kind === 'cloud');
      setStepIdx(cloudIdx);
    },
    [fire, steps]
  );

  const handleSourceFormSave = useCallback(
    async (_type, _name, config) => {
      setSourceSaving(true);
      setErrorMessage(null);
      try {
        const source = await createSource({ projectName, projectDir, config });
        let dashboard = null;
        if (config?.file) {
          dashboard = await uploadSourceFile({ projectDir, config });
        }
        await finalizeProject({
          projectName,
          projectDir,
          sources: [source],
          dashboards: dashboard ? [dashboard] : [],
        });
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

  const handleHandoff = useCallback(() => {
    let destination = '/editor';
    if (outcome.sourceConnected) destination = '/explorer';
    else if (outcome.path === 'sample') destination = '/project';
    setTimeout(() => completeAndNavigate(destination), 1400);
    return destination;
  }, [outcome, completeAndNavigate]);

  // Render current step
  let body = null;
  if (current?.kind === 'welcome') {
    body = (
      <Welcome
        onContinue={goNext}
        onSkip={() => setShowSkipConfirm(true)}
        fire={fire}
      />
    );
  } else if (current?.kind === 'role') {
    body = <Role role={role} onPick={setRole} onContinue={goNext} fire={fire} />;
  } else if (current?.kind === 'concept') {
    body = (
      <Concept
        concept={current.concept}
        step={current.idx}
        role={role || 'other'}
        onNavigate={goToConcept}
        fire={fire}
      />
    );
  } else if (current?.kind === 'data') {
    body = (
      <Data
        role={role || 'other'}
        onConnectClick={() => setShowSourceModal(true)}
        onSamplePick={handleSamplePick}
        fire={fire}
        isLoadingSample={sampleLoading}
        loadingText={sampleLoadingText}
      />
    );
  } else if (current?.kind === 'cloud') {
    body = (
      <Cloud
        role={role || 'other'}
        connected={outcome.cloudConnected}
        onConnect={() => setOutcome(o => ({ ...o, cloudConnected: true }))}
        onLater={goNext}
        onConnectedDone={goNext}
        fire={fire}
      />
    );
  } else if (current?.kind === 'handoff') {
    let destination = '/editor';
    if (outcome.sourceConnected) destination = '/explorer';
    else if (outcome.path === 'sample') destination = '/project';
    body = (
      <Handoff
        destination={destination}
        totalDurationMs={Date.now() - startTs.current}
        sourceConnected={outcome.sourceConnected}
        cloudConnected={outcome.cloudConnected}
        fire={fire}
      />
    );
  }

  // Auto-handoff trigger
  useEffect(() => {
    if (current?.kind === 'handoff') {
      handleHandoff();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current?.kind]);

  const total = steps.length - 1; // exclude handoff itself
  const progress = Math.min(stepIdx / total, 1);

  return (
    <div className="onb-frame" data-testid="onboarding-frame">
      <div className="onb-stage">
        <div className="onb-progress">
          <div
            className="onb-progress__fill"
            style={{ width: `${progress * 100}%` }}
            data-testid="onboarding-progress"
          />
        </div>

        {current?.kind !== 'handoff' && (
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
              {current?.kind === 'concept'
                ? `Concept ${current.idx} of ${CONCEPTS.length}`
                : current?.kind === 'welcome'
                ? 'Welcome'
                : current?.kind === 'role'
                ? 'Step 1'
                : current?.kind === 'data'
                ? 'Connect your data'
                : current?.kind === 'cloud'
                ? 'Cloud (optional)'
                : ''}
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
              Continue <span style={{ opacity: 0.7 }}>→</span>
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
                    Credentials never leave your machine.
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

        {showSkipConfirm && (
          <div className="onb-modal-backdrop" onClick={() => setShowSkipConfirm(false)}>
            <div className="onb-confirm" onClick={e => e.stopPropagation()}>
              <h3>Skip onboarding?</h3>
              <p>
                You'll go straight to the editor with an empty project. You can re-trigger this
                later from the Help menu.
              </p>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                <button
                  className="onb-btn onb-btn--ghost"
                  onClick={() => setShowSkipConfirm(false)}
                >
                  Cancel
                </button>
                <button
                  className="onb-btn onb-btn--secondary"
                  onClick={handleSkip}
                  data-testid="onb-skip-confirm"
                >
                  Yes, skip
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
