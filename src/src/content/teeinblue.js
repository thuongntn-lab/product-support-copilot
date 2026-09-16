// This fingerprint is deliberately baked into the content-script bytecode.
// Do not replace it with chrome.runtime.getManifest().version: an old content
// script can read a new manifest after Chrome reloads the extension.
var TIB_RUNTIME_FINGERPRINT = "ps-tib-0.16.19-20260819-a";
var TIB_RUNTIME_STARTED_AT = Date.now();
var tibLabelFields = new Map();
var tibSmartSetupPlan = new Map();
var tibSmartSetupV2Plan = new Map();

function tibText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function tibVisibleElement(element) {
  const rect = element?.getBoundingClientRect?.();
  const style = element ? getComputedStyle(element) : null;
  return Boolean(rect && rect.width > 3 && rect.height > 3 && style?.display !== "none" && style?.visibility !== "hidden");
}

function tibButton(pattern, root = document) {
  return [...root.querySelectorAll('button, a, [role="button"]')].find(
    (element) => tibVisibleElement(element) && pattern.test(tibText(element.textContent))
  );
}

async function tibWaitFor(factory, timeout = 10000, interval = 150) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    const result = factory();
    if (result) return result;
    await tibWait(interval);
  }
  return null;
}

function tibWaitForDom(factory, timeout = 10000) {
  return new Promise((resolve) => {
    let finished = false;
    let observer = null;
    let fallback = null;
    let timer = null;
    const finish = (value) => {
      if (finished) return;
      finished = true;
      observer?.disconnect();
      clearInterval(fallback);
      clearTimeout(timer);
      resolve(value || null);
    };
    const check = () => {
      if (finished) return;
      try {
        const value = factory();
        if (value) finish(value);
      } catch {
        // Keep observing; TeeInBlue may be replacing the current subtree.
      }
    };
    check();
    if (finished) return;
    observer = new MutationObserver(check);
    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: ["class", "style", "disabled"]
    });
    // Safety poll covers state changes that do not mutate observable DOM.
    fallback = setInterval(check, 500);
    timer = setTimeout(() => finish(null), timeout);
  });
}

function tibSetNativeValue(input, value) {
  const prototype = input instanceof HTMLTextAreaElement
    ? HTMLTextAreaElement.prototype
    : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(prototype, "value")?.set?.call(input, value);
  input.dispatchEvent(new InputEvent("input", { bubbles: true, composed: true, data: value }));
  input.dispatchEvent(new Event("change", { bubbles: true, composed: true }));
}

function tibArtworkCategory(root = document) {
  const label = [...root.querySelectorAll("label, .control-label, .form-label")]
    .find((element) => tibVisibleElement(element) && /^category\s*\*?$/i.test(tibText(element.textContent)));
  if (!label) return "";
  const controlled = label.htmlFor ? document.getElementById(label.htmlFor) : null;
  const containers = [
    label.closest(".form-group, .form-field, .ant-form-item, [class*='form-group'], [class*='form-item']"),
    label.parentElement,
    label.parentElement?.parentElement
  ].filter(Boolean);
  for (const container of containers) {
    const control = controlled || [...container.querySelectorAll("input, textarea")]
      .find((input) => input.type !== "hidden" && tibText(input.value));
    const controlValue = tibText(control?.value);
    if (controlValue && !/^category$/i.test(controlValue)) return controlValue;
    const selected = container.querySelector(
      ".ant-select-selection-item, .multiselect__tag, .select2-selection__choice, " +
      ".vs__selected, [class*='singleValue'], [class*='selection-item']"
    );
    const selectedValue = tibText(selected?.getAttribute?.("title") || selected?.textContent)
      .replace(/[×x]\s*$/, "")
      .trim();
    if (selectedValue && !/^category$/i.test(selectedValue)) return selectedValue;
    const compactText = tibText(container.textContent)
      .replace(/^category\s*\*?/i, "")
      .replace(/\+\s*new category.*$/i, "")
      .replace(/[×x]\s*$/, "")
      .trim();
    if (compactText && compactText.length < 120) return compactText;
  }
  return "";
}

function tibArtworkDetailsDialog() {
  return [...document.querySelectorAll('[role="dialog"], .modal')]
    .filter(tibVisibleElement)
    .find((element) => /Artwork details/i.test(tibText(element.textContent))) || null;
}

async function tibReadArtworkCategory() {
  let details = tibArtworkDetailsDialog();
  const wasOpen = Boolean(details);
  if (!details) {
    const direct = [...document.querySelectorAll(
      '[title*="Edit artwork" i], [aria-label*="Edit artwork" i], ' +
      '[data-original-title*="Edit artwork" i], .artwork-name-edit, .artwork-title-edit'
    )].find(tibVisibleElement);
    const topIcon = [...document.querySelectorAll(
      'button, a, [role="button"], [class*="pencil"], [class*="edit"]'
    )].find((element) => {
      if (!tibVisibleElement(element)) return false;
      const rect = element.getBoundingClientRect();
      const label = tibText([
        element.textContent,
        element.getAttribute("title"),
        element.getAttribute("aria-label"),
        element.getAttribute("data-original-title"),
        element.className
      ].join(" "));
      return rect.top < 180 && /(?:edit.*artwork|artwork.*edit|pencil)/i.test(label);
    });
    const opener = direct?.closest?.('button, a, [role="button"]') || direct ||
      topIcon?.closest?.('button, a, [role="button"]') || topIcon;
    if (opener) {
      opener.dispatchEvent(new MouseEvent("click", { bubbles: true, composed: true }));
      details = await tibWaitFor(tibArtworkDetailsDialog, 6000);
    }
  }
  const category = tibArtworkCategory(details || document);
  if (details && !wasOpen) {
    const close = tibButton(/^cancel$/i, details) ||
      details.querySelector('[aria-label="Close"], [data-dismiss="modal"], .close');
    close?.dispatchEvent(new MouseEvent("click", { bubbles: true, composed: true }));
    await tibWaitFor(() => !tibArtworkDetailsDialog(), 3000);
  }
  return category;
}

async function tibArtworkCampaignSource() {
  const dialog = [...document.querySelectorAll('[role="dialog"], .modal')]
    .filter(tibVisibleElement)
    .find((element) => /Artwork\s*2\.0/i.test(element.textContent || ""));
  const url = new URL(location.href);
  const idFromUrl = url.searchParams.get("id") || url.pathname.match(/\/artworks\/(\d+)/)?.[1] || "";
  const dialogText = tibText(dialog?.textContent);
  const id = idFromUrl || dialogText.match(/#(\d{4,})/)?.[1] || "";
  let title = dialogText.match(/^(.+?)\s*\(#\d+/)?.[1] ||
    tibText(dialog?.querySelector(".modal-title, h1, h2, h3")?.textContent);
  if (/^(Artwork\s*2\.0|Edit)$/i.test(title)) title = "";
  if (!title && dialog) {
    title = [...dialog.querySelectorAll("div, span")]
      .map((element) => tibText(element.textContent))
      .find((value) => value && value.length < 220 && !/^Artwork\s*2\.0$/i.test(value) && !/^\(#\d+/.test(value)) || "";
  }
  if (!title) {
    title = tibText(document.title)
      .replace(/\s*[-–]\s*TeeInBlue Portal.*$/i, "")
      .replace(/^Edit Artwork\s*/i, "");
  }
  const selectedListTitle = id
    ? tibText(
        document.querySelector(`img[src*="/artworks/"][alt]`)?.alt ||
          [...document.querySelectorAll('.vgrid-entry-wrapper[title]')].find((entry) =>
            entry.querySelector(`img[src*="/artworks/"]`)
          )?.getAttribute("title")
      )
    : "";
  if (!title || /TeeInBlue Portal/i.test(title)) title = selectedListTitle;
  const category = tibArtworkCategory(dialog || document) || await tibReadArtworkCategory();
  const productHint = category || (title.match(/personalized\s+(.+?)(?:\s+copy)*$/i)?.[1] || title.split(/\s+-\s+/).at(-1) || "")
    .replace(/\s+copy(?:\s+copy)*$/i, "")
    .trim();
  if (!title || !id) {
    return { ok: false, error: "Hãy mở popup Artwork hoặc trang Edit Artwork TeeInBlue rồi thử lại." };
  }
  return { ok: true, title, artworkId: id, productHint, category, url: location.href };
}

async function tibCreateCampaignShell(title) {
  if (!location.pathname.startsWith("/campaigns/new")) {
    throw new Error("Hãy mở trang New Campaign TeeInBlue.");
  }
  const titleInput = await tibWaitFor(() => {
    const campaignLabel = [...document.querySelectorAll("label")].find((label) =>
      /campaign title/i.test(tibText(label.textContent))
    );
    return campaignLabel?.querySelector("input") ||
      [...document.querySelectorAll("input.form-control, input")].find((input) =>
        /campaign title/i.test(
          tibText(input.closest("label")?.textContent) ||
          tibText(input.closest(".form-group")?.textContent)
        )
      ) || null;
  }, 10000);
  if (!titleInput) throw new Error("Không tìm thấy ô Campaign title.");
  tibSetNativeValue(titleInput, title);
  await tibWait(180);
  const save = await tibWaitFor(() =>
    [...document.querySelectorAll("button")].find((button) =>
      tibVisibleElement(button) && /^save$/i.test(tibText(button.innerText))
    ) || null,
  10000);
  if (!save) throw new Error("Không tìm thấy nút Save Campaign.");
  save.click();
  return { ok: true, navigating: true };
}

function tibProductDialog() {
  return [...document.querySelectorAll('[role="dialog"], .modal')]
    .filter(tibVisibleElement)
    .find((element) => /Select your product/i.test(element.textContent || "")) || null;
}

function tibProductEntryLabel(entry) {
  // TeeInBlue renders the product cards from a virtualized list. Depending on
  // the list state, the product name may be exposed by the title attribute,
  // a data attribute, or only by the card heading. Read all of those sources
  // so the extension never trusts the category chip as the search result.
  const heading = entry?.querySelector?.(
    "h1, h2, h3, h4, h5, h6, .vgrid-entry-title, .product-name, [class*='product-name']"
  );
  return tibText([
    entry?.getAttribute?.("title"),
    entry?.getAttribute?.("data-title"),
    entry?.getAttribute?.("aria-label"),
    heading?.textContent,
    entry?.textContent
  ].filter(Boolean).join(" "));
}

function tibProductEntryMatches(entry, keyword) {
  const needle = tibText(keyword).toLowerCase();
  if (!needle) return true;
  return tibProductEntryLabel(entry).toLowerCase().includes(needle);
}

function tibFilterRenderedProductEntries(dialog, keyword) {
  const entries = [...dialog.querySelectorAll(".vgrid-entry-wrapper[title], .vgrid-entry-wrapper")];
  if (!entries.length) return [];
  const matches = entries.filter((entry) => tibProductEntryMatches(entry, keyword));
  // Do not blank the modal while TeeInBlue is still replacing a virtualized
  // page. Once at least one real match is rendered, hide only the unrelated
  // cards so the user sees the same result set that the extension will use.
  if (matches.length) {
    for (const entry of entries) {
      const show = matches.includes(entry);
      entry.hidden = !show;
      entry.style.display = show ? "" : "none";
      entry.setAttribute("aria-hidden", show ? "false" : "true");
    }
  }
  return matches.filter(tibVisibleElement);
}

async function tibPrepareCampaignProduct(keyword) {
  let dialog = tibProductDialog();
  if (!dialog) {
    const existingProductBase = await tibWaitForDom(
      () => tibCampaignHasProductBase(),
      6000
    );
    if (existingProductBase) {
      return { ok: true, selected: true, existingProductBase: true, matches: [] };
    }
    const add = await tibWaitFor(() => {
      const button = document.querySelector("button#select-product-base");
      return tibVisibleElement(button) ? button : null;
    }, 12000);
    if (!add) throw new Error("Không tìm thấy nút Add more product.");
    add.click();
    dialog = await tibWaitFor(tibProductDialog, 10000);
  }
  if (!dialog) throw new Error("Không mở được bảng Product Base.");
  const search = dialog.querySelector('input.vgrid-input[placeholder="Search"], input[placeholder="Search"]');
  if (!search) throw new Error("Không tìm thấy ô tìm Product Base.");
  tibSetNativeValue(search, "");
  search.dispatchEvent(new Event("input", { bubbles: true, composed: true }));
  search.dispatchEvent(new Event("change", { bubbles: true, composed: true }));
  await tibWait(80);
  tibSetNativeValue(search, keyword);
  // Ant-based inputs update their list from both input and keyboard events;
  // dispatch the same lightweight events as a real user keystroke.
  search.dispatchEvent(new KeyboardEvent("keyup", {
    key: tibText(keyword).slice(-1) || "a",
    bubbles: true,
    composed: true
  }));
  search.dispatchEvent(new Event("input", { bubbles: true, composed: true }));
  search.dispatchEvent(new Event("change", { bubbles: true, composed: true }));
  search.dispatchEvent(new Event("search", { bubbles: true, composed: true }));
  const normalizedKeyword = tibText(keyword).toLowerCase();
  let stableSignature = "";
  let stablePolls = 0;
  const entries = await tibWaitFor(() => {
    const found = tibFilterRenderedProductEntries(dialog, normalizedKeyword);
    const signature = found
      .map((entry) => tibText(entry.getAttribute("title") || entry.textContent))
      .sort()
      .join("\n");
    if (!signature) {
      stableSignature = "";
      stablePolls = 0;
      return null;
    }
    if (signature === stableSignature) stablePolls += 1;
    else {
      stableSignature = signature;
      stablePolls = 0;
    }
    return stablePolls >= 5 ? found : null;
  }, 15000, 300);
  if (!entries?.length) {
    // The selected Product Base can finish rendering behind this modal while
    // TeeInBlue's async search still returns an empty list. Re-check the real
    // campaign state before reporting a false failure.
    if (tibCampaignHasProductBase()) {
      const close = tibButton(/^close$|^cancel$/i, dialog) ||
        dialog.querySelector('[aria-label="Close"], [data-dismiss="modal"], .close');
      close?.dispatchEvent(new MouseEvent("click", { bubbles: true, composed: true }));
      await tibWaitFor(() => !tibProductDialog(), 3000);
      return { ok: true, selected: true, existingProductBase: true, matches: [] };
    }
    throw new Error(`Không tìm thấy Product Base chứa "${keyword}".`);
  }
  const matches = entries.map((entry) => ({ title: entry.getAttribute("title") || tibText(entry.textContent) }));
  if (entries.length === 1) {
    entries[0].click();
    await tibWaitFor(() => !tibProductDialog() && tibButton(/Select artwork/i), 10000);
    return { ok: true, selected: true, matches };
  }
  return { ok: true, selected: false, matches };
}

function tibArtworkDialog() {
  return [...document.querySelectorAll('[role="dialog"], .modal')]
    .filter(tibVisibleElement)
    .find((element) => /Select your artwork/i.test(element.textContent || "")) || null;
}

function tibArtworkAction(preferAll = false) {
  const normalized = (element) => tibText(element?.textContent).replace(/^\+\s*/, "");
  const candidates = [...document.querySelectorAll("body *")].filter((element) => {
    if (!tibVisibleElement(element)) return false;
    const text = normalized(element);
    if (!/^Select artwork(?: for all)?$/i.test(text)) return false;
    return ![...element.children].some((child) =>
      tibVisibleElement(child) && /^Select artwork(?: for all)?$/i.test(normalized(child))
    );
  });
  const target = (preferAll
    ? candidates.find((element) => /^Select artwork for all$/i.test(normalized(element)))
    : null) || candidates.find((element) => /^Select artwork$/i.test(normalized(element))) ||
    candidates.find((element) => /^Select artwork for all$/i.test(normalized(element)));
  return target?.closest?.('button, a, [role="button"], [class*="btn"], [class*="link"]') || target || null;
}

function tibCampaignHasProductBase() {
  if (tibArtworkAction(true)) return true;
  // Some TeeInBlue link children report a zero-size box while their parent is
  // visibly rendered. Page text still proves a Product Base already exists.
  const pageText = tibText(document.body?.innerText || document.body?.textContent);
  return /Available Products:?/i.test(pageText) &&
    /Print Areas of\s+\S+/i.test(pageText) &&
    /Select artwork(?: for all)?/i.test(pageText);
}

async function tibLinkCampaignArtwork(title) {
  let dialog = tibArtworkDialog();
  if (!dialog) {
    const select = await tibWaitForDom(() => tibArtworkAction(true), 15000);
    if (!select) throw new Error("Không tìm thấy nút Select artwork.");
    select.click();
    dialog = await tibWaitForDom(tibArtworkDialog, 10000);
  }
  if (!dialog) throw new Error("Không mở được bảng Artwork.");
  const search = dialog.querySelector('input.vgrid-input[placeholder="Search"], input[placeholder="Search"]');
  if (!search) throw new Error("Không tìm thấy ô tìm Artwork.");
  tibSetNativeValue(search, title);
  const entry = await tibWaitFor(() =>
    [...dialog.querySelectorAll(".vgrid-entry-wrapper[title]")].find(
      (item) => tibText(item.getAttribute("title")) === tibText(title)
    ), 9000);
  if (!entry) throw new Error(`Không tìm thấy Artwork "${title}".`);
  entry.click();
  await tibWait(250);
  const apply = tibButton(/Apply|Select/i, dialog);
  if (apply && !apply.disabled) apply.click();
  await tibWaitFor(() => !tibArtworkDialog(), 10000);
  if (tibArtworkDialog()) throw new Error("TeeInBlue chưa link Artwork.");
  return { ok: true };
}

function tibMockupDialog() {
  return [...document.querySelectorAll('[role="dialog"], .modal')]
    .filter(tibVisibleElement)
    .find((element) => /Drag and drop, or click to upload/i.test(element.textContent || "")) || null;
}

function tibReceiveCampaignFiles(sessionId, input) {
  return new Promise((resolve, reject) => {
    const iframe = document.createElement("iframe");
    iframe.hidden = true;
    iframe.src = `${chrome.runtime.getURL("src/bridge/upload-bridge.html")}?session=${encodeURIComponent(sessionId)}`;
    const timeout = setTimeout(() => finish(new Error("Không nhận được mockup từ extension.")), 30000);
    const finish = (error, count = 0) => {
      clearTimeout(timeout);
      window.removeEventListener("message", onMessage);
      iframe.remove();
      error ? reject(error) : resolve(count);
    };
    const onMessage = (event) => {
      if (event.source !== iframe.contentWindow || event.data?.sessionId !== sessionId) return;
      if (event.data.type === "CUSTOMALL_UPLOAD_FILE_ERROR") return finish(new Error(event.data.error));
      if (event.data.type !== "CUSTOMALL_UPLOAD_FILES_READY" || !event.data.files?.length) return;
      const transfer = new DataTransfer();
      event.data.files.forEach((file) => transfer.items.add(file));
      input.files = transfer.files;
      input.dispatchEvent(new Event("input", { bubbles: true, composed: true }));
      input.dispatchEvent(new Event("change", { bubbles: true, composed: true }));
      finish(null, event.data.files.length);
    };
    window.addEventListener("message", onMessage);
    document.documentElement.appendChild(iframe);
  });
}

async function tibUploadCampaignMockups(sessionId, fileNames = []) {
  let dialog = tibMockupDialog();
  if (!dialog) {
    const upload = tibButton(/^(?:Upload|Assign mockups)$/i);
    if (!upload) throw new Error("Không tìm thấy nút Upload mockup.");
    upload.click();
    dialog = await tibWaitFor(tibMockupDialog, 6000);
  }
  const dropzone = dialog?.querySelector("#imageDropzone");
  if (!dropzone) throw new Error("Không tìm thấy vùng upload TeeInBlue.");
  const fileInput = await tibWaitFor(() =>
    [...document.querySelectorAll('input.dz-hidden-input[type="file"]')]
      .find((input) => input.multiple) || null,
  5000);
  if (!fileInput) throw new Error("Không kết nối được vùng upload TeeInBlue.");
  const checkedBefore = [...dialog.querySelectorAll(".layer-listing__checkbox:checked")];
  if (checkedBefore.length) {
    const deselectAll = [...dialog.querySelectorAll("button")].find((button) =>
      tibVisibleElement(button) && /^deselect all$/i.test(tibText(button.innerText))
    );
    if (deselectAll) deselectAll.click();
    else checkedBefore.forEach((checkbox) => checkbox.click());
    await tibWaitFor(
      () => !dialog.querySelector(".layer-listing__checkbox:checked"),
      5000
    );
  }
  const previewCountBefore = dialog.querySelectorAll("#imageDropzone .dz-preview").length;
  const count = await tibReceiveCampaignFiles(sessionId, fileInput);
  const select = await tibWaitFor(() => {
    const previews = [...dialog.querySelectorAll("#imageDropzone .dz-preview")]
      .slice(previewCountBefore);
    const selectedCount = dialog.querySelectorAll(".layer-listing__checkbox:checked").length;
    const button = dialog.querySelector('button[title="Select"]');
    const buttonCount = Number(tibText(button?.innerText).match(/select\s+(\d+)\s+images?/i)?.[1] || 0);
    const uploadComplete = previews.length >= count &&
      previews.slice(0, count).every((preview) => preview.classList.contains("dz-complete"));
    return uploadComplete && selectedCount === count && buttonCount === count && !button.disabled
      ? button
      : null;
  }, 120000, 500);
  if (!select) throw new Error(`TeeInBlue chưa upload và auto-select đủ ${count} mockup.`);
  select.click();
  await tibWaitFor(() => !tibMockupDialog(), 10000);
  return { ok: true, count, selected: count };
}

function tibNormalize(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function tibFieldDescription(field, index) {
  const id = field.id || "";
  const directLabel = id
    ? document.querySelector(`label[for="${CSS.escape(id)}"]`)
    : null;
  const container = field.closest(
    "label, .ant-form-item, .form-group, [class*=field], [class*=option], [class*=setting]"
  );
  const labelText = tibNormalize(
    directLabel?.textContent ||
      container?.querySelector?.("label")?.textContent ||
      field.getAttribute("aria-label") ||
      field.getAttribute("placeholder") ||
      field.name ||
      field.id
  );
  const hint = [field.name, field.id, field.getAttribute("placeholder"), labelText]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  const kind = /placeholder/.test(hint)
    ? "Placeholder"
    : /option[\s_-]*title|title/.test(hint)
      ? "Option title"
      : /label/.test(hint)
        ? "Label"
        : "Text field";
  return {
    kind,
    label: labelText || `${kind} ${index + 1}`
  };
}

function tibReplaceLiteral(value, find, replacement, caseSensitive) {
  if (!find) return value;
  if (caseSensitive) return String(value).split(find).join(replacement);
  return String(value).replace(
    new RegExp(find.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi"),
    replacement
  );
}

const tibWait = (milliseconds) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

function tibEditableFields() {
  return [
    ...document.querySelectorAll(
      'input:not([type]), input[type="text"], input[type="search"], textarea'
    )
  ].filter((field) => !field.disabled && !field.readOnly);
}

function tibVisible(element) {
  const rect = element?.getBoundingClientRect?.();
  const style = element ? getComputedStyle(element) : null;
  return Boolean(
    rect &&
      rect.width > 4 &&
      rect.height > 4 &&
      style?.display !== "none" &&
      style?.visibility !== "hidden"
  );
}

function tibLayerLabel(row) {
  const teeinblueName = [
    ...(row.querySelectorAll?.(
      ".artwork-sortable-layer-name .text-truncate"
    ) || [])
  ].find((element) => element.closest(".artwork-sortable-layer") === row);
  const named = row.querySelector?.(
    '[class*=name], [class*=title], [class*=label], [data-layer-name]'
  );
  const text = tibNormalize(
    teeinblueName?.textContent ||
      named?.getAttribute?.("data-layer-name") ||
      named?.textContent ||
      row.getAttribute?.("data-layer-name") ||
      row.innerText ||
      row.textContent
  );
  return text.slice(0, 120);
}

function tibLayerEditButton(row) {
  return [...row.querySelectorAll("button#manage-layer")].find(
    (button) =>
      button.closest(".artwork-sortable-layer") === row &&
      Boolean(button.querySelector("i.la-pen"))
  );
}

function tibLayerRows() {
  return [...document.querySelectorAll(".artwork-sortable-layer")]
    .filter((row) => Boolean(tibLayerEditButton(row)))
    .map((row, index) => ({
      row,
      index,
      id: row.id || row.getAttribute("data-layer-id") || "",
      label: tibLayerLabel(row)
    }))
    .filter(({ label }) => Boolean(label));
}

function tibPersonalizationPanel() {
  return [...document.querySelectorAll(".layer-option-wrapper .layer-panel")].find(
    (panel) =>
      /Personalization Settings/i.test(
        panel.querySelector(".layer-panel__header")?.textContent || ""
      )
  );
}

async function tibOpenPersonalizationSettings() {
  let panel = tibPersonalizationPanel();
  if (!panel) return false;
  if (!panel.classList.contains("layer-panel--active")) {
    panel.querySelector(".layer-panel__header")?.click();
  }
  const deadline = Date.now() + 1600;
  while (Date.now() < deadline) {
    panel = tibPersonalizationPanel();
    if (panel?.classList.contains("layer-panel--active")) return true;
    await tibWait(80);
  }
  return false;
}

function tibPersonalizationOptionTitleField() {
  const panel = tibPersonalizationPanel();
  if (!panel?.classList.contains("layer-panel--active")) return null;
  return panel.querySelector('input[name="form_label"]');
}

async function tibLayerDescriptors() {
  const counts = new Map();
  const rows = tibLayerRows();
  return rows.map(({ row, index, id, label }) => {
    const occurrence = counts.get(label) || 0;
    counts.set(label, occurrence + 1);
    const ancestors = [];
    let parentLayer = row.parentElement?.closest(".artwork-sortable-layer");
    while (parentLayer) {
      const parentLabel = tibLayerLabel(parentLayer);
      if (parentLabel) ancestors.push(parentLabel);
      parentLayer = parentLayer.parentElement?.closest(".artwork-sortable-layer");
    }
    const path = [...ancestors].reverse();
    return {
      label,
      occurrence,
      index,
      id,
      ancestors,
      path,
      displayLabel: path.length ? `${path.join(" / ")} / ${label}` : label
    };
  });
}

function tibFindLayerRow(descriptor) {
  const rows = tibLayerRows();
  if (descriptor.id) {
    const byId = rows.find((item) => item.id === descriptor.id);
    if (byId) return byId.row;
  }
  const sameLabel = rows.filter((item) => item.label === descriptor.label);
  if (descriptor.path?.length) {
    const byPath = sameLabel.find((item) => {
      const ancestors = [];
      let parent = item.row.parentElement?.closest(".artwork-sortable-layer");
      while (parent) {
        const parentLabel = tibLayerLabel(parent);
        if (parentLabel) ancestors.push(parentLabel);
        parent = parent.parentElement?.closest(".artwork-sortable-layer");
      }
      ancestors.reverse();
      return ancestors.length === descriptor.path.length &&
        ancestors.every((value, index) =>
          tibSmartComparable(value) === tibSmartComparable(descriptor.path[index])
        );
    });
    if (byPath) return byPath.row;
  }
  if (sameLabel[descriptor.occurrence]) return sameLabel[descriptor.occurrence].row;
  if (Number.isInteger(descriptor.index) && rows[descriptor.index]) {
    return rows[descriptor.index].row;
  }
  return sameLabel[0]?.row;
}

async function tibActivateLayer(descriptor) {
  if (!descriptor) return true;
  const row = tibFindLayerRow(descriptor);
  if (!row) return false;
  row.scrollIntoView({ block: "center", inline: "nearest" });
  const editButton = tibLayerEditButton(row);
  if (!editButton) return false;
  editButton.dispatchEvent(
    new MouseEvent("mousedown", { bubbles: true, composed: true })
  );
  editButton.dispatchEvent(
    new MouseEvent("mouseup", { bubbles: true, composed: true })
  );
  editButton.click();
  await tibWait(420);
  return tibOpenPersonalizationSettings();
}

async function tibActivateLayerEditor(descriptor) {
  // TeeInBlue re-renders the layer tree after every edit click. On slower
  // machines the next scan can otherwise inspect the previous layer's panel.
  // Re-resolve the row and retry the click until the editor surface exists.
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const row = tibFindLayerRow(descriptor);
    if (!row) {
      await tibWait(220 * attempt);
      continue;
    }
    row.scrollIntoView({ block: "center", inline: "nearest" });
    const editButton = tibLayerEditButton(row);
    if (!editButton) {
      await tibWait(220 * attempt);
      continue;
    }
    editButton.dispatchEvent(
      new MouseEvent("mousedown", { bubbles: true, composed: true })
    );
    editButton.dispatchEvent(
      new MouseEvent("mouseup", { bubbles: true, composed: true })
    );
    editButton.click();
    const ready = await tibWaitFor(
      () => tibConditionalPanel() || document.querySelector(".layer-option-wrapper"),
      2200,
      90
    );
    if (ready) {
      await tibWait(180);
      return true;
    }
    await tibWait(220 * attempt);
  }
  return false;
}

function tibSmartSourceOptions() {
  return [...document.querySelectorAll(".tee-field")]
    .map((field, index) => {
      const title = tibNormalize(
        field.querySelector(".tee-field__heading")?.textContent
      ).replace(/\*+$/, "").trim();
      const ownerId = [...field.classList]
        .find((name) => name.startsWith("tee-field--layer-"))
        ?.replace("tee-field--layer-", "");
      const values = [
        ...new Set(
          [
            ...field.querySelectorAll(
              ".tee-clipart-label[data-title], .tee-clipart-label img[alt]"
            )
          ]
            .map(
              (element) =>
                element.getAttribute("data-title") || element.getAttribute("alt")
            )
            .map(tibNormalize)
            .filter(Boolean)
        )
      ];
      if (!values.length) {
        values.push(
          ...[
            ...field.querySelectorAll(
              'select option:not([disabled]), input[type="radio"] + label, input[type="checkbox"] + label'
            )
          ]
            .map((element) => tibNormalize(element.textContent))
            .filter(Boolean)
        );
      }
      return {
        key: ownerId ? `${ownerId}:${title}` : `field-${index}:${title}`,
        title,
        ownerId: ownerId || "",
        values: [...new Set(values)]
      };
    })
    .filter(
      (option) =>
        option.title &&
        option.values.length &&
        !/^template$/i.test(option.title)
    );
}

function tibAdditionalOptionSource(descriptor) {
  const panel = tibPersonalizationPanel();
  const additionalField = panel?.querySelector(".field__additional_option");
  if (!panel?.classList.contains("layer-panel--active") || !additionalField) {
    return null;
  }
  const title = tibNormalize(
    panel.querySelector('input[name="form_label"]')?.value || descriptor?.label
  );
  const category = tibNormalize(
    additionalField.querySelector(".vue3-treeselect__single-value strong")
      ?.textContent ||
      additionalField.querySelector(".field__extra-action .bg-dark h6")
        ?.textContent
  );
  const values = [
    ...new Set(
      [...additionalField.querySelectorAll(".field__extra-action .bg-dark li")]
        .map((item) => tibNormalize(item.textContent))
        .filter(Boolean)
    )
  ];
  if (!title || !values.length) return null;
  const row = tibFindLayerRow(descriptor);
  const ownerId = row?.id?.replace(/^artwork-sortable-layer-layer-/, "") || "";
  return {
    key: `additional-${ownerId || descriptor.occurrence}:${title}`,
    title,
    ownerId,
    category,
    values,
    sourceType: "additional-option"
  };
}

async function tibAdditionalOptionSources(layers) {
  const sources = [];
  for (const descriptor of layers) {
    if (!(await tibActivateLayer(descriptor))) continue;
    const source = tibAdditionalOptionSource(descriptor);
    if (source) sources.push(source);
  }
  return sources;
}

async function tibWaitForSmartSourcesV2(timeout = 7000, stableCycles = 3) {
  const deadline = Date.now() + timeout;
  let lastSignature = "";
  let stable = 0;
  let lastSources = [];
  while (Date.now() < deadline) {
    const sources = tibSmartSourceOptions();
    const signature = JSON.stringify(
      sources.map((source) => [source.key, source.title, source.values])
    );
    stable = sources.length && signature === lastSignature ? stable + 1 : sources.length ? 1 : 0;
    lastSignature = signature;
    lastSources = sources;
    if (sources.length && stable >= stableCycles) return sources;
    await tibWait(140);
  }
  return lastSources;
}

async function tibReloadPreviewSourcesV2() {
  let sources = await tibWaitForSmartSourcesV2(3000);
  if (sources.length) return sources;
  const reloadButton = [...document.querySelectorAll('button, a, [role="button"]')].find(
    (element) =>
      tibVisible(element) && /reload\s+preview/i.test(tibNormalize(element.textContent))
  );
  if (!reloadButton) return sources;
  reloadButton.click();
  sources = await tibWaitForSmartSourcesV2(10000);
  return sources;
}

async function tibAdditionalOptionSourcesV2(layers) {
  const sources = [];
  for (const descriptor of layers) {
    if (!(await tibActivateLayerEditor(descriptor))) continue;
    await tibWaitForEditorQuiet(4600, 400, 1100);
    if (!(await tibOpenPersonalizationSettings())) continue;
    const source = await tibWaitFor(
      () => tibAdditionalOptionSource(descriptor),
      2800,
      90
    );
    if (source) sources.push(source);
  }
  return sources;
}

function tibSmartSourceMatchCountV2(source, layers, rule = "contains") {
  return layers.reduce((count, layer) => {
    const direct = source.values.some((value) =>
      tibSmartMatchesV2(value, layer.label, rule)
    );
    const inherited = (layer.ancestors || []).some((ancestor) =>
      source.values.some((value) => tibSmartMatchesGroupV2(value, ancestor, rule))
    );
    return count + (direct || inherited ? 1 : 0);
  }, 0);
}

async function tibGetSmartSetupV2Sources({ rule = "contains" } = {}) {
  const layers = await tibLayerDescriptors();
  if (!layers.length) {
    return { ok: false, error: "Hãy mở đúng Artwork editor của TeeInBlue rồi thử lại." };
  }
  const previewSources = await tibReloadPreviewSourcesV2();
  const additionalSources = previewSources.length
    ? []
    : await tibAdditionalOptionSourcesV2(layers);
  const sources = tibMergeSmartSources(previewSources, additionalSources);
  if (!sources.length) {
    return {
      ok: false,
      error: "Không đọc được Option và Value trong Preview Options."
    };
  }
  const sourceOptions = sources
    .map((source) => ({
      key: source.key,
      title: source.title,
      valueCount: source.values.length,
      matchCount: tibSmartSourceMatchCountV2(source, layers, rule)
    }))
    .sort(
      (left, right) =>
        right.matchCount - left.matchCount || right.valueCount - left.valueCount
    );
  return { ok: true, sourceOptions, layerCount: layers.length };
}

function tibMergeSmartSources(...sourceGroups) {
  const merged = new Map();
  sourceGroups.flat().forEach((source) => {
    const identity = `${tibSmartComparable(source.title)}:${source.ownerId || ""}`;
    const current = merged.get(identity);
    if (!current) {
      merged.set(identity, source);
      return;
    }
    current.values = [...new Set([...current.values, ...source.values])];
    if (source.sourceType === "additional-option") {
      current.sourceType = source.sourceType;
      current.category = source.category;
    }
  });
  return [...merged.values()];
}

function tibSmartComparable(value) {
  return tibNormalize(value).toLocaleLowerCase();
}

function tibSmartMatches(optionValue, layerName, rule) {
  const option = tibSmartComparable(optionValue);
  const layer = tibSmartComparable(layerName);
  if (!option || !layer) return false;
  return rule === "contains"
    ? option.includes(layer) || layer.includes(option)
    : option === layer;
}

function tibSmartMatchesV2(optionValue, layerName, rule) {
  const option = tibSmartComparable(optionValue);
  const layer = tibSmartComparable(layerName);
  if (!option || !layer) return false;
  if (rule === "exact") return option === layer;
  const escaped = option.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[^a-z0-9])${escaped}($|[^a-z0-9])`, "i").test(layer);
}

function tibSmartMatchesGroupV2(optionValue, groupLabel, rule) {
  if (tibSmartMatchesV2(optionValue, groupLabel, rule)) return true;
  if (rule === "exact") return false;
  const optionNumber = tibSmartComparable(optionValue).match(/\d+/)?.[0];
  const groupNumber = tibSmartComparable(groupLabel).match(/\d+/)?.[0];
  return Boolean(
    optionNumber &&
      groupNumber &&
      Number(optionNumber) === Number(groupNumber)
  );
}

async function tibScanSmartSetup({ sourceKey = "", rule = "exact" } = {}) {
  tibSmartSetupPlan.clear();
  const layers = await tibLayerDescriptors();
  const previewSources = tibSmartSourceOptions();
  const additionalSources = await tibAdditionalOptionSources(layers);
  const sourceOptions = tibMergeSmartSources(previewSources, additionalSources);
  if (!sourceOptions.length) {
    return {
      ok: false,
      error: "Không tìm thấy Option và danh sách giá trị trong Preview TeeInBlue."
    };
  }
  const selectedSource =
    sourceOptions.find((option) => option.key === sourceKey) ||
    [...sourceOptions].sort((left, right) => right.values.length - left.values.length)[0];
  const mappingId = crypto.randomUUID();
  const mappings = [];
  const missing = [];
  const matchedLayerIndexes = new Set();
  const duplicateLayerIndexes = new Set();

  selectedSource.values.forEach((optionValue, optionIndex) => {
    const candidates = layers
      .map((layer, layerIndex) => ({ layer, layerIndex }))
      .filter(({ layer }) => tibSmartMatches(optionValue, layer.label, rule));
    if (!candidates.length) {
      missing.push({ option: optionValue, status: "missing" });
      return;
    }
    if (candidates.length > 1) {
      candidates.forEach(({ layerIndex }) => duplicateLayerIndexes.add(layerIndex));
    }
    candidates.forEach(({ layer, layerIndex }, candidateIndex) => {
      matchedLayerIndexes.add(layerIndex);
      const key = `${mappingId}:${optionIndex}:${candidateIndex}`;
      const entry = {
        key,
        option: optionValue,
        layer,
        source: selectedSource,
        status: candidates.length > 1 ? "duplicate" : "matched"
      };
      tibSmartSetupPlan.set(key, entry);
      mappings.push({
        key,
        option: optionValue,
        layer: layer.label,
        status: entry.status
      });
    });
  });

  const extras = layers
    .map((layer, layerIndex) => ({ layer: layer.label, layerIndex }))
    .filter(
      ({ layer, layerIndex }) =>
        !matchedLayerIndexes.has(layerIndex) &&
        tibSmartComparable(layer) !== tibSmartComparable(selectedSource.title)
    )
    .map(({ layer }) => ({ layer, status: "extra" }));

  return {
    ok: true,
    sourceOptions: sourceOptions.map(({ key, title, values }) => ({
      key,
      title,
      valueCount: values.length
    })),
    selectedSourceKey: selectedSource.key,
    selectedSourceTitle: selectedSource.title,
    rule: rule === "contains" ? "contains" : "exact",
    mappings,
    missing,
    extras,
    duplicateCount: mappings.filter((item) => item.status === "duplicate").length,
    layerCount: layers.length
  };
}

function tibConditionalPanel() {
  return [...document.querySelectorAll(".layer-option-wrapper .layer-panel")].find(
    (panel) =>
      /Conditional Setting/i.test(
        panel.querySelector(".layer-panel__header")?.textContent || ""
      )
  );
}

async function tibOpenConditionalSettings() {
  let panel = tibConditionalPanel();
  if (!panel) return null;
  if (!panel.classList.contains("layer-panel--active")) {
    panel.querySelector(".layer-panel__header")?.click();
  }
  const deadline = Date.now() + 1800;
  while (Date.now() < deadline) {
    panel = tibConditionalPanel();
    if (panel?.classList.contains("layer-panel--active")) return panel;
    await tibWait(90);
  }
  return null;
}

function tibConditionSource(block) {
  const single = block?.querySelector(".multiselect__single");
  const description = single?.querySelector(".option__desc");
  return {
    title: tibNormalize(
      description?.querySelector("div")?.textContent ||
        description?.textContent ||
        single?.textContent
    ),
    owner: tibNormalize(
      description?.querySelector("small")?.textContent || ""
    )
  };
}

function tibConditionSourceMatches(actual, expected) {
  const normalizeTitle = (value) =>
    tibSmartComparable(value).replace(/\s*\(\s*\d+\s*layers?\s*\)$/i, "");
  if (normalizeTitle(actual?.title) !== normalizeTitle(expected?.title)) return false;
  // TeeInBlue 2.0 uses a numeric layer id in Preview Options but the
  // Conditional Setting dropdown renders the owner/category label (for
  // example “MK PRE”). They are different identifiers for the same Option.
  // The normalized title is therefore the stable key; never reject a valid
  // source because those display-only owner strings differ.
  return true;
}

function tibConditionOptionMatches(option, expected) {
  const description = option?.querySelector(".option__desc");
  const title = tibNormalize(
    description?.querySelector("div")?.textContent ||
      description?.textContent ||
      option?.textContent
  );
  const owner = tibNormalize(description?.querySelector("small")?.textContent);
  return tibConditionSourceMatches(
    { title, owner },
    expected
  );
}

function tibVisibleConditionOptions(multiselect) {
  const local = [...(multiselect?.querySelectorAll(".multiselect__option") || [])];
  const global = [...document.querySelectorAll(".multiselect__option")];
  return [...new Set([...local, ...global])].filter((option) => {
    const style = window.getComputedStyle(option);
    return style.display !== "none" && style.visibility !== "hidden";
  });
}

async function tibWaitFor(check, timeout = 4000, interval = 80) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const result = check();
    if (result) return result;
    await tibWait(interval);
  }
  return null;
}

async function tibWaitForEditorQuiet(timeout = 4200, quietWindow = 450, minimumWait = 1650) {
  const root = document.querySelector(".layer-option-wrapper");
  if (!root) return false;
  return new Promise((resolve) => {
    let settled = false;
    let quietTimer;
    const earliest = Date.now() + minimumWait;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      clearTimeout(quietTimer);
      clearTimeout(deadlineTimer);
      observer.disconnect();
      resolve(result);
    };
    const armQuietWindow = () => {
      clearTimeout(quietTimer);
      quietTimer = setTimeout(
        () => finish(true),
        Math.max(quietWindow, earliest - Date.now())
      );
    };
    const observer = new MutationObserver(armQuietWindow);
    const deadlineTimer = setTimeout(() => finish(false), timeout);
    observer.observe(root, { childList: true, subtree: true, attributes: true });
    armQuietWindow();
  });
}

async function tibWaitForConditionValueControl(panel, source) {
  return tibWaitFor(
    () => {
      const liveBlock = [...panel.querySelectorAll(".bg-dark")].find(
        (item) => tibConditionSourceMatches(tibConditionSource(item), source)
      );
      if (!liveBlock) return null;
      const hasImageChoices = Boolean(
        liveBlock.querySelector('.radio-image input[type="checkbox"]')
      );
      const hasAdditionalChoices =
        liveBlock.querySelectorAll(".multiselect").length > 1;
      return hasImageChoices || hasAdditionalChoices ? liveBlock : null;
    },
    5500,
    70
  );
}

async function tibSelectConditionSource(block, source) {
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    if (tibConditionSourceMatches(tibConditionSource(block), source)) return true;
    const multiselect = block.querySelector(".multiselect");
    const trigger = multiselect?.querySelector(".multiselect__input");
    if (!trigger) return false;
    trigger.focus();
    trigger.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    trigger.click();
    const match = await tibWaitFor(
      () => tibVisibleConditionOptions(multiselect).find((option) =>
        tibConditionOptionMatches(option, source)
      ),
      2600,
      90
    );
    if (match) {
      if (match.classList.contains("multiselect__option--selected")) {
        const settled = await tibWaitFor(
          () => tibConditionSourceMatches(tibConditionSource(block), source),
          1400
        );
        if (settled) return true;
      } else {
        match.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
        match.click();
      }
    }
    const selected = await tibWaitFor(
      () => tibConditionSourceMatches(tibConditionSource(block), source),
      4500
    );
    if (selected) return true;
    await tibWait(180 * attempt);
  }
  return false;
}

async function tibSetConditionValue(block, optionValue) {
  // TeeInBlue fetches clipart values after selecting the source Option. On a
  // cold machine this request regularly needs 2-5 seconds, so do not treat a
  // still-loading list as a failed Condition.
  const deadline = Date.now() + 10000;
  let choices = [];
  while (Date.now() < deadline) {
    choices = [...block.querySelectorAll('.radio-image input[type="checkbox"]')];
    const valueMultiselects = [...block.querySelectorAll(".multiselect")];
    if (choices.length || valueMultiselects.length > 1) break;
    await tibWait(100);
  }
  if (!choices.length) {
    const valueMultiselect = [...block.querySelectorAll(".multiselect")][1];
    if (!valueMultiselect) return false;
    const wantedValue = tibSmartComparable(optionValue);
    // Each tag removal makes Vue replace the tags subtree. Always reacquire
    // the live node before the next click; otherwise duplicate layers keep
    // stale values and the extension reports a false success.
    for (let removal = 0; removal < 40; removal += 1) {
      const liveTags = [
        ...valueMultiselect.querySelectorAll(".multiselect__tag")
      ];
      const unwanted = liveTags.find(
        (tag) => tibSmartComparable(tag.querySelector("span")?.textContent) !== wantedValue
      );
      if (!unwanted) break;
      const remove = unwanted.querySelector(".multiselect__tag-icon");
      if (!remove) return false;
      remove.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
      remove.click();
      const removed = await tibWaitFor(
        () =>
          ![...valueMultiselect.querySelectorAll(".multiselect__tag")].some(
            (tag) => tag === unwanted
          ),
        1400,
        35
      );
      if (!removed) return false;
    }
    const exactCurrentValue = () => {
      const values = [...valueMultiselect.querySelectorAll(".multiselect__tag")]
        .map((tag) => tibSmartComparable(tag.querySelector("span")?.textContent));
      return values.length === 1 && values[0] === wantedValue;
    };
    if (exactCurrentValue()) return true;
    const trigger = valueMultiselect.querySelector(".multiselect__input");
    if (!trigger) return false;
    trigger.focus();
    trigger.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    trigger.click();
    const wantedOption = await tibWaitFor(
      () =>
        [...valueMultiselect.querySelectorAll(".multiselect__option")].find(
          (option) =>
            tibSmartComparable(option.textContent) ===
            tibSmartComparable(optionValue)
        ),
      4500
    );
    if (!wantedOption) return false;
    wantedOption.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    wantedOption.click();
    return Boolean(await tibWaitFor(exactCurrentValue, 2600));
  }
  const wanted = choices.find((input) => {
    const label = block.querySelector(`label[for="${CSS.escape(input.id)}"]`);
    return (
      tibSmartComparable(label?.getAttribute("data-title")) ===
        tibSmartComparable(optionValue) ||
      tibSmartComparable(label?.querySelector("img")?.getAttribute("alt")) ===
        tibSmartComparable(optionValue)
    );
  });
  if (!wanted) return false;
  for (const input of choices) {
    const shouldCheck = input === wanted;
    if (input.checked !== shouldCheck) {
      input.click();
      await tibWait(45);
    }
  }
  return Boolean(
    await tibWaitFor(() => {
      const currentChoices = [
        ...block.querySelectorAll('.radio-image input[type="checkbox"]')
      ];
      const checked = currentChoices.filter((input) => input.checked);
      if (checked.length !== 1) return false;
      const checkedLabel = block.querySelector(
        `label[for="${CSS.escape(checked[0].id)}"]`
      );
      const selectedValue =
        checkedLabel?.getAttribute("data-title") ||
        checkedLabel?.querySelector("img")?.getAttribute("alt");
      return (
        tibSmartComparable(selectedValue) === tibSmartComparable(optionValue)
      );
    }, 2600)
  );
}

function tibConditionSelectedValues(block) {
  const values = [];
  block?.querySelectorAll(".multiselect__tag span").forEach((element) => {
    const value = tibNormalize(element.textContent);
    if (value) values.push(value);
  });
  block
    ?.querySelectorAll('input[type="checkbox"]:checked')
    .forEach((input) => {
      const label = input.id
        ? (block.querySelector(`label[for="${CSS.escape(input.id)}"]`) ||
          document.querySelector(`label[for="${CSS.escape(input.id)}"]`))
        : input.closest("label");
      const value = tibNormalize(
        input.getAttribute("data-title") ||
          input.getAttribute("data-value") ||
        label?.getAttribute("data-title") ||
          label?.getAttribute("data-value") ||
          label?.querySelector("img")?.getAttribute("alt") ||
          label?.textContent ||
          (/^(on|true)$/i.test(input.value || "") ? "" : input.value)
      );
      if (value) values.push(value);
    });
  return [...new Set(values)];
}

function tibConditionChoiceValue(block, input) {
  const label = input?.id
    ? (block?.querySelector(`label[for="${CSS.escape(input.id)}"]`) ||
      document.querySelector(`label[for="${CSS.escape(input.id)}"]`))
    : input?.closest("label");
  return tibNormalize(
    input?.getAttribute("data-title") ||
      input?.getAttribute("data-value") ||
      label?.getAttribute("data-title") ||
      label?.getAttribute("data-value") ||
      label?.querySelector("img")?.getAttribute("alt") ||
      label?.textContent ||
      (/^(on|true)$/i.test(input?.value || "") ? "" : input?.value)
  );
}

function tibConditionChoiceMatches(actual, wanted) {
  const left = tibSmartComparable(actual);
  const right = tibSmartComparable(wanted);
  if (left === right) return true;
  const leftNumber = left.match(/^0*(\d+)\b/)?.[1];
  const rightNumber = right.match(/^0*(\d+)\b/)?.[1];
  return Boolean(leftNumber && rightNumber && Number(leftNumber) === Number(rightNumber));
}

function tibConditionJoinMode(panel) {
  const checked = [...(panel?.querySelectorAll('input[type="radio"]') || [])].find(
    (input) => input.checked
  );
  if (!checked) return "and";
  const label = checked.id
    ? panel.querySelector(`label[for="${CSS.escape(checked.id)}"]`)
    : null;
  const text = tibNormalize(label?.textContent || checked.parentElement?.textContent);
  return /Any conditions|\bOR\b/i.test(text) ? "or" : "and";
}

function tibConditionSnapshot(panel) {
  const conditions = [...(panel?.querySelectorAll(".bg-dark") || [])]
    .map((block) => {
      const source = tibConditionSource(block);
      return {
        source: source.title,
        owner: source.owner,
        values: tibConditionSelectedValues(block)
      };
    })
    .filter((condition) => condition.source);
  return { join: tibConditionJoinMode(panel), conditions };
}

function tibConditionSnapshotSignature(snapshot) {
  return JSON.stringify({
    join: snapshot?.join || "and",
    conditions: (snapshot?.conditions || [])
      .map((condition) => ({
        source: tibSmartComparable(condition.source),
        values: (condition.values || []).map(tibSmartComparable).sort()
      }))
      .sort((left, right) => left.source.localeCompare(right.source))
  });
}

function tibConditionGroupsToText(groups = [], join = "and") {
  const parts = groups.map((group) => {
    const values = (group.values || []).join(" OR ");
    return `${group.source} = ${values}`;
  });
  return parts.join(join === "or" ? " OR " : " AND ") || "—";
}

function tibMergeConditionGroups(existing = [], suggested = []) {
  const groups = new Map();
  [...existing, ...suggested].forEach((group) => {
    const identity = tibSmartComparable(group.source);
    if (!identity) return;
    const current = groups.get(identity) || {
      source: group.source,
      owner: group.owner || "",
      values: []
    };
    current.values = [
      ...new Set([...(current.values || []), ...(group.values || [])].filter(Boolean))
    ];
    groups.set(identity, current);
  });
  return [...groups.values()];
}

async function tibSetConditionValuesV2(block, optionValues = []) {
  const wantedValues = [...new Set(optionValues.map(tibNormalize).filter(Boolean))];
  if (!wantedValues.length) return true;
  const deadline = Date.now() + 10000;
  let choices = [];
  while (Date.now() < deadline) {
    choices = [...block.querySelectorAll('input[type="checkbox"]')].filter(
      (input) => tibConditionChoiceValue(block, input)
    );
    if (choices.length || block.querySelectorAll(".multiselect").length > 1) break;
    await tibWait(100);
  }
  if (choices.length) {
    // TeeInBlue often preselects the first image (usually 001) when a new
    // condition block is created. Clear that default before applying the
    // requested Value set, otherwise 006 becomes 001 + 006 and verification
    // correctly rejects the condition as mismatched.
    for (const input of choices) {
      if (!input.checked) continue;
      input.click();
      await tibWait(45);
    }
    for (const wantedValue of wantedValues) {
      const wanted = choices.find((input) =>
        tibConditionChoiceMatches(tibConditionChoiceValue(block, input), wantedValue)
      );
      if (!wanted) return false;
      if (!wanted.checked) {
        wanted.click();
        await tibWait(55);
      }
    }
    return Boolean(await tibWaitFor(() => {
      const selected = tibConditionSelectedValues(block).map(tibSmartComparable);
      return selected.length === wantedValues.length &&
        wantedValues.every((value) => selected.includes(tibSmartComparable(value)));
    }, 2600));
  }

  const valueMultiselect = [...block.querySelectorAll(".multiselect")][1];
  if (!valueMultiselect) return false;
  for (const wantedValue of wantedValues) {
    const hasValue = () =>
      tibConditionSelectedValues(block)
        .map(tibSmartComparable)
        .includes(tibSmartComparable(wantedValue));
    if (hasValue()) continue;
    const trigger = valueMultiselect.querySelector(".multiselect__input");
    if (!trigger) return false;
    trigger.focus();
    trigger.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    trigger.click();
    const option = await tibWaitFor(
      () =>
        [...new Set([
          ...valueMultiselect.querySelectorAll(".multiselect__option"),
          ...document.querySelectorAll(".multiselect__option")
        ])].find((item) => tibConditionChoiceMatches(item.textContent, wantedValue)),
      4500
    );
    if (!option) return false;
    option.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    option.click();
    if (!(await tibWaitFor(hasValue, 2600))) return false;
  }
  return true;
}

async function tibRemoveAllConditionBlocks(panel) {
  let guard = 0;
  while (guard < 30) {
    const blocks = [...panel.querySelectorAll(".bg-dark")];
    if (!blocks.length) return true;
    const removeButton = blocks[0].querySelector("button.repeater-remove");
    if (!removeButton) return false;
    const before = blocks.length;
    removeButton.click();
    const removed = await tibWaitFor(
      () => panel.querySelectorAll(".bg-dark").length < before,
      2200,
      70
    );
    if (!removed) return false;
    guard += 1;
  }
  return panel.querySelectorAll(".bg-dark").length === 0;
}

async function tibEnsureConditionJoinMode(panel, conditionCount, joinMode = "and") {
  const radios = [...panel.querySelectorAll('input[type="radio"]')];
  const wantedMode = joinMode === "or" ? "or" : "and";
  const wantedRadio = radios.find((input) => {
    const label = input.id
      ? panel.querySelector(`label[for="${CSS.escape(input.id)}"]`)
      : null;
    const text = tibNormalize(label?.textContent || input.parentElement?.textContent);
    return wantedMode === "or"
      ? /Any conditions|\bOR\b/i.test(text)
      : /All conditions|\bAND\b/i.test(text);
  });
  if (!wantedRadio) return false;
  if (!wantedRadio.checked) wantedRadio.click();
  return Boolean(await tibWaitFor(() => wantedRadio.checked, 1400));
}

async function tibScanSmartSetupV2({
  rule = "contains",
  primarySourceKey = "",
  additionalSourceKeys = [],
  joinMode = "and"
} = {}) {
  tibSmartSetupV2Plan.clear();
  const layers = await tibLayerDescriptors();
  if (!layers.length) {
    return {
      ok: false,
      error: "Hãy mở đúng Artwork editor của TeeInBlue rồi Scan lại."
    };
  }
  const previewSources = await tibReloadPreviewSourcesV2();
  const additionalSources = previewSources.length
    ? []
    : await tibAdditionalOptionSourcesV2(layers);
  const sources = tibMergeSmartSources(previewSources, additionalSources);
  if (!sources.length) {
    return {
      ok: false,
      error:
        "Preview Options chưa tải xong hoặc Artwork không có Category/Option chứa Value. Hãy mở Preview Options rồi Scan lại."
    };
  }

  const sourceOptions = sources
    .map((source) => ({
      source,
      directMatchCount: layers.filter((layer) =>
        source.values.some((value) =>
          tibSmartMatchesV2(value, layer.label, rule)
        )
      ).length
    }))
    .sort(
      (left, right) =>
        right.directMatchCount - left.directMatchCount ||
        right.source.values.length - left.source.values.length
    );
  const primarySource =
    sources.find((source) => source.key === primarySourceKey) ||
    sourceOptions[0]?.source;
  if (!primarySource) {
    return { ok: false, error: "Hãy chọn Option điều kiện chính." };
  }
  const additionalKeySet = new Set(
    (additionalSourceKeys || []).map(String).filter(Boolean)
  );
  additionalKeySet.delete(primarySource.key);
  const selectedAdditionalSources = sources.filter((source) =>
    additionalKeySet.has(source.key)
  );

  const rawRows = layers
    .map((layer) => {
      const primaryValues = primarySource.values.filter((value) =>
        tibSmartMatchesV2(value, layer.label, rule)
      );
      if (!primaryValues.length) return { layer, suggestions: [] };
      const suggestions = [
        {
          source: primarySource.title,
          owner: primarySource.ownerId || "",
          sourceData: primarySource,
          values: primaryValues
        }
      ];
      const missingAdditional = [];
      selectedAdditionalSources.forEach((source) => {
        const values = source.values.filter((value) =>
          (layer.ancestors || []).some((ancestor) =>
            tibSmartMatchesGroupV2(value, ancestor, rule)
          )
        );
        if (!values.length) {
          missingAdditional.push(source.title);
          return;
        }
        suggestions.push({
          source: source.title,
          owner: source.ownerId || "",
          sourceData: source,
          values
        });
      });
      return { layer, suggestions, missingAdditional };
    })
    .filter((row) => row.suggestions.length);

  const mappingId = crypto.randomUUID();
  const rows = [];
  for (let index = 0; index < rawRows.length; index += 1) {
    const row = rawRows[index];
    const key = `${mappingId}:${index}`;
    let snapshot = { join: "and", conditions: [] };
    let scanError = row.missingAdditional?.length
      ? `Không tìm được Value theo group cha cho: ${row.missingAdditional.join(", ")}.`
      : "";
    if (!(await tibActivateLayerEditor(row.layer))) {
      scanError = `Không mở được layer "${row.layer.displayLabel || row.layer.label}".`;
    } else {
      await tibWaitForEditorQuiet();
      const panel = await tibOpenConditionalSettings();
      if (panel) snapshot = tibConditionSnapshot(panel);
      else scanError = "Không đọc được Conditional Setting.";
    }
    const existing = snapshot.conditions.map((condition) => ({
      source: condition.source,
      owner: condition.owner,
      values: condition.values
    }));
    const finalGroups = row.suggestions.map((group) => ({
      source: group.source,
      owner: group.owner || "",
      sourceData: group.sourceData || null,
      values: [...group.values]
    }));
    const suggestionOwners = new Map();
    row.suggestions.forEach((group) =>
      group.values.forEach((value) => {
        const identity = tibSmartComparable(value);
        const owners = suggestionOwners.get(identity) || new Set();
        owners.add(tibSmartComparable(group.source));
        suggestionOwners.set(identity, owners);
      })
    );
    const ambiguousValues = [...suggestionOwners.entries()]
      .filter(([, owners]) => owners.size > 1)
      .map(([value]) => value);
    const finalSnapshot = {
      join: joinMode === "or" ? "or" : "and",
      conditions: finalGroups
    };
    let action = !existing.length
      ? "new"
      : tibConditionSnapshotSignature(snapshot) ===
          tibConditionSnapshotSignature(finalSnapshot)
        ? "skip"
        : "replace";
    // A value repeated across different Categories is valid for AND:
    // Frame=003 AND Style=003 is an intentional intersection. It is only
    // ambiguous under OR, where the same value could come from either source.
    const ambiguousForJoin =
      finalSnapshot.join === "or" && ambiguousValues.length > 0;
    if (scanError || ambiguousForJoin) {
      action = "conflict";
    }
    const confidence = rule === "exact" ? 100 : 85;
    const plan = {
      key,
      layer: row.layer,
      suggestions: row.suggestions,
      existingSnapshot: snapshot,
      existingSignature: tibConditionSnapshotSignature(snapshot),
      finalGroups,
      joinMode: finalSnapshot.join,
      action,
      confidence,
      error:
        scanError ||
        (ambiguousForJoin
          ? `Value trùng ở nhiều Category: ${ambiguousValues.join(", ")}.`
          : action === "conflict"
            ? "Condition hiện tại dùng OR giữa nhiều Category."
            : "")
    };
    tibSmartSetupV2Plan.set(key, plan);
    rows.push({
      key,
        layer: row.layer.displayLabel || row.layer.label,
        layerId: row.layer.id || "",
        layerPath: row.layer.path || [],
        layerName: row.layer.label,
      existing: tibConditionGroupsToText(existing, snapshot.join),
      suggestion: tibConditionGroupsToText(row.suggestions, finalSnapshot.join),
      final: tibConditionGroupsToText(finalGroups, finalSnapshot.join),
      action,
      confidence,
      error: plan.error
    });
  }

  return {
    ok: true,
    rows,
    layerCount: layers.length,
    sourceCount: sources.length,
    safeCount: rows.filter((row) => ["new", "replace"].includes(row.action)).length,
    conflictCount: rows.filter((row) => row.action === "conflict").length,
    skipCount: rows.filter((row) => row.action === "skip").length,
    rule: rule === "exact" ? "exact" : "contains",
    joinMode: joinMode === "or" ? "or" : "and",
    sourceOptions: sourceOptions.map(({ source, directMatchCount }) => ({
      key: source.key,
      title: source.title,
      valueCount: source.values.length,
      matchCount: directMatchCount
    })),
    selectedPrimarySourceKey: primarySource.key,
    selectedPrimarySourceTitle: primarySource.title,
    selectedAdditionalSourceKeys: selectedAdditionalSources.map(
      (source) => source.key
    ),
    selectedAdditionalSourceTitles: selectedAdditionalSources.map(
      (source) => source.title
    )
  };
}

async function tibApplySmartSetupV2(keys = []) {
  const updated = [];
  const failed = [];
  for (const key of [...new Set(keys.map(String))]) {
    const entry = tibSmartSetupV2Plan.get(key);
    if (!entry || !["new", "replace"].includes(entry.action)) {
      failed.push({ key, error: "Dòng không còn an toàn để Apply. Hãy Scan lại." });
      continue;
    }
    try {
      if (!(await tibActivateLayerEditor(entry.layer))) {
        throw new Error(`Không mở được layer "${entry.layer.label}".`);
      }
      await tibWaitForEditorQuiet();
      const panel = await tibOpenConditionalSettings();
      if (!panel) throw new Error("Không mở được Conditional Setting.");
      const liveSnapshot = tibConditionSnapshot(panel);
      // Switching layers in TeeInBlue 2.0 rehydrates the Condition panel and
      // can change transient DOM ordering/default selections after Scan. Do
      // not block a planned Apply on that false-positive; the final snapshot
      // below remains the authoritative verification.
      const conditionChangedAfterScan =
        tibConditionSnapshotSignature(liveSnapshot) !== entry.existingSignature;

      if (!(await tibRemoveAllConditionBlocks(panel))) {
        throw new Error("Không xóa được Condition cũ của layer.");
      }

      for (const group of entry.finalGroups) {
        let blocks = [...panel.querySelectorAll(".bg-dark")];
        let block = blocks.find(
          (item) => tibConditionSourceMatches(tibConditionSource(item), group)
        );
        block ||= blocks.find((item) => !tibConditionSource(item).title);
        if (!block) {
          const addButton = [...panel.querySelectorAll("button")].find((button) =>
            /Add conditions/i.test(button.textContent || "")
          );
          if (!addButton) throw new Error("Không tìm thấy nút Add conditions.");
          addButton.click();
          await tibWait(260);
          blocks = [...panel.querySelectorAll(".bg-dark")];
          block = blocks[blocks.length - 1];
        }
        const sourceData = group.sourceData || {
          title: group.source,
          ownerId: group.owner || "",
          values: [...group.values]
        };
        const sourceReady = await tibSelectConditionSource(block, sourceData);
        if (!sourceReady) {
          throw new Error(`Không chọn được Category "${group.source}".`);
        }
        block = await tibWaitForConditionValueControl(panel, sourceData);
        if (!block) throw new Error(`Category "${group.source}" chưa tải Value.`);
        if (!(await tibSetConditionValuesV2(block, group.values))) {
          throw new Error(
            `Không xác nhận đủ Value: ${group.source} → ${group.values.join(", ")}.`
          );
        }
      }

      const finalSourceCount = entry.finalGroups.length;
      if (!(await tibEnsureConditionJoinMode(panel, finalSourceCount, entry.joinMode))) {
        throw new Error(
          `Không xác nhận được logic ${entry.joinMode.toUpperCase()} giữa các Category.`
        );
      }
      const verified = tibConditionSnapshot(panel);
      const expected = {
        join: entry.joinMode,
        conditions: entry.finalGroups
      };
      if (
        tibConditionSnapshotSignature(verified) !==
        tibConditionSnapshotSignature(expected)
      ) {
        throw new Error("TeeInBlue chưa thay thế đúng toàn bộ Final Condition của layer.");
      }
      updated.push({
        key,
        layer: entry.layer.displayLabel || entry.layer.label,
        conditionCount: finalSourceCount,
        conditionChangedAfterScan
      });
    } catch (error) {
      failed.push({ key, error: error?.message || String(error) });
    }
  }
  return { ok: failed.length === 0, updated, failed };
}

async function tibApplySmartSetup(keys = []) {
  const updated = [];
  const failed = [];
  for (const key of [...new Set(keys.map(String))]) {
    const entry = tibSmartSetupPlan.get(key);
    if (!entry) {
      failed.push({ key, error: "Preview đã cũ. Hãy quét lại Smart Setup." });
      continue;
    }
    try {
      if (!(await tibActivateLayerEditor(entry.layer))) {
        throw new Error(`Không mở được layer "${entry.layer.label}".`);
      }
      await tibWaitForEditorQuiet();
      const panel = await tibOpenConditionalSettings();
      if (!panel) throw new Error("Không mở được Conditional Setting.");
      let blocks = [...panel.querySelectorAll(".bg-dark")];
      let block = blocks.find(
        (item) => tibConditionSourceMatches(tibConditionSource(item), entry.source)
      );
      // Reuse a blank Condition left by a previous interrupted/slow run.
      block ||= blocks.find((item) => !tibConditionSource(item).title);
      let created = false;
      if (!block) {
        const addButton = [...panel.querySelectorAll("button")].find((button) =>
          /Add conditions/i.test(button.textContent || "")
        );
        if (!addButton) throw new Error("Không tìm thấy nút Add conditions.");
        addButton.click();
        await tibWait(260);
        blocks = [...panel.querySelectorAll(".bg-dark")];
        block = blocks[blocks.length - 1];
        created = true;
      }
      let applied = false;
      for (let attempt = 1; attempt <= 2 && block; attempt += 1) {
        const sourceReady = await tibSelectConditionSource(block, entry.source);
        if (sourceReady) {
          // TeeInBlue replaces the row and loads its values asynchronously.
          block = await tibWaitForConditionValueControl(panel, entry.source);
          if (!block) {
            await tibWait(120 * attempt);
            continue;
          }
          const valueReady = await tibSetConditionValue(block, entry.option);
          if (valueReady) {
            applied = true;
            break;
          }
        }
        await tibWait(140 * attempt);
      }
      if (!applied) {
        if (created) block?.querySelector("button.repeater-remove")?.click();
        throw new Error(
          `Không xác nhận được Condition "${entry.source.title}" → "${entry.option}" sau 2 lần thử.`
        );
      }
      updated.push({ key, option: entry.option, layer: entry.layer.label });
    } catch (error) {
      failed.push({ key, error: error?.message || String(error) });
    }
  }
  return { ok: failed.length === 0, updated, failed };
}

function tibFindStoredField(entry) {
  if (entry.field?.isConnected && String(entry.field.value) === entry.before) {
    return entry.field;
  }
  const optionTitle = tibPersonalizationOptionTitleField();
  return optionTitle && String(optionTitle.value) === entry.before
    ? optionTitle
    : null;
}

async function tibScanLabels({ find = "", replacement = "", caseSensitive = true } = {}) {
  const needle = String(find);
  if (!needle) return { ok: false, error: "Hãy nhập nội dung cần tìm." };
  tibLabelFields.clear();
  const scanId = crypto.randomUUID();
  const matches = [];
  const layers = await tibLayerDescriptors();
  const scanTargets = layers.length > 1 ? layers : [null];

  for (let layerIndex = 0; layerIndex < scanTargets.length; layerIndex += 1) {
    const layer = scanTargets[layerIndex];
    if (!(await tibActivateLayer(layer))) continue;
    const field = tibPersonalizationOptionTitleField();
    if (!field) continue;
    const before = String(field.value);
    const matchesNeedle = caseSensitive
      ? before.includes(needle)
      : before.toLowerCase().includes(needle.toLowerCase());
    if (!matchesNeedle) continue;

    const key = `${scanId}:${layerIndex}`;
    const after = tibReplaceLiteral(
      before,
      needle,
      String(replacement),
      caseSensitive
    );
    tibLabelFields.set(key, {
      field,
      kind: "Option title",
      fieldLabel: "Personalization Settings · Option Title",
      layer,
      before,
      after
    });
    matches.push({
      key,
      kind: "Option title",
      label: layer
        ? `${layer.label} · Personalization Settings`
        : "Personalization Settings",
      layer: layer?.label || "",
      before,
      after,
      visible: tibVisible(field)
    });
  }
  return {
    ok: true,
    url: location.href,
    title: document.title,
    layerCount: layers.length,
    matches
  };
}

function tibReactProps(field) {
  const key = Object.getOwnPropertyNames(field || {}).find((name) =>
    name.startsWith("__reactProps")
  );
  return key ? field[key] : null;
}

async function tibSetFieldValue(field, value) {
  const prototype =
    field instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;
  field.focus();
  setter?.call(field, value);
  field.dispatchEvent(
    new InputEvent("input", {
      bubbles: true,
      composed: true,
      data: value,
      inputType: "insertReplacementText"
    })
  );
  field.dispatchEvent(new Event("change", { bubbles: true, composed: true }));

  // Teeinblue has both Vue and React editor builds. Native input/change is
  // enough for Vue; call mounted React handlers when present.
  const props = tibReactProps(field);
  const eventLike = {
    target: field,
    currentTarget: field,
    type: "change",
    nativeEvent: new Event("change", { bubbles: true }),
    preventDefault() {},
    stopPropagation() {},
    persist() {},
    isDefaultPrevented: () => false,
    isPropagationStopped: () => false
  };
  props?.onChange?.(eventLike);
  await new Promise((resolve) => setTimeout(resolve, 120));
  const latestProps = tibReactProps(field);
  latestProps?.onBlur?.({ ...eventLike, type: "blur" });
  field.blur();
  await new Promise((resolve) => setTimeout(resolve, 220));
  return String(field.value) === String(value);
}

async function tibApplyLabelChanges(keys = []) {
  const updated = [];
  const failed = [];
  for (const key of [...new Set(keys.map(String))]) {
    const entry = tibLabelFields.get(key);
    if (!entry) {
      failed.push({ key, error: "Không còn dữ liệu preview. Hãy quét lại." });
      continue;
    }
    if (!(await tibActivateLayer(entry.layer))) {
      failed.push({ key, error: `Không mở lại được layer "${entry.layer?.label || "?"}".` });
      continue;
    }
    const field = tibFindStoredField(entry);
    if (!field || String(field.value) !== entry.before) {
      failed.push({ key, error: "Giá trị hiện tại khác bản preview. Hãy quét lại." });
      continue;
    }
    try {
      const accepted = await tibSetFieldValue(field, entry.after);
      if (!accepted) throw new Error("Teeinblue trả lại giá trị cũ.");
      updated.push({ key, before: entry.before, after: entry.after });
    } catch (error) {
      failed.push({ key, error: error?.message || String(error) });
    }
  }
  return { ok: failed.length === 0, updated, failed };
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "PING_TEEINBLUE_CONTENT") {
    sendResponse({
      ok: true,
      version: chrome.runtime.getManifest().version,
      runtimeFingerprint: TIB_RUNTIME_FINGERPRINT,
      runtimeStartedAt: TIB_RUNTIME_STARTED_AT,
      url: location.href
    });
    return;
  }
  if (message?.type === "GET_TIB_CAMPAIGN_SOURCE") {
    tibArtworkCampaignSource()
      .then(sendResponse)
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }
  if (message?.type === "CREATE_TIB_CAMPAIGN_SHELL") {
    tibCreateCampaignShell(message.title || "")
      .then(sendResponse)
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }
  if (message?.type === "PREPARE_TIB_CAMPAIGN_PRODUCT") {
    tibPrepareCampaignProduct(message.keyword || "")
      .then(sendResponse)
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }
  if (message?.type === "LINK_TIB_CAMPAIGN_ARTWORK") {
    tibLinkCampaignArtwork(message.title || "")
      .then(sendResponse)
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }
  if (message?.type === "UPLOAD_TIB_CAMPAIGN_MOCKUPS") {
    tibUploadCampaignMockups(message.sessionId || "", message.fileNames || [])
      .then(sendResponse)
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }
  if (message?.type === "SCAN_TIB_LABELS") {
    tibScanLabels(message.values || {})
      .then(sendResponse)
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }
  if (message?.type === "APPLY_TIB_LABELS") {
    tibApplyLabelChanges(message.keys || [])
      .then(sendResponse)
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }
  if (message?.type === "SCAN_TIB_SMART_SETUP") {
    tibScanSmartSetup(message.values || {})
      .then(sendResponse)
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }
  if (message?.type === "APPLY_TIB_SMART_SETUP") {
    tibApplySmartSetup(message.keys || [])
      .then(sendResponse)
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }
  if (message?.type === "SCAN_TIB_SMART_SETUP_V2") {
    tibScanSmartSetupV2(message.values || {})
      .then(sendResponse)
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }
  if (message?.type === "GET_TIB_SMART_SETUP_V2_SOURCES") {
    tibGetSmartSetupV2Sources(message.values || {})
      .then(sendResponse)
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }
  if (message?.type === "APPLY_TIB_SMART_SETUP_V2") {
    tibApplySmartSetupV2(message.keys || [])
      .then(sendResponse)
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }
});
