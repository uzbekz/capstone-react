import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import "./Snackbar.css";

const SnackbarContext = createContext(null);

const DEFAULT_DURATION = 3200;
const VARIANT_META = {
  info: {
    title: "Notice",
    icon: "i"
  },
  success: {
    title: "Success",
    icon: "check"
  },
  error: {
    title: "Error",
    icon: "!"
  },
  warning: {
    title: "Attention",
    icon: "!"
  }
};

export function SnackbarProvider({ children }) {
  const [snackbar, setSnackbar] = useState(null);
  const timeoutRef = useRef(null);

  const dismissSnackbar = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    setSnackbar(null);
  }, []);

  const showSnackbar = useCallback((message, variant = "info", duration = DEFAULT_DURATION) => {
    if (!message) {
      return;
    }

    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    setSnackbar({
      id: Date.now(),
      message,
      variant,
      duration
    });

    timeoutRef.current = setTimeout(() => {
      setSnackbar(null);
      timeoutRef.current = null;
    }, duration);
  }, []);

  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  const value = useMemo(() => ({
    showSnackbar,
    dismissSnackbar
  }), [showSnackbar, dismissSnackbar]);

  return (
    <SnackbarContext.Provider value={value}>
      {children}
      <div className="snackbar-stack" aria-live="polite" aria-atomic="true">
        {snackbar ? (
          <div key={snackbar.id} className={`snackbar snackbar-${snackbar.variant}`} role="status">
            <div className={`snackbar-icon snackbar-icon-${snackbar.variant}`} aria-hidden="true">
              {VARIANT_META[snackbar.variant]?.icon || VARIANT_META.info.icon}
            </div>
            <div className="snackbar-copy">
              <div className="snackbar-title">
                {VARIANT_META[snackbar.variant]?.title || VARIANT_META.info.title}
              </div>
              <div className="snackbar-message">{snackbar.message}</div>
              <div
                className="snackbar-progress"
                style={{ animationDuration: `${snackbar.duration}ms` }}
                aria-hidden="true"
              />
            </div>
            <button type="button" className="snackbar-close" onClick={dismissSnackbar} aria-label="Dismiss notification">
              <span aria-hidden="true">+</span>
            </button>
          </div>
        ) : null}
      </div>
    </SnackbarContext.Provider>
  );
}

export function useSnackbar() {
  const context = useContext(SnackbarContext);

  if (!context) {
    throw new Error("useSnackbar must be used within a SnackbarProvider");
  }

  return context;
}
