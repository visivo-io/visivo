import React, { useEffect, useState } from 'react';
import Authentication from './Authentication';
import BranchSelection from './BranchSelection';
import DeployLoader from './DeployLoader';
import { ModalOverlay, ModalWrapper } from '../styled/Modal';
import { fetchAuthorization } from '../../api/authorization';

const DeployModal = ({ isOpen, setIsOpen }) => {
  const [status, setStatus] = useState('login-required');

  // The same question the Agent tab asks, through the same client (VIS-1377).
  // This used to read `data.token` — the endpoint no longer hands the token to
  // the browser, and it never had a use for it.
  const fetchAuthStatus = async () => {
    try {
      setStatus('loading');
      const { authorized } = await fetchAuthorization();
      setStatus(authorized ? 'branch' : 'login-required');
    } catch {
      setStatus('login-required');
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchAuthStatus();
    }
  }, [isOpen]);

  const renderContent = () => {
    if (status === 'loading') return <DeployLoader />;
    if (status === 'branch') return <BranchSelection status={status} />;
    return <Authentication setStatus={setStatus} />;
  };

  if (!isOpen) return null;

  return (
    <ModalOverlay>
      <ModalWrapper>
        <div className="flex justify-between">
          <h2 className="text-xl font-bold text-gray-900 mb-2">Project Deployment</h2>
          <button
            onClick={() => setIsOpen(false)}
            className="hover:text-gray-800 text-gray-500 text-2xl font-bold focus:outline-none cursor-pointer"
          >
            &times;
          </button>
        </div>
        <div className="flex min-h-[50vh] justify-center items-center flex-col py-4">
          {renderContent()}
        </div>
      </ModalWrapper>
    </ModalOverlay>
  );
};

export default DeployModal;
