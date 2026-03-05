import React, { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/hooks/use-toast";
import { Loader2, Shield, UserCog } from "lucide-react";
import { ThemeToggle } from "@/components/ThemeToggle";
import { useNavigate } from "react-router-dom";
import footerLogo from "@/assets/l.png";
import { LogOut } from "lucide-react";
/* ---------- TSX typing for <model-viewer> (same as Index) ---------- */
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

/* ---------- GLB logo (same as Index header) ---------- */
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
        src="/l.glb"
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
        style={{ width: 72, height: 72 }}
      />
    </div>
  );
};

type AppCatalogItem = { key: string; title: string; url: string };

type AdminRow = {
  Email: string;
  Active: boolean;
  CreatedAt?: string;
  UpdatedAt?: string;
  UpdatedBy?: string;
};

type UserRow = {
  email: string;
  empId: any;
  activeFlag: boolean;
  enabledApps: number;
  isAdmin: boolean;
};

type UserDetails = {
  email: string;
  empId: any;
  activeFlag: boolean;
  apps: Record<string, boolean>;
  isAdmin: boolean;
};

const PREMIER_DOMAIN = "@premierenergies.com";
const isPremierEmail = (v: string) =>
  String(v || "")
    .trim()
    .toLowerCase()
    .endsWith(PREMIER_DOMAIN);

async function api<T>(url: string, opts?: RequestInit): Promise<T> {
  const r = await fetch(url, { credentials: "include", ...opts });
  if (!r.ok) {
    const e = await r.json().catch(() => ({}));
    const msg = e?.message || e?.error || `HTTP ${r.status}`;
    throw new Error(msg);
  }
  return r.json();
}

export default function Users() {
  const { user, logout } = useAuth();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const year = new Date().getFullYear();

  const [search, setSearch] = useState("");
  const [activeOnly, setActiveOnly] = useState(false);

  const [addAdminEmail, setAddAdminEmail] = useState("");

  const [addUserEmail, setAddUserEmail] = useState("");
  const [addUserActive, setAddUserActive] = useState(true);

  const [selectedEmail, setSelectedEmail] = useState<string | null>(null);
  const [editOpen, setEditOpen] = useState(false);

  // Admin gate (backend also enforces; this is just UX)
  const isAdmin = !!user?.isAdmin;

  const [allowAppKey, setAllowAppKey] = useState<string | null>(null);
  const [allowOpen, setAllowOpen] = useState(false);
  const [allowEmailsText, setAllowEmailsText] = useState("");
  const [restrictOnly, setRestrictOnly] = useState(false);
  const [allowSaving, setAllowSaving] = useState(false);

  const allowListQ = useQuery({
    queryKey: ["globalAllowList", allowAppKey],
    queryFn: () =>
      api<{ appKey: string; emails: string[] }>(
        `/api/admin/app-global-allowlist/${encodeURIComponent(allowAppKey!)}`
      ),
    enabled: isAdmin && allowOpen && !!allowAppKey,
  });

  React.useEffect(() => {
    if (!allowOpen || !allowAppKey) return;
    if (!allowListQ.data) return;

    setAllowEmailsText((allowListQ.data.emails || []).join("\n"));
    setRestrictOnly(globalRestrictMap[allowAppKey] === true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allowListQ.data, allowOpen, allowAppKey]);

  const meQ = useQuery({
    queryKey: ["adminMe"],
    queryFn: () => api<{ ok: boolean; email: string }>("/api/admin/me"),
    enabled: isAdmin,
    retry: false,
  });

  const appsQ = useQuery({
    queryKey: ["appCatalog"],
    queryFn: () => api<{ apps: AppCatalogItem[] }>("/api/admin/app-catalog"),
    enabled: isAdmin,
  });

  const globalAppsQ = useQuery({
    queryKey: ["globalAppState"],
    queryFn: () =>
      api<{
        map: Record<string, boolean>;
        restrictMap?: Record<string, boolean>;
      }>("/api/admin/app-global"),
    enabled: isAdmin,
  });

  const globalMap = globalAppsQ.data?.map || {};
  const globalRestrictMap = globalAppsQ.data?.restrictMap || {};

  const onToggleGlobalApp = async (appKey: string, enabled: boolean) => {
    try {
      await api("/api/admin/app-global", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ appKey, enabled }),
      });
      qc.invalidateQueries({ queryKey: ["globalAppState"] });
      toast({
        title: "Global app updated",
        description: `${appKey} → ${enabled ? "ON" : "OFF"} (for everyone)`,
      });
    } catch (e: any) {
      toast({
        title: "Failed to update global app",
        description: String(e?.message || e),
        variant: "destructive",
      });
    }
  };

  const openAllowList = (appKey: string) => {
    setAllowAppKey(appKey);
    setAllowOpen(true);
  };

  const closeAllowList = () => {
    setAllowOpen(false);
    setAllowAppKey(null);
    setAllowEmailsText("");
  };

  const parseEmails = (text: string) => {
    const raw = text
      .split(/[\n,;\s]+/g)
      .map((s) => s.trim())
      .filter(Boolean);

    const uniq = Array.from(new Set(raw));
    return uniq.filter(isPremierEmail);
  };

  const saveAllowList = async () => {
    if (!allowAppKey) return;

    setAllowSaving(true);
    const emails = parseEmails(allowEmailsText);

    try {
      await api(
        `/api/admin/app-global-allowlist/${encodeURIComponent(allowAppKey)}`,
        {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ emails }),
        }
      );

      await api(`/api/admin/app-global-restrict`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ appKey: allowAppKey, restrict: restrictOnly }),
      });

      qc.invalidateQueries({ queryKey: ["globalAppState"] });
      qc.invalidateQueries({ queryKey: ["globalAllowList", allowAppKey] });

      toast({
        title: "Allowlist saved",
        description: `${allowAppKey} • ${
          restrictOnly ? "Allowlist mode ON" : "Allowlist mode OFF"
        } • ${emails.length} emails`,
      });

      closeAllowList();
    } catch (e: any) {
      toast({
        title: "Failed to save allowlist",
        description: String(e?.message || e),
        variant: "destructive",
      });
    } finally {
      setAllowSaving(false);
    }
  };

  const onLogout = async () => {
    await logout();
    navigate("/login");
  };

  const setAllGlobalApps = async (enabled: boolean) => {
    try {
      const next: Record<string, boolean> = {};
      for (const a of apps) next[a.key] = enabled;

      await api("/api/admin/app-global", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ apps: next }),
      });

      qc.invalidateQueries({ queryKey: ["globalAppState"] });
      toast({
        title: "Global apps updated",
        description: enabled
          ? "All apps enabled globally"
          : "All apps disabled globally",
      });
    } catch (e: any) {
      toast({
        title: "Failed to update global apps",
        description: String(e?.message || e),
        variant: "destructive",
      });
    }
  };

  const adminsQ = useQuery({
    queryKey: ["admins"],
    queryFn: () => api<{ admins: AdminRow[] }>("/api/admin/admins"),
    enabled: isAdmin,
  });

  const usersQ = useQuery({
    queryKey: ["users", search, activeOnly],
    queryFn: () =>
      api<{
        page: number;
        pageSize: number;
        total: number;
        users: UserRow[];
      }>(
        `/api/admin/users?search=${encodeURIComponent(search)}&activeOnly=${
          activeOnly ? "true" : "false"
        }&page=1&pageSize=100`
      ),
    enabled: isAdmin,
  });

  const userDetailsQ = useQuery({
    queryKey: ["userDetails", selectedEmail],
    queryFn: () =>
      api<{ user: UserDetails }>(
        `/api/admin/users/${encodeURIComponent(selectedEmail!)}`
      ),
    enabled: isAdmin && !!selectedEmail,
  });

  const apps = appsQ.data?.apps || [];
  const totalUsers = usersQ.data?.total ?? 0;

  const sortedAdmins = useMemo(() => {
    const list = adminsQ.data?.admins || [];
    return [...list].sort((a, b) => a.Email.localeCompare(b.Email));
  }, [adminsQ.data]);

  const onAddAdmin = async () => {
    try {
      const email = addAdminEmail.trim();
      if (!isPremierEmail(email)) {
        toast({
          title: "Invalid email",
          description: `Only ${PREMIER_DOMAIN} emails are allowed`,
          variant: "destructive",
        });
        return;
      }

      if (!email) return;

      await api("/api/admin/admins", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email }),
      });

      setAddAdminEmail("");
      toast({ title: "Admin added", description: email });
      qc.invalidateQueries({ queryKey: ["admins"] });
    } catch (e: any) {
      toast({
        title: "Failed to add admin",
        description: String(e?.message || e),
        variant: "destructive",
      });
    }
  };

  const onToggleAdmin = async (email: string, active: boolean) => {
    try {
      await api(`/api/admin/admins/${encodeURIComponent(email)}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ active }),
      });
      qc.invalidateQueries({ queryKey: ["admins"] });
      toast({
        title: "Admin updated",
        description: `${email} → ${active ? "Active" : "Inactive"}`,
      });
    } catch (e: any) {
      toast({
        title: "Failed to update admin",
        description: String(e?.message || e),
        variant: "destructive",
      });
    }
  };

  const onAddUser = async () => {
    try {
      const email = addUserEmail.trim();
      if (!isPremierEmail(email)) {
        toast({
          title: "Invalid email",
          description: `Only ${PREMIER_DOMAIN} emails are allowed`,
          variant: "destructive",
        });
        return;
      }

      if (!email) return;

      await api("/api/admin/users", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email,
          activeFlag: addUserActive,
        }),
      });

      setAddUserEmail("");
      toast({ title: "User saved", description: email });
      qc.invalidateQueries({ queryKey: ["users"] });
    } catch (e: any) {
      toast({
        title: "Failed to create user",
        description: String(e?.message || e),
        variant: "destructive",
      });
    }
  };

  const openEdit = (email: string) => {
    setSelectedEmail(email);
    setEditOpen(true);
  };

  const closeEdit = () => {
    setEditOpen(false);
    setSelectedEmail(null);
  };

  const onSaveUser = async (next: Partial<UserDetails>) => {
    if (!selectedEmail) return;
    try {
      await api(`/api/admin/users/${encodeURIComponent(selectedEmail)}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          activeFlag: next.activeFlag,
          apps: next.apps,
        }),
      });
      toast({ title: "Saved", description: selectedEmail });
      qc.invalidateQueries({ queryKey: ["users"] });
      qc.invalidateQueries({ queryKey: ["userDetails", selectedEmail] });
      closeEdit();
    } catch (e: any) {
      toast({
        title: "Failed to save user",
        description: String(e?.message || e),
        variant: "destructive",
      });
    }
  };

  // Body content (wrapped by Index-like header/footer)
  let body: React.ReactNode;

  if (!isAdmin) {
    body = (
      <Card className="p-6">
        <div className="flex items-center gap-2">
          <Shield className="h-5 w-5" />
          <div className="font-semibold">Access restricted</div>
        </div>
        <div className="mt-2 text-sm text-muted-foreground">
          You don’t have permission to view this page.
        </div>
      </Card>
    );
  } else if (meQ.isError) {
    body = (
      <Card className="p-6">
        <div className="flex items-center gap-2">
          <Shield className="h-5 w-5" />
          <div className="font-semibold">Admin permission required</div>
        </div>
        <div className="mt-2 text-sm text-muted-foreground">
          {String((meQ.error as any)?.message || "Forbidden")}
        </div>
      </Card>
    );
  } else {
    body = (
      <div className="mx-auto max-w-6xl space-y-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <div className="text-2xl font-semibold flex items-center gap-2">
              <UserCog className="h-6 w-6" />
              Users & App Access
            </div>
            <div className="text-sm text-muted-foreground">
              Control who can open which portal apps. Admins can manage this
              page.
            </div>
          </div>
          <div className="text-sm text-muted-foreground">
            Signed in as <span className="font-medium">{user?.email}</span>
          </div>
        </div>

        {/* Admins */}
        <Card className="p-6">
          <div className="flex items-center justify-between gap-4">
            <div>
              <div className="font-semibold flex items-center gap-2">
                <Shield className="h-4 w-4" />
                Admin Access (Users page)
              </div>
              <div className="text-sm text-muted-foreground mt-1">
                Seeded with aarnav.singh@premierenergies.com by default.
              </div>
            </div>

            <div className="flex items-end gap-2">
              <div className="space-y-1">
                <Label htmlFor="addAdmin">Add admin email</Label>
                <Input
                  id="addAdmin"
                  value={addAdminEmail}
                  onChange={(e) => setAddAdminEmail(e.target.value)}
                  placeholder="name@premierenergies.com"
                />
              </div>
              <Button onClick={onAddAdmin} disabled={!addAdminEmail.trim()}>
                Add
              </Button>
            </div>
          </div>

          <div className="mt-4 overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Email</TableHead>
                  <TableHead className="w-[120px]">Status</TableHead>
                  <TableHead className="w-[120px] text-right">Active</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedAdmins
                  .filter((a) => isPremierEmail(a.Email))
                  .map((a) => (
                    <TableRow key={a.Email}>
                      <TableCell className="font-medium">{a.Email}</TableCell>
                      <TableCell>
                        {a.Active ? (
                          <Badge>Active</Badge>
                        ) : (
                          <Badge variant="secondary">Inactive</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <Switch
                          checked={!!a.Active}
                          onCheckedChange={(v) => onToggleAdmin(a.Email, v)}
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                {!sortedAdmins.length && (
                  <TableRow>
                    <TableCell colSpan={3} className="text-muted-foreground">
                      No admins found.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </Card>

        {/* Global app control */}
        <Card className="p-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <div className="font-semibold">
                Global App Control (All Employees)
              </div>
              <div className="text-sm text-muted-foreground mt-1">
                Turning an app OFF disables opening it for everyone in the
                portal (per-user access is still stored).
              </div>
            </div>

            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={() => setAllGlobalApps(false)}
                disabled={globalAppsQ.isLoading || !apps.length}
              >
                Disable all
              </Button>
              <Button
                variant="outline"
                onClick={() => setAllGlobalApps(true)}
                disabled={globalAppsQ.isLoading || !apps.length}
              >
                Enable all
              </Button>
            </div>
          </div>

          <div className="mt-4">
            {globalAppsQ.isLoading ? (
              <div className="text-muted-foreground inline-flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading global
                apps…
              </div>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                {apps.map((a) => (
                  <div
                    key={a.key}
                    className="flex items-center justify-between rounded-lg border p-3"
                  >
                    <div>
                      <div className="font-medium flex items-center gap-2">
                        {a.title}
                        {globalRestrictMap[a.key] ? (
                          <Badge variant="secondary">Allowlist</Badge>
                        ) : null}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {a.key}
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => openAllowList(a.key)}
                      >
                        Allowlist
                      </Button>

                      <Switch
                        checked={globalMap[a.key] !== false} // default ON
                        onCheckedChange={(v) => onToggleGlobalApp(a.key, v)}
                      />
                    </div>
                  </div>
                ))}

                {!apps.length && (
                  <div className="text-sm text-muted-foreground">
                    No apps found in catalog.
                  </div>
                )}
              </div>
            )}
          </div>
        </Card>

        {/* Users */}
        <Card className="p-6">
          <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
            <div>
              <div className="font-semibold">EMP Users</div>
              <div className="text-sm text-muted-foreground mt-1">
                Total: {totalUsers}
              </div>
            </div>

            <div className="flex flex-wrap items-end gap-3">
              <div className="space-y-1">
                <Label htmlFor="search">Search email</Label>
                <Input
                  id="search"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="type to filter…"
                />
              </div>

              <div className="flex items-center gap-2 pb-1">
                <Switch
                  checked={activeOnly}
                  onCheckedChange={(v) => setActiveOnly(v)}
                />
                <span className="text-sm">Active only</span>
              </div>

              <div className="flex items-end gap-2">
                <div className="space-y-1">
                  <Label htmlFor="addUser">Add user</Label>
                  <Input
                    id="addUser"
                    value={addUserEmail}
                    onChange={(e) => setAddUserEmail(e.target.value)}
                    placeholder="new.user@premierenergies.com"
                  />
                </div>
                <div className="flex items-center gap-2 pb-1">
                  <Switch
                    checked={addUserActive}
                    onCheckedChange={(v) => setAddUserActive(v)}
                  />
                  <span className="text-sm">Active</span>
                </div>
                <Button onClick={onAddUser} disabled={!addUserEmail.trim()}>
                  Add / Upsert
                </Button>
              </div>
            </div>
          </div>

          <div className="mt-4 overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Email</TableHead>
                  <TableHead className="w-[120px]">EMP</TableHead>
                  <TableHead className="w-[140px]">Apps Enabled</TableHead>
                  <TableHead className="w-[120px]">Admin</TableHead>
                  <TableHead className="w-[140px] text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {usersQ.isLoading && (
                  <TableRow>
                    <TableCell colSpan={5} className="text-muted-foreground">
                      <span className="inline-flex items-center gap-2">
                        <Loader2 className="h-4 w-4 animate-spin" /> Loading…
                      </span>
                    </TableCell>
                  </TableRow>
                )}

                {(usersQ.data?.users || [])
                  .filter((u) => isPremierEmail(u.email))
                  .map((u) => (
                    <TableRow key={u.email}>
                      <TableCell className="font-medium">{u.email}</TableCell>
                      <TableCell>
                        {u.activeFlag ? (
                          <Badge>Active</Badge>
                        ) : (
                          <Badge variant="secondary">Disabled</Badge>
                        )}
                      </TableCell>
                      <TableCell>{u.enabledApps}</TableCell>
                      <TableCell>
                        {u.isAdmin ? (
                          <Badge>Yes</Badge>
                        ) : (
                          <Badge variant="outline">No</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="outline"
                          onClick={() => openEdit(u.email)}
                        >
                          Edit
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}

                {!usersQ.isLoading && !(usersQ.data?.users || []).length && (
                  <TableRow>
                    <TableCell colSpan={5} className="text-muted-foreground">
                      No users found.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </Card>
        {/* Global allowlist dialog */}
        <Dialog
          open={allowOpen}
          onOpenChange={(v) => (!v ? closeAllowList() : null)}
        >
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>
                Global Allowlist {allowAppKey ? `• ${allowAppKey}` : ""}
              </DialogTitle>
            </DialogHeader>

            {allowListQ.isLoading ? (
              <div className="py-6 text-muted-foreground inline-flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading allowlist…
              </div>
            ) : (
              <div className="space-y-4">
                <Card className="p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="font-semibold">Allowlist mode</div>
                      <div className="text-sm text-muted-foreground">
                        When ON, this app is enabled globally but only usable by
                        allowlisted emails (admins still bypass).
                      </div>
                    </div>
                    <Switch
                      checked={restrictOnly}
                      onCheckedChange={setRestrictOnly}
                    />
                  </div>
                </Card>

                <div className="space-y-2">
                  <Label>Allowed emails (one per line)</Label>
                  <textarea
                    className="w-full min-h-[220px] rounded-md border bg-background p-3 text-sm"
                    value={allowEmailsText}
                    onChange={(e) => setAllowEmailsText(e.target.value)}
                    placeholder={
                      "name@premierenergies.com\nanother@premierenergies.com"
                    }
                  />
                  <div className="text-xs text-muted-foreground">
                    Non-premier emails are ignored automatically.
                  </div>
                </div>

                <div className="flex justify-end gap-2">
                  <Button
                    variant="outline"
                    onClick={closeAllowList}
                    disabled={allowSaving}
                  >
                    Cancel
                  </Button>
                  <Button
                    onClick={saveAllowList}
                    disabled={allowSaving || !allowAppKey}
                  >
                    {allowSaving ? "Saving..." : "Save"}
                  </Button>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>

        {/* Edit dialog */}
        <Dialog open={editOpen} onOpenChange={(v) => (!v ? closeEdit() : null)}>
          <DialogContent className="max-w-3xl">
            <DialogHeader>
              <DialogTitle>Edit User Access</DialogTitle>
            </DialogHeader>

            {userDetailsQ.isLoading ? (
              <div className="py-8 text-muted-foreground inline-flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading user…
              </div>
            ) : userDetailsQ.data?.user ? (
              <EditUserPanel
                user={userDetailsQ.data.user}
                apps={apps}
                onSave={onSaveUser}
              />
            ) : (
              <div className="py-8 text-muted-foreground">No data.</div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    );
  }

  return (
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
          {/* Right: Digi + Theme toggle */}
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              onClick={() => navigate("/")}
              className="hidden sm:inline-flex"
            >
              Digi
            </Button>
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
              onClick={() => navigate("/")}
            >
              Digi
            </Button>
          </div>
        )}
      </header>

      {/* ----- Main ----- */}
      <main className="flex-1">
        <div className="mx-auto max-w-screen-2xl px-6 py-8">{body}</div>
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
  );
}

function EditUserPanel({
  user,
  apps,
  onSave,
}: {
  user: UserDetails;
  apps: AppCatalogItem[];
  onSave: (next: Partial<UserDetails>) => void;
}) {
  const [activeFlag, setActiveFlag] = useState<boolean>(!!user.activeFlag);
  const [appsMap, setAppsMap] = useState<Record<string, boolean>>({
    ...user.apps,
  });

  const enabledCount = useMemo(
    () => Object.values(appsMap).filter(Boolean).length,
    [appsMap]
  );

  return (
    <div className="space-y-5">
      <Card className="p-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <div className="font-semibold">{user.email}</div>
            <div className="text-xs text-muted-foreground">
              EMP Active: {activeFlag ? "Yes" : "No"} • Apps Enabled:{" "}
              {enabledCount}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-sm">EMP Active</span>
            <Switch checked={activeFlag} onCheckedChange={setActiveFlag} />
          </div>
        </div>
      </Card>

      <Card className="p-4">
        <div className="font-semibold mb-3">Application Access</div>

        <div className="grid gap-3 sm:grid-cols-2">
          {apps.map((a) => (
            <div
              key={a.key}
              className="flex items-center justify-between rounded-lg border p-3"
            >
              <div>
                <div className="font-medium">{a.title}</div>
                <div className="text-xs text-muted-foreground">{a.key}</div>
              </div>
              <Switch
                checked={!!appsMap[a.key]}
                onCheckedChange={(v) =>
                  setAppsMap((m) => ({ ...m, [a.key]: v }))
                }
              />
            </div>
          ))}
        </div>
      </Card>

      <div className="flex justify-end gap-2">
        <Button
          variant="outline"
          onClick={() => {
            const allOff: Record<string, boolean> = {};
            for (const a of apps) allOff[a.key] = false;
            setAppsMap(allOff);
          }}
        >
          Disable all
        </Button>
        <Button
          variant="outline"
          onClick={() => {
            const allOn: Record<string, boolean> = {};
            for (const a of apps) allOn[a.key] = true;
            setAppsMap(allOn);
          }}
        >
          Enable all
        </Button>
        <Button onClick={() => onSave({ activeFlag, apps: appsMap })}>
          Save
        </Button>
      </div>
    </div>
  );
}
