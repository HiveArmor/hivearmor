/**
 * useUndoRedo — 50-step undo/redo stack for nodes + edges
 */

import { useCallback, useState } from 'react';

export function useUndoRedo<T>(initialState: T): {
  state: T;
  setState: (newState: T) => void;
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
} {
  const [history, setHistory] = useState<T[]>([initialState]);
  const [pointer, setPointer] = useState(0);

  const state = history[pointer];

  const setState = useCallback(
    (newState: T) => {
      setHistory((prev) => {
        const truncated = prev.slice(0, pointer + 1);
        return [...truncated, newState].slice(-50);
      });
      setPointer((p) => Math.min(p + 1, 49));
    },
    [pointer]
  );

  const undo = useCallback(() => {
    setPointer((p) => Math.max(p - 1, 0));
  }, []);

  const redo = useCallback(() => {
    setPointer((p) => Math.min(p + 1, history.length - 1));
  }, [history.length]);

  return {
    state,
    setState,
    undo,
    redo,
    canUndo: pointer > 0,
    canRedo: pointer < history.length - 1,
  };
}
