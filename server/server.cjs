// server/server.cjs
const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "../.env") }); // load root .env
const fs = require("fs");
const https = require("https");
const express = require("express");
const cors = require("cors");
const compression = require("compression");
const cookieParser = require("cookie-parser");
const jwt = require("jsonwebtoken");
const mssql = require("mssql");

// Microsoft Graph (same behavior as INVEST)
const { Client } = require("@microsoft/microsoft-graph-client");
const { ClientSecretCredential } = require("@azure/identity");
require("isomorphic-fetch");

// -------- Helpers: validate env + read files safely ----------
function mustGetEnv(name) {
  const v = process.env[name];
  if (!v || !String(v).trim()) {
    console.error(`❌ Missing required env: ${name}`);
    process.exit(1);
  }
  return v.replace(/^"(.*)"$/, "$1"); // strip surrounding quotes if present
}

const IST_OFFSET_MS = 330 * 60 * 1000; // +05:30

function currentIstDay() {
  return new Date(Date.now() + IST_OFFSET_MS).toISOString().slice(0, 10); // YYYY-MM-DD in IST
}

function readFileOrExit(filePath, label) {
  try {
    return fs.readFileSync(filePath, "utf8");
  } catch (e) {
    console.error(`❌ Failed to read ${label} at: ${filePath}`);
    console.error(e.message || e);
    process.exit(1);
  }
}

// -------- Env / Config ----------
const PORT = Number(process.env.PORT || 21443);
const HOST = process.env.HOST || "0.0.0.0";

// Leave COOKIE_DOMAIN blank for localhost; set to ".premierenergies.com" in prod
const COOKIE_DOMAIN = (process.env.COOKIE_DOMAIN || "").trim();
const ISSUER = process.env.ISSUER || "auth.premierenergies.com";
const AUDIENCE = process.env.AUDIENCE || "apps.premierenergies.com";
const ACCESS_TTL = process.env.ACCESS_TTL || "15m";
const REFRESH_TTL = process.env.REFRESH_TTL || "30d";

// Keys (required)
const AUTH_PRIVATE_KEY_FILE = mustGetEnv("AUTH_PRIVATE_KEY_FILE");
const AUTH_PUBLIC_KEY_FILE = mustGetEnv("AUTH_PUBLIC_KEY_FILE");
const AUTH_PRIVATE_KEY = readFileOrExit(
  AUTH_PRIVATE_KEY_FILE,
  "AUTH_PRIVATE_KEY_FILE"
);
const AUTH_PUBLIC_KEY = readFileOrExit(
  AUTH_PUBLIC_KEY_FILE,
  "AUTH_PUBLIC_KEY_FILE"
);

// TLS (required)
const TLS_KEY_FILE = mustGetEnv("TLS_KEY_FILE");
const TLS_CERT_FILE = mustGetEnv("TLS_CERT_FILE");
const TLS_CA_FILE = mustGetEnv("TLS_CA_FILE");

// MSSQL (SPOT auth DB) — INVEST-style OTP storage/verification
const authDbConfig = {
  user: process.env.MSSQL_USER || "PEL_DB",
  password: process.env.MSSQL_PASSWORD || "V@aN3#@VaN",
  server: process.env.MSSQL_SERVER || "10.0.50.17",
  port: Number(process.env.MSSQL_PORT) || 1433,
  database: process.env.MSSQL_DB_AUTH || "SPOT",
  options: {
    trustServerCertificate: true,
    encrypt: false,
    connectionTimeout: 60000,
  },
};

// Graph creds (EXACT same behavior as INVEST)
const CLIENT_ID =
  process.env.AZURE_CLIENT_ID || "3d310826-2173-44e5-b9a2-b21e940b67f7";
const TENANT_ID =
  process.env.AZURE_TENANT_ID || "1c3de7f3-f8d1-41d3-8583-2517cf3ba3b1";
const CLIENT_SECRET =
  process.env.AZURE_CLIENT_SECRET || "2e78Q~yX92LfwTTOg4EYBjNQrXrZ2z5di1Kvebog";
const SENDER_EMAIL = process.env.SENDER_EMAIL || "spot@premierenergies.com";

const credential = new ClientSecretCredential(
  TENANT_ID,
  CLIENT_ID,
  CLIENT_SECRET
);
const graphClient = Client.initWithMiddleware({
  authProvider: {
    getAccessToken: () =>
      credential
        .getToken("https://graph.microsoft.com/.default")
        .then((t) => t.token),
  },
});

async function sendEmail(to, subject, html) {
  await graphClient.api(`/users/${SENDER_EMAIL}/sendMail`).post({
    message: {
      subject,
      body: { contentType: "HTML", content: html },
      toRecipients: [{ emailAddress: { address: to } }],
    },
    saveToSentItems: "true",
  });
}

// Allowed list (match INVEST behavior)
const ALLOWED = new Set([
  "aarnav.singh@premierenergies.com",
  "saluja@premierenergies.com",
  "vinay.rustagi@premierenergies.com",
  "nk.khandelwal@premierenergies.com",
  "neha.g@premierenergies.com",
  "krishankk@premierenergies.com",
  "ramesh.t@premierenergies.com",
  "kishorekundeti@premierenergies.com",
  "vishnu.hazari@premierenergies.com",
  "chandra.kumar@premierenergies.com",
  "saumya.ranjan@premierenergies.com",
  "nrao@premierenergies.com",
  "singhmp@premierenergies.com",
  "jasveen@premierenergies.com",
  "baskara.pandian@premierenergies.com",
  "praful.bharadwaj@premierenergies.com",
  "vcs@premierenergies.com",
]);

const PREMIER_DOMAIN = "@premierenergies.com";

function isPremierEmail(v = "") {
  return String(v || "")
    .trim()
    .toLowerCase()
    .endsWith(PREMIER_DOMAIN);
}

function normaliseEmail(v = "") {
  const raw = String(v).trim().toLowerCase();

  // If user already typed a domain, keep it (but we will reject non-premier elsewhere)
  if (raw.includes("@")) return raw;

  // If no domain provided, assume premier domain
  return `${raw}${PREMIER_DOMAIN}`;
}

// -------- App ----------
const app = express();
app.set("trust proxy", 1);
app.use(
  cors({
    origin: [/^https:\/\/.*\.premierenergies\.com$/],
    credentials: true,
  })
);
app.use(express.json({ limit: "10mb" }));
app.use(cookieParser());
app.use(compression());

/* =========================
   Portal Access Control (Admins + App Permissions)
   Stored in SPOT DB (same authDbConfig)
========================= */

const PORTAL_ADMIN_SEED = "aarnav.singh@premierenergies.com";


const APP_CATALOG = [
  { key: "audit", title: "Audit", url: "https://audit.premierenergies.com/" },
  { key: "ccas", title: "CCAS", url: "https://code.premierenergies.com/" },
  {
    key: "retention",
    title: "Retention",
    url: "https://retention.premierenergies.com/",
  },
  {
    key: "invest",
    title: "Invest",
    url: "https://invest.premierenergies.com/dashboard",
  },
  { key: "leaf", title: "LEAF", url: "https://leaf.premierenergies.com/" },
  { key: "nest", title: "NEST", url: "https://nest.premierenergies.com/" },
  { key: "spot", title: "SPOT", url: "https://spot.premierenergies.com/" },
  {
    key: "suryaghar",
    title: "Suryaghar",
    url: "https://suryaghar.premierenergies.com/",
  },
  { key: "qap", title: "QAP", url: "https://qap.premierenergies.com/" },
  {
    key: "vendors",
    title: "Vendors",
    url: "https://vendors.premierenergies.com/",
  },
  { key: "visa", title: "VISA", url: "https://visa.premierenergies.com/" },
  { key: "watt", title: "WATT", url: "https://watt.premierenergies.com/" },
  { key: "wave", title: "WAVE", url: "https://wave.premierenergies.com/" },
  { key: "dms", title: "DMS", url: "https://dms.premierenergies.com/" },
  { key: "admin", title: "Admin", url: "https://admin.premierenergies.com/" },
  { key: "sip", title: "SIP", url: "https://stockup.premierenergies.com/" },
];

const APP_KEYS = new Set(APP_CATALOG.map((a) => a.key));

let __pool;
let __poolConnect;
async function db() {
  if (!__pool) {
    __pool = new mssql.ConnectionPool(authDbConfig);
    __poolConnect = __pool.connect();
  }
  await __poolConnect;
  return __pool;
}

async function ensurePortalTables() {
  const pool = await db();

  // Admins
  await pool.request().query(`
    IF OBJECT_ID('dbo.PortalAdmins','U') IS NULL
    BEGIN
      CREATE TABLE dbo.PortalAdmins (
        Email NVARCHAR(256) NOT NULL PRIMARY KEY,
        Active BIT NOT NULL CONSTRAINT DF_PortalAdmins_Active DEFAULT(1),
        CreatedAt DATETIME2 NOT NULL CONSTRAINT DF_PortalAdmins_CreatedAt DEFAULT(SYSUTCDATETIME()),
        UpdatedAt DATETIME2 NULL,
        UpdatedBy NVARCHAR(256) NULL
      );
    END
  `);

  // Seed aarnav as admin (idempotent)
  await pool.request().input("seed", mssql.NVarChar(256), PORTAL_ADMIN_SEED)
    .query(`
      IF NOT EXISTS (SELECT 1 FROM dbo.PortalAdmins)
      BEGIN
        INSERT INTO dbo.PortalAdmins (Email, Active) VALUES (@seed, 1);
      END
      ELSE IF NOT EXISTS (SELECT 1 FROM dbo.PortalAdmins WHERE Email=@seed)
      BEGIN
        INSERT INTO dbo.PortalAdmins (Email, Active) VALUES (@seed, 1);
      END
    `);

  // App access
  await pool.request().query(`
    IF OBJECT_ID('dbo.PortalAppAccess','U') IS NULL
    BEGIN
      CREATE TABLE dbo.PortalAppAccess (
        Email NVARCHAR(256) NOT NULL,
        AppKey NVARCHAR(64) NOT NULL,
        Enabled BIT NOT NULL CONSTRAINT DF_PortalAppAccess_Enabled DEFAULT(1),
        UpdatedAt DATETIME2 NOT NULL CONSTRAINT DF_PortalAppAccess_UpdatedAt DEFAULT(SYSUTCDATETIME()),
        UpdatedBy NVARCHAR(256) NULL,
        CONSTRAINT PK_PortalAppAccess PRIMARY KEY (Email, AppKey)
      );
      CREATE INDEX IX_PortalAppAccess_Email ON dbo.PortalAppAccess (Email);
    END
  `);

  // Global app enable/disable (applies to everyone)
  await pool.request().query(`
      IF OBJECT_ID('dbo.PortalGlobalAppState','U') IS NULL
      BEGIN
        CREATE TABLE dbo.PortalGlobalAppState (
          AppKey NVARCHAR(64) NOT NULL PRIMARY KEY,
          Enabled BIT NOT NULL CONSTRAINT DF_PortalGlobalAppState_Enabled DEFAULT(1),
          UpdatedAt DATETIME2 NOT NULL CONSTRAINT DF_PortalGlobalAppState_UpdatedAt DEFAULT(SYSUTCDATETIME()),
          UpdatedBy NVARCHAR(256) NULL
        );
      END
    `);

  // Ensure RestrictToAllowList column exists (idempotent)
  await pool.request().query(`
    IF OBJECT_ID('dbo.PortalGlobalAppState','U') IS NOT NULL
       AND COL_LENGTH('dbo.PortalGlobalAppState', 'RestrictToAllowList') IS NULL
    BEGIN
      ALTER TABLE dbo.PortalGlobalAppState
        ADD RestrictToAllowList BIT NOT NULL
          CONSTRAINT DF_PortalGlobalAppState_RestrictToAllowList DEFAULT(0);
    END
  `);

  // Global allowlist table (per-app)
  await pool.request().query(`
    IF OBJECT_ID('dbo.PortalGlobalAppAllowList','U') IS NULL
    BEGIN
      CREATE TABLE dbo.PortalGlobalAppAllowList (
        AppKey NVARCHAR(64) NOT NULL,
        Email NVARCHAR(256) NOT NULL,
        Allowed BIT NOT NULL CONSTRAINT DF_PortalGlobalAppAllowList_Allowed DEFAULT(1),
        UpdatedAt DATETIME2 NOT NULL CONSTRAINT DF_PortalGlobalAppAllowList_UpdatedAt DEFAULT(SYSUTCDATETIME()),
        UpdatedBy NVARCHAR(256) NULL,
        CONSTRAINT PK_PortalGlobalAppAllowList PRIMARY KEY (AppKey, Email)
      );
      CREATE INDEX IX_PortalGlobalAppAllowList_Email ON dbo.PortalGlobalAppAllowList (Email);
      CREATE INDEX IX_PortalGlobalAppAllowList_AppKey ON dbo.PortalGlobalAppAllowList (AppKey);
    END
  `);

  // Seed all catalog apps (idempotent; also covers newly-added apps later)
  const globalValues = APP_CATALOG.map((a) => `('${a.key}', 1)`).join(",\n");
  await pool.request().query(`
      MERGE PortalGlobalAppState AS t
      USING (VALUES
        ${globalValues}
      ) AS s(AppKey, Enabled)
        ON t.AppKey = s.AppKey
      WHEN NOT MATCHED THEN
        INSERT (AppKey, Enabled) VALUES (s.AppKey, s.Enabled);
    `);
}

async function isPortalAdmin(email) {
  const pool = await db();
  const r = await pool
    .request()
    .input("email", mssql.NVarChar(256), normaliseEmail(email))
    .query(`SELECT 1 AS ok FROM PortalAdmins WHERE Email=@email AND Active=1`);
  return !!r.recordset.length;
}

async function ensureDefaultAppAccess(email) {
  const pool = await db();
  const e = normaliseEmail(email);

  // Always ensure every catalog app exists for this user.
  // ✅ Inserts missing rows only (so adding new apps later auto-provisions to existing users)
  // ✅ Does NOT override existing Enabled values.
  const values = APP_CATALOG.map((a) => `(@email, '${a.key}')`).join(",\n");

  await pool.request().input("email", mssql.NVarChar(256), e).query(`
      MERGE PortalAppAccess AS t
      USING (VALUES
        ${values}
      ) AS s(Email, AppKey)
        ON t.Email = s.Email AND t.AppKey = s.AppKey
      WHEN NOT MATCHED THEN
        INSERT (Email, AppKey, Enabled, UpdatedAt, UpdatedBy)
        VALUES (s.Email, s.AppKey, 1, SYSUTCDATETIME(), NULL);
    `);
}

async function getEnabledApps(email) {
  const pool = await db();
  const e = normaliseEmail(email);

  await ensureDefaultAppAccess(e);

  const r = await pool
    .request()
    .input("email", mssql.NVarChar(256), e)
    .query(
      `SELECT AppKey FROM PortalAppAccess WHERE Email=@email AND Enabled=1 ORDER BY AppKey`
    );

  return r.recordset.map((x) => x.AppKey);
}

async function getAppsMap(email) {
  const pool = await db();
  const e = normaliseEmail(email);

  await ensureDefaultAppAccess(e);

  const r = await pool
    .request()
    .input("email", mssql.NVarChar(256), e)
    .query(
      `SELECT AppKey, Enabled FROM PortalAppAccess WHERE Email=@email ORDER BY AppKey`
    );

  const map = {};
  for (const row of r.recordset) map[row.AppKey] = !!row.Enabled;

  // Ensure all keys appear (even if catalog expands later)
  for (const a of APP_CATALOG) if (!(a.key in map)) map[a.key] = false;

  return map;
}

async function setApps(email, appsObj, updatedBy) {
  const pool = await db();
  const e = normaliseEmail(email);
  const by = updatedBy ? normaliseEmail(updatedBy) : null;

  const entries = Object.entries(appsObj || {}).filter(([k]) =>
    APP_KEYS.has(k)
  );

  for (const [appKey, enabled] of entries) {
    await pool
      .request()
      .input("email", mssql.NVarChar(256), e)
      .input("appKey", mssql.NVarChar(64), appKey)
      .input("enabled", mssql.Bit, enabled ? 1 : 0)
      .input("by", mssql.NVarChar(256), by).query(`
        MERGE PortalAppAccess AS t
        USING (SELECT @email AS Email, @appKey AS AppKey) AS s
          ON t.Email=s.Email AND t.AppKey=s.AppKey
        WHEN MATCHED THEN
          UPDATE SET Enabled=@enabled, UpdatedAt=SYSUTCDATETIME(), UpdatedBy=@by
        WHEN NOT MATCHED THEN
          INSERT (Email, AppKey, Enabled, UpdatedAt, UpdatedBy)
          VALUES (@email, @appKey, @enabled, SYSUTCDATETIME(), @by);
      `);
  }
}
async function ensureGlobalAppStateSeeded() {
  const pool = await db();
  const globalValues = APP_CATALOG.map((a) => `('${a.key}', 1)`).join(",\n");

  await pool.request().query(`
    MERGE PortalGlobalAppState AS t
    USING (VALUES
      ${globalValues}
    ) AS s(AppKey, Enabled)
      ON t.AppKey = s.AppKey
    WHEN NOT MATCHED THEN
      INSERT (AppKey, Enabled) VALUES (s.AppKey, s.Enabled);
  `);
}

async function getGlobalAppsConfig() {
  const pool = await db();
  await ensureGlobalAppStateSeeded();

  const r = await pool.request().query(`
    SELECT AppKey,
           Enabled,
           ISNULL(RestrictToAllowList, 0) AS RestrictToAllowList
      FROM PortalGlobalAppState
     ORDER BY AppKey
  `);

  const enabledMap = {};
  const restrictMap = {};
  for (const row of r.recordset) {
    enabledMap[row.AppKey] = !!row.Enabled;
    restrictMap[row.AppKey] = !!row.RestrictToAllowList;
  }

  // Ensure all keys appear even if catalog expands
  for (const a of APP_CATALOG) {
    if (!(a.key in enabledMap)) enabledMap[a.key] = true;
    if (!(a.key in restrictMap)) restrictMap[a.key] = false;
  }

  return { enabledMap, restrictMap };
}

async function getGlobalAppsMap() {
  const { enabledMap } = await getGlobalAppsConfig();
  return enabledMap;
}

async function getGlobalEnabledSet() {
  const map = await getGlobalAppsMap();
  return new Set(Object.keys(map).filter((k) => map[k]));
}

async function getGlobalRestrictedSet() {
  const { restrictMap } = await getGlobalAppsConfig();
  return new Set(Object.keys(restrictMap).filter((k) => restrictMap[k]));
}

async function getAllowlistedAppsForEmail(email) {
  const pool = await db();
  const e = normaliseEmail(email);

  const r = await pool.request().input("email", mssql.NVarChar(256), e).query(`
      SELECT AppKey
        FROM PortalGlobalAppAllowList
       WHERE Email=@email AND Allowed=1
    `);

  return new Set(r.recordset.map((x) => x.AppKey));
}

async function getAllowlistForApp(appKey) {
  const pool = await db();
  const r = await pool.request().input("appKey", mssql.NVarChar(64), appKey)
    .query(`
      SELECT Email
        FROM PortalGlobalAppAllowList
       WHERE AppKey=@appKey AND Allowed=1
       ORDER BY Email
    `);
  return r.recordset.map((x) => x.Email);
}

async function replaceAllowlistForApp(appKey, emails, updatedBy) {
  const pool = await db();
  const by = updatedBy ? normaliseEmail(updatedBy) : null;

  const cleaned = Array.from(
    new Set(
      (Array.isArray(emails) ? emails : [])
        .map((e) => normaliseEmail(String(e || "")))
        .filter((e) => isPremierEmail(e))
    )
  ).slice(0, 500);

  // wipe + reinsert (simple + predictable, minimal changes)
  await pool
    .request()
    .input("appKey", mssql.NVarChar(64), appKey)
    .query(`DELETE FROM PortalGlobalAppAllowList WHERE AppKey=@appKey`);

  for (const email of cleaned) {
    await pool
      .request()
      .input("appKey", mssql.NVarChar(64), appKey)
      .input("email", mssql.NVarChar(256), email)
      .input("by", mssql.NVarChar(256), by).query(`
        MERGE PortalGlobalAppAllowList AS t
        USING (SELECT @appKey AS AppKey, @email AS Email) AS s
          ON t.AppKey=s.AppKey AND t.Email=s.Email
        WHEN MATCHED THEN
          UPDATE SET Allowed=1, UpdatedAt=SYSUTCDATETIME(), UpdatedBy=@by
        WHEN NOT MATCHED THEN
          INSERT (AppKey, Email, Allowed, UpdatedAt, UpdatedBy)
          VALUES (@appKey, @email, 1, SYSUTCDATETIME(), @by);
      `);
  }

  return cleaned;
}

async function setGlobalRestrict(appKey, restrict, updatedBy) {
  const pool = await db();
  await ensureGlobalAppStateSeeded();

  const by = updatedBy ? normaliseEmail(updatedBy) : null;

  await pool
    .request()
    .input("appKey", mssql.NVarChar(64), appKey)
    .input("r", mssql.Bit, restrict ? 1 : 0)
    .input("by", mssql.NVarChar(256), by).query(`
      UPDATE PortalGlobalAppState
         SET RestrictToAllowList=@r,
             UpdatedAt=SYSUTCDATETIME(),
             UpdatedBy=@by
       WHERE AppKey=@appKey
    `);
}

async function setGlobalApps(appsObj, updatedBy) {
  const pool = await db();
  await ensureGlobalAppStateSeeded();

  const by = updatedBy ? normaliseEmail(updatedBy) : null;
  const entries = Object.entries(appsObj || {}).filter(([k]) =>
    APP_KEYS.has(k)
  );

  for (const [appKey, enabled] of entries) {
    await pool
      .request()
      .input("appKey", mssql.NVarChar(64), appKey)
      .input("enabled", mssql.Bit, enabled ? 1 : 0)
      .input("by", mssql.NVarChar(256), by).query(`
        MERGE PortalGlobalAppState AS t
        USING (SELECT @appKey AS AppKey) AS s
          ON t.AppKey = s.AppKey
        WHEN MATCHED THEN
          UPDATE SET Enabled=@enabled, UpdatedAt=SYSUTCDATETIME(), UpdatedBy=@by
        WHEN NOT MATCHED THEN
          INSERT (AppKey, Enabled, UpdatedAt, UpdatedBy)
          VALUES (@appKey, @enabled, SYSUTCDATETIME(), @by);
      `);
  }
}

// Effective apps = user-enabled ∩ globally-enabled
// Effective apps = user-enabled ∩ globally-enabled ∩ (if restricted -> allowlisted OR admin)
async function getEnabledAppsEffective(email) {
  const userEnabled = await getEnabledApps(email);
  const globalEnabled = await getGlobalEnabledSet();
  const restricted = await getGlobalRestrictedSet();

  // Only query allowlist if restriction is actually used
  const allowForEmail = restricted.size
    ? await getAllowlistedAppsForEmail(email)
    : new Set();

  const admin = await isPortalAdmin(email);

  return userEnabled.filter((k) => {
    if (!globalEnabled.has(k)) return false;
    if (!restricted.has(k)) return true;
    // Restricted -> must be allowlisted (admins bypass restriction so you can't lock yourself out)
    return admin || allowForEmail.has(k);
  });
}

function requireAuth(req, res, next) {
  const token = req.cookies?.sso;
  if (!token) return res.status(401).json({ error: "unauthenticated" });

  try {
    const payload = jwt.verify(token, AUTH_PUBLIC_KEY, {
      algorithms: ["RS256"],
      issuer: ISSUER,
      audience: AUDIENCE,
    });

    if (!payload.day || payload.day !== currentIstDay()) {
      clearSsoCookies(res);
      return res.status(401).json({ error: "session_expired_day_change" });
    }

    req.user = payload;
    return next();
  } catch (e) {
    return res.status(401).json({ error: "invalid token" });
  }
}

function requireAdmin(req, res, next) {
  requireAuth(req, res, async () => {
    const email = req.user?.email;
    if (!email) return res.status(401).json({ error: "unauthenticated" });

    try {
      const ok = await isPortalAdmin(email);
      if (!ok) return res.status(403).json({ error: "forbidden" });
      return next();
    } catch (e) {
      console.error("requireAdmin error", e);
      return res.status(500).json({ error: "server_error" });
    }
  });
}

// -------- JWT helpers ----------
function issueTokens(user) {
  const day = currentIstDay();

  const access = jwt.sign(
    {
      sub: user.id,
      email: user.email,
      roles: user.roles || [],
      apps: user.apps || [],
      day,
    },

    AUTH_PRIVATE_KEY,
    {
      algorithm: "RS256",
      expiresIn: ACCESS_TTL,
      issuer: ISSUER,
      audience: AUDIENCE,
    }
  );
  const refresh = jwt.sign(
    {
      sub: user.id,
      email: user.email,
      roles: user.roles || [],
      apps: user.apps || [],
      typ: "refresh",
      day,
    },
    AUTH_PRIVATE_KEY,
    {
      algorithm: "RS256",
      expiresIn: REFRESH_TTL,
      issuer: ISSUER,
      audience: AUDIENCE,
    }
  );
  return { access, refresh };
}

/**
 * Set SSO cookies.
 * - If request host ends with the configured COOKIE_DOMAIN, set domain.
 * - Otherwise (localhost/IP), omit domain so cookies stick in dev.
 */
function setSsoCookies(req, res, access, refresh) {
  // If COOKIE_DOMAIN is set (prod), ALWAYS set it so cookies work across subdomains.
  // This avoids proxy/ingress hostname quirks.
  const shouldSetDomain = !!(COOKIE_DOMAIN && String(COOKIE_DOMAIN).trim());

  const baseCookie = {
    httpOnly: true,
    secure: true,
    sameSite: "none",
  };

  const accessOpts = {
    ...baseCookie,
    path: "/",
    maxAge: 15 * 60 * 1000,
    ...(shouldSetDomain ? { domain: COOKIE_DOMAIN } : {}),
  };

  const refreshOpts = {
    ...baseCookie,
    path: "/auth",
    maxAge: 30 * 24 * 60 * 60 * 1000,
    ...(shouldSetDomain ? { domain: COOKIE_DOMAIN } : {}),
  };

  res.cookie("sso", access, accessOpts);
  res.cookie("sso_refresh", refresh, refreshOpts);
}

function clearSsoCookies(res) {
  // clear cookies both with and without domain to be safe
  const clear = (opts) => {
    res.clearCookie("sso", { path: "/", ...opts });
    res.clearCookie("sso_refresh", { path: "/auth", ...opts });
  };
  clear({});
  if (COOKIE_DOMAIN) clear({ domain: COOKIE_DOMAIN });
}

// -------- OTP: SEND (DB flow like INVEST) ----------
app.post("/api/send-otp", async (req, res) => {
  const fullEmail = normaliseEmail(req.body.email);
  if (!isPremierEmail(fullEmail)) {
    return res
      .status(400)
      .json({ message: "Only @premierenergies.com emails are allowed." });
  }

  let authPool;
  try {
    authPool = new mssql.ConnectionPool(authDbConfig);
    await authPool.connect();

    // Verify employee exists
    const empResult = await authPool
      .request()
      .input("email", mssql.NVarChar(256), fullEmail).query(`
        SELECT EmpID 
          FROM EMP 
         WHERE EmpEmail = @email 
           AND ActiveFlag = 1
      `);

    // Ensure portal access rows exist (default all apps enabled on first login)
    const admin = await isPortalAdmin(fullEmail);
    const enabledApps = await getEnabledAppsEffective(fullEmail);

    // If someone has been explicitly disabled (0 enabled apps) and is not admin → block login
    if (!admin && enabledApps.length === 0) {
      await authPool.close();
      return res
        .status(403)
        .json({ message: "Your portal access is disabled. Contact admin." });
    }

    if (!empResult.recordset.length) {
      await authPool.close();
      return res
        .status(404)
        .json({ message: "No @premierenergies.com account found." });
    }

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const expiry = new Date(Date.now() + 5 * 60 * 1000);

    await authPool
      .request()
      .input("username", mssql.NVarChar(256), fullEmail)
      .input("otp", mssql.NVarChar(6), otp)
      .input("expiry", mssql.DateTime, expiry).query(`
        MERGE Login AS t
        USING (SELECT @username AS Username) AS s
          ON t.Username = s.Username
        WHEN MATCHED THEN
          UPDATE SET OTP = @otp, OTP_Expiry = @expiry
        WHEN NOT MATCHED THEN
          INSERT (Username, OTP, OTP_Expiry)
          VALUES (@username, @otp, @expiry);
      `);

    await authPool.close();

    const subject = "Your Premier Energies Portal OTP";
    const html = `
      <div style="font-family:Arial;color:#333;line-height:1.5;">
        <h2 style="color:#0052cc;margin-bottom:.5em;">Premier Energies Digital Portal</h2>
        <p>Your one-time password (OTP) is:</p>
        <p style="font-size:24px;font-weight:bold;color:#0052cc;">${otp}</p>
        <p>This code expires in <strong>5 minutes</strong>.</p>
        <hr style="border:none;border-top:1px solid #eee;margin:2em 0;">
        <p style="font-size:12px;color:#777;">If you didn’t request this, please ignore this email.</p>
      </div>`;
    await sendEmail(fullEmail, subject, html);

    return res.json({ message: "OTP sent successfully" });
  } catch (err) {
    if (authPool) await authPool.close();
    console.error("send-otp error", err);
    return res.status(500).json({ message: "Server error" });
  }
});

// -------- OTP: VERIFY (DB) + issue SSO cookies ----------
app.post("/api/verify-otp", async (req, res) => {
  const fullEmail = normaliseEmail(req.body.email);
  if (!isPremierEmail(fullEmail)) {
    return res
      .status(400)
      .json({ message: "Only @premierenergies.com emails are allowed." });
  }

  const { otp } = req.body;

  let authPool;
  try {
    authPool = new mssql.ConnectionPool(authDbConfig);
    await authPool.connect();

    const lookup = await authPool
      .request()
      .input("username", mssql.NVarChar(256), fullEmail)
      .input("otp", mssql.NVarChar(6), otp).query(`
        SELECT OTP_Expiry, (SELECT TOP 1 EmpID FROM EMP WHERE EmpEmail=@username) AS EmpID
          FROM Login
         WHERE Username = @username
           AND OTP = @otp
      `);

    if (!lookup.recordset.length) {
      await authPool.close();
      return res.status(400).json({ message: "Invalid OTP" });
    }
    if (new Date() > lookup.recordset[0].OTP_Expiry) {
      await authPool.close();
      return res.status(400).json({ message: "OTP expired" });
    }

    const enabledApps = await getEnabledAppsEffective(fullEmail);
    const admin = await isPortalAdmin(fullEmail);

    const user = {
      id: String(lookup.recordset[0].EmpID || fullEmail),
      email: fullEmail,
      roles: [],
      apps: enabledApps,
      isAdmin: admin,
    };

    const { access, refresh } = issueTokens(user);
    setSsoCookies(req, res, access, refresh);

    await authPool.close();
    return res.json({ ok: true, user: { email: user.email } });
  } catch (err) {
    if (authPool) await authPool.close();
    console.error("verify-otp error", err);
    return res.status(500).json({ message: "Server error" });
  }
});

// -------- Session (used by SPA to hydrate user) ----------
app.get("/api/session", requireAuth, async (req, res) => {
  try {
    const email = req.user.email;
    const apps = await getEnabledAppsEffective(email);

    const admin = await isPortalAdmin(email);

    return res.json({
      user: {
        email,
        id: req.user.sub,
        roles: req.user.roles || [],
        apps,
        isAdmin: admin,
      },
    });
  } catch (e) {
    console.error("session error", e);
    return res.status(500).json({ error: "server_error" });
  }
});

// -------- Refresh ----------
app.post("/auth/refresh", async (req, res) => {
  const rt = req.cookies?.sso_refresh;
  if (!rt) return res.status(401).json({ error: "no refresh" });

  try {
    const payload = jwt.verify(rt, AUTH_PUBLIC_KEY, {
      algorithms: ["RS256"],
      issuer: ISSUER,
      audience: AUDIENCE,
    });

    // Only allow real refresh tokens + same IST day
    if (
      payload.typ !== "refresh" ||
      !payload.day ||
      payload.day !== currentIstDay()
    ) {
      clearSsoCookies(res);
      return res.status(401).json({ error: "session_expired_day_change" });
    }

    const freshApps = await getEnabledAppsEffective(payload.email || "");

    const admin = await isPortalAdmin(payload.email || "");

    const user = {
      id: payload.sub,
      email: payload.email || "",
      roles: payload.roles || [],
      apps: freshApps,
      isAdmin: admin,
    };

    const { access, refresh } = issueTokens(user);
    setSsoCookies(req, res, access, refresh);
    return res.json({ ok: true });
  } catch (e) {
    return res.status(401).json({ error: "invalid refresh" });
  }
});

// -------- Logout ----------
app.post("/auth/logout", (req, res) => {
  clearSsoCookies(res);
  res.json({ ok: true });
});

/* =========================
   Admin APIs (Users + App Access)
========================= */

// who am i (admin)
app.get("/api/admin/me", requireAdmin, async (req, res) => {
  res.json({ ok: true, email: req.user.email });
});

// app catalog
app.get("/api/admin/app-catalog", requireAdmin, async (req, res) => {
  res.json({ apps: APP_CATALOG });
});

// admins list
app.get("/api/admin/admins", requireAdmin, async (req, res) => {
  const pool = await db();
  const r = await pool.request().query(`
    SELECT Email, Active, CreatedAt, UpdatedAt, UpdatedBy
      FROM PortalAdmins
     WHERE LOWER(Email) LIKE '%@premierenergies.com'
     ORDER BY Email
  `);

  res.json({ admins: r.recordset });
});

// add admin
app.post("/api/admin/admins", requireAdmin, async (req, res) => {
  const email = normaliseEmail(req.body?.email || "");
  if (!isPremierEmail(email))
    return res.status(400).json({ error: "only_premier_emails_allowed" });

  if (!email) return res.status(400).json({ error: "email_required" });

  const pool = await db();
  await pool
    .request()
    .input("email", mssql.NVarChar(256), email)
    .input("by", mssql.NVarChar(256), normaliseEmail(req.user.email)).query(`
      MERGE PortalAdmins AS t
      USING (SELECT @email AS Email) s
        ON t.Email=s.Email
      WHEN MATCHED THEN
        UPDATE SET Active=1, UpdatedAt=SYSUTCDATETIME(), UpdatedBy=@by
      WHEN NOT MATCHED THEN
        INSERT (Email, Active, UpdatedAt, UpdatedBy) VALUES (@email, 1, SYSUTCDATETIME(), @by);
    `);

  res.json({ ok: true });
});

// activate/deactivate admin (prevents removing last active admin)
app.patch("/api/admin/admins/:email", requireAdmin, async (req, res) => {
  const target = normaliseEmail(req.params.email || "");
  if (!isPremierEmail(target))
    return res.status(400).json({ error: "only_premier_emails_allowed" });

  const active = !!req.body?.active;

  const pool = await db();

  if (!active) {
    const cnt = await pool
      .request()
      .query(`SELECT COUNT(1) AS c FROM PortalAdmins WHERE Active=1`);
    if ((cnt.recordset?.[0]?.c || 0) <= 1) {
      return res.status(400).json({ error: "cannot_disable_last_admin" });
    }
  }

  await pool
    .request()
    .input("email", mssql.NVarChar(256), target)
    .input("active", mssql.Bit, active ? 1 : 0)
    .input("by", mssql.NVarChar(256), normaliseEmail(req.user.email)).query(`
      UPDATE PortalAdmins
         SET Active=@active, UpdatedAt=SYSUTCDATETIME(), UpdatedBy=@by
       WHERE Email=@email
    `);

  res.json({ ok: true });
});

// list users (EMP) + enabled apps count + admin flag
app.get("/api/admin/users", requireAdmin, async (req, res) => {
  const search = String(req.query.search || "")
    .trim()
    .toLowerCase();
  const activeOnly = String(req.query.activeOnly || "false") === "true";
  const page = Math.max(1, Number(req.query.page || 1));
  const pageSize = Math.min(
    200,
    Math.max(10, Number(req.query.pageSize || 50))
  );
  const offset = (page - 1) * pageSize;

  const pool = await db();
  const like = `%${search}%`;

  const totalQ = await pool.request().input("like", mssql.NVarChar(256), like)
    .query(`
      SELECT COUNT(1) AS total
        FROM EMP
       WHERE EmpEmail LIKE @like
         AND LOWER(EmpEmail) LIKE '%@premierenergies.com'
         ${activeOnly ? "AND ActiveFlag=1" : ""}
    `);

  const total = totalQ.recordset?.[0]?.total || 0;

  const r = await pool
    .request()
    .input("like", mssql.NVarChar(256), like)
    .input("offset", mssql.Int, offset)
    .input("limit", mssql.Int, pageSize).query(`
      SELECT e.EmpEmail, e.EmpID, e.ActiveFlag,
             (SELECT COUNT(1) FROM PortalAppAccess pa WHERE pa.Email=e.EmpEmail AND pa.Enabled=1) AS EnabledApps,
             CASE WHEN EXISTS (SELECT 1 FROM PortalAdmins a WHERE a.Email=e.EmpEmail AND a.Active=1) THEN 1 ELSE 0 END AS IsAdmin
        FROM EMP e
       WHERE e.EmpEmail LIKE @like
         AND LOWER(e.EmpEmail) LIKE '%@premierenergies.com'
         ${activeOnly ? "AND e.ActiveFlag=1" : ""}
       ORDER BY e.EmpEmail
       OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY
    `);

  res.json({
    page,
    pageSize,
    total,
    users: r.recordset.map((x) => ({
      email: x.EmpEmail,
      empId: x.EmpID,
      activeFlag: !!x.ActiveFlag,
      enabledApps: Number(x.EnabledApps || 0),
      isAdmin: !!x.IsAdmin,
    })),
  });
});

// get single user details + apps map
app.get("/api/admin/users/:email", requireAdmin, async (req, res) => {
  const email = normaliseEmail(req.params.email || "");
  if (!isPremierEmail(email))
    return res.status(400).json({ error: "only_premier_emails_allowed" });

  const pool = await db();

  const u = await pool
    .request()
    .input("email", mssql.NVarChar(256), email)
    .query(
      `SELECT TOP 1 EmpEmail, EmpID, ActiveFlag FROM EMP WHERE EmpEmail=@email`
    );

  if (!u.recordset.length) return res.status(404).json({ error: "not_found" });

  const apps = await getAppsMap(email);
  const admin = await isPortalAdmin(email);

  res.json({
    user: {
      email: u.recordset[0].EmpEmail,
      empId: u.recordset[0].EmpID,
      activeFlag: !!u.recordset[0].ActiveFlag,
      apps,
      isAdmin: admin,
    },
  });
});

// create user in EMP (best-effort: EmpEmail + ActiveFlag; supports extra fields if you pass them)
app.post("/api/admin/users", requireAdmin, async (req, res) => {
  const email = normaliseEmail(req.body?.email || "");
  if (!isPremierEmail(email))
    return res.status(400).json({ error: "only_premier_emails_allowed" });

  if (!email) return res.status(400).json({ error: "email_required" });

  const pool = await db();

  // If exists, just return ok
  const exists = await pool
    .request()
    .input("email", mssql.NVarChar(256), email)
    .query(`SELECT TOP 1 1 AS ok FROM EMP WHERE EmpEmail=@email`);

  if (exists.recordset.length) {
    await ensureDefaultAppAccess(email);
    return res.json({ ok: true, existed: true });
  }

  // Try insert minimal. If your EMP table requires additional NOT NULL fields, pass them in req.body.empFields
  const activeFlag =
    req.body?.activeFlag === undefined ? 1 : req.body.activeFlag ? 1 : 0;

  const empFields =
    req.body?.empFields && typeof req.body.empFields === "object"
      ? req.body.empFields
      : {};
  // Build dynamic insert for extra fields (assumes your provided fields match real column names)
  const keys = Object.keys(empFields);

  const cols = ["EmpEmail", "ActiveFlag", ...keys];
  const vals = ["@email", "@activeFlag", ...keys.map((k) => `@${k}`)];

  const rq = pool
    .request()
    .input("email", mssql.NVarChar(256), email)
    .input("activeFlag", mssql.Bit, activeFlag);

  // Treat extra fields as NVARCHAR by default (safe); adjust if needed later
  for (const k of keys) {
    rq.input(k, mssql.NVarChar(mssql.MAX), String(empFields[k]));
  }

  try {
    await rq.query(
      `INSERT INTO EMP (${cols.join(",")}) VALUES (${vals.join(",")})`
    );
    await ensureDefaultAppAccess(email);
    return res.json({ ok: true, existed: false });
  } catch (e) {
    console.error("EMP insert failed", e);
    return res.status(400).json({
      error: "emp_insert_failed",
      message:
        "EMP insert failed (likely EMP schema requires more NOT NULL fields). Pass required columns in empFields.",
      detail: String(e?.message || e),
    });
  }
});

// update user (ActiveFlag + apps)
app.patch("/api/admin/users/:email", requireAdmin, async (req, res) => {
  const email = normaliseEmail(req.params.email || "");
  if (!isPremierEmail(email))
    return res.status(400).json({ error: "only_premier_emails_allowed" });

  const pool = await db();

  const exists = await pool
    .request()
    .input("email", mssql.NVarChar(256), email)
    .query(`SELECT TOP 1 1 AS ok FROM EMP WHERE EmpEmail=@email`);

  if (!exists.recordset.length)
    return res.status(404).json({ error: "not_found" });

  if (req.body?.activeFlag !== undefined) {
    await pool
      .request()
      .input("email", mssql.NVarChar(256), email)
      .input("af", mssql.Bit, req.body.activeFlag ? 1 : 0)
      .query(`UPDATE EMP SET ActiveFlag=@af WHERE EmpEmail=@email`);
  }

  if (req.body?.apps && typeof req.body.apps === "object") {
    await setApps(email, req.body.apps, req.user.email);
  }

  res.json({ ok: true });
});

// "delete" user => deactivate (ActiveFlag=0)
app.delete("/api/admin/users/:email", requireAdmin, async (req, res) => {
  const email = normaliseEmail(req.params.email || "");
  if (!isPremierEmail(email))
    return res.status(400).json({ error: "only_premier_emails_allowed" });

  const pool = await db();

  await pool
    .request()
    .input("email", mssql.NVarChar(256), email)
    .query(`UPDATE EMP SET ActiveFlag=0 WHERE EmpEmail=@email`);

  res.json({ ok: true });
});

// update global app state
app.patch("/api/admin/app-global", requireAdmin, async (req, res) => {
  const body = req.body || {};

  // supports either { appKey, enabled } OR { apps: { key: boolean, ... } }
  let appsObj = body.apps;

  if (!appsObj && body.appKey) {
    appsObj = { [String(body.appKey)]: !!body.enabled };
  }

  if (!appsObj || typeof appsObj !== "object") {
    return res.status(400).json({ error: "apps_required" });
  }

  await setGlobalApps(appsObj, req.user.email);
  res.json({ ok: true });
});

// global app state (on/off for everyone) + restrict map
app.get("/api/admin/app-global", requireAdmin, async (req, res) => {
  const { enabledMap, restrictMap } = await getGlobalAppsConfig();
  res.json({ map: enabledMap, restrictMap });
});

// toggle restrict-to-allowlist for an app
app.patch("/api/admin/app-global-restrict", requireAdmin, async (req, res) => {
  const appKey = String(req.body?.appKey || "").trim();
  const restrict = !!req.body?.restrict;

  if (!APP_KEYS.has(appKey))
    return res.status(400).json({ error: "invalid_appKey" });

  await setGlobalRestrict(appKey, restrict, req.user.email);
  res.json({ ok: true });
});

// get allowlist for an app
app.get(
  "/api/admin/app-global-allowlist/:appKey",
  requireAdmin,
  async (req, res) => {
    const appKey = String(req.params.appKey || "").trim();
    if (!APP_KEYS.has(appKey))
      return res.status(400).json({ error: "invalid_appKey" });

    const emails = await getAllowlistForApp(appKey);
    res.json({ appKey, emails });
  }
);

// replace allowlist for an app
app.put(
  "/api/admin/app-global-allowlist/:appKey",
  requireAdmin,
  async (req, res) => {
    const appKey = String(req.params.appKey || "").trim();
    if (!APP_KEYS.has(appKey))
      return res.status(400).json({ error: "invalid_appKey" });

    const emails = await replaceAllowlistForApp(
      appKey,
      req.body?.emails || [],
      req.user.email
    );
    res.json({ ok: true, appKey, count: emails.length });
  }
);

// -------- Static (Vite) ----------
const distDir = path.join(__dirname, "../dist");
const indexHtml = path.join(distDir, "index.html");
app.use(express.static(distDir));
app.use((req, res, next) => {
  if (req.path.startsWith("/api/") || req.path.startsWith("/auth/"))
    return next();
  res.sendFile(indexHtml);
});

ensurePortalTables()
  .then(() => console.log("✅ Portal tables are ready"))
  .catch((e) => {
    console.error("❌ ensurePortalTables failed", e);
    process.exit(1);
  });

// -------- HTTPS Boot ----------
const httpsOptions = {
  key: readFileOrExit(TLS_KEY_FILE, "TLS_KEY_FILE"),
  cert: readFileOrExit(TLS_CERT_FILE, "TLS_CERT_FILE"),
  ca: readFileOrExit(TLS_CA_FILE, "TLS_CA_FILE"),
};

https.createServer(httpsOptions, app).listen(PORT, HOST, () => {
  console.log(
    `🔒 Portal HTTPS → https://${
      HOST === "0.0.0.0" ? "localhost" : HOST
    }:${PORT}`
  );
});
