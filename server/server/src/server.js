import http from "node:http";
import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import nodePath from "node:path";
import { promisify } from "node:util";
import { buildLookupResult } from "./lark-data.js";

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
  }
};

let tokenCache = { value: "", expiresAt: 0 };
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
    const method = String(options.method || "GET").toUpperCase();
    const args = ["api", method, path, "--as", "user", "--format", "json"];
    if (options.body) args.push("--data", options.body);
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
    const command = larkCliEntry ? process.execPath : "lark-cli";
    const commandArgs = larkCliEntry ? [larkCliEntry, ...args] : args;
    const { stdout } = await execFileAsync(command, commandArgs, {
      env: {
        ...process.env,
        LARKSUITE_CLI_NO_UPDATE_NOTIFIER: "1",
        LARKSUITE_CLI_NO_SKILLS_NOTIFIER: "1"
      },
      maxBuffer: 10 * 1024 * 1024
    });
    const envelope = JSON.parse(stdout);
    if (!envelope.ok) throw new Error(envelope.error?.message || "lark-cli request failed.");
    return envelope.data;
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
  return buildLookupResult({
    productType,
    shippingProductType,
    gmcProductType,
    shippingValues: shipping.values,
    gmcValues: gmc.values,
    shippingRevision: shipping.revision,
    gmcRevision: gmc.revision
  });
}

const server = http.createServer(async (request, response) => {
  try {
    const url = new URL(request.url, `http://${request.headers.host || "localhost"}`);
    if (request.method === "GET" && url.pathname === "/health") {
      json(response, 200, { ok: true, service: "customall-lark-lookup" });
      return;
    }
    const isLookup =
      request.method === "GET" && url.pathname === "/api/lark/product";
    const isConfig =
      request.method === "GET" && url.pathname === "/api/config";
    if (!isLookup && !isConfig) {
      json(response, 404, { ok: false, error: "Not found" });
      return;
    }
    if (!config.apiKey || request.headers["x-api-key"] !== config.apiKey) {
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
