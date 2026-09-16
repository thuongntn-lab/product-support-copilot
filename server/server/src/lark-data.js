export function normalizeProductType(value) {
  return String(value || "")
    .normalize("NFKC")
    .trim()
    .toLowerCase()
    .replace(/[\s_-]+/g, " ");
}

function rowMatchesProductType(cell, productType) {
  const wanted = normalizeProductType(productType);
  return String(cell || "")
    .split(/\r?\n/)
    .some((entry) => normalizeProductType(entry) === wanted);
}

function nonEmptyRows(values) {
  return values
    .map((row, index) => ({ row, sheetRow: index + 1 }))
    .filter(({ row }) => row.some((value) => String(value ?? "").trim() !== ""));
}

function cellText(value) {
  if (value == null) return "";
  if (Array.isArray(value)) return value.map(cellText).join("");
  if (typeof value === "object") {
    if ("text" in value) return cellText(value.text);
    if ("value" in value) return cellText(value.value);
    return "";
  }
  return String(value);
}

function uniqueRelevantMatches(matches, fields) {
  const signatures = new Set(
    matches.map(({ row }) =>
      JSON.stringify(fields.map((index) => cellText(row[index]).trim()))
    )
  );
  return { ambiguous: signatures.size > 1, signatures };
}

export function lookupShipping(values, productType) {
  const dataRows = nonEmptyRows(values).filter(({ sheetRow }) => sheetRow > 1);
  let matches = dataRows.filter(({ row }) => rowMatchesProductType(row[0], productType));
  let fallbackUsed = false;

  if (!matches.length) {
    matches = dataRows.filter(({ row }) =>
      normalizeProductType(row[0]).startsWith("others")
    );
    fallbackUsed = matches.length > 0;
  }
  const uniqueness = uniqueRelevantMatches(matches, [1, 3]);

  if (!matches.length) {
    return { found: false, ambiguous: false, fallbackUsed: false, sourceRows: [] };
  }

  const selected = matches[0];
  const codeRaw = cellText(selected.row[1]).trim();
  let code = null;
  let codeError = null;
  if (codeRaw) {
    try {
      code = JSON.parse(codeRaw);
    } catch {
      codeError = "Shipping Code không phải JSON hợp lệ.";
    }
  }

  return {
    found: true,
    ambiguous: uniqueness.ambiguous,
    fallbackUsed,
    requestedProductType: String(productType || "").trim(),
    sourceRows: matches.map(({ sheetRow }) => sheetRow),
    productType: cellText(selected.row[0]).trim(),
    code,
    codeRaw,
    codeError,
    note: cellText(selected.row[2]).trim(),
    shippingPage: cellText(selected.row[3]).trim(),
    updatedAtLabel: cellText(selected.row[4]).trim()
  };
}

export function lookupGmc(values, productType) {
  const matches = nonEmptyRows(values)
    .filter(({ sheetRow, row }) => sheetRow > 1 && rowMatchesProductType(row[0], productType));
  const uniqueness = uniqueRelevantMatches(matches, [1, 2, 4, 5]);

  if (!matches.length) {
    return { found: false, ambiguous: false, sourceRows: [] };
  }

  const selected = matches[0];
  return {
    found: true,
    ambiguous: uniqueness.ambiguous,
    sourceRows: matches.map(({ sheetRow }) => sheetRow),
    productType: cellText(selected.row[0]).trim(),
    categoryBreadcrumb: cellText(selected.row[1]).trim(),
    categoryId: cellText(selected.row[2]).trim(),
    note: cellText(selected.row[3]).trim(),
    color: cellText(selected.row[4]).trim(),
    material: cellText(selected.row[5]).trim()
  };
}

export function buildLookupResult({
  productType,
  shippingProductType = productType,
  gmcProductType = productType,
  shippingValues,
  gmcValues,
  shippingRevision,
  gmcRevision,
  fetchedAt = new Date().toISOString()
}) {
  return {
    productType,
    shippingProductType,
    gmcProductType,
    fetchedAt,
    shippingRevision,
    gmcRevision,
    shipping: lookupShipping(shippingValues, shippingProductType),
    gmc: lookupGmc(gmcValues, gmcProductType)
  };
}
