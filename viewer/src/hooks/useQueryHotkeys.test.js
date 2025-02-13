import { renderHook } from '@testing-library/react';
import { useQueryHotkeys } from './useQueryHotkeys';

describe('useQueryHotkeys', () => {
    let mockExecuteQuery;
    let mockEditorRef;
    let mockMonacoRef;
    let mockDisposable;
    
    beforeEach(() => {
        // Reset all mocks
        mockExecuteQuery = jest.fn();
        mockDisposable = { dispose: jest.fn() };
        mockEditorRef = {
            current: {
                addAction: jest.fn().mockReturnValue(mockDisposable)
            }
        };
        mockMonacoRef = {
            current: {
                KeyMod: { CtrlCmd: 2048 },
                KeyCode: { Enter: 3 }
            }
        };
        
        // Clear any previous event listeners
        document.removeEventListener = jest.fn();
        document.addEventListener = jest.fn();
    });

    it('adds global hotkey listener', () => {
        renderHook(() => useQueryHotkeys(mockExecuteQuery));
        expect(document.addEventListener).toHaveBeenCalledWith('keydown', expect.any(Function));
    });

    it('removes global hotkey listener on cleanup', () => {
        const { unmount } = renderHook(() => useQueryHotkeys(mockExecuteQuery));
        unmount();
        expect(document.removeEventListener).toHaveBeenCalledWith('keydown', expect.any(Function));
    });

    it('executes query on Cmd+Enter/Ctrl+Enter when not loading', () => {
        const { result } = renderHook(() => useQueryHotkeys(mockExecuteQuery));
        
        // Get the event handler
        const handler = document.addEventListener.mock.calls[0][1];
        
        // Test Cmd+Enter
        handler({ metaKey: true, key: 'Enter', preventDefault: jest.fn() });
        expect(mockExecuteQuery).toHaveBeenCalled();
        
        // Test Ctrl+Enter
        mockExecuteQuery.mockClear();
        handler({ ctrlKey: true, key: 'Enter', preventDefault: jest.fn() });
        expect(mockExecuteQuery).toHaveBeenCalled();
    });

    it('does not execute query when loading', () => {
        const { result } = renderHook(() => useQueryHotkeys(mockExecuteQuery, true));
        
        // Get the event handler
        const handler = document.addEventListener.mock.calls[0][1];
        
        // Test with loading=true
        handler({ metaKey: true, key: 'Enter', preventDefault: jest.fn() });
        expect(mockExecuteQuery).not.toHaveBeenCalled();
    });

    it('adds Monaco editor action when refs are provided', () => {
        renderHook(() => useQueryHotkeys(mockExecuteQuery, false, mockEditorRef, mockMonacoRef));
        
        expect(mockEditorRef.current.addAction).toHaveBeenCalledWith({
            id: 'execute-query',
            label: 'Execute Query',
            keybindings: [mockMonacoRef.current.KeyMod.CtrlCmd | mockMonacoRef.current.KeyCode.Enter],
            run: expect.any(Function)
        });
    });

    it('disposes Monaco action on cleanup', () => {
        const { unmount } = renderHook(() => 
            useQueryHotkeys(mockExecuteQuery, false, mockEditorRef, mockMonacoRef)
        );
        
        unmount();
        expect(mockDisposable.dispose).toHaveBeenCalled();
    });

    it('executes query through Monaco action when not loading', () => {
        renderHook(() => useQueryHotkeys(mockExecuteQuery, false, mockEditorRef, mockMonacoRef));
        
        // Get the run function from the action
        const action = mockEditorRef.current.addAction.mock.calls[0][0];
        action.run();
        
        expect(mockExecuteQuery).toHaveBeenCalled();
    });

    it('does not execute query through Monaco action when loading', () => {
        renderHook(() => useQueryHotkeys(mockExecuteQuery, true, mockEditorRef, mockMonacoRef));
        
        // Get the run function from the action
        const action = mockEditorRef.current.addAction.mock.calls[0][0];
        action.run();
        
        expect(mockExecuteQuery).not.toHaveBeenCalled();
    });
}); 