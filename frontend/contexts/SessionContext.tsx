import React, { createContext, useContext, useState, useCallback } from 'react';

export type SessionMode = 'profile' | 'hub';

interface SessionState {
  /** Current mode: 'profile' (legacy flow) or 'hub' (new HUB flow) */
  mode: SessionMode;
  /** The athlete currently selected in the HUB */
  activeAthleteId: string | null;
  /** Path to return to after save (used by modules) */
  returnPath: string | null;
}

interface SessionContextValue extends SessionState {
  /** Set active athlete in session */
  setActiveAthlete: (athleteId: string) => void;
  /** Clear active athlete */
  clearActiveAthlete: () => void;
  /** Set return path for post-save navigation */
  setReturnPath: (path: string | null) => void;
  /** Set session mode */
  setMode: (mode: SessionMode) => void;
}

const SessionContext = createContext<SessionContextValue | null>(null);

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<SessionState>({
    mode: 'profile',
    activeAthleteId: null,
    returnPath: null,
  });

  const setActiveAthlete = useCallback((athleteId: string) => {
    setState(prev => ({ ...prev, activeAthleteId: athleteId }));
  }, []);

  const clearActiveAthlete = useCallback(() => {
    setState(prev => ({ ...prev, activeAthleteId: null }));
  }, []);

  const setReturnPath = useCallback((path: string | null) => {
    setState(prev => ({ ...prev, returnPath: path }));
  }, []);

  const setMode = useCallback((mode: SessionMode) => {
    setState(prev => ({ ...prev, mode }));
  }, []);

  return (
    <SessionContext.Provider
      value={{
        ...state,
        setActiveAthlete,
        clearActiveAthlete,
        setReturnPath,
        setMode,
      }}
    >
      {children}
    </SessionContext.Provider>
  );
}

export function useSession(): SessionContextValue {
  const ctx = useContext(SessionContext);
  if (!ctx) {
    // Fallback for components outside provider (safety)
    return {
      mode: 'profile',
      activeAthleteId: null,
      returnPath: null,
      setActiveAthlete: () => {},
      clearActiveAthlete: () => {},
      setReturnPath: () => {},
      setMode: () => {},
    };
  }
  return ctx;
}
