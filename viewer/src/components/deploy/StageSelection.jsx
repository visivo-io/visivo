import React, { useEffect, useState } from 'react';
import Loading from '../common/Loading';
import DeployLoader from './DeployLoader';
import AddStageForm from './AddStageForm';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faCircleInfo,
  faCloudArrowUp,
  faTriangleExclamation,
  faPlus,
  faCheckCircle,
  faExternalLinkAlt,
  faRedo,
} from '@fortawesome/free-solid-svg-icons';

const StageSelection = ({ status }) => {
  const [stages, setStages] = useState([]);
  const [selectedStage, setSelectedStage] = useState('');
  const [loading, setLoading] = useState(false);
  const [deploying, setDeploying] = useState(false);
  const [deployingMsg, setDeployingMsg] = useState('Deploying...');
  const [deploymentSuccess, setDeploymentSuccess] = useState(false);
  const [previewUrl, setPreviewUrl] = useState('');
  const [showAddForm, setShowAddForm] = useState(false);

  useEffect(() => {
    if (status !== 'stage') return;

    const fetchStages = async () => {
      setLoading(true);
      try {
        const res = await fetch('/api/cloud/stages/');
        const data = await res.json();
        setStages(data.stages || []);
      } catch (err) {
        setStages([]);
      } finally {
        setLoading(false);
      }
    };

    fetchStages();
  }, [status]);

  const resetDeploymentState = () => {
    setDeploying(false);
    setDeploymentSuccess(false);
    setDeployingMsg('Deploying...');
    setPreviewUrl('');
  };

  const pollDeploymentStatus = (deployId, maxRetries = 30) => {
    let retries = 0;

    const interval = setInterval(async () => {
      if (retries >= maxRetries) {
        clearInterval(interval);
        resetDeploymentState();
        return;
      }

      try {
        const res = await fetch(`/api/cloud/job/status/${deployId}/`);
        const data = await res.json();
        retries++;

        setDeployingMsg(data.message || 'Deploying ...');

        if (data.status === 201) {
          clearInterval(interval);
          setDeploying(false);
          setDeploymentSuccess(true);
          if (data.project_url) {
            const baseUrl = 'https://app.visivo.io';
            setPreviewUrl(new URL(data.project_url, baseUrl).toString());
          }
        } else if ([400, 404, 500].includes(data.status)) {
          clearInterval(interval);
          resetDeploymentState();
        }
      } catch (err) {
        clearInterval(interval);
        resetDeploymentState();
      }
    }, 2000);
  };

  const handleDeploy = async () => {
    resetDeploymentState();
    if (!selectedStage) return;

    setDeploying(true);
    try {
      const res = await fetch('/api/cloud/deploy/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: selectedStage }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      pollDeploymentStatus(data.deploy_id);
    } catch (err) {
      setDeploying(false);
      setDeployingMsg('Deployment failed');
    }
  };

  if (loading) return <DeployLoader message="Loading Stages..." />;

  return (
    <div className="w-full max-w-md space-y-6">
      {/* Header */}
      <div className="text-center space-y-3">
        <div
          className={`mx-auto w-16 h-16 rounded-full flex items-center justify-center mb-4 ${
            deploymentSuccess ? 'bg-green-500' : 'bg-[#713B57]'
          }`}
        >
          <FontAwesomeIcon
            icon={deploymentSuccess ? faCheckCircle : faCloudArrowUp}
            className="text-white text-2xl"
          />
        </div>
        <h3 className="text-xl font-semibold text-gray-900">
          {deploymentSuccess ? 'Deployment Successful!' : 'Select Deployment Stage'}
        </h3>
        <p className="text-gray-600">
          {deploymentSuccess
            ? `Your project has been successfully deployed to ${selectedStage}`
            : 'Choose the environment where you want to deploy your project'}
        </p>
      </div>

      {/* Success State */}
      {deploymentSuccess ? (
        <div className="space-y-4">
          <div className="p-4 bg-green-50 border border-green-200 rounded-md">
            <div className="flex items-start">
              <FontAwesomeIcon
                icon={faCheckCircle}
                className="w-5 h-5 text-green-400 mt-0.5 mr-2"
              />
              <div className="text-sm flex-1">
                <p className="font-medium text-green-800">Deployment Complete</p>
                <p className="text-green-600 mt-1">
                  Your application is now live on {selectedStage} environment.
                </p>
              </div>
            </div>
          </div>

          {previewUrl && (
            <a
              href={previewUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full py-3 px-4 bg-green-500 hover:bg-green-600 text-white rounded-md font-medium transition-colors flex items-center justify-center shadow-lg"
            >
              <FontAwesomeIcon icon={faExternalLinkAlt} className="w-5 h-5 mr-2" />
              View Live Preview
            </a>
          )}

          <button
            onClick={resetDeploymentState}
            className="w-full py-3 px-4 bg-[#713B57] hover:bg-[#5A2F46] text-white rounded-md font-medium transition-colors flex items-center justify-center shadow-lg"
          >
            <FontAwesomeIcon icon={faRedo} className="w-5 h-5 mr-2" />
            Deploy Again
          </button>
        </div>
      ) : (
        // Deployment Form
        <div className="space-y-4">
          {/* Stage Selector */}
          <div>
            <label htmlFor="stage-select" className="block text-sm font-medium text-gray-700 mb-2">
              Deployment Environment
            </label>
            <select
              id="stage-select"
              value={selectedStage}
              onChange={e => setSelectedStage(e.target.value)}
              disabled={deploying}
              className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="">Select a stage...</option>
              {stages.map(stage => (
                <option key={stage.id || stage.name} value={stage.name}>
                  {stage.name}
                </option>
              ))}
            </select>
          </div>

          {/* Add Stage Button */}
          {!showAddForm && (
            <button
              disabled={deploying}
              onClick={() => setShowAddForm(true)}
              className="cursor-pointer w-full py-2 px-4 border-2 border-dashed border-gray-300 rounded-md text-gray-600 hover:border-[#713B57] hover:text-[#713B57] transition-colors flex items-center justify-center"
            >
              <FontAwesomeIcon icon={faPlus} className="w-4 h-4 mr-2" />
              Add New Stage
            </button>
          )}

          {showAddForm && (
            <AddStageForm
              stages={stages}
              setStages={setStages}
              setSelectedStage={setSelectedStage}
              onClose={() => setShowAddForm(false)}
            />
          )}

          {/* Info Box */}
          {selectedStage && !deploying && (
            <div className="p-3 bg-blue-50 border border-blue-200 rounded-md">
              <div className="flex items-start">
                <FontAwesomeIcon
                  icon={faCircleInfo}
                  className="w-5 h-5 text-blue-400 mt-0.5 mr-2"
                />
                <div className="text-sm">
                  <p className="font-medium text-blue-800">Ready to deploy to {selectedStage}</p>
                  <p className="text-blue-600 mt-1">
                    Make sure your code is ready for the {selectedStage} environment.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Deploy Button */}
          <button
            onClick={handleDeploy}
            disabled={!selectedStage || deploying}
            className={`w-full py-3 px-4 rounded-md font-medium transition-colors ${
              !selectedStage || deploying
                ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                : 'bg-[#713B57] hover:bg-[#5A2F46] hover:scale-101 text-white shadow-lg cursor-pointer'
            }`}
          >
            {deploying ? (
              <div className="flex items-center justify-center gap-2">
                <Loading w="4" h="4" />
                {deployingMsg}
              </div>
            ) : (
              <div className="flex items-center justify-center">
                <FontAwesomeIcon icon={faCloudArrowUp} className="w-5 h-5 mr-2" />
                Deploy to {selectedStage || 'Stage'}
              </div>
            )}
          </button>
        </div>
      )}

      {/* No Stages Warning */}
      {stages.length === 0 && !loading && !deploymentSuccess && (
        <div className="text-center p-4 bg-yellow-50 border border-yellow-200 rounded-md">
          <FontAwesomeIcon
            icon={faTriangleExclamation}
            className="w-8 h-8 text-yellow-400 mx-auto mb-2"
          />
          <p className="text-sm font-medium text-yellow-800">No stages available</p>
        </div>
      )}
    </div>
  );
};

export default StageSelection;
