var customallMessageHandler = (message, _sender, sendResponse) => {
  if (message?.type === "PING_CUSTOMALL_CONTENT") {
    sendResponse({ ok: true, version: chrome.runtime.getManifest().version });
    return;
  }

  if (message?.type === "PREPARE_ARTWORK_FORM") {
    prepareArtworkForm(message.values || {})
      .then(sendResponse)
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  if (message?.type === "AUDIT_ARTWORK") {
    sendResponse(auditArtworkEditor());
    return;
  }

  if (message?.type === "GET_ARTWORK_LAYERS") {
    expandAllArtworkGroups()
      .then((expandedGroups) => {
        const response = getArtworkLayers();
        sendResponse({ ...response, expandedGroups });
      })
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  if (message?.type === "GET_ARTWORK_FONTS") {
    getArtworkFonts()
      .then(sendResponse)
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  if (message?.type === "SEARCH_ARTWORK_FONTS") {
    searchArtworkFonts(message.search || "")
      .then(sendResponse)
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  if (message?.type === "GET_ARTWORK_CAMPAIGN_SOURCE") {
    getArtworkCampaignSource()
      .then(sendResponse)
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  if (message?.type === "SEARCH_CAMPAIGN_PRODUCT_BASES") {
    searchCampaignProductBases(message.category || "")
      .then(sendResponse)
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  if (message?.type === "ARM_CAMPAIGN_PRODUCT_BASE_AUTO_CREATE") {
    armCampaignProductBaseAutoCreate()
      .then(sendResponse)
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  if (message?.type === "GET_CAMPAIGN_EDITOR_STATE") {
    const productBaseModalOpen = Boolean(findProductBaseSelectorModal());
    const applyArtworkAvailable = Boolean(
      document.querySelector(".ctm-tour-campaign-step-1-3")
    );
    sendResponse({
      ok: true,
      ready:
        location.pathname.startsWith("/campaigns/new") &&
        !productBaseModalOpen &&
        applyArtworkAvailable,
      productBaseModalOpen,
      applyArtworkAvailable
    });
    return;
  }

  if (message?.type === "SELECT_CAMPAIGN_PRODUCT_BASE") {
    selectCampaignProductBase(message.productBase?.title || "", {
      waitForNavigation: false
    })
      .then(() => sendResponse({ ok: true, navigating: true }))
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  if (message?.type === "BUILD_CAMPAIGN_FROM_ARTWORK") {
    buildCampaignFromArtwork(
      message.source || {},
      message.productBase || {},
      message.mockupSessionId || ""
    )
      .then(sendResponse)
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  if (message?.type === "APPLY_ARTWORK_TRANSFORM") {
    applyArtworkTransform(message.layerIndexes || [], message.values || {})
      .then(sendResponse)
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  if (message?.type === "APPLY_ARTWORK_TEXT_STYLE") {
    applyArtworkTextStyle(message.layerIndexes || [], message.values || {})
      .then(sendResponse)
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  if (message?.type === "APPLY_ARTWORK_STROKE") {
    applyArtworkStroke(message.layerIndexes || [], message.values || {})
      .then(sendResponse)
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  if (message?.type === "APPLY_ARTWORK_CHANGE_CASE") {
    applyArtworkChangeCase(message.layerIndexes || [], message.value || "")
      .then(sendResponse)
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  if (message?.type === "REPLACE_ARTWORK_LABELS") {
    replaceArtworkLabels(
      message.layerIndexes || [],
      message.find || "",
      message.replacement || "",
      message.layers || []
    )
      .then(sendResponse)
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  if (message?.type === "UPLOAD_FOLDER_DIRECT") {
    uploadFolderDirect(message)
      .then(sendResponse)
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  if (message?.type === "GET_UPLOAD_STATUS") {
    const text = document.body?.innerText || "";
    sendResponse({
      ok: true,
      completed: /upload(ed)?\s+success|import(ed)?\s+success|completed|done/i.test(text),
      failed: /upload\s+failed|import\s+failed|no\s+clipart|error/i.test(text)
    });
    return;
  }

  if (message?.type !== "GET_PAGE_CONTEXT") return;

  const text = document.body?.innerText || "";
  const productLink = [...document.querySelectorAll('a[href*="/products/"]')]
    .map((anchor) => anchor.href)
    .find((href) => /\/products\/\d+/.test(href));
  const productId =
    productLink?.match(/\/products\/(\d+)/)?.[1] ||
    text.match(/\bProduct\s*ID\s*[:#]?\s*(\d{6,})\b/i)?.[1] ||
    null;

  sendResponse({
    app: "customall",
    url: location.href,
    title: document.title,
    productId,
    artworkMode: getArtworkMode(),
    artwork: getArtworkSummary()
  });
};

if (globalThis.__PS_CUSTOMALL_MESSAGE_HANDLER__) {
  chrome.runtime.onMessage.removeListener(
    globalThis.__PS_CUSTOMALL_MESSAGE_HANDLER__
  );
}
globalThis.__PS_CUSTOMALL_MESSAGE_HANDLER__ = customallMessageHandler;
chrome.runtime.onMessage.addListener(customallMessageHandler);

var wait = (milliseconds) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

function normalizedText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function visible(element) {
  const rect = element?.getBoundingClientRect?.();
  const style = element ? getComputedStyle(element) : null;
  return Boolean(
    rect &&
      rect.width > 2 &&
      rect.height > 2 &&
      style?.display !== "none" &&
      style?.visibility !== "hidden"
  );
}

function getArtworkMode() {
  if (/\/artworks\/[^/]+\/design(?:\/|$)/.test(location.pathname)) {
    return "editor";
  }
  if (location.pathname === "/artworks" || location.pathname === "/artworks/") {
    return document.querySelector("#artwork-form") ? "create" : "list";
  }
  if (location.pathname.startsWith("/campaigns")) return "campaign";
  return null;
}

function getArtworkSummary() {
  const mode = getArtworkMode();
  if (!mode) return null;
  if (mode !== "editor") return { mode };
  const audit = auditArtworkEditor();
  return {
    mode,
    title: document.title.replace(/^Edit Artwork\s*/i, "").replace(/\s*-\s*CustomAll$/i, ""),
    templateCount: audit.templateCount,
    layerCount: audit.layerCount
  };
}

function setInputValue(input, value) {
  const descriptor = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    "value"
  );
  descriptor?.set?.call(input, String(value));
  input.dispatchEvent(new Event("input", { bubbles: true, composed: true }));
  input.dispatchEvent(new Event("change", { bubbles: true, composed: true }));
}

function getArtworkLayerEntries() {
  const titles = [
    ...document.querySelectorAll(".ant-collapse-header .layer-title")
  ];
  const itemIndexes = new Map(
    titles.map((title, index) => [title.closest(".ant-collapse-item"), index])
  );
  return titles
    .map((title, index) => {
      const clone = title.cloneNode(true);
      clone.querySelectorAll(".edit, svg, [role=img]").forEach((item) => item.remove());
      const name = normalizedText(clone.textContent);
      const item = title.closest(".ant-collapse-item");
      const parentGroup = item?.parentElement?.closest(".ant-collapse-item.Group");
      let depth = 0;
      const groupPath = [];
      let ancestor = parentGroup;
      while (ancestor) {
        depth += 1;
        groupPath.unshift(
          normalizedText(
            ancestor.querySelector(":scope > .ant-collapse-header .layer-title")
              ?.textContent
          )
        );
        ancestor = ancestor.parentElement?.closest(".ant-collapse-item.Group");
      }
      const type = item?.classList.contains("Text")
        ? "Text"
        : item?.classList.contains("Image")
          ? "Image"
          : item?.classList.contains("Option")
            ? "Option"
            : item?.classList.contains("Group")
              ? "Group"
              : "Layer";
      return {
        index,
        name,
        type,
        depth,
        groupPath,
        parentIndex: parentGroup ? itemIndexes.get(parentGroup) ?? null : null,
        header: title.closest(".ant-collapse-header")
      };
    })
    .filter((layer) => layer.name && layer.header);
}

function isArtworkGroupHeader(header) {
  if (!header) return false;
  const item = header.closest(".ant-collapse-item");
  return Boolean(item?.classList.contains("Group"));
}

function isCollapsedArtworkGroupHeader(header) {
  return Boolean(
    header &&
      visible(header) &&
      header.getAttribute("aria-expanded") !== "true" &&
      isArtworkGroupHeader(header)
  );
}

function getArtworkGroupDomKey(item) {
  const path = [];
  let group = item;
  while (group?.matches?.(".ant-collapse-item.Group")) {
    path.unshift(
      normalizedText(
        group.querySelector(":scope > .ant-collapse-header .layer-title")
          ?.textContent
      )
    );
    group = group.parentElement?.closest(".ant-collapse-item.Group");
  }
  return JSON.stringify(path);
}

function findArtworkGroupByDomKey(key) {
  return [...document.querySelectorAll(".ant-collapse-item.Group")].find(
    (item) => getArtworkGroupDomKey(item) === key
  );
}

async function waitForArtworkGroupExpanded(key, timeoutMs = 1800) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const item = findArtworkGroupByDomKey(key);
    const header = item?.querySelector(":scope > .ant-collapse-header");
    if (header?.getAttribute("aria-expanded") === "true") return true;
    await wait(80);
  }
  return false;
}

async function expandAllArtworkGroups() {
  if (getArtworkMode() !== "editor") return 0;
  let expanded = 0;
  const visited = new Set();

  // Groups at the same level behave like an accordion: opening one closes its
  // sibling, although previously mounted child rows stay in the DOM. Walk the
  // tree depth-first and visit each stable path exactly once. This mounts every
  // lazy child without reopening siblings forever or producing duplicate scans.
  async function visitGroup(key, depth = 0) {
    if (visited.has(key) || depth > 30) return;
    let item = findArtworkGroupByDomKey(key);
    let header = item?.querySelector(":scope > .ant-collapse-header");
    if (!header) return;

    if (header.getAttribute("aria-expanded") !== "true") {
      const title = header.querySelector(":scope > .layer-title");
      (title || header).click();
      if (!(await waitForArtworkGroupExpanded(key))) return;
      expanded += 1;
      await wait(220);
    }

    visited.add(key);
    item = findArtworkGroupByDomKey(key);
    const childKeys = [...item.querySelectorAll(".ant-collapse-item.Group")]
      .filter(
        (child) =>
          child.parentElement?.closest(".ant-collapse-item.Group") === item
      )
      .map(getArtworkGroupDomKey);
    for (const childKey of childKeys) {
      await visitGroup(childKey, depth + 1);
    }
  }

  const rootKeys = [...document.querySelectorAll(".ant-collapse-item.Group")]
    .filter((item) => !item.parentElement?.closest(".ant-collapse-item.Group"))
    .map(getArtworkGroupDomKey);
  for (const rootKey of rootKeys) await visitGroup(rootKey);
  return expanded;
}

function getArtworkLayers() {
  if (getArtworkMode() !== "editor") {
    return {
      ok: false,
      error: "Hãy mở một Artwork editor trên Customall rồi thử lại."
    };
  }
  const occurrences = new Map();
  const layers = getArtworkLayerEntries().map(
    ({ index, name, type, depth, groupPath, parentIndex }) => {
      const key = artworkLayerTreeKey({ name, type, groupPath });
      const occurrence = occurrences.get(key) || 0;
      occurrences.set(key, occurrence + 1);
      return {
        index,
        name,
        type,
        depth,
        groupPath,
        parentIndex,
        occurrence
      };
    }
  );
  return { ok: true, layers };
}

async function selectArtworkLayer(index) {
  const layer = getArtworkLayerEntries().find((item) => item.index === Number(index));
  if (!layer) throw new Error(`Không tìm thấy layer #${Number(index) + 1}.`);
  if (layer.header.getAttribute("aria-expanded") === "true") {
    // Customall can keep a Fabric multi-selection even when one layer remains
    // expanded in the sidebar. Collapse + expand forces that layer to become
    // the only active object before Transform/Label is edited.
    layer.header.click();
    await wait(90);
    layer.header.click();
    await wait(180);
  } else {
    layer.header.click();
    await wait(180);
  }
  return layer;
}

function findVisibleButton(label) {
  const expected = normalizedText(label).toLowerCase();
  return [...document.querySelectorAll("button")].find(
    (button) =>
      visible(button) &&
      normalizedText(button.textContent || button.getAttribute("aria-label"))
        .toLowerCase() === expected
  );
}

async function openArtworkTransform() {
  let rx = document.querySelector("#rx");
  if (rx && visible(rx)) return rx;
  let button = findVisibleButton("Transform");
  if (!button) {
    // One extra selection cycle clears a stale multi-object selection.
    const activeHeader = getArtworkLayerEntries().find(
      (layer) => layer.header.getAttribute("aria-expanded") === "true"
    )?.header;
    if (activeHeader) {
      activeHeader.click();
      await wait(90);
      activeHeader.click();
      await wait(180);
      button = findVisibleButton("Transform");
    }
  }
  if (!button) throw new Error("Không tìm thấy nút Transform.");
  button.click();
  rx = await waitForElement(() => {
    const input = document.querySelector("#rx");
    return input && visible(input) ? input : null;
  }, 2500);
  if (!rx) throw new Error("Không mở được bảng Transform.");
  return rx;
}

function closeArtworkPopover() {
  const transformInput = document.querySelector("#rx");
  if (transformInput && visible(transformInput)) {
    const transformButton = findVisibleButton("Transform");
    if (transformButton) {
      transformButton.click();
      return;
    }
  }
  document.dispatchEvent(
    new KeyboardEvent("keydown", {
      key: "Escape",
      code: "Escape",
      bubbles: true,
      composed: true
    })
  );
}

function getVisibleArtworkFloatingPanels() {
  const panels = [
    ...document.querySelectorAll(
      ".sketch-picker, .ant-popover-inner-content, .ant-popover-inner, .ant-popover-content"
    )
  ].filter((element) => {
    if (!visible(element)) return false;
    return (
      element.matches(".sketch-picker") ||
      element.querySelector(".sketch-picker") ||
      element.querySelector("#strokeEnabled") ||
      element.querySelector("#multiStroke_enabled") ||
      element.querySelector('input.ant-input[placeholder="Search"]') ||
      element.querySelector("#rx") ||
      isArtworkChangeCasePanel(element)
    );
  });
  return [...new Set(panels)];
}

function findArtworkClickAwayTarget() {
  return (
    [...document.querySelectorAll("h2")].find(
      (element) =>
        visible(element) &&
        normalizedText(element.textContent) === normalizedText(document.title.split(" - CustomAll")[0])
    ) ||
    [...document.querySelectorAll("h2")].find(visible) ||
    document.querySelector("body")
  );
}

async function dismissArtworkFloatingPanels() {
  if (!getVisibleArtworkFloatingPanels().length) return;

  const target = findArtworkClickAwayTarget();
  if (target) humanClick(target);
  await wait(280);

  if (getVisibleArtworkFloatingPanels().length) {
    document.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "Escape",
        code: "Escape",
        bubbles: true,
        composed: true
      })
    );
    await wait(220);
  }

  if (getVisibleArtworkFloatingPanels().length && target) {
    humanClick(target);
    await wait(280);
  }
}

async function applyArtworkTransform(layerIndexes, values) {
  if (getArtworkMode() !== "editor") {
    return {
      ok: false,
      error: "Hãy mở một Artwork editor trên Customall rồi thử lại."
    };
  }

  const fields = {
    x: "#rx",
    y: "#ry",
    width: "#widthDesign",
    height: "#heightDesign",
    rotate: "#rotation",
    skew: "#skewX"
  };
  // Customall recalculates Width after Height changes, especially for text
  // layers with auto-resize enabled. Apply Width last so it is not overwritten.
  const updateOrder = ["x", "y", "rotate", "skew", "height", "width"];
  const updates = updateOrder
    .filter(
      (key) =>
        Object.hasOwn(values, key) &&
        fields[key] &&
        Number.isFinite(Number(values[key]))
    )
    .map((key) => [key, values[key]]);
  if (!updates.length) {
    return { ok: false, error: "Không có giá trị Transform hợp lệ." };
  }

  const result = { ok: true, updated: 0, failed: [] };
  for (const index of [...new Set(layerIndexes.map(Number))]) {
    try {
      const layer = await selectArtworkLayer(index);
      await openArtworkTransform();
      let mismatches = updates;
      for (let attempt = 0; attempt < 3 && mismatches.length; attempt += 1) {
        for (const [key, value] of mismatches) {
          const input = document.querySelector(fields[key]);
          if (!input || !visible(input)) {
            throw new Error(`Thiếu trường ${key}.`);
          }
          input.focus();
          input.select?.();
          setInputValue(input, value);
          input.blur();
          await wait(120);
        }

        await wait(350);
        mismatches = updates.filter(([key, value]) => {
          const actual = Number(document.querySelector(fields[key])?.value);
          return (
            !Number.isFinite(actual) ||
            Math.abs(actual - Number(value)) > 0.0001
          );
        });
      }
      if (mismatches.length) {
        const details = mismatches
          .map(([key, value]) => {
            const actual = document.querySelector(fields[key])?.value ?? "?";
            return `${key}: cần ${value}, đang ${actual}`;
          })
          .join("; ");
        throw new Error(`Customall đã trả lại giá trị cũ (${details}).`);
      }

      // Reopen the same layer to verify the persisted Transform value rather
      // than the temporary value still displayed in the current popover.
      await selectArtworkLayer(index);
      await openArtworkTransform();
      await wait(250);
      const persistedMismatches = updates.filter(([key, value]) => {
        const actual = Number(document.querySelector(fields[key])?.value);
        return (
          !Number.isFinite(actual) ||
          Math.abs(actual - Number(value)) > 0.0001
        );
      });
      if (persistedMismatches.length) {
        const details = persistedMismatches
          .map(([key, value]) => {
            const actual = document.querySelector(fields[key])?.value ?? "?";
            return `${key}: cần ${value}, đang ${actual}`;
          })
          .join("; ");
        throw new Error(`Transform chưa được lưu (${details}).`);
      }
      result.updated += 1;
      result.lastLayer = layer.name;
    } catch (error) {
      const name =
        getArtworkLayerEntries().find((layer) => layer.index === Number(index))
          ?.name || `Layer #${Number(index) + 1}`;
      result.failed.push({ index, name, error: error.message });
    }
  }
  await dismissArtworkFloatingPanels();
  return result;
}

function findArtworkFontSizeInput() {
  return (
    [...document.querySelectorAll('input[type="number"], input')]
      .filter((input) => {
        if (!visible(input) || !Number.isFinite(Number(input.value))) return false;
        const rect = input.getBoundingClientRect();
        return (
          rect.top >= 55 &&
          rect.top < 260 &&
          rect.left > 250 &&
          rect.width >= 35 &&
          rect.width <= 150
        );
      })
      .sort((a, b) => {
        const aRect = a.getBoundingClientRect();
        const bRect = b.getBoundingClientRect();
        return aRect.top - bRect.top || aRect.left - bRect.left;
      })[0] || null
  );
}

function findArtworkFontSelector() {
  return (
    [...document.querySelectorAll('[class*="FontSelector__Container"] button')]
      .find(visible) || null
  );
}

function humanClick(element) {
  for (const type of ["pointerdown", "mousedown", "pointerup", "mouseup", "click"]) {
    const EventClass = type.startsWith("pointer") ? PointerEvent : MouseEvent;
    element.dispatchEvent(
      new EventClass(type, {
        bubbles: true,
        cancelable: true,
        composed: true,
        button: 0,
        pointerId: 1,
        pointerType: "mouse"
      })
    );
  }
  element.click?.();
}

function findArtworkFontOverlay() {
  return (
    [...document.querySelectorAll('.ant-popover-inner input.ant-input[placeholder="Search"]')]
      .map((input) => input.closest(".ant-popover-inner"))
      .find(visible) || null
  );
}

async function openArtworkFontPicker() {
  let overlay = findArtworkFontOverlay();
  if (overlay) return overlay;
  const selector = findArtworkFontSelector();
  if (!selector) throw new Error("Không tìm thấy ô Font.");

  const targets = [];
  let current = selector;
  for (let depth = 0; current && depth < 5; depth += 1) {
    targets.push(current);
    current = current.parentElement;
  }
  for (const target of targets) {
    // A single React click is enough for Customall's Font selector. The
    // previous multi-event helper fired twice and immediately closed the
    // popover that the first event had just opened.
    target.scrollIntoView?.({ block: "nearest", inline: "nearest" });
    target.click();
    await wait(400);
    overlay = findArtworkFontOverlay();
    if (overlay) return overlay;
  }
  selector.focus?.();
  selector.dispatchEvent(
    new KeyboardEvent("keydown", {
      key: "Enter",
      code: "Enter",
      bubbles: true,
      composed: true
    })
  );
  await wait(300);
  overlay = findArtworkFontOverlay();
  if (overlay) return overlay;
  throw new Error("Không mở được bảng Font của Customall.");
}

function findFontSearchInput(overlay) {
  return overlay.querySelector('input.ant-input[placeholder="Search"]');
}

function directElementText(element) {
  return normalizedText(
    [...element.childNodes]
      .filter((node) => node.nodeType === Node.TEXT_NODE)
      .map((node) => node.textContent)
      .join(" ")
  );
}

function collectFontNames(overlay) {
  return [
    ...new Set(
      [
        ...overlay.querySelectorAll(
          '[role="tabpanel"][aria-hidden="false"] .ant-col.ant-col-24.ant-col-lg-12 span'
        )
      ]
        .map((element) => normalizedText(element.textContent))
        .filter(Boolean)
    )
  ];
}

async function submitFontSearch(search, value) {
  search.focus();
  setInputValue(search, "");
  await wait(120);
  setInputValue(search, value);
  await wait(120);
  for (const type of ["keydown", "keypress", "keyup"]) {
    search.dispatchEvent(
      new KeyboardEvent(type, {
        key: "Enter",
        code: "Enter",
        keyCode: 13,
        which: 13,
        bubbles: true,
        cancelable: true,
        composed: true
      })
    );
  }
}

async function setArtworkFont(font) {
  const overlay = await openArtworkFontPicker();
  const search = findFontSearchInput(overlay);
  if (!search) throw new Error("Không tìm thấy ô Search trong bảng Font.");
  await submitFontSearch(search, font);
  await wait(700);

  const requested = normalizedText(font).toLowerCase();
  const option = [
    ...overlay.querySelectorAll(
      '[role="tabpanel"][aria-hidden="false"] .ant-col.ant-col-24.ant-col-lg-12'
    )
  ].find(
    (element) =>
      normalizedText(element.querySelector("span")?.textContent).toLowerCase() ===
      requested
  );
  if (!option) {
    document.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "Escape",
        code: "Escape",
        bubbles: true,
        composed: true
      })
    );
    throw new Error(`Không tìm thấy font "${font}" trong Customall.`);
  }

  option.click();
  await wait(400);
  const actual = normalizedText(findArtworkFontSelector()?.textContent);
  await dismissArtworkFloatingPanels();
  if (actual.toLowerCase() !== requested) {
    throw new Error(`Customall chưa chọn font "${font}" (đang là "${actual}").`);
  }
}

async function searchArtworkFonts(searchText) {
  const overlay = await openArtworkFontPicker();
  const search = findFontSearchInput(overlay);
  if (!search) throw new Error("Không tìm thấy ô Search trong bảng Font.");
  await submitFontSearch(search, normalizedText(searchText));
  await wait(700);
  const fonts = collectFontNames(overlay);
  await dismissArtworkFloatingPanels();
  return { ok: true, fonts };
}

async function getArtworkFonts() {
  if (getArtworkMode() !== "editor") {
    return {
      ok: false,
      error: "Hãy mở một Artwork editor trên Customall rồi thử lại."
    };
  }
  const textLayer = getArtworkLayerEntries().find(
    (layer) => layer.type === "Text"
  );
  if (!textLayer) {
    return { ok: false, error: "Artwork không có Text layer." };
  }

  await selectArtworkLayer(textLayer.index);
  const overlay = await openArtworkFontPicker();
  const search = findFontSearchInput(overlay);
  if (search) {
    await submitFontSearch(search, "");
    await wait(700);
  }

  const fonts = collectFontNames(overlay);
  await dismissArtworkFloatingPanels();
  return { ok: true, fonts };
}

async function setArtworkFontSize(size, layerIndex) {
  const expected = Number(size);
  let actual = NaN;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const enableMaxSize = document.querySelector(
      "#personalized_enable_max_size"
    );
    if (!enableMaxSize) {
      throw new Error("Không tìm thấy tùy chọn Enable max size.");
    }
    if (!enableMaxSize.checked) {
      enableMaxSize.click();
      await wait(350);
    }
    if (!enableMaxSize.checked) {
      throw new Error("Customall chưa bật Enable max size.");
    }

    const committed = await chrome.runtime.sendMessage({
      type: "SET_CUSTOMALL_MAX_FONT_SIZE_MAIN",
      value: expected
    });
    if (!committed?.ok) {
      throw new Error(
        committed?.error || "Customall chưa cập nhật Max font size vào layer."
      );
    }
    actual = Number(committed.value);

    // Round-trip through another Text layer when possible. This catches a
    // temporary form value that was never committed to the artwork model.
    await wait(900);
    const otherTextLayer = getArtworkLayerEntries().find(
      (layer) => layer.type === "Text" && layer.index !== Number(layerIndex)
    );
    if (otherTextLayer) {
      await selectArtworkLayerExclusive(otherTextLayer.index);
      await wait(300);
    }
    await selectArtworkLayerExclusive(layerIndex);
    await wait(450);
    const persistedEnable = document.querySelector(
      "#personalized_enable_max_size"
    );
    const persistedInput = document.querySelector(
      "#personalized_max_font_size"
    );
    actual = Number(persistedInput?.value);
    if (
      persistedEnable?.checked &&
      Number.isFinite(actual) &&
      Math.abs(actual - expected) <= 0.0001
    ) {
      return;
    }
  }
  throw new Error(
    `Max font size chưa được lưu: cần ${expected}, đang ${Number.isFinite(actual) ? actual : "?"}.`
  );
}

async function setArtworkTextColor(color) {
  const normalizedColor = String(color || "")
    .trim()
    .replace(/^#/, "")
    .toUpperCase();
  const colorButton = [
    ...document.querySelectorAll("button")
  ].find((button) =>
    button.querySelector('svg path[d^="M5 18h14v3H5"]')
  );
  if (!colorButton) throw new Error("Không tìm thấy nút Text color.");
  let picker = [...document.querySelectorAll(".sketch-picker")].find(visible);
  if (!picker) {
    humanClick(colorButton);
    picker = await waitForElement(
      () => [...document.querySelectorAll(".sketch-picker")].find(visible),
      2500
    );
  }

  const hexInput = picker?.querySelector('input[id^="rc-editable-input-"]');
  if (!hexInput) throw new Error("Không mở được bảng Text color.");
  hexInput.focus();
  hexInput.select?.();
  setInputValue(hexInput, normalizedColor);
  await wait(450);

  const actual = String(hexInput.value || "")
    .replace(/^#/, "")
    .toUpperCase();
  await dismissArtworkFloatingPanels();
  if (actual !== normalizedColor) {
    throw new Error(
      `Customall chưa nhận Color #${normalizedColor} (đang là #${actual}).`
    );
  }
}

function findArtworkStrokePanel() {
  const candidates = [
    ...document.querySelectorAll(
      ".ant-popover-inner-content, .ant-popover-inner, .ant-popover-content, [role=dialog]"
    )
  ].filter((element) => {
    if (!visible(element)) return false;
    return (
      element.querySelector("#strokeEnabled") &&
      element.querySelector("#multiStroke_enabled")
    );
  });
  return (
    candidates.sort(
      (left, right) =>
        left.getBoundingClientRect().width * left.getBoundingClientRect().height -
        right.getBoundingClientRect().width * right.getBoundingClientRect().height
    )[0] || null
  );
}

async function openArtworkStroke() {
  let panel = findArtworkStrokePanel();
  if (panel) return panel;
  const button = findVisibleButton("Stroke");
  if (!button) throw new Error("Không tìm thấy nút Stroke.");
  button.click();
  panel = await waitForElement(() => findArtworkStrokePanel(), 2500);
  if (!panel) throw new Error("Không mở được bảng Stroke.");
  return panel;
}

function findExactTextElement(root, text) {
  const expected = normalizedText(text).toLowerCase();
  return [...root.querySelectorAll("*")]
    .filter(
      (element) =>
        visible(element) &&
        normalizedText(element.textContent).toLowerCase() === expected
    )
    .sort(
      (left, right) =>
        left.getBoundingClientRect().width * left.getBoundingClientRect().height -
        right.getBoundingClientRect().width * right.getBoundingClientRect().height
    )[0];
}

function getStrokeSwitch(panel) {
  return panel.querySelector("#strokeEnabled");
}

function strokeSwitchChecked(element) {
  return (
    element?.getAttribute("aria-checked") === "true" ||
    element?.classList.contains("ant-switch-checked") ||
    element?.querySelector('input[type="checkbox"]')?.checked === true
  );
}

async function setStrokeEnabled(panel, enabled) {
  const toggle = getStrokeSwitch(panel);
  if (!toggle) throw new Error("Không tìm thấy công tắc Enable stroke.");
  if (strokeSwitchChecked(toggle) !== enabled) {
    toggle.click();
    await wait(300);
  }
  if (strokeSwitchChecked(toggle) !== enabled) {
    throw new Error(
      `Customall chưa ${enabled ? "bật" : "tắt"} được Enable stroke.`
    );
  }
}

async function setArtworkStrokeWidth(panel, width) {
  const widthField = panel
    .querySelector('label[for="strokeWidth"]')
    ?.closest(".ant-form-item");
  const input = widthField?.querySelector(".ant-input-number-input");
  if (!input) throw new Error("Không tìm thấy ô Stroke Width.");
  input.focus();
  input.select?.();
  setInputValue(input, width);
  input.dispatchEvent(
    new KeyboardEvent("keydown", {
      key: "Enter",
      code: "Enter",
      bubbles: true,
      composed: true
    })
  );
  input.dispatchEvent(
    new KeyboardEvent("keyup", {
      key: "Enter",
      code: "Enter",
      bubbles: true,
      composed: true
    })
  );
  input.blur();
  await wait(500);
  if (Math.abs(Number(input.value) - Number(width)) > 0.0001) {
    throw new Error(`Customall không nhận Stroke Width=${width}.`);
  }
}

function findStrokeChoice(panel, label) {
  const normalized = normalizedText(label).toLowerCase();
  const group =
    normalized === "inside" || normalized === "outside"
      ? panel.querySelector("#fillAfterStrokeEnabled")
      : panel.querySelector("#lineJoin");
  const value =
    normalized === "inside"
      ? "false"
      : normalized === "outside"
        ? "true"
        : normalized;
  return group?.querySelector(`input[type="radio"][value="${value}"]`)?.closest("label");
}

async function setArtworkStrokeChoice(panel, groupName, value) {
  const choice = findStrokeChoice(panel, value);
  if (!choice) {
    throw new Error(`Không tìm thấy ${groupName} "${value}".`);
  }
  const radio =
    choice.matches?.('[role="radio"], input[type="radio"]')
      ? choice
      : choice.querySelector?.('[role="radio"], input[type="radio"]');
  const checked =
    radio?.checked === true ||
    radio?.getAttribute?.("aria-checked") === "true" ||
    choice.classList?.contains("ant-radio-wrapper-checked");
  if (!checked) {
    choice.click();
    await wait(280);
  }
  const actualRadio =
    choice.matches?.('[role="radio"], input[type="radio"]')
      ? choice
      : choice.querySelector?.('[role="radio"], input[type="radio"]');
  const actualChecked =
    actualRadio?.checked === true ||
    actualRadio?.getAttribute?.("aria-checked") === "true" ||
    choice.classList?.contains("ant-radio-wrapper-checked");
  if (!actualChecked) {
    throw new Error(`Customall chưa chọn ${groupName} "${value}".`);
  }
}

function findStrokeColorControl(panel) {
  return (
    panel
      .querySelector('label[for="stroke"]')
      ?.closest(".ant-form-item")
      ?.querySelector("button") || null
  );
}

async function setArtworkStrokeColor(panel, color) {
  const normalizedColor = String(color || "")
    .trim()
    .replace(/^#/, "")
    .toUpperCase();
  let picker = [...document.querySelectorAll(".sketch-picker")].find(visible);
  if (!picker) {
    const control = findStrokeColorControl(panel);
    if (!control) throw new Error("Không tìm thấy ô Stroke Color.");
    control.click();
    picker = await waitForElement(
      () => [...document.querySelectorAll(".sketch-picker")].find(visible),
      2500
    );
  }
  const hexInput = picker?.querySelector('input[id^="rc-editable-input-"]');
  if (!hexInput) throw new Error("Không mở được bảng Stroke Color.");
  hexInput.focus();
  hexInput.select?.();
  setInputValue(hexInput, normalizedColor);
  hexInput.dispatchEvent(
    new KeyboardEvent("keydown", {
      key: "Enter",
      code: "Enter",
      bubbles: true,
      composed: true
    })
  );
  hexInput.dispatchEvent(
    new KeyboardEvent("keyup", {
      key: "Enter",
      code: "Enter",
      bubbles: true,
      composed: true
    })
  );
  hexInput.blur();
  await wait(500);
  const actual = String(hexInput.value || "")
    .replace(/^#/, "")
    .toUpperCase();
  await dismissArtworkFloatingPanels();
  if (actual !== normalizedColor) {
    throw new Error(
      `Customall chưa nhận Stroke Color #${normalizedColor} (đang là #${actual}).`
    );
  }
}

function closeArtworkStroke() {
  const panel = findArtworkStrokePanel();
  const button = findVisibleButton("Stroke");
  if (panel && button) {
    button.click();
    return;
  }
  closeArtworkPopover();
}

async function closeArtworkStrokeAndWait() {
  await dismissArtworkFloatingPanels();
  if (
    findArtworkStrokePanel() ||
    [...document.querySelectorAll(".sketch-picker")].some(visible)
  ) {
    throw new Error("Không đóng được bảng Stroke của layer trước.");
  }
}

async function selectArtworkLayerExclusive(index) {
  await closeArtworkStrokeAndWait();
  let entries = getArtworkLayerEntries();
  const target = entries.find((item) => item.index === Number(index));
  if (!target) throw new Error(`Không tìm thấy layer #${Number(index) + 1}.`);

  const expanded = entries.filter(
    (item) => item.header.getAttribute("aria-expanded") === "true"
  );
  for (const item of expanded) {
    item.header.click();
    await wait(100);
  }

  entries = getArtworkLayerEntries();
  const freshTarget = entries.find((item) => item.index === Number(index));
  if (!freshTarget) {
    throw new Error(`Không tìm thấy lại layer "${target.name}".`);
  }
  freshTarget.header.click();
  await wait(300);
  if (freshTarget.header.getAttribute("aria-expanded") !== "true") {
    freshTarget.header.click();
    await wait(250);
  }
  return freshTarget;
}

async function commitArtworkStrokeLayer(index) {
  await closeArtworkStrokeAndWait();
  const layer = getArtworkLayerEntries().find(
    (item) => item.index === Number(index)
  );
  if (!layer) return;
  if (layer.header.getAttribute("aria-expanded") === "true") {
    layer.header.click();
    await wait(120);
  }
  layer.header.click();
  await wait(260);
}

async function applyArtworkStroke(layerIndexes, values) {
  if (getArtworkMode() !== "editor") {
    return {
      ok: false,
      error: "Hãy mở một Artwork editor trên Customall rồi thử lại."
    };
  }

  const enabled =
    values.enabled === "true"
      ? true
      : values.enabled === "false"
        ? false
        : null;
  const width =
    values.width !== "" && Number.isFinite(Number(values.width))
      ? Number(values.width)
      : null;
  const color = normalizedText(values.color);
  const mode = normalizedText(values.mode);
  const lineJoin = normalizedText(values.lineJoin);
  if (enabled === null && width === null && !color && !mode && !lineJoin) {
    return { ok: false, error: "Chưa chọn thuộc tính Stroke cần thay đổi." };
  }

  const result = { ok: true, updated: 0, failed: [] };
  for (const index of [...new Set(layerIndexes.map(Number))]) {
    const layer = getArtworkLayerEntries().find(
      (item) => item.index === Number(index)
    );
    if (!layer || layer.type !== "Text") {
      result.failed.push({
        index,
        name: layer?.name || `Layer #${Number(index) + 1}`,
        error: "Stroke chỉ áp dụng cho Text layer."
      });
      continue;
    }
    try {
      await selectArtworkLayerExclusive(index);
      let panel = await openArtworkStroke();
      const hasDetails = width !== null || color || mode || lineJoin;
      if (hasDetails && !strokeSwitchChecked(getStrokeSwitch(panel))) {
        await setStrokeEnabled(panel, true);
        panel = await openArtworkStroke();
      }
      if (width !== null) await setArtworkStrokeWidth(panel, width);
      if (mode) await setArtworkStrokeChoice(panel, "Mode", mode);
      if (lineJoin) {
        await setArtworkStrokeChoice(panel, "Line Join", lineJoin);
      }
      if (color) {
        await setArtworkStrokeColor(panel, color);
        panel = await openArtworkStroke();
      }
      if (enabled !== null) await setStrokeEnabled(panel, enabled);
      await commitArtworkStrokeLayer(index);
      result.updated += 1;
      result.lastLayer = layer.name;
    } catch (error) {
      try {
        await closeArtworkStrokeAndWait();
      } catch {
        closeArtworkStroke();
      }
      result.failed.push({
        index,
        name: layer.name,
        error: error.message
      });
    }
  }
  try {
    await closeArtworkStrokeAndWait();
  } catch {
    closeArtworkStroke();
  }
  return result;
}

async function applyArtworkTextStyle(layerIndexes, values) {
  if (getArtworkMode() !== "editor") {
    return {
      ok: false,
      error: "Hãy mở một Artwork editor trên Customall rồi thử lại."
    };
  }

  const font = normalizedText(values.font);
  const size =
    values.size !== "" && Number.isFinite(Number(values.size))
      ? Number(values.size)
      : null;
  const color = normalizedText(values.color);
  if (!font && size === null && !color) {
    return { ok: false, error: "Chưa nhập Font, Size hoặc Color." };
  }

  const result = { ok: true, updated: 0, failed: [] };
  for (const index of [...new Set(layerIndexes.map(Number))]) {
    const layer = getArtworkLayerEntries().find(
      (item) => item.index === Number(index)
    );
    if (!layer || layer.type !== "Text") {
      result.failed.push({
        index,
        name: layer?.name || `Layer #${Number(index) + 1}`,
        error: "Text Style chỉ áp dụng cho Text layer."
      });
      continue;
    }
    try {
      // Text Style must target exactly one Fabric object. Customall can keep
      // the previous text objects in a multi-selection even when only one
      // layer row looks active, which makes the Font button unavailable.
      await selectArtworkLayerExclusive(index);
      if (color) await setArtworkTextColor(color);
      // Font opens a large Customall popover and is therefore applied last.
      if (font) {
        await dismissArtworkFloatingPanels();
        await selectArtworkLayerExclusive(index);
        await setArtworkFont(font);
      }
      // Max font size is independent from Transform and must be the final
      // Text Style operation so Customall recalculates against the existing
      // text frame without the extension changing that frame.
      if (size !== null) {
        await dismissArtworkFloatingPanels();
        await selectArtworkLayerExclusive(index);
        await setArtworkFontSize(size, index);
      }
      result.updated += 1;
      result.lastLayer = layer.name;
    } catch (error) {
      await dismissArtworkFloatingPanels();
      result.failed.push({
        index,
        name: layer.name,
        error: error.message
      });
    }
  }
  await dismissArtworkFloatingPanels();
  return result;
}

function artworkChangeCaseChoices(root = document) {
  return ["Default", "Uppercase", "Lowercase"].map((choice) =>
    [...root.querySelectorAll("*")]
      .filter(
        (element) =>
          visible(element) &&
          normalizedText(element.textContent).toLowerCase() ===
            choice.toLowerCase()
      )
      .sort(
        (left, right) =>
          left.getBoundingClientRect().width *
            left.getBoundingClientRect().height -
          right.getBoundingClientRect().width *
            right.getBoundingClientRect().height
      )[0]
  );
}

function isArtworkChangeCasePanel(element) {
  return artworkChangeCaseChoices(element).every(Boolean);
}

function findArtworkChangeCasePanel() {
  return (
    [
      ...document.querySelectorAll(
        ".ant-popover-inner-content, .ant-popover-inner, .ant-popover-content, [role=dialog]"
      )
    ]
      .filter(
        (element) => visible(element) && isArtworkChangeCasePanel(element)
      )
      .sort(
        (left, right) =>
          left.getBoundingClientRect().width *
            left.getBoundingClientRect().height -
          right.getBoundingClientRect().width *
            right.getBoundingClientRect().height
      )[0] || null
  );
}

function findArtworkChangeCaseButton() {
  const buttons = [...document.querySelectorAll("button")].filter(visible);
  const named = buttons.find((button) =>
    [
      button.textContent,
      button.getAttribute("title"),
      button.getAttribute("aria-label"),
      button.getAttribute("data-original-title")
    ].some((value) =>
      normalizedText(value).toLowerCase().includes("change case")
    )
  );
  if (named) return named;

  const pattern = findVisibleButton("Pattern");
  const stroke = findVisibleButton("Stroke");
  if (!pattern || !stroke) return null;
  const patternRect = pattern.getBoundingClientRect();
  const strokeRect = stroke.getBoundingClientRect();
  const left = Math.min(patternRect.right, strokeRect.right);
  const right = Math.max(patternRect.left, strokeRect.left);
  const centerY = (patternRect.top + patternRect.bottom) / 2;
  return (
    buttons
      .filter((button) => {
        const rect = button.getBoundingClientRect();
        const buttonCenterX = (rect.left + rect.right) / 2;
        const buttonCenterY = (rect.top + rect.bottom) / 2;
        return (
          button !== pattern &&
          button !== stroke &&
          buttonCenterX > left &&
          buttonCenterX < right &&
          Math.abs(buttonCenterY - centerY) < 18
        );
      })
      .sort((a, b) => {
        const middle = (patternRect.right + strokeRect.left) / 2;
        const aRect = a.getBoundingClientRect();
        const bRect = b.getBoundingClientRect();
        return (
          Math.abs((aRect.left + aRect.right) / 2 - middle) -
          Math.abs((bRect.left + bRect.right) / 2 - middle)
        );
      })[0] || null
  );
}

async function openArtworkChangeCase() {
  let panel = findArtworkChangeCasePanel();
  if (panel) return panel;
  const button = findArtworkChangeCaseButton();
  if (!button) throw new Error("Không tìm thấy nút Change Case.");
  button.click();
  panel = await waitForElement(() => findArtworkChangeCasePanel(), 2500);
  if (!panel) throw new Error("Không mở được bảng Change Case.");
  return panel;
}

function findArtworkChangeCaseOption(panel, value) {
  const expected = normalizedText(value).toLowerCase();
  const text = artworkChangeCaseChoices(panel).find(
    (element) =>
      normalizedText(element.textContent).toLowerCase() === expected
  );
  return (
    text?.closest("label, [role=radio], .ant-radio-wrapper") ||
    text?.parentElement ||
    null
  );
}

function artworkChangeCaseOptionChecked(option) {
  return (
    option?.matches?.(":checked") ||
    option?.querySelector?.('input[type="radio"]')?.checked === true ||
    option?.getAttribute?.("aria-checked") === "true" ||
    option?.classList?.contains("ant-radio-wrapper-checked") ||
    Boolean(option?.querySelector?.(".ant-radio-checked"))
  );
}

async function setArtworkChangeCase(value) {
  let panel = await openArtworkChangeCase();
  let option = findArtworkChangeCaseOption(panel, value);
  if (!option) throw new Error(`Không tìm thấy lựa chọn "${value}".`);
  if (!artworkChangeCaseOptionChecked(option)) {
    option.click();
    await wait(350);
  }

  panel = findArtworkChangeCasePanel() || (await openArtworkChangeCase());
  option = findArtworkChangeCaseOption(panel, value);
  if (!artworkChangeCaseOptionChecked(option)) {
    throw new Error(`Customall chưa chọn Change Case "${value}".`);
  }
  await dismissArtworkFloatingPanels();
}

async function applyArtworkChangeCase(layerIndexes, value) {
  if (getArtworkMode() !== "editor") {
    return {
      ok: false,
      error: "Hãy mở một Artwork editor trên Customall rồi thử lại."
    };
  }

  const changeCase = normalizedText(value);
  if (!["Default", "Uppercase", "Lowercase"].includes(changeCase)) {
    return { ok: false, error: "Change Case không hợp lệ." };
  }

  const result = { ok: true, updated: 0, failed: [] };
  for (const index of [...new Set(layerIndexes.map(Number))]) {
    const layer = getArtworkLayerEntries().find(
      (item) => item.index === Number(index)
    );
    if (!layer || layer.type !== "Text") {
      result.failed.push({
        index,
        name: layer?.name || `Layer #${Number(index) + 1}`,
        error: "Change Case chỉ áp dụng cho Text layer."
      });
      continue;
    }
    try {
      await selectArtworkLayerExclusive(index);
      await setArtworkChangeCase(changeCase);
      result.updated += 1;
      result.lastLayer = layer.name;
    } catch (error) {
      await dismissArtworkFloatingPanels();
      result.failed.push({
        index,
        name: layer.name,
        error: error.message
      });
    }
  }
  await dismissArtworkFloatingPanels();
  return result;
}

function artworkLayerTreeKey(layer) {
  return JSON.stringify([
    layer.type || "Layer",
    ...(Array.isArray(layer.groupPath) ? layer.groupPath : []),
    layer.name || ""
  ]);
}

async function expandArtworkGroupPath(groupPath = []) {
  const path = [];
  for (const groupName of groupPath) {
    path.push(groupName);
    const key = JSON.stringify(path);
    let item = findArtworkGroupByDomKey(key);
    let header = item?.querySelector(":scope > .ant-collapse-header");
    if (!header) {
      throw new Error(`Không tìm thấy group "${groupName}".`);
    }
    if (header.getAttribute("aria-expanded") !== "true") {
      (header.querySelector(":scope > .layer-title") || header).click();
      if (!(await waitForArtworkGroupExpanded(key, 2200))) {
        throw new Error(`Không mở được group "${groupName}".`);
      }
      await wait(180);
    }
    item = findArtworkGroupByDomKey(key);
    header = item?.querySelector(":scope > .ant-collapse-header");
    if (!header || header.getAttribute("aria-expanded") !== "true") {
      throw new Error(`Group "${groupName}" chưa sẵn sàng.`);
    }
  }
}

function findArtworkLayerByTarget(target) {
  const matches = getArtworkLayerEntries().filter(
    (layer) => artworkLayerTreeKey(layer) === target.key
  );
  return matches[target.occurrence] || null;
}

function createArtworkLabelTarget(layer, entries = getArtworkLayerEntries()) {
  const key = artworkLayerTreeKey(layer);
  const matches = entries.filter((entry) => artworkLayerTreeKey(entry) === key);
  return {
    key,
    occurrence: Math.max(0, matches.indexOf(layer)),
    name: layer.name,
    type: layer.type,
    groupPath: [...layer.groupPath]
  };
}

function findArtworkLabelInput(layer, selector) {
  const item = layer?.header?.closest(".ant-collapse-item");
  const localInput = item
    ? [...item.querySelectorAll(selector)].find(visible)
    : null;
  if (localInput) return localInput;
  const visibleInputs = [...document.querySelectorAll(selector)].filter(visible);
  return visibleInputs.length === 1 ? visibleInputs[0] : null;
}

async function openArtworkLabelTarget(target) {
  await expandArtworkGroupPath(target.groupPath);
  let layer = findArtworkLayerByTarget(target);
  if (!layer?.header) {
    throw new Error(`Không tìm thấy lại layer "${target.name}".`);
  }
  layer.header.scrollIntoView?.({ block: "nearest" });
  if (layer.header.getAttribute("aria-expanded") !== "true") {
    layer.header.click();
    await wait(260);
  }
  if (layer.header.getAttribute("aria-expanded") !== "true") {
    throw new Error(`Không chọn được layer "${target.name}".`);
  }
  const selector = target.type === "Option" ? "#title" : "#personalized_label";
  const input = await waitForElement(
    () => findArtworkLabelInput(layer, selector),
    1800
  );
  if (!input && document.querySelectorAll(selector).length) {
    throw new Error(`Có nhiều field Label đang mở cho layer "${target.name}".`);
  }
  return { layer, input, selector };
}

async function commitArtworkLabelTarget(target, next) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const opened = await openArtworkLabelTarget(target);
    if (!opened.input) return { noLabel: true };
    const expectedLayerId = String(document.querySelector("#id")?.value || "");
    const mainCommit = await chrome.runtime.sendMessage({
      type: "SET_CUSTOMALL_LABEL_MAIN",
      selector: opened.selector,
      value: next
    });
    if (!mainCommit?.ok) {
      throw new Error(
        mainCommit?.error || `Customall chưa nhận Label "${next}" trong MAIN world.`
      );
    }
    await wait(900);
    const activeLayerId = String(document.querySelector("#id")?.value || "");
    const currentInput = findArtworkLabelInput(opened.layer, opened.selector);
    if (
      String(currentInput?.value || "") === next &&
      String(mainCommit.reactValue ?? mainCommit.value ?? "") === next &&
      (!expectedLayerId || activeLayerId === expectedLayerId) &&
      (!mainCommit.layerId || mainCommit.layerId === expectedLayerId)
    ) {
      return { ok: true };
    }
    await wait(180);
  }
  return { ok: false };
}

async function replaceArtworkLabels(
  _layerIndexes,
  find,
  replacement,
  selectedLayers = []
) {
  if (getArtworkMode() !== "editor") {
    return {
      ok: false,
      error: "Hãy mở một Artwork editor trên Customall rồi thử lại."
    };
  }

  const search = String(find || "");
  const replaceWith = String(replacement || "");
  const result = {
    ok: true,
    updated: 0,
    scanned: 0,
    skippedGroups: 0,
    noLabel: [],
    noMatch: [],
    failed: []
  };

  // Preserve the exact selected row. Matching only type/path/name makes one
  // checked layer accidentally include every sibling with the same key.
  const currentEntries = getArtworkLayerEntries();
  const targets = [];
  const seenTargets = new Set();
  selectedLayers.forEach((selected, selectedIndex) => {
    if (selected.type === "Group") {
      result.skippedGroups += 1;
      return;
    }
    const key = artworkLayerTreeKey(selected);
    let occurrence = Number(selected.occurrence);
    if (!Number.isInteger(occurrence) || occurrence < 0) {
      const requestedIndex = Number(selected.index ?? _layerIndexes[selectedIndex]);
      const exactEntry = currentEntries.find(
        (entry) =>
          Number(entry.index) === requestedIndex && artworkLayerTreeKey(entry) === key
      );
      occurrence = exactEntry
        ? currentEntries
            .filter((entry) => artworkLayerTreeKey(entry) === key)
            .indexOf(exactEntry)
        : -1;
    }
    const identity = `${key}::${occurrence}`;
    if (occurrence < 0 || seenTargets.has(identity)) return;
    seenTargets.add(identity);
    targets.push({
      key,
      occurrence,
      name: selected.name,
      type: selected.type,
      groupPath: [...(selected.groupPath || [])]
    });
  });
  result.scanned = targets.length;

  // Re-resolve every row from its group path. Customall uses accordion groups,
  // so opening a sibling may unmount or hide previously scanned layer nodes.
  for (let targetIndex = 0; targetIndex < targets.length; targetIndex += 1) {
    const target = targets[targetIndex];
    try {
      const opened = await openArtworkLabelTarget(target);
      const input = opened.input;
      if (!input) {
        result.noLabel.push({ index: targetIndex, name: target.name });
        continue;
      }
      const current = String(input.value || "");
      if (search && !current.includes(search)) {
        result.noMatch.push({ index: targetIndex, name: target.name });
        continue;
      }
      const next = search ? current.split(search).join(replaceWith) : replaceWith;
      if (next === current) {
        result.noMatch.push({ index: targetIndex, name: target.name });
        continue;
      }
      const committed = await commitArtworkLabelTarget(target, next);
      if (committed.noLabel) {
        result.noLabel.push({ index: targetIndex, name: target.name });
        continue;
      }
      if (!committed.ok) {
        throw new Error(`Customall chưa lưu Label "${next}".`);
      }
      result.updated += 1;
    } catch (error) {
      result.failed.push({ index: targetIndex, name: target.name, error: error.message });
    }
  }
  return result;
}

async function waitForElement(finder, timeoutMs = 8000) {
  const deadline = Date.now() + timeoutMs;
  let element = finder();
  while (!element && Date.now() < deadline) {
    await wait(150);
    element = finder();
  }
  return element || null;
}

async function selectArtworkCategory(form, requestedCategory) {
  const category = normalizedText(requestedCategory);
  if (!category) return { ok: true, skipped: true };

  const treeSelect = form.querySelector(".ant-tree-select");
  const selector = treeSelect?.querySelector(".ant-select-selector");
  if (!selector) {
    return { ok: false, error: "Không tìm thấy ô Categories." };
  }

  const selectedRemovers = [
    ...treeSelect.querySelectorAll(".ant-select-selection-item-remove")
  ];
  selectedRemovers.forEach((element) => element.click());
  if (selectedRemovers.length) await wait(150);

  selector.dispatchEvent(
    new MouseEvent("mousedown", {
      bubbles: true,
      cancelable: true,
      composed: true,
      button: 0
    })
  );
  selector.click();
  await wait(150);

  const search = await waitForElement(() => {
    return form.querySelector(
      ".ant-tree-select input.ant-select-selection-search-input"
    );
  }, 3000);
  if (!search) {
    return { ok: false, error: "Không mở được danh sách Categories." };
  }

  search.removeAttribute("readonly");
  search.focus();
  setInputValue(search, category);
  search.dispatchEvent(
    new KeyboardEvent("keydown", {
      key: category.slice(-1) || "a",
      bubbles: true,
      composed: true
    })
  );
  await wait(500);

  const categoryLower = category.toLowerCase();
  const candidates = [
    ...document.querySelectorAll(
      ".ant-select-tree-node-content-wrapper, .ant-select-item-option, [role=treeitem], [role=option]"
    )
  ].filter(visible);
  const option =
    candidates.find(
      (element) => normalizedText(element.textContent).toLowerCase() === categoryLower
    ) ||
    candidates.find((element) =>
      normalizedText(element.textContent).toLowerCase().includes(categoryLower)
    );
  if (!option) {
    return {
      ok: false,
      error: `Không tìm thấy Category "${category}" trong Customall.`
    };
  }

  option.click();
  await wait(200);
  return { ok: true, category: normalizedText(option.textContent) };
}

async function selectArtworkProductBase(form, requestedProductBase) {
  const productBase = normalizedText(requestedProductBase);
  if (!productBase) {
    return { ok: false, error: "Thiếu Product base." };
  }

  const printareaRadio = [...form.querySelectorAll('input[type="radio"]')].find(
    (input) =>
      input.value === "false" ||
      normalizedText(input.closest("label")?.textContent).toLowerCase() ===
        "printarea size"
  );
  if (!printareaRadio) {
    return { ok: false, error: "Không tìm thấy lựa chọn Printarea size." };
  }
  if (!printareaRadio.checked) {
    printareaRadio.closest("label")?.click();
    await wait(250);
  }

  const productBaseSelect = [
    ...form.querySelectorAll(".ant-select-single.ant-select-show-search")
  ].find((element) => !element.querySelector("#format"));
  const selector = productBaseSelect?.querySelector(".ant-select-selector");
  const search = productBaseSelect?.querySelector(
    "input.ant-select-selection-search-input"
  );
  if (!selector || !search) {
    return { ok: false, error: "Không tìm thấy ô Product base." };
  }

  selector.dispatchEvent(
    new MouseEvent("mousedown", {
      bubbles: true,
      cancelable: true,
      composed: true,
      button: 0
    })
  );
  selector.click();
  search.focus();
  setInputValue(search, productBase);
  search.dispatchEvent(
    new KeyboardEvent("keydown", {
      key: productBase.slice(-1) || "a",
      bubbles: true,
      composed: true
    })
  );
  await wait(600);

  const productBaseLower = productBase.toLowerCase();
  const candidates = [
    ...document.querySelectorAll(".ant-select-item-option, [role=option]")
  ].filter(visible);
  const option =
    candidates.find(
      (element) =>
        normalizedText(element.getAttribute("title") || element.textContent)
          .toLowerCase() === productBaseLower
    ) ||
    candidates.find((element) =>
      normalizedText(element.getAttribute("title") || element.textContent)
        .toLowerCase()
        .includes(productBaseLower)
    );
  if (!option) {
    return {
      ok: false,
      error: `Không tìm thấy Product base "${productBase}" trong Customall.`
    };
  }

  option.click();
  await wait(250);
  return {
    ok: true,
    productBase: normalizedText(
      option.getAttribute("title") || option.textContent
    )
  };
}

function findArtworkDetailsPanel() {
  const candidates = [
    ...document.querySelectorAll(
      ".ant-modal-content, .ant-popover-inner, [role=dialog], .ant-dropdown"
    )
  ].filter((element) => {
    if (!visible(element)) return false;
    const text = normalizedText(element.textContent).toLowerCase();
    return (
      text.includes("title") &&
      text.includes("categories") &&
      text.includes("artwork size") &&
      text.includes("artwork format")
    );
  });
  return (
    candidates.sort(
      (left, right) =>
        left.getBoundingClientRect().width *
          left.getBoundingClientRect().height -
        right.getBoundingClientRect().width *
          right.getBoundingClientRect().height
    )[0] || null
  );
}

function findArtworkHeaderTitle() {
  return (
    [...document.querySelectorAll("h1, h2, h3")]
      .filter((element) => {
        if (!visible(element)) return false;
        const rect = element.getBoundingClientRect();
        const text = normalizedText(element.textContent);
        return rect.top < 120 && text.length > 3;
      })
      .sort(
        (a, b) =>
          a.getBoundingClientRect().top - b.getBoundingClientRect().top
      )[0] || null
  );
}

function findArtworkEditControl() {
  const title = findArtworkHeaderTitle();
  if (!title) return null;
  const titleRect = title.getBoundingClientRect();
  return (
    [...document.querySelectorAll("button, [role=button], svg")]
      .map((element) =>
        element.tagName.toLowerCase() === "svg"
          ? element.closest("button, [role=button], span, div")
          : element
      )
      .filter((element) => {
        if (!element || !visible(element)) return false;
        const rect = element.getBoundingClientRect();
        return (
          rect.left >= titleRect.right - 8 &&
          rect.left <= titleRect.right + 80 &&
          Math.abs(
            (rect.top + rect.bottom) / 2 -
              (titleRect.top + titleRect.bottom) / 2
          ) < 24 &&
          rect.width <= 60 &&
          rect.height <= 60
        );
      })[0] || null
  );
}

function findFieldContainerByLabel(root, labelText) {
  const expected = normalizedText(labelText).toLowerCase();
  const label = [...root.querySelectorAll("label, span, div, p")].find(
    (element) =>
      visible(element) &&
      normalizedText(element.textContent).toLowerCase() === expected
  );
  return (
    label?.closest(".ant-form-item, .form-group, [class*=FormItem]") ||
    label?.parentElement ||
    null
  );
}

function readArtworkCategories(panel) {
  const container =
    findFieldContainerByLabel(panel, "Categories") || panel;
  const categories = [
    ...container.querySelectorAll(
      ".ant-select-selection-item, .ant-select-selection__choice__content, .ant-tag"
    )
  ]
    .map((element) =>
      normalizedText(element.textContent).replace(/×$/, "").trim()
    )
    .filter(
      (value) =>
        value &&
        !/new category/i.test(value) &&
        value.toLowerCase() !== "categories"
    );
  return [...new Set(categories)];
}

async function getArtworkCampaignSource() {
  if (getArtworkMode() !== "editor") {
    return {
      ok: false,
      error: "Hãy mở đúng Artwork editor trước khi tạo Campaign."
    };
  }

  let panel = findArtworkDetailsPanel();
  if (!panel) {
    const edit = findArtworkEditControl();
    if (!edit) {
      return { ok: false, error: "Không tìm thấy nút sửa thông tin Artwork." };
    }
    edit.click();
    panel = await waitForElement(() => findArtworkDetailsPanel(), 3000);
  }
  if (!panel) {
    return { ok: false, error: "Không mở được thông tin Artwork." };
  }

  const titleContainer =
    findFieldContainerByLabel(panel, "Title") || panel;
  const titleInput =
    [...titleContainer.querySelectorAll("input")].find(visible) ||
    [...panel.querySelectorAll("input")].find(
      (input) => visible(input) && normalizedText(input.value)
    );
  const title =
    normalizedText(titleInput?.value) ||
    normalizedText(findArtworkHeaderTitle()?.textContent);
  const categories = readArtworkCategories(panel);

  document.dispatchEvent(
    new KeyboardEvent("keydown", {
      key: "Escape",
      code: "Escape",
      bubbles: true,
      composed: true
    })
  );
  await wait(220);

  if (!title) {
    return { ok: false, error: "Không đọc được Artwork Title." };
  }
  if (!categories.length) {
    return { ok: false, error: "Artwork chưa có Category." };
  }
  return {
    ok: true,
    artworkId: location.pathname.match(/\/artworks\/([^/]+)/)?.[1] || "",
    title,
    category: categories[0],
    categories
  };
}

function normalizeCampaignMatch(value) {
  return normalizedText(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function findProductBaseSelectorModal() {
  return (
    [...document.querySelectorAll(".product-base-selector-modal")].find(
      visible
    ) || null
  );
}

function readProductBaseCard(card) {
  const titleElement =
    card.querySelector(".ant-card-meta-title [title]") ||
    card.querySelector(".ant-card-meta-title") ||
    card.querySelector("[title]");
  return {
    title: normalizedText(
      titleElement?.getAttribute("title") || titleElement?.textContent
    ),
    category: normalizedText(
      card.querySelector(".ant-card-meta-description")?.textContent
    ),
    card
  };
}

async function searchCampaignProductBases(category) {
  if (!location.pathname.startsWith("/campaigns")) {
    return { ok: false, error: "Hãy mở trang Customall Campaigns." };
  }
  const requested = normalizedText(category);
  if (!requested) return { ok: false, error: "Artwork chưa có Category." };

  const modal = await waitForElement(
    () => findProductBaseSelectorModal(),
    10_000
  );
  if (!modal) {
    return {
      ok: false,
      error: "Không mở được bảng chọn Product Base. Hãy mở Campaigns → Add New."
    };
  }
  const search = [
    ...modal.querySelectorAll('input[placeholder="Search by name"]')
  ].find(visible);
  if (!search) {
    return { ok: false, error: "Không tìm thấy ô Search Product Base." };
  }
  search.focus();
  setInputValue(search, requested);
  await wait(1400);

  const requestedKey = normalizeCampaignMatch(requested);
  const matches = [...modal.querySelectorAll(".ant-card")]
    .filter(visible)
    .map(readProductBaseCard)
    .filter(
      (item) =>
        item.title &&
        normalizeCampaignMatch(item.title).includes(requestedKey)
    )
    .map(({ title, category: itemCategory }) => ({
      title,
      category: itemCategory
    }))
    .filter(
      (item, index, list) =>
        list.findIndex((other) => other.title === item.title) === index
    );
  return { ok: true, category: requested, matches };
}

var cleanupCampaignProductBaseAutoCreate = null;

async function armCampaignProductBaseAutoCreate() {
  const modal = await waitForElement(
    () => findProductBaseSelectorModal(),
    5000
  );
  if (!modal) {
    return { ok: false, error: "Không tìm thấy bảng Product Base." };
  }

  cleanupCampaignProductBaseAutoCreate?.();
  let running = false;

  const handleCardClick = (event) => {
    const card = event.target.closest(".ant-card");
    if (!card || !modal.contains(card) || running) return;
    running = true;
    setTimeout(async () => {
      try {
        const create = await waitForElement(() => {
          const activeModal = findProductBaseSelectorModal() || modal;
          const selected = [
            ...activeModal.querySelectorAll(".ant-card.selected-card")
          ].find(visible);
          const button = findExactButtonIn(activeModal, "Create campaign");
          return selected && button && !button.disabled ? button : null;
        }, 4000);
        if (!create) {
          running = false;
          return;
        }
        cleanupCampaignProductBaseAutoCreate?.();
        create.click();
      } catch {
        running = false;
      }
    }, 120);
  };

  modal.addEventListener("click", handleCardClick, true);
  cleanupCampaignProductBaseAutoCreate = () => {
    modal.removeEventListener("click", handleCardClick, true);
    cleanupCampaignProductBaseAutoCreate = null;
  };
  return { ok: true, armed: true };
}

async function waitForCampaignPath(timeoutMs = 12_000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (location.pathname.startsWith("/campaigns/new")) return true;
    await wait(150);
  }
  return false;
}

function findCampaignTitleInput() {
  return (
    [...document.querySelectorAll('#title, input[name="title"]')].find(
      visible
    ) ||
    [...document.querySelectorAll(
      '.editable-title[contenteditable="true"], [contenteditable="true"][placeholder="Example Mug"]'
    )].find(visible) ||
    null
  );
}

async function ensureCampaignTitleInput() {
  let input = findCampaignTitleInput();
  if (input) return input;
  const section = document.querySelector(".ctm-tour-campaign-step-2");
  const header =
    section?.querySelector(".ant-collapse-header") ||
    section
      ?.closest(".ant-collapse-item")
      ?.querySelector(".ant-collapse-header");
  (header || section)?.click();
  input = await waitForElement(() => findCampaignTitleInput(), 4000);
  return input;
}

async function setCampaignTitleValue(control, value) {
  const text = String(value || "");
  if (
    control instanceof HTMLInputElement ||
    control instanceof HTMLTextAreaElement
  ) {
    setInputValue(control, text);
    return normalizedText(control.value);
  }

  control.focus();
  const selection = window.getSelection();
  const range = document.createRange();
  range.selectNodeContents(control);
  selection?.removeAllRanges();
  selection?.addRange(range);

  const inserted = document.execCommand?.("insertText", false, text);
  if (!inserted || normalizedText(control.textContent) !== normalizedText(text)) {
    control.textContent = text;
    control.dispatchEvent(
      new InputEvent("input", {
        bubbles: true,
        composed: true,
        inputType: "insertText",
        data: text
      })
    );
  }
  control.dispatchEvent(new Event("change", { bubbles: true, composed: true }));

  const container =
    control.closest('[class*="EditableTitle__Container"]') ||
    control.parentElement;
  const confirm = await waitForElement(() => {
    const icon = container?.querySelector('[aria-label="check"]');
    const button = icon?.closest("button");
    return visible(button) ? button : null;
  }, 1500);
  if (confirm) {
    confirm.click();
    await waitForElement(() => {
      const current = findCampaignTitleInput();
      const currentValue =
        current instanceof HTMLInputElement ||
        current instanceof HTMLTextAreaElement
          ? normalizedText(current.value)
          : normalizedText(current?.textContent);
      return currentValue === normalizedText(text) ? current : null;
    }, 2500);
  } else {
    control.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "Enter",
        code: "Enter",
        keyCode: 13,
        which: 13,
        bubbles: true,
        composed: true
      })
    );
    control.dispatchEvent(
      new KeyboardEvent("keyup", {
        key: "Enter",
        code: "Enter",
        keyCode: 13,
        which: 13,
        bubbles: true,
        composed: true
      })
    );
    await wait(220);
  }
  selection?.removeAllRanges();
  const current = findCampaignTitleInput() || control;
  return current instanceof HTMLInputElement ||
    current instanceof HTMLTextAreaElement
    ? normalizedText(current.value)
    : normalizedText(current.textContent);
}

function findExactButtonIn(root, text) {
  const expected = normalizeCampaignMatch(text);
  return [...root.querySelectorAll("button")].find(
    (button) =>
      visible(button) &&
      normalizeCampaignMatch(button.textContent) === expected
  );
}

async function selectCampaignProductBase(
  productBaseTitle,
  { waitForNavigation = true } = {}
) {
  const modal = await waitForElement(
    () => findProductBaseSelectorModal(),
    5000
  );
  if (!modal) throw new Error("Không tìm thấy bảng Product Base.");
  const expected = normalizeCampaignMatch(productBaseTitle);
  const item = [...modal.querySelectorAll(".ant-card")]
    .filter(visible)
    .map(readProductBaseCard)
    .find(({ title }) => normalizeCampaignMatch(title) === expected);
  if (!item) {
    throw new Error(`Không còn thấy Product Base "${productBaseTitle}".`);
  }
  if (!item.card.classList.contains("selected-card")) {
    item.card.click();
    await wait(150);
  }

  // Customall re-renders the Product Base cards after selection, so the
  // original `item.card` can be stale. Resolve the selected card again from
  // the live modal and wait until Create campaign is ready.
  const ready = await waitForElement(() => {
    const activeModal = findProductBaseSelectorModal() || modal;
    const selectedItem = [...activeModal.querySelectorAll(".ant-card.selected-card")]
      .filter(visible)
      .map(readProductBaseCard)
      .find(({ title }) => normalizeCampaignMatch(title) === expected);
    const createButton = findExactButtonIn(activeModal, "Create campaign");
    return selectedItem && createButton && !createButton.disabled
      ? { createButton }
      : null;
  }, 5000);
  if (!ready) {
    throw new Error(`Customall chưa chọn Product Base "${productBaseTitle}".`);
  }
  ready.createButton.click();
  if (!waitForNavigation) return;
  if (!(await waitForCampaignPath())) {
    throw new Error("Customall chưa mở trang tạo Campaign.");
  }
}

function findArtworkSelectorModal() {
  return (
    [...document.querySelectorAll(".artwork-selector-modal")].find(visible) ||
    null
  );
}

async function openCampaignArtworkSelector() {
  let applyButton = [
    ...document.querySelectorAll(".ctm-tour-campaign-step-1-3")
  ].find(visible);
  if (!applyButton) {
    const section = document.querySelector(".ctm-tour-campaign-step-3");
    const header =
      section?.querySelector(".ant-collapse-header") ||
      section
        ?.closest(".ant-collapse-item")
        ?.querySelector(".ant-collapse-header");
    (header || section)?.click();
    applyButton = await waitForElement(
      () =>
        [
          ...document.querySelectorAll(".ctm-tour-campaign-step-1-3")
        ].find(visible),
      6000
    );
  }
  if (!applyButton) throw new Error("Không tìm thấy nút Apply artwork.");
  applyButton.click();
  const modal = await waitForElement(
    () => findArtworkSelectorModal(),
    5000
  );
  if (!modal) throw new Error("Không mở được bảng Select artwork.");
  return modal;
}

function readArtworkCard(card) {
  const image = card.querySelector("img[alt]");
  const titleElement =
    card.querySelector(".ant-card-meta-title [title]") ||
    card.querySelector(".ant-card-meta-title") ||
    card.querySelector("[title]");
  return normalizedText(
    image?.getAttribute("alt") ||
      titleElement?.getAttribute("title") ||
      titleElement?.textContent
  );
}

function readArtworkCardSearchText(card) {
  const values = [
    readArtworkCard(card),
    normalizedText(card.textContent),
    ...[...card.querySelectorAll("[title]")].map((element) =>
      normalizedText(element.getAttribute("title"))
    ),
    ...[...card.querySelectorAll("img[alt]")].map((element) =>
      normalizedText(element.getAttribute("alt"))
    )
  ].filter(Boolean);
  return normalizeCampaignMatch([...new Set(values)].join(" "));
}

function findArtworkResultCards(modal) {
  const hasResultMetadata = (element) =>
    /used in\s+\d+\s+campaigns?/i.test(normalizedText(element.textContent));
  const primary = [...modal.querySelectorAll(".ant-card")].filter(
    (element) => visible(element) && hasResultMetadata(element)
  );
  if (primary.length) return primary;
  const named = [
    ...modal.querySelectorAll(
      ".unselected-card, .selected-card, [class*=artwork][class*=card]"
    )
  ].filter((element) => visible(element) && hasResultMetadata(element));
  if (named.length) return named;

  // Some Customall builds render Artwork results without the Ant card class.
  // Infer each result from its preview image and the "Used in … campaigns"
  // metadata that belongs to every Artwork result card.
  const inferred = [...modal.querySelectorAll("img")]
    .filter((image) => {
      if (!visible(image)) return false;
      const rect = image.getBoundingClientRect();
      return rect.width >= 80 && rect.height >= 50;
    })
    .map((image) => {
      let element = image;
      while (element && element !== modal) {
        const text = normalizedText(element.textContent);
        if (/used in\s+\d+\s+campaigns?/i.test(text)) return element;
        element = element.parentElement;
      }
      return null;
    })
    .filter(Boolean);
  const imageCards = [...new Set(inferred)];
  if (imageCards.length) return imageCards;

  // Final fallback independent of card classes and preview implementation.
  // The metadata line is stable even when Customall renders the preview as a
  // background image/canvas instead of an <img>.
  const metadataCards = [...modal.querySelectorAll("*")]
    .filter(
      (element) =>
        visible(element) &&
        /^used in\s+\d+\s+campaigns?$/i.test(normalizedText(element.textContent))
    )
    .map((metadata) => {
      let element = metadata;
      while (element.parentElement && element.parentElement !== modal) {
        const parent = element.parentElement;
        const rect = parent.getBoundingClientRect();
        if (
          hasResultMetadata(parent) &&
          rect.width >= 140 &&
          rect.height >= 140
        ) {
          return parent;
        }
        element = parent;
      }
      return metadata;
    });
  return [...new Set(metadataCards)];
}

function isArtworkResultSelected(card) {
  return Boolean(
    card.classList.contains("selected-card") ||
      card.closest(".selected-card, [aria-selected=true]") ||
      card.querySelector(
        ".selected-card, [aria-selected=true], input[type=radio]:checked, input[type=checkbox]:checked"
      )
  );
}

function findApplyArtworkAction(modal) {
  return (
    [...modal.querySelectorAll(".ctm-tour-campaign-step-3-3")].find(visible) ||
    [...modal.querySelectorAll("button")].find((button) => {
      const text = normalizeCampaignMatch(button.textContent);
      return visible(button) && /^apply (artwork|to print area)/.test(text);
    }) ||
    null
  );
}

async function linkCampaignArtwork(artworkTitle) {
  const modal = await openCampaignArtworkSelector();
  const search =
    modal.querySelector("#search-artwork-modal") ||
    [...modal.querySelectorAll('input[placeholder="Search by name"]')].find(
      visible
    );
  if (!search) throw new Error("Không tìm thấy ô Search Artwork.");
  search.focus();
  setInputValue(search, artworkTitle);
  await waitForElement(
    () => (findArtworkResultCards(modal).length ? modal : null),
    5000
  );

  const expected = normalizeCampaignMatch(artworkTitle);
  const cards = findArtworkResultCards(modal);
  let card = cards.find(
    (element) => readArtworkCardSearchText(element) === expected
  );
  if (!card) {
    card = cards.find((element) => {
      const text = readArtworkCardSearchText(element);
      return text.includes(expected) || expected.includes(text);
    });
  }
  if (!card) {
    const expectedTokens = expected.split(" ").filter((token) => token.length > 2);
    card = cards.find((element) => {
      const text = readArtworkCardSearchText(element);
      const matched = expectedTokens.filter((token) => text.includes(token));
      return (
        expectedTokens.length > 0 &&
        matched.length / expectedTokens.length >= 0.7
      );
    });
  }
  if (!card && cards.length === 1) {
    card = cards[0];
  }
  if (!card) {
    throw new Error(`Không tìm thấy Artwork "${artworkTitle}".`);
  }
  if (!isArtworkResultSelected(card)) {
    (card.querySelector("img") || card).click();
  }
  const selectionReady = await waitForElement(() => {
    const action = findApplyArtworkAction(modal);
    return isArtworkResultSelected(card) ||
      (action && !action.disabled && action.getAttribute("aria-disabled") !== "true")
      ? action || card
      : null;
  }, 4000);
  if (!selectionReady) {
    throw new Error(`Customall chưa chọn Artwork "${artworkTitle}".`);
  }

  const applyAllText = [...modal.querySelectorAll("*")].find(
    (element) =>
      visible(element) &&
      normalizedText(element.textContent) ===
        "Apply artwork to all print areas"
  );
  const applyAllLabel = applyAllText?.closest(
    "label, .ant-checkbox-wrapper"
  );
  const applyAllInput = applyAllLabel?.querySelector(
    'input[type="checkbox"]'
  );
  if (applyAllLabel && applyAllInput && !applyAllInput.checked) {
    applyAllLabel.click();
    await wait(220);
  }

  const apply = findApplyArtworkAction(modal);
  if (!apply || apply.disabled) {
    throw new Error("Nút Apply artwork chưa sẵn sàng.");
  }
  apply.click();
  const closed = await waitForElement(
    () => (findArtworkSelectorModal() ? null : document.body),
    7000
  );
  if (!closed) {
    throw new Error("Customall chưa link Artwork vào Product Base.");
  }
}

function findCampaignAdditionalInformationHeader() {
  const exactText = [...document.querySelectorAll("span, div, button")].find(
    (element) =>
      visible(element) &&
      normalizeCampaignMatch(element.textContent) ===
        "additional information"
  );
  return (
    exactText?.closest(".ant-collapse-header") ||
    exactText?.closest("button, [role=button]") ||
    exactText ||
    null
  );
}

function selectedCampaignTagValues(container) {
  return [
    ...container.querySelectorAll(
      ".ant-select-selection-item, .ant-select-selection__choice__content, .ant-tag"
    )
  ]
    .map((element) => normalizeCampaignMatch(element.textContent))
    .filter(Boolean);
}

async function selectCampaignTag(container, tag) {
  const expected = normalizeCampaignMatch(tag);
  if (selectedCampaignTagValues(container).includes(expected)) return true;

  const search = [
    ...container.querySelectorAll(
      "input.ant-select-selection-search-input, input[role=combobox], input"
    )
  ].find(visible);
  const selector =
    container.querySelector(".ant-select-selector") ||
    container.querySelector("[role=combobox]") ||
    search;
  if (!search || !selector) return false;

  selector.click();
  search.focus();
  setInputValue(search, tag);
  await wait(300);

  const option = [
    ...document.querySelectorAll(
      ".ant-select-dropdown:not(.ant-select-dropdown-hidden) .ant-select-item-option, .ant-select-dropdown:not(.ant-select-dropdown-hidden) [role=option]"
    )
  ].find(
    (element) =>
      visible(element) &&
      normalizeCampaignMatch(element.textContent) === expected
  );
  if (option) {
    humanClick(option);
    await wait(220);
  }
  if (!selectedCampaignTagValues(container).includes(expected)) {
    search.focus();
    search.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "Enter",
        code: "Enter",
        keyCode: 13,
        which: 13,
        bubbles: true,
        composed: true
      })
    );
    search.dispatchEvent(
      new KeyboardEvent("keyup", {
        key: "Enter",
        code: "Enter",
        keyCode: 13,
        which: 13,
        bubbles: true,
        composed: true
      })
    );
  }
  const selected = await waitForElement(
    () =>
      selectedCampaignTagValues(container).includes(expected)
        ? container
        : null,
    1500
  );
  return Boolean(selected);
}

async function fillCampaignAdditionalInformation() {
  let skuInput = [
    ...document.querySelectorAll(
      'input[placeholder="SKU suffix"], input[name*="sku" i]'
    )
  ].find(visible);
  if (!skuInput) {
    findCampaignAdditionalInformationHeader()?.click();
    skuInput = await waitForElement(
      () =>
        [
          ...document.querySelectorAll(
            'input[placeholder="SKU suffix"], input[name*="sku" i]'
          )
        ].find(visible),
      4000
    );
  }
  if (!skuInput) {
    throw new Error("KhÃ´ng tÃ¬m tháº¥y Ã´ SKU suffix.");
  }
  setInputValue(skuInput, "US");
  await wait(180);
  if (normalizedText(skuInput.value) !== "US") {
    throw new Error("Customall chÆ°a nháº­n SKU suffix.");
  }

  const tagsContainer =
    findFieldContainerByLabel(document, "Tags") ||
    [...document.querySelectorAll(".ant-form-item")].find((element) =>
      element.querySelector(
        "input.ant-select-selection-search-input, input[role=combobox]"
      )
    );
  if (!tagsContainer) {
    throw new Error("KhÃ´ng tÃ¬m tháº¥y trÆ°á»ng Tags.");
  }

  for (const tag of ["customall", "personalized"]) {
    if (!(await selectCampaignTag(tagsContainer, tag))) {
      throw new Error(`Customall chÆ°a nháº­n tag "${tag}".`);
    }
  }
}

function findCampaignMockupFileInput() {
  const inputs = [...document.querySelectorAll('input[type="file"]')].filter(
    (input) => !input.hasAttribute("webkitdirectory")
  );
  return (
    inputs.find((input) => {
      const accept = String(input.getAttribute("accept") || "").toLowerCase();
      const container = input.closest(
        ".ant-upload, .ant-upload-wrapper, [class*=upload], [class*=mockup], section, form"
      );
      return (
        /mockups?|upload manual mockups?/i.test(container?.textContent || "") &&
        (!accept || accept.includes("image") || /png|jpe?g|webp/.test(accept))
      );
    }) ||
    inputs.find((input) => {
      const accept = String(input.getAttribute("accept") || "").toLowerCase();
      return accept.includes("image") || /png|jpe?g|webp/.test(accept);
    }) ||
    null
  );
}

function findCampaignMediaLibraryModal() {
  return (
    [...document.querySelectorAll('.ant-modal, [role="dialog"], [class*=modal]')]
      .filter(visible)
      .find((element) =>
        /media library/i.test(normalizedText(element.textContent))
      ) || null
  );
}

function findCampaignMockupAddTrigger() {
  const heading = [...document.querySelectorAll("h1, h2, h3, h4, div, span")]
    .filter(visible)
    .find(
      (element) =>
        normalizeCampaignMatch(element.textContent) === "mockups"
    );
  if (!heading) return null;
  const headingRect = heading.getBoundingClientRect();
  const candidates = [
    ...document.querySelectorAll(
      'button, [role="button"], [data-icon="plus"], svg[aria-label="plus"], .ant-card, [class*=upload]'
    )
  ]
    .map((element) =>
      element.matches('[data-icon="plus"], svg[aria-label="plus"]')
        ? element.closest('button, [role="button"], .ant-card, [class*=upload], div')
        : element
    )
    .filter((element, index, list) => element && list.indexOf(element) === index)
    .filter((element) => {
      if (!visible(element)) return false;
      const rect = element.getBoundingClientRect();
      const text = normalizedText(element.textContent);
      const label = normalizedText(
        element.getAttribute("aria-label") || element.getAttribute("title")
      );
      const looksLikeAdd =
        text === "+" ||
        /add|upload manual mockups?|upload mockups?/i.test(label) ||
        Boolean(
          element.querySelector(
            '[data-icon="plus"], svg[aria-label="plus"]'
          )
        );
      return (
        looksLikeAdd &&
        rect.top >= headingRect.bottom - 10 &&
        rect.top <= headingRect.bottom + 500 &&
        rect.left >= headingRect.left - 80 &&
        rect.left <= headingRect.left + 500
      );
    })
    .sort((left, right) => {
      const leftRect = left.getBoundingClientRect();
      const rightRect = right.getBoundingClientRect();
      return (
        Math.abs(leftRect.top - headingRect.bottom) -
          Math.abs(rightRect.top - headingRect.bottom) ||
        Math.abs(leftRect.left - headingRect.left) -
          Math.abs(rightRect.left - headingRect.left)
      );
    });
  return candidates[0] || null;
}

async function openCampaignMediaLibrary() {
  let modal = findCampaignMediaLibraryModal();
  if (modal) return modal;
  const addTrigger = await waitForElement(
    () => findCampaignMockupAddTrigger(),
    5000
  );
  if (!addTrigger) {
    throw new Error("Không tìm thấy ô dấu + trong phần Mockups.");
  }
  addTrigger.click();
  modal = await waitForElement(() => findCampaignMediaLibraryModal(), 5000);
  if (!modal) {
    throw new Error("Không mở được Media Library từ ô dấu +.");
  }
  return modal;
}

async function uploadCampaignMockups(sessionId) {
  if (!sessionId) {
    throw new Error("Chưa chọn folder mockup cho Campaign.");
  }
  const modal = await openCampaignMediaLibrary();
  const uploadTab = [...modal.querySelectorAll('button, [role="tab"], div, span')]
    .filter(visible)
    .find(
      (element) => normalizeCampaignMatch(element.textContent) === "upload"
    );
  uploadTab?.click();
  const input = await waitForElement(
    () =>
      [...modal.querySelectorAll('input[type="file"]')].find(
        (element) => !element.hasAttribute("webkitdirectory")
      ) || findCampaignMockupFileInput(),
    5000
  );
  if (!input) {
    throw new Error("Không tìm thấy ô upload file trong Media Library.");
  }
  const expectedCount = await receiveBridgeFile(sessionId, input);
  if (!expectedCount) {
    throw new Error("Customall chưa nhận file mockup từ máy.");
  }

  const started = Date.now();
  let readyChecks = 0;
  while (Date.now() - started < 30_000) {
    const errorItem = modal.querySelector(
      ".ant-upload-list-item-error, [class*=upload][class*=error]"
    );
    if (errorItem) {
      throw new Error("Customall báo lỗi khi upload mockup.");
    }
    // Ant Design keeps the progress element in the DOM after an upload has
    // completed. Only explicit "uploading" states should block auto Select.
    const uploading = modal.querySelector(
      ".ant-upload-list-item-uploading, [class*=uploading]"
    );
    const select = [...modal.querySelectorAll("button")].find(
      (button) =>
        visible(button) &&
        normalizeCampaignMatch(button.textContent) === "select" &&
        !button.disabled &&
        button.getAttribute("aria-disabled") !== "true"
    );
    readyChecks = !uploading && select ? readyChecks + 1 : 0;
    if (readyChecks >= 2 && Date.now() - started >= 1000) {
      select.click();
      const closed = await waitForElement(
        () => (findCampaignMediaLibraryModal() ? null : document.body),
        7000
      );
      if (!closed) {
        throw new Error("Media Library chưa xác nhận chọn mockup.");
      }
      return { count: expectedCount };
    }
    await wait(250);
  }
  throw new Error("Upload hoặc auto Select mockup quá thời gian chờ; Campaign chưa được Save.");
}

function findEditMockupDialog() {
  const dialogs = [
    ...document.querySelectorAll(
      '.ant-modal, [role="dialog"], .ant-drawer, [class*=modal]'
    )
  ].filter(visible);
  return (
    dialogs.find((dialog) =>
      [...dialog.querySelectorAll("h1, h2, h3, h4, div, span")].some(
        (element) =>
          visible(element) &&
          normalizeCampaignMatch(element.textContent) === "edit mockup"
      )
    ) || null
  );
}

async function saveEditMockupIfOpen() {
  const dialog = await waitForElement(() => findEditMockupDialog(), 3500);
  if (!dialog) return false;
  const save = [...dialog.querySelectorAll("button")]
    .filter(
      (button) =>
        visible(button) &&
        normalizeCampaignMatch(button.textContent) === "save" &&
        !button.disabled &&
        button.getAttribute("aria-disabled") !== "true"
    )
    .sort((left, right) => {
      const leftRect = left.getBoundingClientRect();
      const rightRect = right.getBoundingClientRect();
      return rightRect.top - leftRect.top || rightRect.right - leftRect.right;
    })[0];
  if (!save) {
    throw new Error("Không tìm thấy nút Save trong bảng Edit Mockup.");
  }
  save.click();
  const closed = await waitForElement(
    () => (findEditMockupDialog() ? null : document.body),
    10_000
  );
  if (!closed) {
    throw new Error("Bảng Edit Mockup chưa xác nhận Save.");
  }
  return true;
}

async function saveCampaign() {
  const save = await waitForElement(() => {
    const buttons = [...document.querySelectorAll("button")]
      .filter(
        (button) =>
          visible(button) &&
          normalizeCampaignMatch(button.textContent) === "save" &&
          !button.disabled
      )
      .sort((a, b) => {
        const aRect = a.getBoundingClientRect();
        const bRect = b.getBoundingClientRect();
        return aRect.top - bRect.top || bRect.right - aRect.right;
      });
    return buttons[0] || null;
  }, 5000);
  if (!save) {
    throw new Error("KhÃ´ng tÃ¬m tháº¥y nÃºt Save Campaign.");
  }

  const startingPath = location.pathname;
  save.click();
  const completed = await waitForElement(() => {
    const pathChanged = location.pathname !== startingPath;
    const successMessage = [
      ...document.querySelectorAll(
        ".ant-message-success, .ant-notification-notice-success, [role=status]"
      )
    ].find(
      (element) =>
        visible(element) &&
        /sav|success|created/i.test(normalizedText(element.textContent))
    );
    return pathChanged || successMessage ? document.body : null;
  }, 10_000);
  if (!completed) {
    throw new Error("Customall chÆ°a xÃ¡c nháº­n lÆ°u Campaign.");
  }
  await saveEditMockupIfOpen();
}

async function buildCampaignFromArtwork(source, productBase, mockupSessionId) {
  const title = normalizedText(source?.title);
  const productBaseTitle = normalizedText(productBase?.title);
  const isCampaignEditor = location.pathname.startsWith("/campaigns/new");
  if (!title || (!isCampaignEditor && !productBaseTitle)) {
    return { ok: false, error: "Thiếu Artwork Title hoặc Product Base." };
  }
  // If a Product Base was chosen from multiple results, Customall has already
  // closed the Product Base modal and navigated to the campaign editor.
  // Resume from the editor instead of trying to find that modal again.
  if (!isCampaignEditor) {
    await selectCampaignProductBase(productBaseTitle);
  }

  const titleInput = await ensureCampaignTitleInput();
  if (!titleInput) throw new Error("Không tìm thấy ô Campaign Title.");
  const committedTitle = await setCampaignTitleValue(titleInput, title);
  await wait(250);
  const currentTitleInput = findCampaignTitleInput();
  const actualTitle =
    committedTitle ||
    (currentTitleInput instanceof HTMLInputElement ||
    currentTitleInput instanceof HTMLTextAreaElement
      ? normalizedText(currentTitleInput.value)
      : normalizedText(currentTitleInput?.textContent));
  if (actualTitle !== title) {
    throw new Error("Customall chưa nhận Campaign Title.");
  }

  await linkCampaignArtwork(title);
  await fillCampaignAdditionalInformation();
  const mockupUpload = await uploadCampaignMockups(mockupSessionId);
  await saveCampaign();
  return {
    ok: true,
    title,
    category: source.category,
    productBase: productBaseTitle,
    skuSuffix: "US",
    tags: ["customall", "personalized"],
    mockupCount: mockupUpload.count,
    saved: true
  };
}

async function prepareArtworkForm(values) {
  if (!location.hostname.endsWith("customall.io")) {
    return { ok: false, error: "Hãy mở Customall trước." };
  }
  if (location.pathname !== "/artworks" && location.pathname !== "/artworks/") {
    location.href = "https://app.customall.io/artworks?create=true";
    return {
      ok: false,
      retry: true,
      error: "Đã mở trang Artworks. Bấm lại sau khi trang tải xong."
    };
  }

  let form = document.querySelector("#artwork-form");
  if (!form) {
    const addNew = [...document.querySelectorAll("button")].find(
      (button) => normalizedText(button.textContent).toLowerCase() === "add new"
    );
    if (!addNew) {
      return { ok: false, error: "Không tìm thấy nút Add New trên Customall." };
    }
    addNew.click();
    form = await waitForElement(() => document.querySelector("#artwork-form"));
  }
  if (!form) {
    return { ok: false, error: "Form Add new artwork không mở được." };
  }

  const title = normalizedText(values.title);
  const productBase = normalizedText(values.productBase || values.category);
  if (!title) return { ok: false, error: "Thiếu Artwork title." };
  if (!productBase) return { ok: false, error: "Thiếu Product base." };

  const titleInput = form.querySelector("#title");
  if (!titleInput) {
    return { ok: false, error: "Customall đã đổi cấu trúc form Artwork." };
  }
  setInputValue(titleInput, title);

  const categoryResult = await selectArtworkCategory(form, values.category);
  if (!categoryResult.ok) return categoryResult;
  const productBaseResult = await selectArtworkProductBase(form, productBase);
  if (!productBaseResult.ok) return productBaseResult;

  return {
    ok: true,
    filled: ["Title", "Category", "Printarea size", "Product base", "PNG"],
    category: categoryResult.category || "",
    productBase: productBaseResult.productBase || "",
    saved: false
  };
}

function auditArtworkEditor() {
  if (getArtworkMode() !== "editor") {
    return {
      ok: false,
      error: "Hãy mở một Artwork editor trên Customall rồi thử lại."
    };
  }

  const layerNames = [
    ...document.querySelectorAll(".ant-collapse-header .layer-title")
  ]
    .map((element) => {
      const clone = element.cloneNode(true);
      clone.querySelectorAll(".edit, svg").forEach((item) => item.remove());
      return normalizedText(clone.textContent);
    })
    .filter(Boolean);
  const templateNames = [
    ...document.querySelectorAll(".ant-tabs-tab-btn")
  ]
    .map((element) => normalizedText(element.textContent))
    .filter(
      (name) =>
        name &&
        name !== "Layers" &&
        name !== "Templates Display Settings"
    );

  const counts = new Map();
  layerNames.forEach((name) => {
    const key = name.toLowerCase();
    counts.set(key, (counts.get(key) || 0) + 1);
  });
  const duplicateLayers = [...counts.entries()]
    .filter(([, count]) => count > 1)
    .map(([name]) => name);
  const defaultLayers = layerNames.filter((name) =>
    /^(text|image)\s*#\d+$/i.test(name)
  );
  const issues = [];
  if (!templateNames.length) {
    issues.push({ severity: "error", message: "Artwork chưa có template." });
  }
  if (!layerNames.length) {
    issues.push({ severity: "error", message: "Artwork chưa có layer." });
  }
  if (duplicateLayers.length) {
    issues.push({
      severity: "warning",
      message: `Layer trùng tên: ${duplicateLayers.join(", ")}.`
    });
  }
  if (defaultLayers.length) {
    issues.push({
      severity: "warning",
      message: `Layer còn tên mặc định: ${defaultLayers.join(", ")}.`
    });
  }
  if (!issues.length) {
    issues.push({
      severity: "success",
      message: "Cấu trúc template và layer không có lỗi cơ bản."
    });
  }

  return {
    ok: true,
    templateCount: templateNames.length,
    layerCount: layerNames.length,
    templateNames,
    layerNames,
    issues
  };
}

function findFolderInput() {
  const inputs = [...document.querySelectorAll('input[type="file"]')];
  return (
    inputs.find((input) => input.hasAttribute("webkitdirectory")) ||
    inputs.find((input) => {
      const container = input.closest('[role="dialog"], .modal, [class*="modal"], form');
      return /import\s+from\s+folder|upload\s+folder/i.test(container?.textContent || "");
    }) ||
    null
  );
}

function findFolderImportTrigger() {
  const candidates = [
    ...document.querySelectorAll('button, a, [role="button"], [role="menuitem"]')
  ].filter((element) => {
    const text = (element.textContent || "").replace(/\s+/g, " ").trim();
    return /import\s+from\s+folder|upload\s+folder/i.test(text);
  });
  return candidates.length === 1 ? candidates[0] : null;
}

async function receiveBridgeFile(sessionId, input) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error("Không nhận được clipart từ extension."));
    }, 30_000);

    const iframe = document.createElement("iframe");
    iframe.hidden = true;
    iframe.src = `${chrome.runtime.getURL("src/bridge/upload-bridge.html")}?session=${encodeURIComponent(sessionId)}`;

    function cleanup() {
      clearTimeout(timeout);
      window.removeEventListener("message", handleMessage);
      iframe.remove();
    }

    function handleMessage(event) {
      if (event.source !== iframe.contentWindow || event.data?.sessionId !== sessionId) return;
      if (event.data.type === "CUSTOMALL_UPLOAD_FILE_ERROR") {
        cleanup();
        reject(new Error(event.data.error || "Không đọc được clipart tạm."));
        return;
      }
      if (
        event.data.type !== "CUSTOMALL_UPLOAD_FILES_READY" ||
        !Array.isArray(event.data.files) ||
        !Array.isArray(event.data.entries) ||
        !event.data.files.length
      ) {
        return;
      }

      const transfer = new DataTransfer();
      event.data.files.forEach((file) => transfer.items.add(file));
      input.files = transfer.files;
      event.data.entries.forEach((entry, index) => {
        try {
          Object.defineProperty(input.files[index], "webkitRelativePath", {
            configurable: true,
            value: entry.path
          });
        } catch {
          // The original File already carries the relative path in most Chrome versions.
        }
      });

      const marker = document.createElement("span");
      marker.hidden = true;
      marker.dataset.selector = `input[data-customall-upload-copilot="${input.getAttribute(
        "data-customall-upload-copilot"
      )}"]`;
      marker.dataset.entries = JSON.stringify(event.data.entries);
      document.documentElement.appendChild(marker);
      marker.dispatchEvent(
        new Event("customall-upload-copilot-paths", {
          bubbles: true,
          composed: true
        })
      );
      marker.remove();

      input.dispatchEvent(new Event("input", { bubbles: true, composed: true }));
      input.dispatchEvent(new Event("change", { bubbles: true, composed: true }));
      cleanup();
      resolve(event.data.files.length);
    }

    window.addEventListener("message", handleMessage);
    document.documentElement.appendChild(iframe);
  });
}

async function prepareFolderUpload() {
  let input = findFolderInput();
  if (!input) {
    const trigger = findFolderImportTrigger();
    if (trigger) trigger.click();
  }

  const deadline = Date.now() + 8000;
  while (!input && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 200));
    input = findFolderInput();
  }
  if (!input) {
    return {
      ok: false,
      error: 'Không tìm thấy ô Import from folder. Hãy mở Cliparts → "Import from folder" rồi bấm lại.'
    };
  }

  const marker = `customall-folder-upload-${Date.now()}`;
  input.setAttribute("data-customall-upload-copilot", marker);
  return {
    ok: true,
    selector: `input[data-customall-upload-copilot="${marker}"]`
  };
}

async function uploadFolderDirect(message) {
  const prepared = await prepareFolderUpload();
  if (!prepared.ok) return prepared;
  const input = document.querySelector(prepared.selector);
  if (!input) {
    return { ok: false, error: "Ô Import from folder đã đóng. Hãy mở lại rồi thử lần nữa." };
  }

  await receiveBridgeFile(message.sessionId, input);
  const confirmation = await confirmFolderUpload(prepared.selector);
  return { ok: true, confirmation };
}

async function confirmFolderUpload(selector) {
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    const input = document.querySelector(selector);
    if (!input) {
      return { ok: true, autoStarted: true };
    }

    const container =
      input.closest('[role="dialog"], .modal, [class*="modal"], form') ||
      input.parentElement ||
      document;
    const buttons = [...container.querySelectorAll('button, [role="button"]')].filter(
      (button) => {
        const text = (button.textContent || "").replace(/\s+/g, " ").trim();
        return (
          !button.disabled &&
          /^(upload|upload files?|import|import now|select|ok|confirm|start upload)$/i.test(text)
        );
      }
    );
    if (buttons.length === 1) {
      buttons[0].click();
      return { ok: true, clicked: true };
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }

  return { ok: true, autoStarted: true };
}
