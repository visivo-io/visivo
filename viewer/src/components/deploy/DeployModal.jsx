import React, { useEffect, useState } from 'react';
import Authentication from './Authentication';
import StageSelection from './StageSelection';
import DeployLoader from './DeployLoader';
import { ModalOverlay, ModalWrapper } from '../styled/Modal';

const DeployModal = ({ isOpen, setIsOpen }) => {
  const [status, setStatus] = useState('login-required');

  const fetchAuthStatus = async () => {
    try {
      setStatus('loading');
      const response = await fetch('/api/auth/status/', { method: 'POST' });
      if (!response.ok) throw new Error('Auth status check failed');
      const data = await response.json();
      setStatus(data?.token ? 'stage' : 'login-required');
    } catch {
      setStatus('login-required');
    }
  };

  useEffect(() => {
    fetchAuthStatus();
  }, []);

  const renderContent = () => {
    if (status === 'loading') return <DeployLoader />;
    if (status === 'stage') return <StageSelection status={status} />;
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
