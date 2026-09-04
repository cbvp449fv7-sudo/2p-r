"use client";
import React, { createContext, useContext, useEffect, useRef, useState } from "react";
import type { AppData, Locale } from "@/lib/types";
import { createSnapshot, listSnapshots, loadData, restoreSnapshot, saveData, type Snapshot } from "@/lib/storage";
import { createDemoData } from "@/lib/demo";

type Ctx = {
  data: AppData | null;
  setData: (d: AppData) => void;
  /** Save a restorable copy first, then apply. Used before every import, bulk edit, or regeneration. */
  setDataWithSnapshot: (label: string, d: AppData) => Promise<Snapshot>;
  snapshots: Snapshot[];
  refreshSnapshots: () => Promise<void>;
  rollback: (id: string) => Promise<boolean>;
  locale: Locale;
  setLocale: (l: Locale) => void;
  theme: string;
  setTheme: (t: string) => void;
  reset: () => void;
  toast: string;
  setToast: (s: string) => void;
};

const C = createContext<Ctx | null>(null);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [data, setState] = useState<AppData | null>(null);
  const [locale, setLocaleState] = useState<Locale>("en");
  const [theme, setThemeState] = useState("light");
  const [toast, setToast] = useState("");
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    loadData().then(setState);
    void listSnapshots().then(setSnapshots);
    queueMicrotask(() => {
      setLocaleState((localStorage.getItem("uqu-locale") as Locale) || "en");
      setThemeState(localStorage.getItem("uqu-theme") || "light");
    });
  }, []);

  useEffect(() => {
    document.documentElement.dir = locale === "ar" ? "rtl" : "ltr";
    document.documentElement.lang = locale;
    localStorage.setItem("uqu-locale", locale);
  }, [locale]);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
    localStorage.setItem("uqu-theme", theme);
  }, [theme]);

  const setData = (d: AppData) => {
    setState(d);
    void saveData(d);
  };

  // Each message replaces the previous one and restarts the timer, so a second
  // message arriving quickly is not cut short by the first one's timeout.
  const flash = (s: string) => {
    setToast(s);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(""), 4000);
  };

  const refreshSnapshots = async () => {
    setSnapshots(await listSnapshots());
  };

  const setDataWithSnapshot = async (label: string, next: AppData) => {
    const snapshot = await createSnapshot(label, data ?? next);
    setData(next);
    await refreshSnapshots();
    return snapshot;
  };

  const rollback = async (id: string) => {
    const restored = await restoreSnapshot(id);
    if (!restored) return false;
    setState(restored);
    await refreshSnapshots();
    flash("Rolled back to the saved snapshot");
    return true;
  };

  return (
    <C.Provider
      value={{
        data,
        setData,
        setDataWithSnapshot,
        snapshots,
        refreshSnapshots,
        rollback,
        locale,
        setLocale: setLocaleState,
        theme,
        setTheme: setThemeState,
        reset: () => {
          const d = createDemoData();
          setData(d);
          flash("Fictional demo data restored");
        },
        toast,
        setToast: flash,
      }}
    >
      {children}
    </C.Provider>
  );
}

export const useApp = () => {
  const c = useContext(C);
  if (!c) throw new Error("AppProvider missing");
  return c;
};
