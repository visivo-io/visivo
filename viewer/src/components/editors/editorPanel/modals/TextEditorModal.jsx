import React, { useState, useEffect } from 'react';
import useStore from '../../../../stores/store';

const editorIcons = {
  vscode:
    'https://raw.githubusercontent.com/vscode-icons/vscode-icons/master/icons/file_type_vscode.svg',
  cursor: 'https://cursor.sh/favicon.ico',
  sublime: 'https://www.sublimetext.com/favicon.ico',
  notepadpp: 'https://notepad-plus-plus.org/favicon.ico',
  atom: 'https://atom-editor.cc/favicon.ico',
  nvim: 'https://raw.githubusercontent.com/neovim/neovim.github.io/master/logos/neovim-mark.svg',
  textmate: 'https://macromates.com/favicon.ico',
  webstorm:
    'https://resources.jetbrains.com/storage/products/webstorm/img/meta/webstorm_logo_300x300.png',
  vim: 'https://www.vim.org/images/vim_shortcut.ico',
  notepad: 'https://windows93.net/c/programs/notepad/icon.png',
  bbedit: 'https://www.barebones.com/favicon.ico',
};

const TextEditorModal = ({ isOpen, onClose, objectName, setSnackBarOpen, setMessage }) => {
  const [editors, setEditors] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const namedChildren = useStore(state => state.namedChildren);

  useEffect(() => {
    const fetchInstalledEditors = async () => {
      try {
        const response = await fetch('/api/editors/installed');
        if (response.ok) {
          const data = await response.json();
          setEditors(data);
        } else {
          throw new Error('Failed to fetch installed editors');
        }
      } catch (error) {
        setError('Failed to load installed editors');
        console.error('Error:', error);
      }
    };

    if (isOpen) {
      fetchInstalledEditors();
    }
  }, [isOpen]);

  const handleEditorSelect = async editor => {
    if (!objectName || !namedChildren[objectName]) return;

    const filePath = namedChildren[objectName].file_path;
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/editors/open', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          editorId: editor.id,
          filePath: filePath,
        }),
      });
      let data = await response.json();

      setSnackBarOpen(true);
      setMessage(data?.message ?? '');

      if (!response.ok) {
        throw new Error('Failed to open editor');
      }

      setError('Failed to open editor');

      onClose();
    } catch (error) {
      setError('Failed to open editor');
      console.error('Error:', error);
    } finally {
      setIsLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 backdrop-blur-sm bg-black/30 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 max-w-md w-full">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-semibold text-gray-900">Open in Text Editor</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-700 transition-colors">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg">
            {error}
          </div>
        )}

        <div className="space-y-2">
          {editors.length === 0 ? (
            <p className="text-gray-500 text-center py-4">
              {isLoading ? 'Loading editors...' : 'No text editors found'}
            </p>
          ) : (
            editors.map(editor => (
              <button
                key={editor.id}
                onClick={() => handleEditorSelect(editor)}
                disabled={isLoading}
                className="w-full text-left px-4 py-3 rounded-lg hover:bg-gray-50 flex items-center space-x-3 disabled:opacity-50 transition-colors border border-gray-100 hover:border-gray-200"
              >
                <div className="flex-shrink-0 w-8 h-8 rounded-md overflow-hidden bg-gray-50 flex items-center justify-center">
                  <img
                    src={editorIcons[editor.id]}
                    alt={`${editor.name} icon`}
                    className="w-6 h-6 object-contain"
                    onError={e => {
                      e.target.src =
                        'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="%23999"><path d="M19.4 7.34L16.66 4.6A2 2 0 0014.84 4H9.16a2 2 0 00-1.82.6L4.6 7.34a2 2 0 00-.6 1.82v4.68a2 2 0 00.6 1.82l2.74 2.74a2 2 0 001.82.6h5.68a2 2 0 001.82-.6l2.74-2.74a2 2 0 00.6-1.82V9.16a2 2 0 00-.6-1.82zM13 17h-2v-2h2v2zm0-4h-2V7h2v6z"/></svg>';
                    }}
                  />
                </div>
                <span className="text-gray-900 font-medium">{editor.name}</span>
                {isLoading && (
                  <div className="ml-auto">
                    <svg
                      className="animate-spin h-4 w-4 text-gray-500"
                      xmlns="http://www.w3.org/2000/svg"
                      fill="none"
                      viewBox="0 0 24 24"
                    >
                      <circle
                        className="opacity-25"
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        strokeWidth="4"
                      ></circle>
                      <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                      ></path>
                    </svg>
                  </div>
                )}
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
};

export default TextEditorModal;
