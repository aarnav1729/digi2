// src/pages/Index.tsx
import React from "react";
import { ThemeProvider } from "@/components/ThemeProvider";
import { ThemeToggle } from "@/components/ThemeToggle";
import { ApplicationCard } from "@/components/ApplicationCard";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import { LogOut } from "lucide-react";

// --- TSX typing for <model-viewer> ---
declare global {
  namespace JSX {
    interface IntrinsicElements {
      "model-viewer": React.DetailedHTMLProps<
        React.HTMLAttributes<HTMLElement>,
        HTMLElement
      > & {
        src?: string;
        alt?: string;
        "camera-controls"?: boolean;
        "disable-zoom"?: boolean;
        autoplay?: boolean;
        "auto-rotate"?: boolean;
        "auto-rotate-delay"?: string | number;
        "rotation-per-second"?: string;
        "camera-orbit"?: string;
        exposure?: string | number;
        "shadow-intensity"?: string | number;
        "shadow-softness"?: string | number;
        ar?: boolean;
        "ar-modes"?: string;
      };
    }
  }
}

/* ---------- GLB logo (from inspiration header) ---------- */
const GLBLogo: React.FC = () => {
  React.useEffect(() => {
    if (!customElements.get("model-viewer")) {
      const s = document.createElement("script");
      s.type = "module";
      s.src = "https://unpkg.com/@google/model-viewer/dist/model-viewer.min.js";
      document.head.appendChild(s);
    }
  }, []);

  return (
    <div className="relative h-8 w-8 sm:h-10 sm:w-10 overflow-visible flex items-center justify-center">
      <model-viewer
        src="/l.glb" // served from /public
        alt="3D Logo"
        camera-controls
        disable-zoom
        autoplay
        auto-rotate
        auto-rotate-delay="0"
        rotation-per-second="25deg"
        camera-orbit="auto 70deg 110%"
        exposure="1.05"
        shadow-intensity="1"
        shadow-softness="1"
        className="pointer-events-none"
        style={{ width: 72, height: 72 }} // visually larger than wrapper
      />
    </div>
  );
};

// ---------- Media previews (placed in /src/assets) ----------
// Videos
import leafVideo from "@/assets/leaf.mp4";
import spotVideo from "@/assets/spot.mp4";
import nestVideo from "@/assets/nest.mp4";
import investVideo from "@/assets/invest.mp4";
import auditVideo from "@/assets/audit.mp4";
import qapVideo from "@/assets/qap.mp4";
import wattVideo from "@/assets/watt.mp4";
import ccasVideo from "@/assets/ccas.mp4";
import retVideo from "@/assets/retention.mp4";

import suryagharVideo from "@/assets/suryaghar.mp4";
import vendorsVideo from "@/assets/vendors.mp4";
import visaVideo from "@/assets/visa.mp4";
import waveVideo from "@/assets/wave.mp4";
import adminVideo from "@/assets/admin.mp4";
import dmsVideo from "@/assets/dms.mp4";

import spotimg from "@/assets/spot.png";
import auditimg from "@/assets/audit.png";
import wattimg from "@/assets/watt.png";
import ccasimg from "@/assets/ccas.png";
import leafimg from "@/assets/leafi.png";
import nestimg from "@/assets/nest.png";
import suryagharimg from "@/assets/suryaghar.png";
import qapimg from "@/assets/qap.png";
import vendorsimg from "@/assets/vendors.png";
import visaimg from "@/assets/visa.png";

// Footer asset
import footerLogo from "@/assets/l.png";

// ---------- Applications ----------
type PortalApp = {
  key: string;
  title: string;
  description: string;
  link: string;
  video?: string;
  image?: string; // fallback image
};

const applications: PortalApp[] = [
  {
    key: "spot",
    title: "SPOT",
    description: "Ticketing tool for reduced SLAs & smart task assignment",
    link: "https://spot.premierenergies.com/",
    video: spotVideo,
    image: spotimg,
  },

  {
    key: "audit",
    title: "Audit",
    description: "Audit management for enhanced visibility & accountability",
    link: "https://audit.premierenergies.com/",
    video: auditVideo,
    image: auditimg,
  },

  {
    key: "admin",
    title: "Admin",
    description: "Raise MEP and Vehicle Requests with automated workflows & approvals",
    link: "https://admin.premierenergies.com/",
    video: adminVideo,
    image: auditimg,
  },

  {
    key: "wave",
    title: "WAVE",
    description: "Welcome & Authenticate Visitor Entry with WAVE's streamlined workflows",
    link: "https://wave.premierenergies.com/",
    video: waveVideo,
    image: auditimg,
  },

  {
    key: "dms",
    title: "DMS",
    description: "Document management system for organized storage & retrieval",
    link: "https://dms.premierenergies.com/",
    video: waveVideo,
    image: auditimg,
  },

  {
    key: "sip",
    title: "SIP",
    description: "Stock Intelligence Platform for real-time warehouse inventory insights & utilization analysis",
    link: "https://stockup.premierenergies.com/",
    video: waveVideo,
    image: auditimg,
  },

  {
    key: "invest",
    title: "Invest",
    description: "Investment tracking & analysis for informed decision-making",
    link: "https://invest.premierenergies.com/",
    video: investVideo,
    image: auditimg,
  },

  {
    key: "ccas",
    title: "CCAS",
    description: "Code creation & approvals to ensure data integrity",
    link: "https://code.premierenergies.com/",
    video: ccasVideo,
    image: ccasimg,
  },
  {
    key: "retention",
    title: "Employee Retention Form",
    description: "Employee Retention Form",
    link: "https://retention.premierenergies.com/",
    video: retVideo,
    image: ccasimg,
  },
  {
    key: "leaf",
    title: "LEAF",
    description: "Logistics bidding for cost optimization & vehicle allocation",
    link: "https://leaf.premierenergies.com/",
    video: leafVideo,
    image: leafimg,
  },
  {
    key: "nest",
    title: "NEST",
    description: "Repository for tracking & identification of equipment spares",
    link: "https://nest.premierenergies.com/",
    video: nestVideo,
    image: nestimg,
  },

  {
    key: "suryaghar",
    title: "Suryaghar",
    description: "Solar adoption & Suryaghar program workflows",
    link: "https://suryaghar.premierenergies.com/",
    video: suryagharVideo,
    image: suryagharimg,
  },
  {
    key: "qap",
    title: "QAP",
    description: "Customer specs to streamline BOM & QAP processes",
    link: "https://qap.premierenergies.com/",
    video: qapVideo,
    image: qapimg,
  },
  {
    key: "vendors",
    title: "Vendors",
    description: "Vendor portal for onboarding, documents & interactions",
    link: "https://vendors.premierenergies.com/",
    video: vendorsVideo,
    image: vendorsimg,
  },
  {
    key: "visa",
    title: "VISA",
    description: "Visa workflows & document generation portal",
    link: "https://visa.premierenergies.com/",
    video: visaVideo,
    image: visaimg,
  },
  {
    key: "watt",
    title: "WATT",
    description: "Warranty registration & approvals with digital certificates",
    link: "https://watt.premierenergies.com/",
    video: wattVideo,
    image: wattimg,
  },
];

const Index: React.FC = () => {
  const year = new Date().getFullYear();
  const navigate = useNavigate();
  const { user, logout } = useAuth();

  // user.apps is returned from /api/session (DB-driven) now
  const allowed = React.useMemo(
    () => new Set((user?.apps || []).map((x) => String(x).toLowerCase())),
    [user?.apps]
  );

  const onLogout = async () => {
    await logout();
    navigate("/login");
  };

  return (
    <ThemeProvider defaultTheme="system">
      <div className="min-h-screen flex flex-col bg-background">
        {/* ----- Header (theme-aware) ----- */}
        <header className="sticky top-0 z-40 bg-background border-b border-border shadow-sm">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3 flex items-center justify-between text-foreground">
            {/* Left: GLB */}
            <div className="flex items-center gap-4">
              <GLBLogo />
            </div>

            <div className="flex items-center gap-4">
              <h1 className="text-lg font-semibold">
                Premier Energies Digital Portal
              </h1>
            </div>

            {/* Right: Admin + Theme toggle */}
            <div className="flex items-center gap-2">
              {user?.isAdmin && (
                <Button
                  variant="outline"
                  onClick={() => navigate("/users")}
                  className="hidden sm:inline-flex"
                >
                  Users
                </Button>
              )}

              <ThemeToggle />

              <Button
                variant="ghost"
                size="icon"
                onClick={onLogout}
                aria-label="Logout"
                title="Logout"
              >
                <LogOut className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* Mobile: show Users button under header */}
          {user?.isAdmin && (
            <div className="sm:hidden px-4 pb-3">
              <Button
                variant="outline"
                className="w-full"
                onClick={() => navigate("/users")}
              >
                Users
              </Button>
            </div>
          )}
        </header>

        {/* ----- Main ----- */}
        <main className="flex-1">
          <div className="mx-auto max-w-screen-2xl px-6 py-8">
            {/* Roomier grid */}
            <div className="grid gap-8 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
              {applications.map((app) => (
                <ApplicationCard
                  key={app.key}
                  title={app.title}
                  description={app.description}
                  link={app.link}
                  videoSrc={app.video}
                  imageSrc={app.image}
                  disabled={!allowed.has(app.key)}
                />
              ))}
            </div>
          </div>
        </main>

        {/* ----- Footer (theme-aware) ----- */}
        <footer className="sticky bottom-0 z-40 bg-background border-t border-border shadow-sm">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3 flex items-center justify-between">
            {/* Left: logo */}
            <div className="flex items-center gap-3">
              <img src={footerLogo} alt="Logo" className="h-7 w-auto" />
            </div>

            {/* Right: copyright */}
            <div className="text-xs text-muted-foreground">
              © {year} Premier Energies
            </div>
          </div>
        </footer>
      </div>
    </ThemeProvider>
  );
};

export default Index;
