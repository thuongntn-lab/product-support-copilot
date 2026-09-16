export const DEFAULT_PRODUCT_TYPE_RULES = {
  shippingDirectMap: {
    mug: "White mug",
    tumbler: "Tumbler 20oz"
  },
  clothingProductTypes: [
    "Classic-T-Shirt",
    "Classic-Women-T-Shirt",
    "Inside Neck Print T-shirt",
    "Classic-Long-Sleeve",
    "Standard-Sweatshirt",
    "Classic-Hoodie",
    "Premium-T-Shirt",
    "Youth T-shirt"
  ],
  clothingMultipleMatchPreference: "Classic-T-Shirt",
  gmcExactMap: {
    "car ornament": "Car Ornament"
  },
  gmcFallbackContainsMappings: [
    { contains: "ornament", productType: "Ornament" }
  ]
};

export const CLOTHING_LARK_PRODUCT_TYPES =
  DEFAULT_PRODUCT_TYPE_RULES.clothingProductTypes;
export const DIRECT_PRODUCT_TYPE_MAP =
  DEFAULT_PRODUCT_TYPE_RULES.shippingDirectMap;

function normalize(value) {
  return String(value || "")
    .normalize("NFKC")
    .trim()
    .toLowerCase()
    .replace(/[\s_-]+/g, " ");
}

export function resolveGmcProductType(
  shopifyProductType,
  rules = DEFAULT_PRODUCT_TYPE_RULES
) {
  const original = String(shopifyProductType || "").trim();
  const normalized = normalize(original);
  const exactProductType = rules.gmcExactMap?.[normalized];
  if (exactProductType) return String(exactProductType).trim();

  const fallbackMappings =
    rules.gmcFallbackContainsMappings || rules.gmcContainsMappings || [];
  const mapping = fallbackMappings.find(({ contains }) =>
    normalized.includes(normalize(contains))
  );
  if (mapping?.productType) return String(mapping.productType).trim();
  return original;
}

export function resolveLarkProductType(
  shopifyProductType,
  shopifyTags = [],
  rules = DEFAULT_PRODUCT_TYPE_RULES
) {
  const normalizedShopifyType = normalize(shopifyProductType);
  const directMapping =
    rules.shippingDirectMap?.[normalizedShopifyType];
  if (directMapping) {
    return {
      ok: true,
      productType: directMapping,
      source: "mapping",
      matches: [directMapping]
    };
  }

  if (normalizedShopifyType !== "clothing") {
    return {
      ok: Boolean(String(shopifyProductType || "").trim()),
      productType: String(shopifyProductType || "").trim(),
      source: "product_type",
      matches: []
    };
  }

  const normalizedTags = new Set(shopifyTags.map(normalize));
  const matches = (rules.clothingProductTypes || []).filter((candidate) =>
    normalizedTags.has(normalize(candidate))
  );
  if (matches.length === 1) {
    return { ok: true, productType: matches[0], source: "tag", matches };
  }
  if (matches.length > 1) {
    const preferred = matches.find(
      (candidate) =>
        normalize(candidate) ===
        normalize(
          rules.clothingMultipleMatchPreference ||
            DEFAULT_PRODUCT_TYPE_RULES.clothingMultipleMatchPreference
        )
    );
    if (preferred) {
      return {
        ok: true,
        productType: preferred,
        source: "tag_preference",
        matches
      };
    }
  }
  return {
    ok: false,
    productType: "",
    source: "tag",
    matches,
    error: matches.length
      ? `Product Type ${shopifyProductType} có nhiều tag mapping: ${matches.join(", ")}.`
      : `Product Type ${shopifyProductType} nhưng không tìm thấy tag mapping hợp lệ.`
  };
}
