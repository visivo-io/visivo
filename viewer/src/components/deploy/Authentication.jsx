import React, { useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faLock, faZap } from '@fortawesome/free-solid-svg-icons';
import Loading from '../common/Loading';
import { openOauthPopupWindow } from '../../utils/utils';
import { authorizationProgress, startAuthorization } from '../../api/authorization';

const Authentication = ({ setStatus }) => {
  const [isLoading, setIsLoading] = useState(false);
  const [loadingText, setLoadingText] = useState('Loading ...');

  const handleAuthentication = async () => {
    setIsLoading(true);

    try {
      // Through the shared client, so Deploy and the Agent tab drive one
      // device flow rather than two that drift (VIS-1377).
      const { authId, url } = await startAuthorization();

      setLoadingText('Redirecting ...');
      openOauthPopupWindow(url);

      pollAuthStatus(authId);
    } catch (error) {
      setIsLoading(false);
    }
  };

  const pollAuthStatus = (authId, maxRetries = 30) => {
    let retries = 0;

    const interval = setInterval(async () => {
      if (retries >= maxRetries) {
        clearInterval(interval);
        setIsLoading(false);
        return;
      }

      try {
        const progress = await authorizationProgress(authId);
        retries++;

        setLoadingText(progress.message);

        if (progress.done) {
          clearInterval(interval);
          setIsLoading(false);
          setStatus('branch');
        } else if (progress.failed) {
          clearInterval(interval);
          setIsLoading(false);
        }
      } catch (error) {
        clearInterval(interval);
        setIsLoading(false);
      }
    }, 2000);
  };

  return (
    <div className="text-center space-y-6">
      <div className="mx-auto w-20 h-20 bg-gradient-to-br from-purple-100 to-pink-100 rounded-full flex items-center justify-center mb-6">
        <FontAwesomeIcon icon={faLock} className="w-10 h-10 text-purple-600" />
      </div>

      <div className="space-y-3">
        <h3 className="text-xl font-semibold text-gray-900">Authentication Required</h3>
        <p className="text-gray-600 leading-relaxed">
          You need to be logged in to deploy your project to our secure cloud infrastructure.
        </p>
      </div>

      <div className="bg-gradient-to-r from-purple-50 to-pink-50 rounded-lg p-4 border border-purple-100">
        <div className="flex items-center space-x-3 text-sm text-purple-700">
          <FontAwesomeIcon icon={faZap} className="w-4 h-4 flex-shrink-0" />
          <span>Deploy instantly with zero-config setup</span>
        </div>
      </div>

      <button
        disabled={isLoading}
        onClick={handleAuthentication}
        className="w-full bg-[#713B57] text-white font-medium py-3 px-6 rounded-xl hover:bg-[#5A2F46] transform hover:scale-[1.02] transition-all duration-200 shadow-lg hover:shadow-xl cursor-pointer"
      >
        {isLoading ? <Loading text={loadingText} /> : 'Login'}
      </button>
    </div>
  );
};

export default Authentication;
