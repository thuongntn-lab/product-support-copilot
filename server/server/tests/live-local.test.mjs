import assert from "node:assert/strict";
import { spawn } from "node:child_process";

const child = spawn(process.execPath, ["server/src/server.js"], {
  cwd: process.cwd(),
  env: {
    ...process.env,
    LARK_AUTH_MODE: "cli-user",
    LOOKUP_API_KEY: "local-dev",
    HOST: "127.0.0.1",
    PORT: "8787"
  },
  stdio: ["ignore", "pipe", "pipe"]
});

try {
  await new Promise((resolve, reject) => {
    let stderr = "";
    const timeout = setTimeout(() => reject(new Error("Local API startup timed out.")), 10_000);
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });
    child.stdout.on("data", (chunk) => {
      if (!String(chunk).includes("Lark lookup API listening")) return;
      clearTimeout(timeout);
      resolve();
    });
    child.once("exit", (code) =>
      reject(new Error(`Local API exited early (${code}): ${stderr.trim()}`))
    );
  });

  const response = await fetch(
    "http://127.0.0.1:8787/api/lark/product?productType=Classic-T-Shirt",
    { headers: { "X-API-Key": "local-dev" } }
  );
  const body = await response.json();
  assert.equal(response.ok, true, body.error);
  assert.equal(body.data.shipping.found, true);
  assert.equal(body.data.shipping.shippingPage, "DS");
  assert.equal(body.data.shippingRevision > 0, true);
  assert.equal(body.data.gmcRevision > 0, true);

  const fallbackResponse = await fetch(
    "http://127.0.0.1:8787/api/lark/product?productType=Definitely-Not-In-ETA",
    { headers: { "X-API-Key": "local-dev" } }
  );
  const fallbackBody = await fallbackResponse.json();
  assert.equal(fallbackResponse.ok, true, fallbackBody.error);
  assert.equal(fallbackBody.data.shipping.fallbackUsed, true);
  assert.match(fallbackBody.data.shipping.productType, /^Others/i);
  assert.equal(fallbackBody.data.shipping.shippingPage, "HCCN");
  assert.deepEqual(
    fallbackBody.data.shipping.code.datas.map((entry) => entry.country),
    ["US", "Other"]
  );

  const clothingResponse = await fetch(
    "http://127.0.0.1:8787/api/lark/product?productType=Clothing&shippingProductType=Classic-T-Shirt&gmcProductType=Clothing",
    { headers: { "X-API-Key": "local-dev" } }
  );
  const clothingBody = await clothingResponse.json();
  assert.equal(clothingResponse.ok, true, clothingBody.error);
  assert.equal(clothingBody.data.shipping.fallbackUsed, false);
  assert.equal(clothingBody.data.shipping.productType, "Classic-T-Shirt");
  assert.equal(clothingBody.data.gmc.productType, "Clothing");
  assert.equal(clothingBody.data.gmc.color, "White/Black");
  assert.equal(
    clothingBody.data.gmc.categoryBreadcrumb,
    "Apparel & Accessories > Clothing > Clothing Tops > T-Shirts"
  );
  console.log("live local Lark lookup passed");
} finally {
  child.kill();
}
