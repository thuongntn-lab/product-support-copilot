function queryAllDeep(selector, root = document) {
  const matches = [...root.querySelectorAll(selector)];
  for (const element of root.querySelectorAll("*")) {
    if (element.shadowRoot) {
      matches.push(...queryAllDeep(selector, element.shadowRoot));
    }
  }
  return matches;
}

function findUploadButton() {
  const candidates = queryAllDeep("button, [role='button']");
  return candidates.find((element) =>
    /upload\s*(files?)?|add\s*files?/i.test(element.textContent || "")
  );
}

function findFileInput() {
  const inputs = queryAllDeep('input[type="file"]:not([webkitdirectory])');
  return (
    inputs.find(
      (input) =>
        input.multiple &&
        /image|png|jpe?g|webp/i.test(input.accept || input.closest("form")?.textContent || "")
    ) ||
    inputs.find((input) => input.multiple) ||
    inputs[0] ||
    null
  );
}

function findProductType() {
  const directInputs = queryAllDeep(
    'input[name*="productType" i], input[id*="productType" i], input[aria-label*="product type" i]'
  );
  const directValue = directInputs.map((input) => input.value?.trim()).find(Boolean);
  if (directValue) return directValue;

  const labels = queryAllDeep("label").filter((label) =>
    /product\s*type/i.test(label.textContent || "")
  );
  for (const label of labels) {
    const targetId = label.htmlFor;
    const input =
      (targetId && document.getElementById(targetId)) ||
      label.querySelector("input") ||
      label.parentElement?.querySelector("input");
    if (input?.value?.trim()) return input.value.trim();
  }

  const bodyText = document.body?.innerText || "";
  return bodyText.match(/Product\s*type\s*\n\s*([^\n]+)/i)?.[1]?.trim() || null;
}

const CLOTHING_TAGS = [
  "Classic-T-Shirt",
  "Classic-Women-T-Shirt",
  "Inside Neck Print T-shirt",
  "Classic-Long-Sleeve",
  "Standard-Sweatshirt",
  "Classic-Hoodie",
  "Premium-T-Shirt",
  "Youth T-shirt"
];

function normalizeTag(value) {
  return String(value || "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[\s_-]+/g, " ")
    .trim();
}

function findProductTags() {
  const tagText = [];
  const directInputs = queryAllDeep(
    'input[name*="tag" i], input[id*="tag" i], input[aria-label*="tag" i]'
  );
  tagText.push(...directInputs.map((input) => input.value));

  const tagLabels = queryAllDeep("label, legend, h2, h3, h4").filter(
    (element) => normalizeTag(element.textContent) === "tags"
  );
  for (const label of tagLabels) {
    let container = label.parentElement;
    for (let level = 0; container && level < 3; level += 1, container = container.parentElement) {
      tagText.push(container.innerText);
    }
  }

  // Shopify renders selected tags as chips. The page-text fallback keeps detection
  // working when those chips are not backed by a conventional input.
  tagText.push(document.body?.innerText || "");
  tagText.push(
    ...queryAllDeep("button, [role='button'], [role='listitem'], span")
      .filter((element) => element.children.length === 0)
      .map((element) => element.textContent)
  );
  const normalizedText = normalizeTag(tagText.filter(Boolean).join("\n"));
  return CLOTHING_TAGS.filter((candidate) =>
    normalizedText.includes(normalizeTag(candidate))
  );
}

function normalizeFieldLabel(value) {
  return String(value || "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function matchesFieldAlias(value, normalizedAliases) {
  const normalized = normalizeFieldLabel(value);
  return normalizedAliases.includes(normalized);
}

function editableElements(root = document) {
  return queryAllDeep(
    'input:not([type="hidden"]):not([type="file"]), textarea, [contenteditable="true"], [role="textbox"], [role="combobox"], s-text-field, ui-text-field, polaris-text-field, s-text-area, ui-text-area, polaris-text-area, s-combobox, ui-combobox, polaris-combobox',
    root
  ).filter((element) => !element.disabled && !element.readOnly);
}

function fieldDescriptors(element) {
  const descriptors = [
    element.getAttribute("aria-label"),
    element.getAttribute("label"),
    element.getAttribute("data-label"),
    element.getAttribute("name"),
    element.getAttribute("id"),
    element.getAttribute("placeholder"),
    element.getAttribute("data-testid"),
    typeof element.label === "string" ? element.label : null
  ];
  if (element.labels) {
    descriptors.push(...[...element.labels].map((label) => label.textContent));
  }
  const labelledBy = String(element.getAttribute("aria-labelledby") || "")
    .split(/\s+/)
    .filter(Boolean);
  for (const id of labelledBy) descriptors.push(document.getElementById(id)?.textContent);
  descriptors.push(element.closest("label")?.textContent);
  return descriptors.map(normalizeFieldLabel).filter(Boolean);
}

function findEditableField(aliases, { includeMarked = false } = {}) {
  const normalizedAliases = aliases.map(normalizeFieldLabel);
  const editables = editableElements().filter(
    (element) =>
      includeMarked ||
      (!element.hasAttribute("data-customall-lark-filled") &&
        !element.hasAttribute("data-customall-lark-attempted"))
  );
  const direct = editables.find((element) => {
    const descriptors = fieldDescriptors(element);
    return descriptors.some((descriptor) =>
      matchesFieldAlias(descriptor, normalizedAliases)
    );
  });
  if (direct) return direct;

  const textNodes = queryAllDeep(
    "label, legend, span, p, h1, h2, h3, h4, div, dt, dd"
  )
    .filter((element) =>
      matchesFieldAlias(element.textContent, normalizedAliases)
    )
    .sort((left, right) => left.children.length - right.children.length);
  // Shopify's Product metafields page renders the name and input in separate
  // grid columns. Pair the visible label with the input on the same row.
  let bestVisualMatch = null;
  let bestScore = Number.POSITIVE_INFINITY;
  for (const textNode of textNodes) {
    const labelRect = textNode.getBoundingClientRect();
    if (!labelRect.width || !labelRect.height) continue;
    const labelCenterY = labelRect.top + labelRect.height / 2;
    for (const editable of editables) {
      const inputRect = editable.getBoundingClientRect();
      if (!inputRect.width || !inputRect.height || inputRect.left <= labelRect.left) continue;
      const inputCenterY = inputRect.top + inputRect.height / 2;
      const verticalDistance = Math.abs(inputCenterY - labelCenterY);
      if (verticalDistance > Math.max(32, inputRect.height)) continue;
      const horizontalDistance = Math.max(0, inputRect.left - labelRect.right);
      const score = verticalDistance * 1000 + horizontalDistance;
      if (score < bestScore) {
        bestScore = score;
        bestVisualMatch = editable;
      }
    }
  }
  if (bestVisualMatch) return bestVisualMatch;

  // Fall back to a shared field wrapper, but only when that wrapper contains
  // one editable. This avoids matching the first input in the entire form.
  for (const textNode of textNodes) {
    let container = textNode.parentElement;
    for (let level = 0; container && level < 4; level += 1, container = container.parentElement) {
      const candidates = editableElements(container);
      if (candidates.length === 1) return candidates[0];
    }
  }
  return null;
}

function inspectFieldCandidates(aliases) {
  const normalizedAliases = aliases.map(normalizeFieldLabel);
  const labels = queryAllDeep(
    "label, legend, span, p, h1, h2, h3, h4, div, dt, dd"
  ).filter((element) =>
    matchesFieldAlias(element.textContent, normalizedAliases)
  );
  const fields = editableElements().filter((element) =>
    fieldDescriptors(element).some((descriptor) =>
      matchesFieldAlias(descriptor, normalizedAliases)
    )
  );
  return { labels: labels.length, fields: fields.length };
}

function findFieldSurfaceByLabel(aliases) {
  const normalizedAliases = aliases.map(normalizeFieldLabel);
  const labels = queryAllDeep(
    "label, legend, span, p, div, dt, dd"
  )
    .filter((element) => {
      const rect = element.getBoundingClientRect();
      return (
        rect.width > 0 &&
        rect.height > 0 &&
        matchesFieldAlias(element.textContent, normalizedAliases)
      );
    })
    .sort((left, right) => {
      const leftRect = left.getBoundingClientRect();
      const rightRect = right.getBoundingClientRect();
      return leftRect.width * leftRect.height - rightRect.width * rightRect.height;
    });

  const allElements = queryAllDeep("*");
  for (const label of labels) {
    const labelRect = label.getBoundingClientRect();
    const labelCenterY = labelRect.top + labelRect.height / 2;

    // Prefer the field cell in the same local row. Shopify keeps the label and
    // control in sibling branches even when the control itself has no role.
    let labelBranch = label;
    let row = label.parentElement;
    for (let level = 0; row && level < 6; level += 1) {
      const rowRect = row.getBoundingClientRect();
      const siblingCells = [...row.children]
        .filter(
          (child) =>
            child !== labelBranch &&
            !child.contains(label) &&
            child.getBoundingClientRect().left > labelRect.left
        )
        .filter((child) => {
          const rect = child.getBoundingClientRect();
          const centerY = rect.top + rect.height / 2;
          return (
            rect.width >= 80 &&
            rect.height >= 24 &&
            rect.height <= 180 &&
            Math.abs(centerY - labelCenterY) <= Math.max(32, rect.height / 2)
          );
        })
        .sort(
          (left, right) =>
            right.getBoundingClientRect().width - left.getBoundingClientRect().width
        );
      if (siblingCells[0]) {
        const cellRect = siblingCells[0].getBoundingClientRect();
        const hit = document.elementFromPoint(
          Math.min(cellRect.right - 12, cellRect.left + cellRect.width * 0.75),
          labelCenterY
        );
        return hit || siblingCells[0];
      }
      if (
        rowRect.height > 220 ||
        rowRect.width > Math.max(window.innerWidth * 0.95, 1200)
      ) {
        break;
      }
      labelBranch = row;
      row = row.parentElement;
    }

    const candidates = allElements
      .filter((element) => {
        if (element === label || label.contains(element) || element.contains(label)) return false;
        const rect = element.getBoundingClientRect();
        if (!rect.width || !rect.height || rect.left <= labelRect.right) return false;
        const centerY = rect.top + rect.height / 2;
        return (
          Math.abs(centerY - labelCenterY) <= Math.max(32, rect.height / 2) &&
          rect.width >= 80 &&
          rect.height >= 24 &&
          rect.height <= 160
        );
      })
      .map((element) => {
        const rect = element.getBoundingClientRect();
        const interactive =
          element.matches(
            'input, textarea, button, [role="button"], [role="textbox"], [role="combobox"], [contenteditable="true"], [tabindex], s-text-field, ui-text-field, polaris-text-field, s-text-area, ui-text-area, polaris-text-area'
          ) ||
          "value" in element;
        const verticalDistance = Math.abs(
          rect.top + rect.height / 2 - labelCenterY
        );
        const horizontalDistance = Math.max(0, rect.left - labelRect.right);
        const score =
          (interactive ? 0 : 1_000_000) +
          verticalDistance * 10_000 +
          horizontalDistance +
          rect.width * rect.height / 100_000;
        return { element, score };
      })
      .sort((left, right) => left.score - right.score);
    if (candidates[0]) return candidates[0].element;
  }
  return null;
}

function deepActiveElement() {
  let active = document.activeElement;
  while (active?.shadowRoot?.activeElement) {
    active = active.shadowRoot.activeElement;
  }
  return active;
}

function clickLikeUser(element) {
  element.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "auto" });
  if (typeof element.focus === "function") {
    element.focus({ preventScroll: true });
  }
  const mouseOptions = {
    bubbles: true,
    cancelable: true,
    composed: true,
    view: window,
    button: 0,
    buttons: 1
  };
  if (typeof PointerEvent === "function") {
    element.dispatchEvent(new PointerEvent("pointerdown", {
      ...mouseOptions,
      pointerId: 1,
      pointerType: "mouse",
      isPrimary: true
    }));
  }
  element.dispatchEvent(new MouseEvent("mousedown", mouseOptions));
  if (typeof PointerEvent === "function") {
    element.dispatchEvent(new PointerEvent("pointerup", {
      ...mouseOptions,
      buttons: 0,
      pointerId: 1,
      pointerType: "mouse",
      isPrimary: true
    }));
  }
  element.dispatchEvent(new MouseEvent("mouseup", {
    ...mouseOptions,
    buttons: 0
  }));
  element.click();
}

function pressKeyLikeUser(element, key, code) {
  element.focus({ preventScroll: true });
  const options = {
    key,
    code,
    bubbles: true,
    cancelable: true,
    composed: true
  };
  element.dispatchEvent(new KeyboardEvent("keydown", options));
  element.dispatchEvent(new KeyboardEvent("keyup", options));
}

let highlightedShopifyTarget = null;

function highlightShopifyTarget(element, message) {
  clearShopifyHighlight();
  element.scrollIntoView({ block: "center", inline: "nearest", behavior: "smooth" });
  highlightedShopifyTarget = {
    element,
    outline: element.style.outline,
    outlineOffset: element.style.outlineOffset
  };
  element.style.outline = "4px solid #ff5a2f";
  element.style.outlineOffset = "3px";

  const tooltip = document.createElement("div");
  tooltip.id = "customall-shopify-assist";
  Object.assign(tooltip.style, {
    position: "fixed",
    zIndex: "2147483647",
    padding: "7px 10px",
    borderRadius: "7px",
    background: "#ff5a2f",
    color: "#ffffff",
    font: "600 13px/1.3 Arial, sans-serif",
    boxShadow: "0 5px 18px rgba(0,0,0,.22)",
    pointerEvents: "none"
  });
  tooltip.textContent = message;
  document.documentElement.appendChild(tooltip);

  requestAnimationFrame(() => {
    const rect = element.getBoundingClientRect();
    const tooltipRect = tooltip.getBoundingClientRect();
    tooltip.style.left = `${Math.max(
      8,
      Math.min(rect.left, window.innerWidth - tooltipRect.width - 8)
    )}px`;
    const below = rect.bottom + 8;
    tooltip.style.top = `${
      below + tooltipRect.height < window.innerHeight
        ? below
        : Math.max(8, rect.top - tooltipRect.height - 8)
    }px`;
  });
}

function clearShopifyHighlight() {
  if (highlightedShopifyTarget?.element?.isConnected) {
    highlightedShopifyTarget.element.style.outline =
      highlightedShopifyTarget.outline;
    highlightedShopifyTarget.element.style.outlineOffset =
      highlightedShopifyTarget.outlineOffset;
  }
  highlightedShopifyTarget = null;
  document.getElementById("customall-shopify-assist")?.remove();
}

async function waitForShopifySelection(checkSelection, timeoutMs = 120_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (checkSelection()) return true;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  return false;
}

function findVisibleChoiceTarget(
  leafText,
  parentText = "",
  root = document,
  allowContainedLeaf = false
) {
  const normalizedLeaf = normalizeFieldLabel(leafText);
  const normalizedParent = normalizeFieldLabel(parentText);
  const leafElements = queryAllDeep(
    'button, label, span, p, div, [role="option"], [role="radio"]',
    root
  ).filter((element) => {
    const rect = element.getBoundingClientRect();
    return (
      rect.width > 0 &&
      rect.height > 0 &&
      element.children.length <= 1 &&
      (
        normalizeFieldLabel(element.textContent) === normalizedLeaf ||
        (
          allowContainedLeaf &&
          ` ${normalizeFieldLabel(element.textContent)} `.includes(
            ` ${normalizedLeaf} `
          )
        )
      )
    );
  });
  const rows = [];
  for (const leaf of leafElements) {
    let row = leaf;
    for (let level = 0; row && level < 5; level += 1, row = row.parentElement) {
      const rect = row.getBoundingClientRect();
      const text = normalizeFieldLabel(row.textContent);
      if (
        rect.width >= 80 &&
        rect.height >= 26 &&
        rect.height <= 100 &&
        text.includes(normalizedLeaf) &&
        (!normalizedParent || text.includes(normalizedParent))
      ) {
        const clickable =
          row.closest(
            'button, label, [role="option"], [role="radio"], [role="button"]'
          ) || row;
        rows.push({ element: clickable, area: rect.width * rect.height });
        break;
      }
    }
  }
  return rows.sort((left, right) => left.area - right.area)[0]?.element || null;
}

async function waitForChoiceTarget(
  leafText,
  parentText = "",
  root = document,
  allowContainedLeaf = false
) {
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    const target = findVisibleChoiceTarget(
      leafText,
      parentText,
      root,
      allowContainedLeaf
    );
    if (target) return target;
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  return null;
}

async function findOrActivateEditable(aliases) {
  let field = findEditableField(aliases);
  if (field) return field;

  // Shopify renders product metafields as a read-only activator first. The
  // activator is a role=button with a dynamic internal structure, so prefer
  // its stable aria-label before using geometric label pairing. This is
  // important on stores whose two-column layout differs (PAW vs WR).
  const normalizedAliases = aliases.map(normalizeFieldLabel);
  const activator = queryAllDeep('button, [role="button"], [tabindex]')
    .filter((element) => {
      const rect = element.getBoundingClientRect();
      if (!rect.width || !rect.height || element.getAttribute("aria-disabled") === "true") return false;
      const aria = normalizeFieldLabel(element.getAttribute("aria-label"));
      return normalizedAliases.some((alias) =>
        aria.includes(alias) && /edit|metafield/i.test(aria)
      );
    })
    .sort((left, right) => {
      const leftAria = normalizeFieldLabel(left.getAttribute("aria-label"));
      const rightAria = normalizeFieldLabel(right.getAttribute("aria-label"));
      return (leftAria.length - rightAria.length);
    })[0];
  if (activator) {
    clickLikeUser(activator);
    const deadline = Date.now() + 1200;
    while (Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 100));
      field = findEditableField(aliases);
      if (field) return field;
    }
  }

  const surface = findFieldSurfaceByLabel(aliases);
  if (!surface) return null;
  clickLikeUser(surface);
  await new Promise((resolve) => setTimeout(resolve, 250));

  field = findEditableField(aliases);
  if (field) return field;
  const active = deepActiveElement();
  if (
    active &&
    (editableElements().includes(active) ||
      "value" in active ||
      active.isContentEditable)
  ) {
    return active;
  }
  if ("value" in surface || surface.isContentEditable) return surface;
  return null;
}

function findLabeledInteractiveControl(aliases) {
  const normalizedAliases = aliases.map(normalizeFieldLabel);
  const candidates = [
    ...editableElements().filter(
      (element) =>
        !element.hasAttribute("data-customall-lark-filled") &&
        !element.hasAttribute("data-customall-lark-attempted")
    ),
    ...queryAllDeep(
      'button, [role="button"], [role="option"], s-button, ui-button, polaris-button'
    )
  ];
  const uniqueCandidates = [...new Set(candidates)];
  const direct = uniqueCandidates.find((element) =>
    fieldDescriptors(element).some((descriptor) =>
      matchesFieldAlias(descriptor, normalizedAliases)
    )
  );
  if (direct) return direct;

  const labels = queryAllDeep(
    "label, legend, span, p, h1, h2, h3, h4, div, dt, dd"
  ).filter((element) =>
    matchesFieldAlias(element.textContent, normalizedAliases)
  );
  for (const label of labels) {
    let container = label.parentElement;
    for (let level = 0; container && level < 5; level += 1, container = container.parentElement) {
      const controls = uniqueCandidates.filter((candidate) => container.contains(candidate));
      if (controls.length === 1) return controls[0];
    }
  }
  return findFieldSurfaceByLabel(aliases);
}

function setEditableValue(element, value, { blur = true } = {}) {
  const nextValue = String(value ?? "");
  element.focus({ preventScroll: true });
  if (element instanceof HTMLInputElement) {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
    setter?.call(element, nextValue);
  } else if (element instanceof HTMLTextAreaElement) {
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set;
    setter?.call(element, nextValue);
  } else if ("value" in element) {
    element.value = nextValue;
  } else {
    element.textContent = nextValue;
  }
  element.dispatchEvent(new InputEvent("input", {
    bubbles: true,
    composed: true,
    inputType: "insertText",
    data: nextValue
  }));
  element.dispatchEvent(new Event("change", { bubbles: true, composed: true }));
  if (blur) {
    if (typeof element.blur === "function") element.blur();
    element.dispatchEvent(new FocusEvent("focusout", { bubbles: true, composed: true }));
  }
}

function editableValue(element) {
  if ("value" in element) return String(element.value ?? "");
  return String(element.textContent ?? "");
}

async function commitEditableValue(element, value, { json = false } = {}) {
  const expected = String(value ?? "");
  setEditableValue(element, expected);
  await new Promise((resolve) => setTimeout(resolve, 250));
  const actual = editableValue(element);
  if (json) {
    try {
      return JSON.stringify(JSON.parse(actual)) === JSON.stringify(JSON.parse(expected));
    } catch {
      return false;
    }
  }
  return actual.trim() === expected.trim();
}

async function fillShopifyPageReference(pageTitle) {
  if (!pageTitle) return { filled: false, missing: false };

  const visible = (element) => {
    const rect = element.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  };
  const control =
    queryAllDeep(
      'button, [role="button"], s-button, ui-button, polaris-button'
    ).find(
      (element) =>
        visible(element) &&
        normalizeFieldLabel(
          element.textContent || element.getAttribute("aria-label")
        ) === "select page"
    ) ||
    findLabeledInteractiveControl(["shipping page"]);
  if (!control) return { filled: false, missing: true };

  clickLikeUser(control);

  const normalizedTitle = normalizeFieldLabel(pageTitle);
  let overlay = null;
  let search = null;
  const openDeadline = Date.now() + 6000;
  while (!search && Date.now() < openDeadline) {
    await new Promise((resolve) => setTimeout(resolve, 150));
    overlay ||= queryAllDeep(
      '[role="dialog"], [aria-modal="true"], [role="listbox"]'
    ).find(visible);

    const active = deepActiveElement();
    if (
      active &&
      visible(active) &&
      active.matches?.(
        'input:not([type="hidden"]), [role="textbox"], s-text-field, ui-text-field, polaris-text-field'
      )
    ) {
      search = active;
    }
    if (!search && overlay) {
      search = queryAllDeep(
        'input:not([type="hidden"]), [role="textbox"], s-text-field, ui-text-field, polaris-text-field',
        overlay
      ).find(visible);
    }
    if (!search) {
      search = queryAllDeep(
        'input:not([type="hidden"]), [role="textbox"], s-text-field, ui-text-field, polaris-text-field'
      )
        .filter(visible)
        .find((element) => {
          const rect = element.getBoundingClientRect();
          const controlRect = control.getBoundingClientRect();
          return (
            rect.top >= controlRect.bottom - 12 &&
            rect.top <= controlRect.bottom + 220
          );
        });
    }
  }
  if (!search) return { filled: false, missing: true };

  for (let attempt = 0; attempt < 3; attempt += 1) {
    setEditableValue(search, pageTitle, { blur: false });
    await new Promise((resolve) => setTimeout(resolve, 180));
    if (editableValue(search).trim() === String(pageTitle).trim()) break;
  }
  await new Promise((resolve) => setTimeout(resolve, 250));

  const pageOption = await waitForChoiceTarget(
    pageTitle,
    "",
    overlay || document,
    true
  );
  if (!pageOption) return { filled: false, missing: true };

  pressKeyLikeUser(search, "ArrowDown", "ArrowDown");
  await new Promise((resolve) => setTimeout(resolve, 120));
  pressKeyLikeUser(search, "Enter", "Enter");
  await new Promise((resolve) => setTimeout(resolve, 400));

  if (pageOption.isConnected && visible(pageOption)) {
    clickLikeUser(pageOption);
    await new Promise((resolve) => setTimeout(resolve, 350));
  }

  const confirm = queryAllDeep(
    'button, [role="button"], s-button, ui-button, polaris-button',
    overlay || document
  ).find((element) => {
    const rect = element.getBoundingClientRect();
    const text = normalizeFieldLabel(
      element.textContent || element.getAttribute("aria-label")
    );
    return (
      rect.width > 0 &&
      rect.height > 0 &&
      ["select", "done", "add", "apply", "choose"].includes(text) &&
      !element.disabled &&
      element.getAttribute("aria-disabled") !== "true"
    );
  });
  if (confirm) {
    clickLikeUser(confirm);
    await new Promise((resolve) => setTimeout(resolve, 350));
  }

  const selected = await waitForShopifySelection(() => {
    const shippingLabels = queryAllDeep("label, span, p, div").filter(
      (element) =>
        visible(element) &&
        normalizeFieldLabel(element.textContent) === "shipping page"
    );
    return shippingLabels.some((label) => {
      let row = label.parentElement;
      for (let level = 0; row && level < 6; level += 1, row = row.parentElement) {
        const rowText = normalizeFieldLabel(row.textContent);
        if (
          rowText.includes("shipping page") &&
          ` ${rowText} `.includes(` ${normalizedTitle} `)
        ) {
          row.setAttribute("data-customall-lark-filled", "shippingPage");
          return true;
        }
        if (row.getBoundingClientRect().height > 220) break;
      }
      return false;
    });
  }, 6000);
  return { filled: selected, missing: !selected };
}

async function fillShopifyJsonMetafield(jsonValue) {
  if (!jsonValue) return { filled: false, missing: false };
  const expected = String(jsonValue);
  try {
    JSON.parse(expected);
  } catch {
    return { filled: false, missing: true };
  }

  const jsonMatches = (actual) => {
    try {
      return JSON.stringify(JSON.parse(String(actual))) === JSON.stringify(JSON.parse(expected));
    } catch {
      return false;
    }
  };

  // Shopify can replace the metafield input after an input/change event. Always
  // reacquire the live field and verify the persisted value instead of trusting
  // the element that received the first write.
  for (let attempt = 0; attempt < 3; attempt += 1) {
    let field =
      findEditableField(["shipping eta"], { includeMarked: true }) ||
      (await findOrActivateEditable(["shipping eta"]));
    if (!field) {
      await new Promise((resolve) => setTimeout(resolve, 250));
      continue;
    }

    if (jsonMatches(editableValue(field))) {
      field.removeAttribute("data-customall-lark-attempted");
      field.setAttribute("data-customall-lark-filled", "shippingEta");
      return { filled: true, missing: false };
    }

    field.setAttribute("data-customall-lark-attempted", "shippingEta");
    setEditableValue(field, expected);

    const verifyDeadline = Date.now() + 1800;
    while (Date.now() < verifyDeadline) {
      await new Promise((resolve) => setTimeout(resolve, 120));
      const liveField =
        findEditableField(["shipping eta"], { includeMarked: true }) ||
        (field.isConnected ? field : null);
      if (liveField && jsonMatches(editableValue(liveField))) {
        field.removeAttribute("data-customall-lark-attempted");
        liveField.removeAttribute("data-customall-lark-attempted");
        liveField.setAttribute("data-customall-lark-filled", "shippingEta");
        return { filled: true, missing: false };
      }
    }

    // A failed attempt must never block the next pass from finding this field.
    field.removeAttribute("data-customall-lark-attempted");
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  return { filled: false, missing: true };
}

async function fillShopifyCategory(categoryBreadcrumb) {
  if (!categoryBreadcrumb) return { filled: false, missing: false };

  const field = findEditableField(["product category", "category"]);
  if (!field) return { filled: false, missing: true };

  setEditableValue(field, categoryBreadcrumb, { blur: false });
  const segments = String(categoryBreadcrumb)
    .split(/\s*>\s*/)
    .map(normalizeFieldLabel)
    .filter(Boolean);
  const normalizedLeaf = segments.at(-1) || "";
  const normalizedParent = segments.at(-2) || "";
  const visible = (element) => {
    const rect = element.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  };

  const categoryOption = await waitForChoiceTarget(
    segments.at(-1),
    segments.at(-2)
  );
  if (!categoryOption) return { filled: false, missing: true };
  clickLikeUser(categoryOption);
  await new Promise((resolve) => setTimeout(resolve, 350));
  const selected = await waitForShopifySelection(() => {
    const categoryLabels = queryAllDeep("label, span, p, div").filter(
      (element) =>
        visible(element) &&
        normalizeFieldLabel(element.textContent) === "category"
    );
    return categoryLabels.some((label) => {
      let row = label.parentElement;
      for (let level = 0; row && level < 6; level += 1, row = row.parentElement) {
        const rect = row.getBoundingClientRect();
        const rowText = normalizeFieldLabel(row.textContent);
        if (
          ` ${rowText} `.includes(` ${normalizedLeaf} `) &&
          !rowText.includes("uncategorized")
        ) {
          row.setAttribute("data-customall-lark-filled", "category");
          return true;
        }
        if (rect.height > 220) break;
      }
      return false;
    });
  }, 6000);
  return { filled: selected, missing: !selected };
}

function findPrimaryScrollContainer() {
  const candidates = [
    document.scrollingElement,
    document.documentElement,
    document.body,
    ...queryAllDeep("*")
  ].filter(
    (element) =>
      element &&
      element.clientHeight > 100 &&
      element.scrollHeight - element.clientHeight > 200
  );
  return [...new Set(candidates)].sort(
    (left, right) =>
      (right.scrollHeight - right.clientHeight) -
      (left.scrollHeight - left.clientHeight)
  )[0] || document.scrollingElement || document.documentElement;
}

async function scanScrollableProductPage(scanAtCurrentPosition) {
  const scroller = findPrimaryScrollContainer();
  const previousScrollTop = scroller.scrollTop;
  const maxScrollTop = Math.max(0, scroller.scrollHeight - scroller.clientHeight);
  const step = Math.max(300, Math.floor(scroller.clientHeight * 0.7));
  const positions = [previousScrollTop, 0];
  for (let position = step; position < maxScrollTop; position += step) {
    positions.push(position);
  }
  positions.push(maxScrollTop);

  for (const position of [...new Set(positions)]) {
    scroller.scrollTop = position;
    await new Promise((resolve) => setTimeout(resolve, 180));
    if (await scanAtCurrentPosition()) break;
  }
  scroller.scrollTop = previousScrollTop;
}

function findOpenMetafieldsControl() {
  const controls = queryAllDeep("a, button, [role='button']");
  const metafieldHeadings = queryAllDeep("h1, h2, h3, h4, legend, p, span").filter(
    (element) => /^(product\s+)?metafields?$/i.test(String(element.textContent || "").trim())
  );
  for (const heading of metafieldHeadings) {
    let container = heading.parentElement;
    for (let level = 0; container && level < 5; level += 1, container = container.parentElement) {
      const control = queryAllDeep("a, button, [role='button']", container).find((element) => {
        const text = String(element.textContent || "").trim();
        const href = String(element.getAttribute("href") || "");
        return /view\s*all|show\s*all|manage|xem\s*táº¥t\s*cáº£/i.test(text) ||
          /\/metafields?(?:\/|$|\?)/i.test(href);
      });
      if (control) return control;
    }
  }
  return controls.find((element) =>
    /\/products\/\d+\/metafields?(?:\/|$|\?)/i.test(
      String(element.getAttribute("href") || "")
    )
  );
}

async function fillShopifyProductData(message) {
  if (
    location.hostname !== "admin.shopify.com" &&
    !location.hostname.endsWith(".myshopify.com")
  ) {
    return { ok: false, error: "Hãy mở đúng trang chỉnh sửa Product trong Shopify." };
  }

  const values = message.values || {};
  const mappings = [
    {
      key: "gmcMaterial",
      label: "GMC Material",
      aliases: ["gmc material"]
    },
    {
      key: "gmcColor",
      label: "GMC Color",
      aliases: ["gmc color"]
    }
  ];

  const filled = [];
  let missingMappings = [];
  const fillMappings = async (targets) => {
    const stillMissing = [];
    for (const mapping of targets) {
      const field = await findOrActivateEditable(mapping.aliases);
      if (!field) {
        stillMissing.push(mapping);
        continue;
      }
      field.setAttribute("data-customall-lark-attempted", mapping.key);
      const committed = await commitEditableValue(field, values[mapping.key] ?? "");
      if (!committed) {
        stillMissing.push(mapping);
        continue;
      }
      field.removeAttribute("data-customall-lark-attempted");
      field.setAttribute("data-customall-lark-filled", mapping.key);
      if (!filled.includes(mapping.label)) filled.push(mapping.label);
    }
    return stillMissing;
  };

  const categoryResult = await fillShopifyCategory(values.categoryBreadcrumb);
  if (categoryResult.filled) filled.push("Category");

  missingMappings = mappings.filter((mapping) =>
    String(values[mapping.key] || "").trim()
  );
  let shippingEtaResult = {
    filled: false,
    missing: Boolean(values.shippingEta)
  };
  let shippingPageResult = {
    filled: false,
    missing: Boolean(values.shippingPage)
  };
  await scanScrollableProductPage(async () => {
    missingMappings = await fillMappings(missingMappings);
    if (shippingEtaResult.missing) {
      shippingEtaResult = await fillShopifyJsonMetafield(values.shippingEta);
      if (shippingEtaResult.filled && !filled.includes("Shipping ETA")) {
        filled.push("Shipping ETA");
      }
    }
    if (shippingPageResult.missing) {
      shippingPageResult = await fillShopifyPageReference(values.shippingPage);
      if (shippingPageResult.filled && !filled.includes("Shipping Page")) {
        filled.push("Shipping Page");
      }
    }
    return (
      !missingMappings.length &&
      !shippingEtaResult.missing &&
      !shippingPageResult.missing
    );
  });

  const missing = missingMappings.map((mapping) => mapping.label);
  if (shippingEtaResult.missing) missing.push("Shipping ETA");
  if (shippingPageResult.missing) missing.push("Shipping Page");
  if (categoryResult.missing) missing.push("Category");

  return {
    ok: filled.length > 0,
    filled,
    missing,
    openedMetafields: false,
    editableCount: editableElements().length,
    fieldDiagnostics: {
      "GMC Material": inspectFieldCandidates(["gmc material"]),
      "GMC Color": inspectFieldCandidates(["gmc color"]),
      "Shipping ETA": inspectFieldCandidates(["shipping eta"]),
      "Shipping Page": inspectFieldCandidates(["shipping page"])
    },
    frameUrl: location.href
  };
}

async function saveShopifyProduct() {
  let saveButton = null;
  const deadline = Date.now() + 5000;
  while (!saveButton && Date.now() < deadline) {
    saveButton = queryAllDeep(
      'button, [role="button"], s-button, ui-button, polaris-button'
    ).find((element) => {
      const text = normalizeFieldLabel(
        element.textContent || element.getAttribute("aria-label")
      );
      return (
        text === "save" &&
        !element.disabled &&
        element.getAttribute("aria-disabled") !== "true"
      );
    });
    if (!saveButton) {
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
  }
  if (!saveButton) return { ok: false, error: "Không tìm thấy nút Save đang hoạt động." };

  saveButton.click();
  await new Promise((resolve) => setTimeout(resolve, 500));
  return { ok: true };
}

async function prepareShopifyFileInput() {
  let input = findFileInput();
  if (!input) {
    const button = findUploadButton();
    if (button) button.click();
  }

  const deadline = Date.now() + 8000;
  while (!input && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 200));
    input = findFileInput();
  }

  if (!input) {
    return {
      ok: false,
      error: 'Không tìm thấy ô Upload files. Hãy mở Shopify Content → Files rồi bấm lại.'
    };
  }

  const marker = `shopify-files-upload-${Date.now()}`;
  input.setAttribute("data-customall-upload-copilot", marker);
  return {
    ok: true,
    input,
    selector: `input[data-customall-upload-copilot="${marker}"]`
  };
}

function receiveShopifyFiles(sessionId, input) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error("Không nhận được mockup từ extension."));
    }, 30_000);

    const iframe = document.createElement("iframe");
    iframe.hidden = true;
    iframe.src = `${chrome.runtime.getURL(
      "src/bridge/shopify-upload-bridge.html"
    )}?session=${encodeURIComponent(sessionId)}`;

    function cleanup() {
      clearTimeout(timeout);
      window.removeEventListener("message", handleMessage);
      iframe.remove();
    }

    function handleMessage(event) {
      if (event.source !== iframe.contentWindow || event.data?.sessionId !== sessionId) return;
      if (event.data.type === "SHOPIFY_UPLOAD_FILES_ERROR") {
        cleanup();
        reject(new Error(event.data.error || "Không đọc được mockup tạm."));
        return;
      }
      if (
        event.data.type !== "SHOPIFY_UPLOAD_FILES_READY" ||
        !Array.isArray(event.data.files) ||
        !event.data.files.length
      ) {
        return;
      }

      const transfer = new DataTransfer();
      event.data.files.forEach((file) => transfer.items.add(file));
      input.files = transfer.files;
      input.dispatchEvent(new Event("input", { bubbles: true, composed: true }));
      input.dispatchEvent(new Event("change", { bubbles: true, composed: true }));
      cleanup();
      resolve(event.data.files.length);
    }

    window.addEventListener("message", handleMessage);
    document.documentElement.appendChild(iframe);
  });
}

async function uploadShopifyFiles(message) {
  if (!/\/content\/files(?:\/|$)/.test(location.pathname)) {
    return {
      ok: false,
      error: "Tab Shopify chưa ở trang Content → Files."
    };
  }

  const prepared = await prepareShopifyFileInput();
  if (!prepared.ok) return prepared;
  const count = await receiveShopifyFiles(message.sessionId, prepared.input);
  return { ok: true, count };
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "GET_PAGE_CONTEXT") {
    const store = location.pathname.match(/\/store\/([^/]+)/)?.[1] || null;
    const productId = location.pathname.match(/\/products\/(\d+)/)?.[1] || null;
    sendResponse({
      app: "shopify",
      url: location.href,
      title: document.title,
      store,
      productId,
      productType: findProductType(),
      tags: findProductTags(),
      onFilesPage: /\/content\/files(?:\/|$)/.test(location.pathname)
    });
    return;
  }

  if (message?.type === "HIGHLIGHT_UPLOAD") {
    const button = findUploadButton();
    if (!button) {
      sendResponse({ ok: false, error: "Không tìm thấy nút Upload files." });
      return;
    }

    button.scrollIntoView({ behavior: "smooth", block: "center" });
    const previousOutline = button.style.outline;
    const previousOffset = button.style.outlineOffset;
    button.style.outline = "4px solid #ff6b35";
    button.style.outlineOffset = "4px";
    setTimeout(() => {
      button.style.outline = previousOutline;
      button.style.outlineOffset = previousOffset;
    }, 6000);
    sendResponse({ ok: true });
    return;
  }

  if (message?.type === "UPLOAD_SHOPIFY_FILES_DIRECT") {
    uploadShopifyFiles(message)
      .then(sendResponse)
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  if (message?.type === "FILL_SHOPIFY_LARK_DATA") {
    fillShopifyProductData(message)
      .then(sendResponse)
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  if (message?.type === "SAVE_SHOPIFY_PRODUCT") {
    saveShopifyProduct()
      .then(sendResponse)
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }
});
