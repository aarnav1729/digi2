import React, { createContext, useContext, useEffect, useState } from "react";
import { toast } from "@/hooks/use-toast";

type User = {
  id: string;
  email: string;
  roles?: string[];
  apps?: string[];
  isAdmin?: boolean;
};

type AuthContextType = {
  user: User | null;
  ready: boolean;
  isAuthenticated: boolean;
  sendOTP: (email: string) => Promise<boolean>;
  verifyOTP: (email: string, otp: string) => Promise<boolean>;
  fetchSession: () => Promise<void>;
  logout: () => Promise<void>;
};

const IST_OFFSET_MS = 330 * 60 * 1000; // +05:30
const IST_DAY_KEY = "digi_last_ist_day";

function istDayString(now = new Date()) {
  // Convert "now" to IST by shifting epoch, then read YYYY-MM-DD from ISO
  return new Date(now.getTime() + IST_OFFSET_MS).toISOString().slice(0, 10);
}

function msUntilNextIstMidnight(now = new Date()) {
  const nowUtcMs = now.getTime();
  const ist = new Date(nowUtcMs + IST_OFFSET_MS);

  // Using getUTC* because `ist` is already shifted to IST epoch
  const y = ist.getUTCFullYear();
  const m = ist.getUTCMonth();
  const d = ist.getUTCDate();

  // Next midnight IST => (UTC midnight of next IST day) minus IST offset
  const nextMidnightUtcMs = Date.UTC(y, m, d + 1, 0, 0, 0, 0) - IST_OFFSET_MS;

  return Math.max(0, nextMidnightUtcMs - nowUtcMs);
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);

// CMD+F: const fetchSession = async () => {
  const fetchSession = async () => {
    try {
      const doSession = async () => fetch("/api/session", { credentials: "include" });
  
      let r = await doSession();
  
      // If access token expired but refresh cookie exists, refresh once then retry
      if (r.status === 401) {
        const rr = await fetch("/auth/refresh", {
          method: "POST",
          credentials: "include",
        }).catch(() => null);
  
        if (rr && rr.ok) {
          r = await doSession();
        }
      }
  
      if (r.ok) {
        const data = await r.json();
        localStorage.setItem(IST_DAY_KEY, istDayString());
        setUser(data.user);
      } else {
        localStorage.removeItem(IST_DAY_KEY);
        setUser(null);
      }
    } catch {
      localStorage.removeItem(IST_DAY_KEY);
      setUser(null);
    } finally {
      setReady(true);
    }
  };
  

  useEffect(() => {
    fetchSession();
  }, []);

  // Auto-logout at IST midnight (and also on focus/visibility if day changed)
  // CMD+F: // Auto-logout at IST midnight (and also on focus/visibility if day changed)
  useEffect(() => {
    if (!user) return;

    const key = IST_DAY_KEY;

    const checkDayAndLogoutIfNeeded = async () => {
      const today = istDayString();
      const last = localStorage.getItem(key);

      // If day changed while tab was inactive/sleeping => force logout
      if (last && last !== today) {
        await logout();
        toast({
          title: "Session expired",
          description: "Signed out automatically at midnight (IST).",
          variant: "destructive",
        });
        return;
      }

      localStorage.setItem(key, today);
    };

    // Set initial day stamp + check once
    checkDayAndLogoutIfNeeded();

    // Timer to midnight IST
    const t = window.setTimeout(async () => {
      await logout();
      toast({
        title: "Session expired",
        description: "Signed out automatically at midnight (IST).",
        variant: "destructive",
      });
    }, msUntilNextIstMidnight());

    // Extra safety when user returns to the tab
    const onFocus = () => checkDayAndLogoutIfNeeded();
    const onVis = () => {
      if (document.visibilityState === "visible") checkDayAndLogoutIfNeeded();
    };

    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVis);

    return () => {
      window.clearTimeout(t);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVis);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const sendOTP = async (email: string): Promise<boolean> => {
    try {
      const r = await fetch("/api/send-otp", {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email }),
      });
      if (r.ok) {
        toast({
          title: "OTP sent",
          description: `An OTP has been emailed to ${email}`,
        });
        return true;
      }
      const e = await r.json().catch(() => ({}));
      toast({
        title: "Failed to send OTP",
        description: e?.message || "Try again",
        variant: "destructive",
      });
      return false;
    } catch (e) {
      toast({
        title: "Network error",
        description: "Could not send OTP",
        variant: "destructive",
      });
      return false;
    }
  };

  const verifyOTP = async (email: string, otp: string): Promise<boolean> => {
    try {
      const r = await fetch("/api/verify-otp", {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email, otp }),
      });
      if (!r.ok) {
        const e = await r.json().catch(() => ({}));
        toast({
          title: "Invalid OTP",
          description: e?.message || "Please try again",
          variant: "destructive",
        });
        return false;
      }
      await fetchSession();
      toast({
        title: "Signed in",
        description: "Welcome to Premier Energies Digital Portal",
      });
      return true;
    } catch {
      toast({
        title: "Network error",
        description: "Could not verify OTP",
        variant: "destructive",
      });
      return false;
    }
  };

  // CMD+F: const logout = async () => {
  const logout = async () => {
    try {
      await fetch("/auth/logout", { method: "POST", credentials: "include" });
    } catch {}
    localStorage.removeItem(IST_DAY_KEY);
    setUser(null);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        ready,
        isAuthenticated: !!user,
        sendOTP,
        verifyOTP,
        fetchSession,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
  return ctx;
};
