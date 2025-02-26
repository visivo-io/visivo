import { useEffect } from 'react';

export const useQueryHotkeys = (onExecuteQuery, isLoading = false, editorRef = null, monacoRef = null) => {
    // Handle global hotkey
    useEffect(() => {
        const handleKeyDown = (e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                e.preventDefault();
                if (!isLoading) {
                    onExecuteQuery();
                }
            }
        };

        document.addEventListener('keydown', handleKeyDown);
        return () => document.removeEventListener('keydown', handleKeyDown);
    }, [onExecuteQuery, isLoading]);

    // Handle Monaco editor command
    useEffect(() => {
        if (editorRef?.current && monacoRef?.current) {
            const editor = editorRef.current;
            const monaco = monacoRef.current;
            
            // Add the command to Monaco editor
            const disposable = editor.addAction({
                id: 'execute-query',
                label: 'Execute Query',
                keybindings: [
                    monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter
                ],
                run: () => {
                    if (!isLoading) {
                        onExecuteQuery();
                    }
                }
            });

            // Return cleanup function
            return () => {
                disposable?.dispose();
            };
        }
    }, [editorRef, monacoRef, onExecuteQuery, isLoading]);
}; 