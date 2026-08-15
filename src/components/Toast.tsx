"use client";

import { createContext, useCallback, useContext, useRef, useState, ReactNode } from "react";

type ToastTone = "success" | "error";

interface ToastItem {
  id: number;
  message: string;
  tone: ToastTone;
  leaving: boolean;
}

const ToastContext = createContext<{
  showToast: (message: string, tone?: ToastTone) => void;
}>({
  showToast: () => {},
});

export function useToast() {
  return useContext(ToastContext);
}

const DURATION = 3000;
const EXIT_DURATION = 200;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const idRef = useRef(0);

  const showToast = useCallback((message: string, tone: ToastTone = "success") => {
    const id = idRef.current++;
    setToasts((prev) => [...prev, { id, message, tone, leaving: false }]);
    setTimeout(() => {
      setToasts((prev) => prev.map((t) => (t.id === id ? { ...t, leaving: true } : t)));
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, EXIT_DURATION);
    }, DURATION);
  }, []);

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-4 z-50 flex flex-col items-center gap-2 px-4 sm:inset-x-auto sm:right-4 sm:items-end">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`pointer-events-auto animate-toast-in rounded-lg px-4 py-2.5 text-sm font-medium text-white shadow-lg transition-all duration-200 ${
              t.tone === "success" ? "bg-slate-900" : "bg-red-600"
            } ${t.leaving ? "translate-y-1 opacity-0" : "translate-y-0 opacity-100"}`}
          >
            {t.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
