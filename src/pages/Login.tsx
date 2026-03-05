import React, { useEffect, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ThemeToggle } from "@/components/ThemeToggle";
import { useAuth } from "@/contexts/AuthContext";

const Login: React.FC = () => {
  const { sendOTP, verifyOTP, isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const [step, setStep] = useState<"email" | "otp">("email");
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [loading, setLoading] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    // INVEST-style: allow apps to send user to DIGI with a redirect back
    const params = new URLSearchParams(window.location.search);
    const redirect = params.get("redirect");
    const emailParam = params.get("email");

    if (redirect) {
      localStorage.setItem("redirectAfterLogin", redirect);
    }

    // Optional: prefill email (Audit sends ?email=...)
    if (emailParam) {
      setEmail((prev) => (prev?.trim() ? prev : emailParam));
    }
  }, []);

  useEffect(() => {
    const t = setInterval(() => setCooldown((c) => (c > 0 ? c - 1 : 0)), 1000);
    return () => clearInterval(t);
  }, []);

  const goAfterLogin = () => {
    // Check URL params first
    const urlParams = new URLSearchParams(window.location.search);
    const returnToParam = urlParams.get("returnTo");
    const appParam = urlParams.get("app");

    const redirectUrl =
      returnToParam || localStorage.getItem("redirectAfterLogin") || "/";
    localStorage.removeItem("redirectAfterLogin"); // Clear after use
    sessionStorage.removeItem("redirectAfterLogin"); // Clear from session storage too

    // IMPORTANT: support full absolute URLs (cross-app redirect)
    if (/^https?:\/\//i.test(redirectUrl)) {
      window.location.replace(redirectUrl);
      return;
    }

    navigate(redirectUrl, { replace: true });
  };

  useEffect(() => {
    if (isAuthenticated) {
      goAfterLogin();
    }
  }, [isAuthenticated, navigate]);

  const onSend = async () => {
    if (!email.trim()) return;
    setLoading(true);
    const ok = await sendOTP(email.trim());
    setLoading(false);
    if (ok) {
      setStep("otp");
      setCooldown(45);
    }
  };

  const onVerify = async () => {
    if (!email.trim() || otp.trim().length !== 6) return;
    setLoading(true);
    const ok = await verifyOTP(email.trim(), otp.trim());
    setLoading(false);
    if (ok) {
      goAfterLogin();
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="absolute top-4 right-4">
        <ThemeToggle />
      </div>
      <Card className="w-full max-w-md p-8 glass animate-fade-in">
        <div className="text-center mb-6">
          <h1 className="text-2xl font-semibold">
            Premier Energies Digital Portal
          </h1>
          <p className="text-muted-foreground mt-2">
            Sign in with your email OTP
          </p>
        </div>

        {step === "email" ? (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email (premierenergies.com)</Label>
              <Input
                id="email"
                type="email"
                placeholder="name@premierenergies.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={loading}
              />
            </div>
            <Button
              className="w-full"
              onClick={onSend}
              disabled={loading || !email}
            >
              {loading ? "Sending..." : "Send OTP"}
            </Button>
            <div className="text-xs text-muted-foreground">
              By continuing, you agree to our acceptable use & security
              policies.
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="otp">Enter 6-digit OTP</Label>
              <Input
                id="otp"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={6}
                placeholder="123456"
                value={otp}
                onChange={(e) =>
                  setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))
                }
                disabled={loading}
              />
            </div>

            <Button
              className="w-full"
              onClick={onVerify}
              disabled={loading || otp.length !== 6}
            >
              {loading ? "Verifying..." : "Verify & Sign In"}
            </Button>

            <div className="flex items-center justify-between text-sm">
              <button
                className="text-primary disabled:opacity-50"
                onClick={onSend}
                disabled={cooldown > 0 || loading}
                type="button"
              >
                Resend OTP {cooldown > 0 ? `(${cooldown})` : ""}
              </button>
              <Link to="/login" className="text-muted-foreground">
                Use a different email
              </Link>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
};

export default Login;
