import http from "node:http";
import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import nodePath from "node:path";
import { promisify } from "node:util";
import { buildLookupResult } from "./lark-data.js";
import { getUsageSummary, recordHeartbeat } from "./usage.js";

const execFileAsync = promisify(execFile);
const config = {
  port: Number(process.env.PORT || 8787),
  host: process.env.HOST || "127.0.0.1",
  authMode: process.env.LARK_AUTH_MODE || "app",
  appId: process.env.LARK_APP_ID || "",
  appSecret: process.env.LARK_APP_SECRET || "",
  apiKey: process.env.LOOKUP_API_KEY || "",
  shipping: {
    token: process.env.SHIPPING_SPREADSHEET_TOKEN || "SYgqsyVjfhlk9TtcWYFjQHsOpoh",
    sheetId: process.env.SHIPPING_SHEET_ID || "e43XxR",
    range: process.env.SHIPPING_RANGE || "A:E"
  },
  gmc: {
    token: process.env.GMC_SPREADSHEET_TOKEN || "GDaOsqfbYh8C4rtSOikjerjLpsh",
    sheetId: process.env.GMC_SHEET_ID || "37d598",
    range: process.env.GMC_RANGE || "A:G"
  },
  giftbox: {
    token: process.env.GIFTBOX_SPREADSHEET_TOKEN || "JLlHsi1wBhET3BtrgkbjBuIapSc",
    sheetId: process.env.GIFTBOX_SHEET_ID || "4b2f72",
    range: process.env.GIFTBOX_RANGE || "A:B"
  }
};

let tokenCache = { value: "", expiresAt: 0 };
let userAuthCheckedAt = 0;
let userAuthRefreshPromise = null;
const productTypeRulesUrl = new URL(
  "../config/product-type-rules.json",
  import.meta.url
);

function json(response, status, body) {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff"
  });
  response.end(JSON.stringify(body));
}

function isLocalAdminRequest(request) {
  return ["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(request.socket.remoteAddress);
}

async function readJson(request) {
  let body = "";
  for await (const chunk of request) body += chunk;
  if (body.length > 10_000) throw new Error("Request quá lớn.");
  return JSON.parse(body || "{}");
}

function usageDashboard() {
  return `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>PS Copilot · Usage</title><style>body{font:15px system-ui;max-width:1100px;margin:32px auto;padding:0 16px;color:#172018}input,button{padding:9px;border:1px solid #ccd5cc;border-radius:8px}button{cursor:pointer;background:#ff542e;color:white;border:0}.cards{display:flex;gap:12px;flex-wrap:wrap;margin:20px 0}.card{padding:16px 22px;background:#f3f7f3;border-radius:12px;min-width:140px}strong{display:block;font-size:26px}table{border-collapse:collapse;width:100%}td,th{text-align:left;border-bottom:1px solid #e1e7e1;padding:10px}</style><h1>Product Support Copilot</h1><p><input id="key" type="password" placeholder="API key"><button onclick="loadUsage()">Tải dữ liệu</button></p><section id="cards" class="cards"></section><table><thead><tr><th>Thiết bị</th><th>Phiên bản</th><th>Lần dùng cuối</th><th>Thời gian hoạt động</th><th>Trạng thái</th></tr></thead><tbody id="rows"></tbody></table><script>async function loadUsage(){const key=document.querySelector('#key').value;const r=await fetch('/api/usage/summary',{headers:{'X-API-Key':key}});const b=await r.json();if(!r.ok) return alert(b.error||'Không tải được dữ liệu');document.querySelector('#cards').innerHTML=[['Đã cài',b.totals.installed],['Đang hoạt động',b.totals.active],['Tổng giờ hoạt động',(b.totals.activeSeconds/3600).toFixed(1)]].map(x=>'<div class="card">'+x[0]+'<strong>'+x[1]+'</strong></div>').join('');document.querySelector('#rows').innerHTML=b.devices.map(d=>'<tr><td>'+d.installationId.slice(0,10)+'…</td><td>'+d.lastVersion+'</td><td>'+new Date(d.lastSeen).toLocaleString('vi-VN')+'</td><td>'+Math.round(d.activeSeconds/60)+' phút</td><td>'+(Date.now()-Date.parse(d.lastSeen)<=600000?'Đang hoạt động':'Không hoạt động')+'</td></tr>').join('')}</script>`;
}

async function getProductTypeRules() {
  const rules = JSON.parse(await readFile(productTypeRulesUrl, "utf8"));
  if (
    !rules ||
    typeof rules !== "object" ||
    !Array.isArray(rules.clothingProductTypes) ||
    !rules.gmcExactMap ||
    typeof rules.gmcExactMap !== "object" ||
    !Array.isArray(rules.gmcFallbackContainsMappings)
  ) {
    throw new Error("Product Type rules config không hợp lệ.");
  }
  return rules;
}

async function larkRequest(path, options = {}) {
  if (config.authMode === "cli-user") {
    await ensureUserAuth();
    try {
      return await larkCliRequest(path, options);
    } catch (error) {
      if (!isAuthError(error)) throw error;
      userAuthCheckedAt = 0;
      await ensureUserAuth(true);
      return larkCliRequest(path, options);
    }
  }

  const token = await getTenantAccessToken();
  const response = await fetch(`https://open.larksuite.com${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json; charset=utf-8",
      ...(options.headers || {})
    }
  });
  const body = await response.json();
  if (!response.ok || body.code !== 0) {
    const error = new Error(body.msg || `Lark API HTTP ${response.status}`);
    error.code = body.code;
    throw error;
  }
  return body.data;
}

function larkCliCommand() {
  const larkCliEntry =
    process.env.LARK_CLI_ENTRY ||
    (process.platform === "win32"
      ? nodePath.join(
          process.env.APPDATA || "",
          "npm",
          "node_modules",
          "@larksuite",
          "cli",
          "scripts",
          "run.js"
        )
      : "");
  return larkCliEntry
    ? { command: process.execPath, prefix: [larkCliEntry] }
    : { command: "lark-cli", prefix: [] };
}

function larkCliEnv() {
  return {
    ...process.env,
    LARKSUITE_CLI_NO_UPDATE_NOTIFIER: "1",
    LARKSUITE_CLI_NO_SKILLS_NOTIFIER: "1"
  };
}

async function runLarkCli(args) {
  const { command, prefix } = larkCliCommand();
  try {
    const { stdout } = await execFileAsync(command, [...prefix, ...args], {
      env: larkCliEnv(),
      maxBuffer: 10 * 1024 * 1024
    });
    return JSON.parse(stdout);
  } catch (error) {
    const raw = String(error.stderr || error.stdout || error.message || "");
    try {
      error.envelope = JSON.parse(raw);
    } catch {
      error.envelope = null;
    }
    throw error;
  }
}

async function ensureUserAuth(force = false) {
  if (!force && Date.now() - userAuthCheckedAt < 5 * 60_000) return;
  if (!userAuthRefreshPromise) {
    userAuthRefreshPromise = runLarkCli(["auth", "status", "--json", "--verify"])
      .then((envelope) => {
        const user = envelope?.identities?.user;
        if (!envelope?.verified || !user?.available || user.tokenStatus === "invalid") {
          throw new Error("Lark user authorization is unavailable or expired.");
        }
        if (user.tokenStatus !== "needs_refresh") {
          userAuthCheckedAt = Date.now();
          return null;
        }
        return runLarkCli([
          "api",
          "GET",
          "/open-apis/authen/v1/user_info",
          "--as",
          "user",
          "--format",
          "json"
        ]).then((probe) => {
          if (!probe?.ok) throw new Error("Lark user authorization refresh failed.");
          userAuthCheckedAt = Date.now();
        });
      })
      .finally(() => {
        userAuthRefreshPromise = null;
      });
  }
  await userAuthRefreshPromise;
}

async function larkCliRequest(path, options = {}) {
  const method = String(options.method || "GET").toUpperCase();
  const args = ["api", method, path, "--as", "user", "--format", "json"];
  if (options.body) args.push("--data", options.body);
  const envelope = await runLarkCli(args);
  if (!envelope.ok) throw new Error(envelope.error?.message || "lark-cli request failed.");
  return envelope.data;
}

function isAuthError(error) {
  const text = JSON.stringify(error?.envelope || error?.message || "").toLowerCase();
  return /token_missing|need_user_authorization|authorization|authentication|token/.test(text);
}

async function getTenantAccessToken() {
  if (tokenCache.value && Date.now() < tokenCache.expiresAt - 60_000) {
    return tokenCache.value;
  }
  if (!config.appId || !config.appSecret) {
    throw new Error("Server chưa cấu hình LARK_APP_ID/LARK_APP_SECRET.");
  }

  const response = await fetch(
    "https://open.larksuite.com/open-apis/auth/v3/tenant_access_token/internal",
    {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify({ app_id: config.appId, app_secret: config.appSecret })
    }
  );
  const body = await response.json();
  if (!response.ok || body.code !== 0 || !body.tenant_access_token) {
    throw new Error(body.msg || "Không lấy được Lark tenant access token.");
  }

  tokenCache = {
    value: body.tenant_access_token,
    expiresAt: Date.now() + Number(body.expire || 7200) * 1000
  };
  return tokenCache.value;
}

async function getSheetSnapshot(source) {
  const range = `${source.sheetId}!${source.range}`;
  const data = await larkRequest(
    `/open-apis/sheets/v2/spreadsheets/${encodeURIComponent(
      source.token
    )}/values/${encodeURIComponent(range)}`
  );
  return {
    revision: Number(data.revision ?? data.valueRange?.revision ?? 0),
    values: data.valueRange?.values || data.values || []
  };
}

async function liveLookup({ productType, shippingProductType, gmcProductType }) {
  const [shipping, gmc] = await Promise.all([
    getSheetSnapshot(config.shipping),
    getSheetSnapshot(config.gmc)
  ]);
  const giftbox = await getSheetSnapshot(config.giftbox).catch(() => ({ revision: 0, values: [] }));
  return buildLookupResult({
    productType,
    shippingProductType,
    gmcProductType,
    shippingValues: shipping.values,
    gmcValues: gmc.values,
    shippingRevision: shipping.revision,
    gmcRevision: gmc.revision,
    giftboxValues: giftbox.values,
    giftboxRevision: giftbox.revision
  });
}

const server = http.createServer(async (request, response) => {
  try {
    const url = new URL(request.url, `http://${request.headers.host || "localhost"}`);
    if (request.method === "GET" && url.pathname === "/health") {
      json(response, 200, { ok: true, service: "customall-lark-lookup" });
      return;
    }
    if (request.method === "GET" && url.pathname === "/admin/usage") {
      if (!isLocalAdminRequest(request)) {
        json(response, 404, { ok: false, error: "Not found" });
        return;
      }
      response.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
      response.end(await readFile(new URL("./usage-dashboard.html", import.meta.url), "utf8"));
      return;
    }
    const isLookup =
      request.method === "GET" && url.pathname === "/api/lark/product";
    const isConfig =
      request.method === "GET" && url.pathname === "/api/config";
    const isHeartbeat = request.method === "POST" && url.pathname === "/api/telemetry/heartbeat";
    const isUsageSummary = request.method === "GET" && url.pathname === "/api/usage/summary";
    if (!isLookup && !isConfig && !isHeartbeat && !isUsageSummary) {
      json(response, 404, { ok: false, error: "Not found" });
      return;
    }
    const localUsageSummary = isUsageSummary && isLocalAdminRequest(request);
    if (!localUsageSummary && (!config.apiKey || request.headers["x-api-key"] !== config.apiKey)) {
      json(response, 401, { ok: false, error: "Unauthorized" });
      return;
    }
    if (isConfig) {
      json(response, 200, {
        ok: true,
        data: { productTypeRules: await getProductTypeRules() }
      });
      return;
    }
    if (isHeartbeat) {
      const body = await readJson(request);
      const device = await recordHeartbeat(body);
      json(response, 200, { ok: true, data: { lastSeen: device.lastSeen } });
      return;
    }
    if (isUsageSummary) {
      if (!isLocalAdminRequest(request)) {
        json(response, 404, { ok: false, error: "Not found" });
        return;
      }
      json(response, 200, { ok: true, data: await getUsageSummary() });
      return;
    }

    const productType = String(url.searchParams.get("productType") || "").trim();
    if (!productType || productType.length > 200) {
      json(response, 400, { ok: false, error: "Product Type không hợp lệ." });
      return;
    }

    const shippingProductType = String(
      url.searchParams.get("shippingProductType") || productType
    ).trim();
    const gmcProductType = String(
      url.searchParams.get("gmcProductType") || productType
    ).trim();
    if (
      !shippingProductType ||
      shippingProductType.length > 200 ||
      !gmcProductType ||
      gmcProductType.length > 200
    ) {
      json(response, 400, { ok: false, error: "Lookup Product Type không hợp lệ." });
      return;
    }
    const result = await liveLookup({
      productType,
      shippingProductType,
      gmcProductType
    });
    json(response, 200, { ok: true, data: result });
  } catch (error) {
    console.error(error);
    const scopeMessage =
      error.code === 99991672
        ? "Lark app thiếu quyền sheets:spreadsheet:read."
        : error.message;
    json(response, 502, { ok: false, error: scopeMessage });
  }
});

server.listen(config.port, config.host, () => {
  console.log(`Lark lookup API listening on http://${config.host}:${config.port}`);
});
