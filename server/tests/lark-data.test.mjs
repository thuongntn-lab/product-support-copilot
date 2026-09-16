import assert from "node:assert/strict";
import {
  buildLookupResult,
  lookupGmc,
  lookupShipping,
  normalizeProductType
} from "../src/lark-data.js";

assert.equal(normalizeProductType(" Inside_Neck-Print  T-Shirt "), "inside neck print t shirt");

const shipping = [
  ["Product Type", "Code", "Note", "Shipping Page", "Ngày Update"],
  ["Classic-T-Shirt", '{"datas":[]}', "", "DS", "16-Jun"],
  ["White mug\nBlack mug", "", "", "DS", ""]
];
assert.equal(lookupShipping(shipping, "classic t shirt").shippingPage, "DS");
assert.equal(lookupShipping(shipping, "Black mug").sourceRows[0], 3);
assert.equal(lookupShipping(shipping, "classic t shirt").fallbackUsed, false);

const shippingWithFallback = [
  ...shipping,
  ["Others (Sản phẩm đi từ TQ)", '{"datas":[]}', "", "HCCN", ""]
];
const fallbackShipping = lookupShipping(shippingWithFallback, "Product-Not-In-ETA");
assert.equal(fallbackShipping.fallbackUsed, true);
assert.equal(fallbackShipping.productType, "Others (Sản phẩm đi từ TQ)");
assert.equal(fallbackShipping.shippingPage, "HCCN");

const gmc = [
  ["Product Type", "Category breadcrumb", "Category ID", "Note", "GMC Color", "GMC Material"],
  ["Mug", "Drinkware", "gid://mug", "", "White", "Ceramic"],
  ["Blank Product", "", "", "", "", ""],
  ["Mug", "Drinkware", "gid://mug", "duplicate", "White", "Ceramic"]
];
const mug = lookupGmc(gmc, "mug");
assert.equal(mug.ambiguous, false);
assert.deepEqual(mug.sourceRows, [2, 4]);
assert.equal(lookupGmc(gmc, "Blank Product").material, "");
const richGmc = lookupGmc([
  ["Product Type", "Category breadcrumb", "Category ID", "Note", "GMC Color", "GMC Material"],
  [
    "Clothing",
    [{ text: "Apparel > " }, { text: "T-Shirts" }],
    "gid://clothing",
    "",
    "White/Black",
    "Cotton"
  ]
], "Clothing");
assert.equal(richGmc.categoryBreadcrumb, "Apparel > T-Shirts");

const result = buildLookupResult({
  productType: "Mug",
  shippingValues: shipping,
  gmcValues: gmc,
  shippingRevision: 180,
  gmcRevision: 576,
  fetchedAt: "2026-07-30T00:00:00.000Z"
});
assert.equal(result.gmc.color, "White");
assert.equal(result.shippingRevision, 180);

const splitLookup = buildLookupResult({
  productType: "Clothing",
  shippingProductType: "Classic-T-Shirt",
  gmcProductType: "Clothing",
  shippingValues: shipping,
  gmcValues: [
    ["Product Type", "Category breadcrumb", "Category ID", "Note", "GMC Color", "GMC Material"],
    ["Clothing", "T-Shirts", "gid://clothing", "", "White/Black", "Cotton"]
  ],
  shippingRevision: 180,
  gmcRevision: 576
});
assert.equal(splitLookup.shipping.fallbackUsed, false);
assert.equal(splitLookup.shipping.productType, "Classic-T-Shirt");
assert.equal(splitLookup.gmc.productType, "Clothing");

console.log("lark-data tests passed");
