import {
  analyzeOriginalNames,
  buildFolderIssues,
  extensionOf,
  formatBytes,
  inspectImage,
  isIgnoredSystemFile,
  normalizePath,
  proposeNames,
  sha256
} from "../lib/asset-tools.js";
import {
  resolveGmcProductType,
  resolveLarkProductType
} from "../lib/product-type-resolver.js";

const DEFAULT_CUSTOMALL_FONTS = [
  "Arial",
  "Clambake October Six",
  "Vanilla Cream Sans",
  "Loredana Sans",
  "Adventura",
  "Greatly Clean",
  "Bearskin Regular",
  "39 Smooth",
  "Cambria Math",
  "212 Baby Girl",
  "Hey Comic",
  "Pintanina Family Black",
  "High Jakarta",
  "Tuesday Sush",
  "Cream Cake",
  "SVN-Steady",
  "Mr Dodo",
  "Pink Chicken",
  "Cheesyfloat Free",
  "Comic Sans MS",
  "One of the guys",
  "Abhaya Libre ExtraBold",
  "ComickBook",
  "Hello Almeida",
  "Gabriola"
];

// Must match the value baked into src/content/teeinblue.js. Unlike the
// manifest version, this proves that the tab is executing the shared bytecode.
const TIB_EXPECTED_RUNTIME_FINGERPRINT = "ps-tib-0.16.19-20260819-a";

const state = {
  clipartFiles: [],
  clipartRows: [],
  folderIssues: [],
  originalNameFolderIssues: [],
  originalNameRowIssues: new Map(),
  nameProposals: new Map(),
  batchRules: [],
  ignoredFiles: [],
  mockupFiles: [],
  artworkLayers: [],
  artworkSelectedLayerIndexes: new Set(),
  artworkCollapsedGroupIndexes: new Set(),
  artworkFonts: [...DEFAULT_CUSTOMALL_FONTS],
  artworkTool: "transform",
  artworkOperationRunning: false,
  campaignDraft: null,
  campaignProductBases: [],
  campaignTabId: null,
  campaignMockupFiles: [],
  campaignMockupSelection: null,
  campaignStartAfterFolderPick: false,
  tibCampaignDraft: null,
  tibCampaignTabId: null,
  tibCampaignMockupFiles: [],
  tibLabelMatches: [],
  tibSmartResult: null,
  tibSmart2Result: null,
  tibSmart2Sources: [],
  tibTabId: null,
  tibFrameId: null,
  tibRuntimeFingerprint: null,
  pageContext: null,
  larkLookup: null,
  productTypeRules: null
};

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

function showToast(message) {
  const toast = $("#toast");
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(showToast.timeout);
  showToast.timeout = setTimeout(() => toast.classList.remove("show"), 2800);
}

function setUploadFeedback(message = "", tone = "") {
  const feedback = $("#upload-feedback");
  feedback.textContent = message;
  feedback.className = `upload-feedback${message ? " show" : ""}${tone ? ` ${tone}` : ""}`;
}

function showNameTooltip(target, name) {
  const tooltip = $("#name-tooltip");
  tooltip.textContent = name;
  tooltip.classList.add("show");

  const targetRect = target.getBoundingClientRect();
  const tooltipRect = tooltip.getBoundingClientRect();
  const margin = 8;
  const left = Math.min(
    window.innerWidth - tooltipRect.width - margin,
    Math.max(margin, targetRect.left)
  );
  let top = targetRect.bottom + 6;
  if (top + tooltipRect.height > window.innerHeight - margin) {
    top = Math.max(margin, targetRect.top - tooltipRect.height - 6);
  }

  tooltip.style.left = `${left}px`;
  tooltip.style.top = `${top}px`;
}

function hideNameTooltip() {
  $("#name-tooltip").classList.remove("show");
}

function summarizeRowIssues(rows, issuesForRow) {
  const summaries = new Map();
  const labels = {
    DUPLICATE: "file có nội dung ảnh trùng với file khác.",
    MISSING_SEQUENCE: "file không có số thứ tự ở cuối tên.",
    DUPLICATE_SEQUENCE: "file bị trùng nhóm và số thứ tự.",
    SIZE: "file có cảnh báo về dung lượng.",
    TYPE: "file không đúng định dạng hỗ trợ.",
    EMPTY: "file rỗng.",
    PIXELS: "file vượt giới hạn độ phân giải.",
    DECODE: "file ảnh không đọc được.",
    INVALID_OUTPUT_NAME: "file có tên Output không hợp lệ sau chỉnh sửa.",
    DUPLICATE_OUTPUT_NAME: "file bị trùng tên Output sau chỉnh sửa."
  };

  rows.forEach((row) => {
    issuesForRow(row).forEach((issue) => {
      const key = `${issue.severity}:${issue.code}`;
      const summary = summaries.get(key) || {
        severity: issue.severity,
        code: issue.code,
        count: 0,
        fallback: issue.message
      };
      summary.count += 1;
      summaries.set(key, summary);
    });
  });

  return [...summaries.values()].map((summary) => ({
    severity: summary.severity,
    message: `${summary.count} ${labels[summary.code] || `file: ${summary.fallback}`}`
  }));
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

async function downloadBlob(blob, filename, saveAs = false) {
  const url = URL.createObjectURL(blob);
  try {
    return await chrome.downloads.download({ url, filename, saveAs });
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }
}

function setActiveTab(name) {
  $$(".tab").forEach((button) => button.classList.toggle("active", button.dataset.tab === name));
  $$(".panel").forEach((panel) => panel.classList.remove("active"));
  $(`#${name}-panel`).classList.add("active");
}

async function runWithConcurrency(items, limit, worker) {
  const results = new Array(items.length);
  let cursor = 0;

  async function runner() {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await worker(items[index], index);
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, runner));
  return results;
}

async function analyzeCliparts(files) {
  state.batchRules = [];
  renderBatchEditorState();
  state.ignoredFiles = files.filter((file) => isIgnoredSystemFile(file.name));
  files = files.filter((file) => !isIgnoredSystemFile(file.name));
  state.clipartFiles = files;
  state.folderIssues = buildFolderIssues(files);
  state.nameProposals = proposeNames(files);

  $("#clipart-empty").classList.add("hidden");
  $("#clipart-results").classList.remove("hidden");
  $("#analysis-status").textContent = "Analyzing";
  $("#file-table").innerHTML = "";

  const rows = await runWithConcurrency(files, 4, async (file) => {
    const path = normalizePath(file.webkitRelativePath || file.name);
    const inspection = await inspectImage(file);
    return {
      file,
      path,
      folder: path.split("/").slice(0, -1).join("/"),
      outputName: state.nameProposals.get(path) || file.name,
      ...inspection,
      hash: null
    };
  });

  const sizeBuckets = new Map();
  rows.forEach((row) => {
    const bucket = sizeBuckets.get(row.file.size) || [];
    bucket.push(row);
    sizeBuckets.set(row.file.size, bucket);
  });

  const duplicateCandidates = [...sizeBuckets.values()].filter((bucket) => bucket.length > 1).flat();
  await runWithConcurrency(duplicateCandidates, 2, async (row) => {
    row.hash = await sha256(row.file);
  });

  const hashes = new Map();
  duplicateCandidates.forEach((row) => {
    const matches = hashes.get(row.hash) || [];
    matches.push(row);
    hashes.set(row.hash, matches);
  });
  for (const matches of hashes.values()) {
    if (matches.length < 2) continue;
    matches.forEach((row) => {
      row.issues.push({
        severity: "warning",
        code: "DUPLICATE",
        message: `Trùng nội dung với ${matches.length - 1} file khác.`
      });
    });
  }

  state.clipartRows = rows;
  const originalNameAnalysis = analyzeOriginalNames(rows);
  state.originalNameFolderIssues = originalNameAnalysis.folderIssues;
  state.originalNameRowIssues = originalNameAnalysis.rowIssues;
  renderClipartResults();
  if (state.ignoredFiles.length) {
    showToast(
      `Đã tự bỏ qua ${state.ignoredFiles.length} file hệ thống: ${state.ignoredFiles
        .map((file) => file.name)
        .join(", ")}`
    );
  }
}

function renderClipartResults() {
  const activeFolderIssues = [...state.folderIssues, ...state.originalNameFolderIssues];
  const outputNameRowIssues = analyzeOutputNames();
  const issuesForRow = (row) => [
    ...row.issues,
    ...(state.originalNameRowIssues.get(row.path) || []),
    ...(outputNameRowIssues.get(row.path) || [])
  ];
  const errors =
    activeFolderIssues.filter((issue) => issue.severity === "error").length +
    state.clipartRows.reduce(
      (sum, row) => sum + issuesForRow(row).filter((issue) => issue.severity === "error").length,
      0
    );
  const warnings = state.clipartRows.reduce(
      (sum, row) => sum + issuesForRow(row).filter((issue) => issue.severity === "warning").length,
      0
    ) + activeFolderIssues.filter((issue) => issue.severity === "warning").length;
  const invalidFiles = state.clipartRows.filter((row) =>
    issuesForRow(row).some((issue) => issue.severity === "error")
  ).length;
  const totalBytes = state.clipartRows.reduce((sum, row) => sum + row.file.size, 0);
  const root =
    state.clipartRows[0]?.path.split("/")[0] ||
    state.clipartFiles[0]?.webkitRelativePath?.split("/")[0] ||
    "Selected folder";
  const rowIssueSummaries = summarizeRowIssues(state.clipartRows, issuesForRow);

  $("#stat-files").textContent = state.clipartRows.length;
  $("#stat-valid").textContent = Math.max(0, state.clipartRows.length - invalidFiles);
  $("#stat-warnings").textContent = warnings;
  $("#stat-errors").textContent = errors;
  $("#folder-name").textContent = root;
  $("#folder-size").textContent = formatBytes(totalBytes);
  $("#analysis-status").textContent = errors ? "Needs fixes" : "Ready";
  $("#analysis-status").style.color = errors ? "var(--red)" : "var(--green)";
  $("#analysis-status").style.background = errors ? "#fff0ee" : "#e7f6ef";

  $("#folder-issues").innerHTML = [...activeFolderIssues, ...rowIssueSummaries]
    .map(
      (issue) =>
        `<div class="issue ${escapeHtml(issue.severity || "warning")}">${escapeHtml(issue.message)}</div>`
    )
    .join("");

  $("#file-table").innerHTML = state.clipartRows
    .map((row) => {
      const rowIssues = issuesForRow(row);
      const severity = rowIssues.some((issue) => issue.severity === "error")
        ? "error"
        : rowIssues.length
          ? "warning"
          : "ok";
      const label = severity === "error" ? "Error" : severity === "warning" ? "Warning" : "Ready";
      const issueTooltip = rowIssues.map((issue) => issue.message).join(" · ");
      const statusTooltip = issueTooltip
        ? ` class="status-cell" data-tooltip="${escapeHtml(issueTooltip)}"`
        : "";
      return `
        <tr>
          <td class="name-cell" data-tooltip="${escapeHtml(row.file.name)}">${escapeHtml(row.file.name)}</td>
          <td class="name-cell" data-tooltip="${escapeHtml(outputNameFor(row))}">${escapeHtml(outputNameFor(row))}</td>
          <td>${escapeHtml(formatBytes(row.file.size))}</td>
          <td${statusTooltip}><span class="badge ${severity === "ok" ? "" : severity}">${label}</span></td>
        </tr>`;
    })
    .join("");

  $("#upload-customall").disabled = errors > 0;
  $("#upload-customall").textContent = errors ? "Fix errors before upload" : "Upload to Customall";
}

function outputNameFor(row) {
  let name = $("#rename-toggle").checked ? row.outputName : row.file.name;
  for (const rule of state.batchRules) {
    name = applyBatchRule(name, rule);
  }
  return name;
}

function applyBatchRule(name, rule) {
  const extension = extensionOf(name);
  const suffix = extension ? `.${extension}` : "";
  const stem = suffix ? name.slice(0, -suffix.length) : name;
  const escapedFind = rule.find.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return `${stem.replace(new RegExp(escapedFind, "gi"), () => rule.replace)}${suffix}`;
}

function analyzeOutputNames() {
  const rowIssues = new Map(state.clipartRows.map((row) => [row.path, []]));
  const names = new Map();

  state.clipartRows.forEach((row) => {
    const outputName = outputNameFor(row).trim();
    if (!outputName || /[\\/:*?"<>|\u0000-\u001f]/.test(outputName)) {
      rowIssues.get(row.path).push({
        severity: "error",
        code: "INVALID_OUTPUT_NAME",
        message: "Tên sau chỉnh sửa không hợp lệ."
      });
      return;
    }

    const key = `${row.folder.toLowerCase()}::${outputName.toLowerCase()}`;
    names.set(key, [...(names.get(key) || []), row]);
  });

  for (const matches of names.values()) {
    if (matches.length < 2) continue;
    matches.forEach((row) =>
      rowIssues.get(row.path).push({
        severity: "error",
        code: "DUPLICATE_OUTPUT_NAME",
        message: `Tên Output "${outputNameFor(row)}" bị trùng sau chỉnh sửa.`
      })
    );
  }

  return rowIssues;
}

function renderBatchEditorState() {
  const count = state.batchRules.length;
  $("#batch-edit-status").textContent = count
    ? `${count} phép thay thế đang áp dụng`
    : "Chưa có chỉnh sửa hàng loạt";
  $("#reset-batch-edit").disabled = count === 0;
}

function applyBatchReplace() {
  const find = $("#batch-find").value;
  const replace = $("#batch-replace").value;
  if (!find) {
    showToast("Nhập nội dung cần tìm.");
    $("#batch-find").focus();
    return;
  }

  const rule = { find, replace };
  const changed = state.clipartRows.filter((row) => {
    const currentName = outputNameFor(row);
    return applyBatchRule(currentName, rule) !== currentName;
  }).length;
  if (!changed) {
    showToast(`Không tìm thấy "${find}" trong tên Output.`);
    return;
  }

  state.batchRules.push(rule);
  $("#batch-find").value = "";
  $("#batch-replace").value = "";
  renderBatchEditorState();
  renderClipartResults();
  showToast(`Đã thay tên cho ${changed} file.`);
}

async function findCustomallTab() {
  const tabs = await chrome.tabs.query({});
  return tabs
    .filter((tab) => {
      if (!tab.id || !tab.url) return false;
      try {
        return /(^|\.)customall\.io$/i.test(new URL(tab.url).hostname);
      } catch {
        return false;
      }
    })
    .sort((a, b) => Number(b.active) - Number(a.active) || (b.lastAccessed || 0) - (a.lastAccessed || 0))[0];
}

function openUploadDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("customall-upload-copilot", 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains("pending-uploads")) {
        request.result.createObjectStore("pending-uploads", { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function storePendingUpload(id, files) {
  const database = await openUploadDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction("pending-uploads", "readwrite");
    transaction.objectStore("pending-uploads").put({ id, files });
    transaction.oncomplete = () => {
      database.close();
      resolve();
    };
    transaction.onerror = () => reject(transaction.error);
  });
}

async function removePendingUpload(id) {
  const database = await openUploadDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction("pending-uploads", "readwrite");
    transaction.objectStore("pending-uploads").delete(id);
    transaction.oncomplete = () => {
      database.close();
      resolve();
    };
    transaction.onerror = () => reject(transaction.error);
  });
}

async function uploadFilesDirectToCustomall(tab, files) {
  const sessionId = crypto.randomUUID();
  await storePendingUpload(sessionId, files);
  try {
    const send = async () => {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        world: "MAIN",
        files: ["src/content/customall-main.js"]
      });
      try {
        return await chrome.tabs.sendMessage(tab.id, {
          type: "UPLOAD_FOLDER_DIRECT",
          sessionId
        });
      } catch {
        await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          files: ["src/content/customall.js"]
        });
        return chrome.tabs.sendMessage(tab.id, {
          type: "UPLOAD_FOLDER_DIRECT",
          sessionId
        });
      }
    };
    const result = await send();
    if (!result?.ok) throw new Error(result?.error || "Customall không nhận được clipart.");
  } finally {
    await removePendingUpload(sessionId).catch(() => {});
  }
}

async function uploadCliparts() {
  if (!state.clipartRows.length) return;
  const hasErrors =
    state.folderIssues.some((issue) => issue.severity === "error") ||
    state.clipartRows.some((row) => row.issues.some((issue) => issue.severity === "error")) ||
    [...state.originalNameRowIssues.values()].some((issues) =>
      issues.some((issue) => issue.severity === "error")
    ) ||
    [...analyzeOutputNames().values()].some((issues) =>
      issues.some((issue) => issue.severity === "error")
    );
  if (hasErrors) {
    showToast("Hãy sửa các lỗi nghiêm trọng trước khi upload.");
    return;
  }

  const progress = $("#upload-progress");
  const bar = $("#upload-progress span");
  const uploadButton = $("#upload-customall");
  progress.classList.remove("hidden");
  uploadButton.disabled = true;
  uploadButton.textContent = "Đang kết nối Customall…";
  setUploadFeedback("Đang tìm tab Customall và chuẩn bị clipart…");
  const pendingFiles = [];

  try {
    const customallTab = await findCustomallTab();
    if (!customallTab) {
      throw new Error("Không tìm thấy tab Customall. Hãy mở Customall và đăng nhập trước.");
    }

    uploadButton.textContent = `Đang chuẩn bị ${state.clipartRows.length} cliparts…`;
    for (let index = 0; index < state.clipartRows.length; index += 1) {
      const row = state.clipartRows[index];
      const pathParts = row.path.split("/");
      const outputName = outputNameFor(row);
      pathParts[pathParts.length - 1] = outputName;
      pendingFiles.push({
        name: outputName,
        path: pathParts.join("/"),
        blob: row.file,
        type: row.file.type,
        lastModified: row.file.lastModified
      });
      bar.style.width = `${Math.round(((index + 1) / state.clipartRows.length) * 70)}%`;
    }

    uploadButton.textContent = `Đang chuyển ${pendingFiles.length} cliparts…`;
    await uploadFilesDirectToCustomall(customallTab, pendingFiles);
    bar.style.width = "100%";
    await chrome.tabs.update(customallTab.id, { active: true });
    setUploadFeedback(`Đã gửi ${pendingFiles.length} cliparts sang Customall.`, "success");
    showToast(`Đã gửi ${pendingFiles.length} cliparts sang Customall.`);
  } catch (error) {
    console.error(error);
    setUploadFeedback(error.message, "error");
    showToast(`Upload thất bại: ${error.message}`);
  } finally {
    uploadButton.disabled = false;
    uploadButton.textContent = "Upload to Customall";
    setTimeout(() => progress.classList.add("hidden"), 1200);
  }
}

async function exportReport() {
  if (!state.clipartRows.length) return;
  const lines = [
    ["path", "output_name", "bytes", "width", "height", "status", "issues"],
    ...state.clipartRows.map((row) => [
      row.path,
      outputNameFor(row),
      row.file.size,
      row.width,
      row.height,
      row.issues.some((issue) => issue.severity === "error") ? "error" : row.issues.length ? "warning" : "ready",
      row.issues.map((issue) => issue.message).join(" | ")
    ])
  ];
  const csv = lines
    .map((line) => line.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(","))
    .join("\r\n");
  await downloadBlob(new Blob(["\ufeff", csv], { type: "text/csv;charset=utf-8" }), "customall-clipart-report.csv", true);
}

async function sendShopifyMessage(tabId, message) {
  try {
    return await chrome.tabs.sendMessage(tabId, message);
  } catch (error) {
    if (!/Receiving end does not exist|Could not establish connection/i.test(error.message)) {
      throw error;
    }
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ["src/content/shopify.js"]
    });
    return chrome.tabs.sendMessage(tabId, message);
  }
}

const SHOPIFY_LARK_FIELDS = [
  { key: "gmcMaterial", label: "GMC Material" },
  { key: "gmcColor", label: "GMC Color" },
  { key: "shippingEta", label: "Shipping ETA" },
  { key: "shippingPage", label: "Shipping Page" },
  { key: "categoryBreadcrumb", label: "Category" }
];

async function sendShopifyFillToFrames(tabId, message) {
  const frames = await chrome.webNavigation.getAllFrames({ tabId });
  const frameIds = [...new Set((frames || []).map((frame) => frame.frameId))];
  if (!frameIds.length) frameIds.push(0);

  const attempts = await Promise.allSettled(
    frameIds.map((frameId) =>
      chrome.tabs.sendMessage(tabId, message, { frameId })
    )
  );
  const responses = attempts
    .filter((attempt) => attempt.status === "fulfilled" && attempt.value)
    .map((attempt) => attempt.value);
  const filled = [...new Set(responses.flatMap((response) => response.filled || []))];
  const expected = SHOPIFY_LARK_FIELDS
    .filter(({ key }) => String(message.values?.[key] || "").trim())
    .map(({ label }) => label);
  const missing = expected.filter((label) => !filled.includes(label));
  const fieldDiagnostics = {};
  for (const response of responses) {
    for (const [label, counts] of Object.entries(response.fieldDiagnostics || {})) {
      fieldDiagnostics[label] ||= { labels: 0, fields: 0 };
      fieldDiagnostics[label].labels += Number(counts.labels || 0);
      fieldDiagnostics[label].fields += Number(counts.fields || 0);
    }
  }
  let saved = false;
  if (!message.deferSave && !missing.length && filled.length) {
    await new Promise((resolve) => setTimeout(resolve, 300));
    const saveAttempts = await Promise.allSettled(
      frameIds.map((frameId) =>
        chrome.tabs.sendMessage(
          tabId,
          { type: "SAVE_SHOPIFY_PRODUCT" },
          { frameId }
        )
      )
    );
    saved = saveAttempts.some(
      (attempt) => attempt.status === "fulfilled" && attempt.value?.ok
    );
  }
  return {
    ok: filled.length > 0,
    filled,
    missing,
    fieldDiagnostics,
    saved,
    openedMetafields: responses.some((response) => response.openedMetafields),
    frameCount: frameIds.length,
    editableCount: responses.reduce(
      (total, response) => total + Number(response.editableCount || 0),
      0
    )
  };
}

async function getShopifyContextFromFrames(tabId) {
  const frames = await chrome.webNavigation.getAllFrames({ tabId });
  const frameIds = [...new Set((frames || []).map((frame) => frame.frameId))];
  if (!frameIds.length) frameIds.push(0);

  const attempts = await Promise.allSettled(
    frameIds.map((frameId) =>
      chrome.tabs.sendMessage(
        tabId,
        { type: "GET_PAGE_CONTEXT" },
        { frameId }
      )
    )
  );
  const contexts = attempts
    .filter((attempt) => attempt.status === "fulfilled" && attempt.value?.app === "shopify")
    .map((attempt) => attempt.value);
  if (!contexts.length) {
    return sendShopifyMessage(tabId, { type: "GET_PAGE_CONTEXT" });
  }

  const primary =
    contexts.find((context) => context.productId && context.store) ||
    contexts.find((context) => context.productId) ||
    contexts[0];
  return {
    ...primary,
    store: contexts.map((context) => context.store).find(Boolean) || primary.store,
    productId:
      contexts.map((context) => context.productId).find(Boolean) || primary.productId,
    productType:
      contexts.map((context) => context.productType).find(Boolean) || primary.productType,
    tags: [...new Set(contexts.flatMap((context) => context.tags || []))]
  };
}

function readShopifyContextFromUrl(rawUrl) {
  try {
    const url = new URL(String(rawUrl || ""));
    const isAdmin = url.hostname === "admin.shopify.com";
    const isMyShopify = url.hostname.endsWith(".myshopify.com");
    if (!isAdmin && !isMyShopify) return {};

    return {
      store:
        url.pathname.match(/\/store\/([^/]+)/)?.[1] ||
        (isMyShopify ? url.hostname.replace(/\.myshopify\.com$/i, "") : null),
      productId: url.pathname.match(/\/products\/(\d+)/)?.[1] || null
    };
  } catch {
    return {};
  }
}

async function queryActiveContext() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) return null;

  let context = null;
  try {
    const isShopify = String(tab.url || "").includes("admin.shopify.com");
    context = isShopify
      ? await getShopifyContextFromFrames(tab.id)
      : await chrome.tabs.sendMessage(tab.id, { type: "GET_PAGE_CONTEXT" });
  } catch {
    const url = tab.url || "";
    context = {
      app: url.includes("admin.shopify.com") ? "shopify" : "unknown",
      url,
      title: tab.title,
      store: url.match(/\/store\/([^/]+)/)?.[1] || null,
      productId: url.match(/\/products\/(\d+)/)?.[1] || null
    };
  }
  if (context?.app === "shopify") {
    const tabUrlContext = readShopifyContextFromUrl(tab.url);
    const pageUrlContext = readShopifyContextFromUrl(context.url);
    context = {
      ...context,
      store: context.store || pageUrlContext.store || tabUrlContext.store || null,
      productId:
        context.productId || pageUrlContext.productId || tabUrlContext.productId || null
    };
  }
  const larkResolution = resolveLarkProductType(
    context.productType,
    context.tags || [],
    state.productTypeRules || undefined
  );
  state.pageContext = {
    ...context,
    tabId: tab.id,
    lookupProductType: larkResolution.ok ? larkResolution.productType : null,
    productTypeResolution: larkResolution
  };

  const label =
    context.app === "shopify"
      ? `Shopify · ${context.store || "unknown store"}${
          larkResolution.source !== "product_type" && larkResolution.ok
            ? ` · ${context.productType} → ${larkResolution.productType}`
            : ""
        }`
      : context.app === "customall"
        ? "Customall"
        : context.title || "Trang không hỗ trợ";
  $("#context-label").textContent = label;
  if (context.store) $("#store-handle").value = context.store;
  if (context.productId) $("#product-id").value = context.productId;
  if (context.productType) {
    $("#lark-product-type").value = context.productType;
  }
  renderMockups();
  return state.pageContext;
}

function apiOriginPattern(endpoint) {
  const url = new URL(endpoint);
  if (!["http:", "https:"].includes(url.protocol)) {
    throw new Error("Lookup API phải dùng HTTP hoặc HTTPS.");
  }
  return `${url.protocol}//${url.hostname}/*`;
}

const DEFAULT_LARK_API_URL = "http://192.168.88.4:8787";
const DEFAULT_LARK_API_KEY = "";

async function ensureApiPermission(endpoint) {
  const origins = [apiOriginPattern(endpoint)];
  const granted = await chrome.permissions.contains({ origins });
  if (granted) return;
  const approved = await chrome.permissions.request({ origins });
  if (!approved) throw new Error("Chưa cấp quyền kết nối Lookup API.");
}

async function getLarkSettings() {
  const settings = await chrome.storage.local.get(["larkApiUrl", "larkApiKey"]);
  return {
    endpoint: String(settings.larkApiUrl || DEFAULT_LARK_API_URL)
      .trim()
      .replace(/\/+$/, ""),
    apiKey: String(settings.larkApiKey || DEFAULT_LARK_API_KEY)
  };
}

async function getLiveProductTypeRules(settings) {
  await ensureApiPermission(settings.endpoint);
  const response = await fetch(`${settings.endpoint}/api/config`, {
    cache: "no-store",
    headers: { "X-API-Key": settings.apiKey }
  });
  const body = await response.json();
  if (!response.ok || !body.ok || !body.data?.productTypeRules) {
    throw new Error(body.error || "Không đọc được Product Type rules từ server.");
  }
  state.productTypeRules = body.data.productTypeRules;
  return state.productTypeRules;
}

async function saveLarkSettings() {
  const endpoint = $("#lark-api-url").value.trim().replace(/\/+$/, "");
  const apiKey = $("#lark-api-key").value;
  if (!endpoint || !apiKey) {
    showToast("Nhập Lookup API URL và API key.");
    return;
  }

  try {
    await ensureApiPermission(endpoint);
    const response = await fetch(`${endpoint}/health`, { cache: "no-store" });
    const body = await response.json();
    if (!response.ok || !body.ok) throw new Error(body.error || "API health check thất bại.");
    await chrome.storage.local.set({ larkApiUrl: endpoint, larkApiKey: apiKey });
    showToast("Đã lưu và kết nối Lookup API.");
  } catch (error) {
    showToast(`Không kết nối được API: ${error.message}`);
  }
}

function setLookupField(id, value, formatted = value) {
  const element = $(`#${id}`);
  const raw = value == null ? "" : String(value);
  element.textContent = raw ? String(formatted) : "— (trống trong Sheet)";
  element.dataset.rawValue = raw;
}

function renderLarkLookup(result) {
  state.larkLookup = result;
  $("#lark-results").classList.remove("hidden");
  $("#lark-fetched-at").textContent = `Fetched ${new Date(result.fetchedAt).toLocaleString("vi-VN")}`;
  $("#lark-revisions").textContent =
    `Shipping r${result.shippingRevision} · GMC r${result.gmcRevision}`;

  const shipping = result.shipping || {};
  const shippingCode = shipping.code
    ? JSON.stringify(shipping.code, null, 2)
    : shipping.codeRaw || "";
  setLookupField("lookup-shipping-page", shipping.shippingPage || "");
  setLookupField("lookup-shipping-code", shipping.codeRaw || "", shippingCode);
  $("#lookup-shipping-source").textContent = shipping.found
    ? `Source: Shipping Sheet, row ${shipping.sourceRows.join(", ")}${
        shipping.fallbackUsed ? ` · dùng mặc định "${shipping.productType}"` : ""
      }${
        shipping.ambiguous ? " · Có dữ liệu xung đột" : ""
      }${shipping.codeError ? ` · ${shipping.codeError}` : ""}`
    : "Không tìm thấy Product Type trong Shipping Sheet.";

  const gmc = result.gmc || {};
  setLookupField("lookup-gmc-color", gmc.color || "");
  setLookupField("lookup-gmc-material", gmc.material || "");
  setLookupField("lookup-gmc-category", gmc.categoryBreadcrumb || "");
  setLookupField("lookup-gmc-category-id", gmc.categoryId || "");
  $("#lookup-gmc-source").textContent = gmc.found
    ? `Source: GMC Sheet, row ${gmc.sourceRows.join(", ")}${
        gmc.ambiguous ? " · Có dữ liệu xung đột" : ""
      }`
    : "Không tìm thấy Product Type trong GMC Sheet.";

  const feedback = $("#lark-feedback");
  if (shipping.ambiguous || gmc.ambiguous) {
    feedback.textContent = "Có nhiều dòng cùng Product Type nhưng dữ liệu khác nhau. Hãy kiểm tra dòng nguồn.";
    feedback.className = "upload-feedback show error";
  } else if (!shipping.found && !gmc.found) {
    feedback.textContent = "Không tìm thấy Product Type trong cả hai Sheet.";
    feedback.className = "upload-feedback show error";
  } else {
    feedback.textContent = "Đã lấy dữ liệu mới nhất từ hai Lark Sheet.";
    feedback.className = "upload-feedback show success";
  }
}

async function fillLookupIntoShopify(result = state.larkLookup) {
  if (!result) {
    showToast("Chưa có dữ liệu Lark để điền.");
    return null;
  }
  if (result.shipping?.ambiguous || result.gmc?.ambiguous) {
    throw new Error("Dữ liệu nguồn đang xung đột nên chưa điền vào Shopify.");
  }

  const context = await queryActiveContext();
  if (context?.app !== "shopify" || !context.productId) {
    throw new Error("Hãy mở đúng trang Product trong Shopify rồi thử lại.");
  }

  const pickerValues = {
    shippingPage: result.shipping?.shippingPage || "",
    categoryBreadcrumb: result.gmc?.categoryBreadcrumb || ""
  };
  const fillMessage = {
    type: "FILL_SHOPIFY_LARK_DATA",
    deferSave: true,
    values: {
      shippingPage: "",
      shippingEta: result.shipping?.codeRaw || "",
      gmcColor: result.gmc?.color || "",
      gmcMaterial: result.gmc?.material || "",
      categoryBreadcrumb: ""
    }
  };
  let response;
  try {
    response = await sendShopifyFillToFrames(context.tabId, fillMessage);
  } catch (error) {
    if (!/message port closed|frame was removed|Receiving end does not exist/i.test(error.message)) {
      throw error;
    }
    await new Promise((resolve) => setTimeout(resolve, 1800));
    const refreshedContext = await queryActiveContext();
    response = await sendShopifyFillToFrames(refreshedContext.tabId, fillMessage);
  }
  if (!response.ok && response.openedMetafields) {
    await new Promise((resolve) => setTimeout(resolve, 1800));
    response = await sendShopifyFillToFrames(context.tabId, fillMessage);
  }
  const pickerResponse = await chrome.runtime.sendMessage({
    type: "FILL_SHOPIFY_TRUSTED_PICKERS",
    tabId: context.tabId,
    values: pickerValues
  });
  if (pickerResponse?.error && !pickerResponse?.filled?.length) {
    throw new Error(pickerResponse.error);
  }

  response.filled = [
    ...new Set([...(response.filled || []), ...(pickerResponse?.filled || [])])
  ];
  const expected = [
    ...SHOPIFY_LARK_FIELDS
      .filter(({ key }) => {
        const allValues = { ...fillMessage.values, ...pickerValues };
        return String(allValues[key] || "").trim();
      })
      .map(({ label }) => label)
  ];
  response.missing = expected.filter((label) => !response.filled.includes(label));
  response.pickerDiagnostics = pickerResponse?.diagnostics || {};

  if (!response?.ok && !response?.filled?.length) {
    throw new Error(
      response?.error ||
      `Không tìm thấy các metafield cần điền sau khi quét ${response?.frameCount || 0} frame (${response?.editableCount || 0} ô nhập liệu).`
    );
  }

  const filled = response.filled || [];
  const missing = response.missing || [];
  if (!missing.length && filled.length) {
    const saveResponse = await chrome.runtime.sendMessage({
      type: "SAVE_SHOPIFY_TRUSTED",
      tabId: context.tabId
    });
    response.saved = Boolean(saveResponse?.ok);
  }
  const feedback = $("#lark-feedback");
  feedback.textContent = missing.length
    ? `Đã điền ${filled.join(", ")}. Chưa tìm thấy: ${missing.join(", ")}. Hãy kiểm tra trước khi Save.`
    : `Đã điền ${filled.join(", ")}. Hãy kiểm tra rồi bấm Save trên Shopify.`;
  if (missing.length) {
    const diagnosticText = Object.entries(response.fieldDiagnostics || {})
      .filter(([label]) => missing.includes(label))
      .map(([label, counts]) => `${label}: label ${counts.labels}/field ${counts.fields}`)
      .join("; ");
    if (diagnosticText) feedback.textContent += ` DOM: ${diagnosticText}.`;
    const pickerDiagnosticText = missing
      .filter((label) => response.pickerDiagnostics?.[label])
      .map((label) => `${label}=${response.pickerDiagnostics[label]}`)
      .join("; ");
    if (pickerDiagnosticText) {
      feedback.textContent += ` Picker: ${pickerDiagnosticText}.`;
    }
  }
  if (!missing.length && response.saved) {
    feedback.textContent = `Đã điền ${filled.join(", ")} và tự động Save trên Shopify.`;
  }
  feedback.className = `upload-feedback show ${missing.length ? "" : "success"}`;
  return response;
}

async function fillLookupIntoShopifyStable(result = state.larkLookup) {
  if (!result) {
    showToast("Chưa có dữ liệu Lark để điền.");
    return null;
  }
  if (result.shipping?.ambiguous || result.gmc?.ambiguous) {
    throw new Error("Dữ liệu nguồn đang xung đột nên chưa điền vào Shopify.");
  }

  const initialContext = await queryActiveContext();
  if (initialContext?.app !== "shopify" || !initialContext.productId) {
    throw new Error("Hãy mở đúng trang Product trong Shopify rồi thử lại.");
  }

  const pickerValues = {
    shippingPage: result.shipping?.shippingPage || "",
    categoryBreadcrumb: result.gmc?.categoryBreadcrumb || ""
  };
  const fillMessage = {
    type: "FILL_SHOPIFY_LARK_DATA",
    deferSave: true,
    values: {
      shippingPage: "",
      shippingEta: result.shipping?.codeRaw || "",
      gmcColor: result.gmc?.color || "",
      gmcMaterial: result.gmc?.material || "",
      categoryBreadcrumb: ""
    }
  };
  const allValues = { ...fillMessage.values, ...pickerValues };
  const expected = SHOPIFY_LARK_FIELDS
    .filter(({ key }) => String(allValues[key] || "").trim())
    .map(({ label }) => label);

  let activeTabId = initialContext.tabId;
  let lastError = null;
  let response = {
    ok: false,
    filled: [],
    missing: expected,
    fieldDiagnostics: {},
    pickerDiagnostics: {},
    frameCount: 0,
    editableCount: 0,
    attempts: 0
  };

  for (let attempt = 1; attempt <= 3; attempt += 1) {
    let frameResponse = null;
    let pickerResponse = null;

    try {
      frameResponse = await sendShopifyFillToFrames(activeTabId, fillMessage);
    } catch (error) {
      lastError = error;
      if (
        !/message port closed|frame was removed|Receiving end does not exist/i.test(
          error.message
        )
      ) {
        throw error;
      }
    }

    if (frameResponse?.openedMetafields && !frameResponse?.filled?.length) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }

    try {
      pickerResponse = await chrome.runtime.sendMessage({
        type: "FILL_SHOPIFY_TRUSTED_PICKERS",
        tabId: activeTabId,
        values: pickerValues
      });
      if (pickerResponse?.error) {
        lastError = new Error(pickerResponse.error);
      }
    } catch (error) {
      lastError = error;
    }

    const passFilled = [
      ...new Set([
        ...(frameResponse?.filled || []),
        ...(pickerResponse?.filled || [])
      ])
    ];
    response = {
      ...response,
      ...(frameResponse || {}),
      ok: passFilled.length > 0,
      filled: passFilled,
      missing: expected.filter((label) => !passFilled.includes(label)),
      pickerDiagnostics: pickerResponse?.diagnostics || {},
      attempts: attempt
    };

    // Shopify frequently re-renders a section shortly after a value changes.
    // Require a second full successful pass before saving.
    if (!response.missing.length && attempt >= 2) break;
    if (attempt >= 3) break;

    await new Promise((resolve) =>
      setTimeout(resolve, response.missing.length ? 1200 : 800)
    );
    const refreshedContext = await queryActiveContext();
    if (
      refreshedContext?.app !== "shopify" ||
      refreshedContext.productId !== initialContext.productId
    ) {
      throw new Error("Trang Product đã thay đổi trong lúc đang điền dữ liệu.");
    }
    activeTabId = refreshedContext.tabId;
  }

  if (!response.ok && !response.filled.length) {
    throw new Error(
      lastError?.message ||
        response.error ||
        `Không tìm thấy metafield sau ${response.attempts} lượt kiểm tra.`
    );
  }

  if (!response.missing.length && response.filled.length) {
    const saveResponse = await chrome.runtime.sendMessage({
      type: "SAVE_SHOPIFY_TRUSTED",
      tabId: activeTabId
    });
    response.saved = Boolean(saveResponse?.ok);
  }

  const feedback = $("#lark-feedback");
  feedback.textContent = response.missing.length
    ? `Đã điền ${response.filled.join(", ")}. Chưa tìm thấy: ${response.missing.join(", ")} sau ${response.attempts} lượt. Hãy kiểm tra trước khi Save.`
    : `Đã xác nhận đủ ${response.filled.join(", ")} qua ${response.attempts} lượt.`;

  if (response.missing.length) {
    const diagnosticText = Object.entries(response.fieldDiagnostics || {})
      .filter(([label]) => response.missing.includes(label))
      .map(([label, counts]) => `${label}: label ${counts.labels}/field ${counts.fields}`)
      .join("; ");
    if (diagnosticText) feedback.textContent += ` DOM: ${diagnosticText}.`;
    const pickerDiagnosticText = response.missing
      .filter((label) => response.pickerDiagnostics?.[label])
      .map((label) => `${label}=${response.pickerDiagnostics[label]}`)
      .join("; ");
    if (pickerDiagnosticText) {
      feedback.textContent += ` Picker: ${pickerDiagnosticText}.`;
    }
  }

  if (!response.missing.length && response.saved) {
    feedback.textContent += " Đã tự động Save trên Shopify.";
  } else if (!response.missing.length && !response.saved) {
    feedback.textContent += " Chưa bấm được Save, hãy kiểm tra trước khi lưu.";
  }
  feedback.className = `upload-feedback show ${response.missing.length ? "" : "success"}`;
  return response;
}

async function lookupLatestLarkData() {
  const context = await queryActiveContext();
  const productType = $("#lark-product-type").value.trim();
  if (!productType) {
    showToast("Nhập Shopify Product Type.");
    return;
  }
  const settings = await getLarkSettings();
  if (!settings.endpoint || !settings.apiKey) {
    showToast("Mở API connection settings để cấu hình trước.");
    return;
  }

  const button = $("#lookup-lark");
  const feedback = $("#lark-feedback");
  button.disabled = true;
  button.textContent = "Đang đọc Lark Sheet…";
  feedback.textContent = "Đang lấy snapshot mới nhất từ hai Sheet…";
  feedback.className = "upload-feedback show";

  try {
    const rules = await getLiveProductTypeRules(settings);
    const resolution = resolveLarkProductType(
      productType,
      context?.tags || [],
      rules
    );
    if (context?.app === "shopify" && !resolution.ok) {
      throw new Error(resolution.error);
    }
    const url = new URL(`${settings.endpoint}/api/lark/product`);
    url.searchParams.set("productType", productType);
    url.searchParams.set("shippingProductType", resolution.productType || productType);
    url.searchParams.set(
      "gmcProductType",
      resolveGmcProductType(productType, rules)
    );
    const response = await fetch(url, {
      cache: "no-store",
      headers: { "X-API-Key": settings.apiKey }
    });
    const body = await response.json();
    if (!response.ok || !body.ok) throw new Error(body.error || "Lark lookup thất bại.");
    renderLarkLookup(body.data);
    await fillLookupIntoShopifyStable(body.data);
  } catch (error) {
    feedback.textContent = error.message;
    feedback.className = "upload-feedback show error";
  } finally {
    button.disabled = false;
    button.textContent = "Đọc Lark & điền Shopify";
  }
}

function targetMockupName(file, index, count) {
  const productId = $("#product-id").value.trim();
  const extension = extensionOf(file.name);
  return count === 1 ? `${productId}.${extension}` : `${productId}-${String(index + 1).padStart(2, "0")}.${extension}`;
}

function renderMockups() {
  const productIdValid = /^\d{6,}$/.test($("#product-id").value.trim());
  const storeValid = /^[a-z0-9][a-z0-9-]*$/i.test($("#store-handle").value.trim());
  $("#mockup-list").innerHTML = state.mockupFiles
    .map(
      (file, index) => `
        <div class="mockup-item">
          <div>
            <strong>${escapeHtml(file.name)}</strong>
            <span>${escapeHtml(targetMockupName(file, index, state.mockupFiles.length))}</span>
          </div>
          <span>${escapeHtml(formatBytes(file.size))}</span>
        </div>`
    )
    .join("");
  $("#upload-shopify").disabled = !state.mockupFiles.length || !productIdValid || !storeValid;
}

async function recordHistory(entry) {
  const { uploadHistory = [] } = await chrome.storage.local.get("uploadHistory");
  const next = [entry, ...uploadHistory].slice(0, 20);
  await chrome.storage.local.set({ uploadHistory: next });
  renderHistory(next);
}

function renderHistory(items) {
  $("#history-list").innerHTML = items.length
    ? items
        .map(
          (item) => `
            <div class="history-item">
              <div>
                <strong>${escapeHtml(item.productId)}</strong>
                <span>${escapeHtml(item.store || "No store")} · ${item.count} files</span>
              </div>
              <span>${escapeHtml(new Date(item.createdAt).toLocaleDateString("vi-VN"))}</span>
            </div>`
        )
        .join("")
    : '<p class="muted">Chưa có session.</p>';
}

function waitForTabComplete(tabId, timeoutMs = 30_000) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error("Shopify tải trang quá lâu."));
    }, timeoutMs);

    function cleanup() {
      clearTimeout(timeout);
      chrome.tabs.onUpdated.removeListener(handleUpdated);
    }

    function handleUpdated(updatedTabId, changeInfo, tab) {
      if (updatedTabId !== tabId || changeInfo.status !== "complete") return;
      cleanup();
      resolve(tab);
    }

    chrome.tabs.get(tabId).then((tab) => {
      if (tab.status === "complete") {
        cleanup();
        resolve(tab);
        return;
      }
      chrome.tabs.onUpdated.addListener(handleUpdated);
    }).catch((error) => {
      cleanup();
      reject(error);
    });
  });
}

async function waitForCampaignEditor(tabId, timeoutMs = 30_000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const tab = await chrome.tabs.get(tabId);
    try {
      const url = new URL(tab.url || "");
      if (
        url.hostname === "app.customall.io" &&
        url.pathname.startsWith("/campaigns/new") &&
        tab.status === "complete"
      ) {
        try {
          const state = await sendCustomallMessage(tabId, {
            type: "GET_CAMPAIGN_EDITOR_STATE"
          });
          if (state?.ready) return tab;
        } catch {
          // Content script can be unavailable briefly during navigation.
        }
      }
    } catch {
      // Keep waiting while Customall changes URL.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(
    "Campaign chưa sẵn sàng. Hãy chọn Product Base trong bảng Customall."
  );
}

async function ensureShopifyFilesTab(store) {
  const tabs = await chrome.tabs.query({});
  const existing = tabs.find((tab) => {
    if (!tab.id || !tab.url) return false;
    try {
      const url = new URL(tab.url);
      return (
        url.hostname === "admin.shopify.com" &&
        url.pathname.startsWith(`/store/${store}/content/files`)
      );
    } catch {
      return false;
    }
  });

  if (existing) {
    await chrome.tabs.update(existing.id, { active: true });
    return waitForTabComplete(existing.id);
  }

  const response = await chrome.runtime.sendMessage({ type: "OPEN_SHOPIFY_FILES", store });
  if (!response?.ok || !response.tabId) {
    throw new Error(response?.error || "Không mở được Shopify Files.");
  }
  return waitForTabComplete(response.tabId);
}

async function uploadFilesDirectToShopify(tab, files) {
  const sessionId = crypto.randomUUID();
  await storePendingUpload(sessionId, files);
  try {
    try {
      const result = await chrome.tabs.sendMessage(tab.id, {
        type: "UPLOAD_SHOPIFY_FILES_DIRECT",
        sessionId
      });
      if (!result?.ok) throw new Error(result?.error || "Shopify không nhận được mockup.");
    } catch (error) {
      if (!/Receiving end does not exist|Could not establish connection/i.test(error.message)) {
        throw error;
      }
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ["src/content/shopify.js"]
      });
      const result = await chrome.tabs.sendMessage(tab.id, {
        type: "UPLOAD_SHOPIFY_FILES_DIRECT",
        sessionId
      });
      if (!result?.ok) throw new Error(result?.error || "Shopify không nhận được mockup.");
    }
  } finally {
    await removePendingUpload(sessionId).catch(() => {});
  }
}

async function uploadMockupsToShopify() {
  const productId = $("#product-id").value.trim();
  const store = $("#store-handle").value.trim();
  if (!/^\d{6,}$/.test(productId)) {
    showToast("Product ID chưa hợp lệ.");
    return;
  }
  if (!/^[a-z0-9][a-z0-9-]*$/i.test(store)) {
    showToast("Shopify store handle chưa hợp lệ.");
    return;
  }

  const button = $("#upload-shopify");
  const feedback = $("#shopify-upload-feedback");
  button.disabled = true;
  button.textContent = "Đang mở Shopify Files…";
  feedback.textContent = "Đang chuẩn bị và chuyển mockup sang Shopify…";
  feedback.className = "upload-feedback show";

  try {
    const pendingFiles = state.mockupFiles.map((file, index) => ({
      name: targetMockupName(file, index, state.mockupFiles.length),
      blob: file,
      type: file.type,
      lastModified: file.lastModified
    }));
    const tab = await ensureShopifyFilesTab(store);
    button.textContent = `Đang upload ${pendingFiles.length} file…`;
    await uploadFilesDirectToShopify(tab, pendingFiles);
    await recordHistory({
      productId,
      store,
      count: pendingFiles.length,
      createdAt: new Date().toISOString()
    });
    feedback.textContent = `Đã gửi ${pendingFiles.length} mockup sang Shopify Files.`;
    feedback.className = "upload-feedback show success";
    showToast(`Đã gửi ${pendingFiles.length} mockup sang Shopify.`);
  } catch (error) {
    console.error(error);
    feedback.textContent = error.message;
    feedback.className = "upload-feedback show error";
    showToast(`Upload Shopify thất bại: ${error.message}`);
  } finally {
    button.disabled = false;
    button.textContent = "Upload trực tiếp lên Shopify";
  }
}

async function openShopifyFiles() {
  const store = $("#store-handle").value.trim();
  const response = await chrome.runtime.sendMessage({ type: "OPEN_SHOPIFY_FILES", store });
  showToast(response?.ok ? "Đã mở Shopify Files." : response?.error || "Không mở được Shopify.");
}

async function highlightUpload() {
  const context = await queryActiveContext();
  if (!context?.tabId || context.app !== "shopify") {
    showToast("Hãy mở tab Shopify Content → Files trước.");
    return;
  }
  try {
    const response = await chrome.tabs.sendMessage(context.tabId, { type: "HIGHLIGHT_UPLOAD" });
    showToast(response?.ok ? "Đã highlight nút Upload." : response?.error);
  } catch {
    showToast("Không kết nối được với trang Shopify. Hãy reload trang.");
  }
}

function setArtworkFeedback(message = "", tone = "") {
  const feedback = $("#artwork-feedback");
  feedback.textContent = message;
  feedback.className = `upload-feedback${message ? " show" : ""}${tone ? ` ${tone}` : ""}`;
}

function setArtworkBatchFeedback(message = "", tone = "") {
  const feedback = $("#artwork-batch-feedback");
  feedback.textContent = message;
  feedback.className = `upload-feedback${message ? " show" : ""}${tone ? ` ${tone}` : ""}`;
}

function setArtworkTool(tool) {
  if (state.artworkOperationRunning) return;
  const allowed = new Set(["transform", "text", "stroke", "case", "label"]);
  state.artworkTool = allowed.has(tool) ? tool : "transform";
  $$("[data-artwork-tool]").forEach((button) => {
    const active = button.dataset.artworkTool === state.artworkTool;
    button.classList.toggle("active", active);
    button.setAttribute("aria-selected", String(active));
  });
  $$("[data-artwork-tool-panel]").forEach((panel) => {
    const active = panel.dataset.artworkToolPanel === state.artworkTool;
    panel.classList.toggle("active", active);
    panel.hidden = !active;
  });
  setArtworkBatchFeedback("");
}

function getSelectedArtworkLayers({ textOnly = false } = {}) {
  return state.artworkLayers.filter(
    (layer) =>
      layer.type !== "Group" &&
      state.artworkSelectedLayerIndexes.has(Number(layer.index)) &&
      (!textOnly || layer.type === "Text")
  );
}

function getArtworkDescendantLayers(groupIndex, { includeGroups = false } = {}) {
  const targetIndex = Number(groupIndex);
  const layersByIndex = new Map(
    state.artworkLayers.map((layer) => [Number(layer.index), layer])
  );
  return state.artworkLayers.filter((layer) => {
    if (!includeGroups && layer.type === "Group") return false;
    let parentIndex = layer.parentIndex;
    while (parentIndex !== null && parentIndex !== undefined) {
      if (Number(parentIndex) === targetIndex) return true;
      parentIndex = layersByIndex.get(Number(parentIndex))?.parentIndex;
    }
    return false;
  });
}

function syncArtworkSelectionControls() {
  $$("[data-artwork-layer-index]").forEach((input) => {
    const index = Number(input.dataset.artworkLayerIndex);
    const layer = state.artworkLayers.find(
      (item) => Number(item.index) === index
    );
    if (layer?.type === "Group") {
      const descendants = getArtworkDescendantLayers(index);
      const selectedCount = descendants.filter((item) =>
        state.artworkSelectedLayerIndexes.has(Number(item.index))
      ).length;
      input.checked = descendants.length > 0 && selectedCount === descendants.length;
      input.indeterminate = selectedCount > 0 && selectedCount < descendants.length;
      return;
    }
    input.indeterminate = false;
    input.checked = state.artworkSelectedLayerIndexes.has(index);
  });
  const selectableLayers = state.artworkLayers.filter(
    (layer) => layer.type !== "Group"
  );
  const allSelected =
    selectableLayers.length > 0 &&
    selectableLayers.every((layer) =>
      state.artworkSelectedLayerIndexes.has(Number(layer.index))
    );
  $("#select-all-artwork-layers").checked = allSelected;
}

function artworkLayerIsHidden(layer, layersByIndex) {
  let parentIndex = layer.parentIndex;
  while (parentIndex !== null && parentIndex !== undefined) {
    if (state.artworkCollapsedGroupIndexes.has(Number(parentIndex))) {
      return true;
    }
    parentIndex = layersByIndex.get(Number(parentIndex))?.parentIndex;
  }
  return false;
}

function renderArtworkSelectionSummary() {
  const selected = getSelectedArtworkLayers();
  const selectedText = selected.filter((layer) => layer.type === "Text");
  const count = $("#artwork-selection-count");
  if (count) {
    count.textContent = selected.length
      ? `${selected.length} chọn · ${selectedText.length} Text`
      : "0 layer";
  }
  const textOnlyButton = $("#select-text-artwork-layers");
  if (textOnlyButton) {
    textOnlyButton.classList.toggle(
      "active",
      selected.length > 0 && selected.length === selectedText.length
    );
  }
}

function clearArtworkOperationResults() {
  const results = $("#artwork-operation-results");
  if (!results) return;
  results.innerHTML = "";
  results.classList.remove("show");
}

function renderArtworkOperationResults(layers, response) {
  const results = $("#artwork-operation-results");
  if (!results) return;
  const failures = new Map(
    (response?.failed || []).map((item) => [Number(item.index), item])
  );
  results.innerHTML = layers
    .map((layer) => {
      const failure = failures.get(Number(layer.index));
      return `
        <div class="operation-result-row ${failure ? "error" : "success"}">
          <span class="operation-result-icon">${failure ? "!" : "✓"}</span>
          <span><strong>${escapeHtml(layer.name)}</strong>${failure ? ` — ${escapeHtml(failure.error || "Không cập nhật được")}` : " — Đã cập nhật"}</span>
        </div>
      `;
    })
    .join("");
  results.classList.toggle("show", layers.length > 0);
}

function setArtworkBatchBusy(busy) {
  state.artworkOperationRunning = Boolean(busy);
  const card = $(".artwork-batch-card");
  card?.classList.toggle("is-running", state.artworkOperationRunning);
  card
    ?.querySelectorAll(
      "button, [data-artwork-layer-index], #select-all-artwork-layers, input, select"
    )
    .forEach((control) => {
      control.disabled = state.artworkOperationRunning;
    });
}

async function preflightArtworkLayers(tabId, selectedLayers) {
  const response = await sendCustomallMessage(tabId, {
    type: "GET_ARTWORK_LAYERS"
  });
  if (!response?.ok) {
    throw new Error(response?.error || "Không kiểm tra được layer hiện tại.");
  }
  const currentLayers = new Map(
    (response.layers || []).map((layer) => [Number(layer.index), layer])
  );
  const changed = selectedLayers.find((layer) => {
    const current = currentLayers.get(Number(layer.index));
    return (
      !current ||
      current.name !== layer.name ||
      current.type !== layer.type
    );
  });
  if (changed) {
    throw new Error(
      `Danh sách layer đã thay đổi tại "${changed.name}". Bấm Quét lại trước khi apply.`
    );
  }
}

function renderArtworkLayers() {
  const list = $("#artwork-layer-list");
  if (!state.artworkLayers.length) {
    list.innerHTML = '<p class="muted">Không tìm thấy layer trong Artwork editor.</p>';
    state.artworkSelectedLayerIndexes.clear();
    state.artworkCollapsedGroupIndexes.clear();
    $("#select-all-artwork-layers").checked = false;
    renderArtworkSelectionSummary();
    return;
  }

  const layersByIndex = new Map(
    state.artworkLayers.map((layer) => [Number(layer.index), layer])
  );
  list.innerHTML = state.artworkLayers
    .filter((layer) => !artworkLayerIsHidden(layer, layersByIndex))
    .map((layer) => {
      const isGroup = layer.type === "Group";
      const collapsed = state.artworkCollapsedGroupIndexes.has(
        Number(layer.index)
      );
      const depth = Math.max(0, Number(layer.depth) || 0);
      return `
        <div class="artwork-layer-option${isGroup ? " is-group" : ""}" style="--layer-depth:${depth}" title="${escapeHtml(layer.name)}">
          ${
            isGroup
              ? `<button class="artwork-group-toggle" type="button" data-artwork-group-toggle="${layer.index}" aria-label="${collapsed ? "Mở" : "Thu gọn"} group ${escapeHtml(layer.name)}" aria-expanded="${String(!collapsed)}">${collapsed ? "›" : "⌄"}</button>`
              : '<span class="artwork-tree-spacer" aria-hidden="true"></span>'
          }
          <input type="checkbox" data-artwork-layer-index="${layer.index}" aria-label="Chọn ${escapeHtml(layer.name)}" />
          <span class="layer-type">${escapeHtml(layer.type || "Layer")}</span>
          <strong>${escapeHtml(layer.name)}</strong>
        </div>
      `;
    })
    .join("");
  syncArtworkSelectionControls();
  renderArtworkSelectionSummary();
}

function getSelectedArtworkLayerIndexes(options = {}) {
  return getSelectedArtworkLayers(options).map((layer) => Number(layer.index));
}

function renderArtworkFonts() {
  const list = $("#customall-font-options");
  list.innerHTML = state.artworkFonts
    .map((font) => `<option value="${escapeHtml(font)}"></option>`)
    .join("");
}

async function searchCustomallFonts(search) {
  const query = search.trim();
  if (query.length < 2) return;
  try {
    const tab = await getActiveCustomallTab();
    const response = await sendCustomallMessage(tab.id, {
      type: "SEARCH_ARTWORK_FONTS",
      search: query
    });
    if (!response?.ok) return;
    state.artworkFonts = [
      ...new Set([
        ...DEFAULT_CUSTOMALL_FONTS,
        ...state.artworkFonts,
        ...(response.fonts || [])
      ])
    ];
    renderArtworkFonts();
  } catch {
    // Keep the current suggestions; Apply will report a precise error if needed.
  }
}

async function scanArtworkLayers() {
  if (state.artworkOperationRunning) return;
  const button = $("#scan-artwork-layers");
  setArtworkBatchBusy(true);
  button.textContent = "Đang quét…";
  clearArtworkOperationResults();
  setArtworkBatchFeedback("Đang đọc danh sách layer…");
  try {
    const tab = await getActiveCustomallTab();
    const response = await sendCustomallMessage(tab.id, {
      type: "GET_ARTWORK_LAYERS"
    });
    if (!response?.ok) {
      throw new Error(response?.error || "Không đọc được layer.");
    }
    state.artworkLayers = response.layers || [];
    state.artworkSelectedLayerIndexes = new Set(
      state.artworkLayers
        .filter((layer) => layer.type !== "Group")
        .map((layer) => Number(layer.index))
    );
    state.artworkCollapsedGroupIndexes = new Set(
      state.artworkLayers
        .filter(
          (layer) => layer.type === "Group" && Number(layer.depth || 0) > 0
        )
        .map((layer) => Number(layer.index))
    );
    renderArtworkLayers();
    const fontResponse = await sendCustomallMessage(tab.id, {
      type: "GET_ARTWORK_FONTS"
    });
    state.artworkFonts = [
      ...new Set([
        ...DEFAULT_CUSTOMALL_FONTS,
        ...(fontResponse?.ok ? fontResponse.fonts || [] : [])
      ])
    ];
    renderArtworkFonts();
    setArtworkBatchFeedback(
      fontResponse?.ok
        ? `Đã quét ${state.artworkLayers.length} layer và ${state.artworkFonts.length} font. Chọn layer cần xử lý.`
        : `Đã quét ${state.artworkLayers.length} layer. Đang dùng danh sách Font Customall dự phòng.`,
      fontResponse?.ok ? "success" : "warning"
    );
  } catch (error) {
    state.artworkLayers = [];
    state.artworkSelectedLayerIndexes.clear();
    state.artworkCollapsedGroupIndexes.clear();
    state.artworkFonts = [...DEFAULT_CUSTOMALL_FONTS];
    renderArtworkLayers();
    renderArtworkFonts();
    setArtworkBatchFeedback(error.message, "error");
  } finally {
    setArtworkBatchBusy(false);
    button.textContent = "Quét lại";
  }
}

function readTransformValues() {
  const mappings = [
    ["x", "#bulk-transform-x"],
    ["y", "#bulk-transform-y"],
    ["width", "#bulk-transform-width"],
    ["height", "#bulk-transform-height"],
    ["rotate", "#bulk-transform-rotate"],
    ["skew", "#bulk-transform-skew"]
  ];
  const values = {};
  for (const [key, selector] of mappings) {
    const raw = $(selector).value.trim().replace(",", ".");
    if (!raw) continue;
    const value = Number(raw);
    if (!Number.isFinite(value)) {
      throw new Error(`${key} phải là một con số.`);
    }
    values[key] = value;
  }
  return values;
}

async function applyArtworkTransform() {
  if (state.artworkOperationRunning) return;
  const selectedLayers = getSelectedArtworkLayers();
  const layerIndexes = selectedLayers.map((layer) => Number(layer.index));
  if (!layerIndexes.length) {
    setArtworkBatchFeedback("Chưa chọn layer để áp dụng.", "error");
    return;
  }

  let values;
  try {
    values = readTransformValues();
  } catch (error) {
    setArtworkBatchFeedback(error.message, "error");
    return;
  }
  if (!Object.keys(values).length) {
    setArtworkBatchFeedback("Hãy nhập ít nhất một giá trị Transform.", "error");
    return;
  }

  const button = $("#apply-artwork-transform");
  setArtworkBatchBusy(true);
  button.textContent = "Đang apply…";
  clearArtworkOperationResults();
  setArtworkBatchFeedback(`Đang áp dụng cho ${layerIndexes.length} layer…`);
  try {
    const tab = await getActiveCustomallTab();
    await preflightArtworkLayers(tab.id, selectedLayers);
    const response = await sendCustomallMessage(tab.id, {
      type: "APPLY_ARTWORK_TRANSFORM",
      layerIndexes,
      values
    });
    if (!response?.ok) {
      throw new Error(response?.error || "Không áp dụng được Transform.");
    }
    const failed = response.failed?.length || 0;
    if (!response.updated) {
      const firstFailure = response.failed?.[0];
      throw new Error(
        firstFailure
          ? `${firstFailure.name || "Layer"}: ${firstFailure.error}`
          : "Customall không cập nhật được layer nào."
      );
    }
    renderArtworkOperationResults(selectedLayers, response);
    setArtworkBatchFeedback(
      `Đã apply ${response.updated}/${layerIndexes.length} layer${failed ? `; lỗi ${failed} layer` : ""}. Chưa bấm Save.`,
      failed ? "warning" : "success"
    );
    showToast(`Đã cập nhật Transform cho ${response.updated} layer.`);
  } catch (error) {
    clearArtworkOperationResults();
    setArtworkBatchFeedback(error.message, "error");
  } finally {
    setArtworkBatchBusy(false);
    button.textContent = "Apply Transform";
  }
}

function readArtworkTextStyleValues() {
  const font = $("#bulk-text-font").value;
  const sizeRaw = $("#bulk-text-size").value.trim().replace(",", ".");
  const color = $("#bulk-text-color").value.trim();
  if (sizeRaw && !Number.isFinite(Number(sizeRaw))) {
    throw new Error("Size phải là một con số.");
  }
  if (color && !/^#[0-9a-f]{6}$/i.test(color)) {
    throw new Error("Color phải có dạng HEX, ví dụ #FF5500.");
  }
  return {
    font,
    size: sizeRaw ? Number(sizeRaw) : "",
    color
  };
}

async function applyArtworkTextStyle() {
  if (state.artworkOperationRunning) return;
  const selectedLayers = getSelectedArtworkLayers({ textOnly: true });
  const layerIndexes = selectedLayers.map((layer) => Number(layer.index));
  if (!layerIndexes.length) {
    setArtworkBatchFeedback("Chưa chọn Text layer để áp dụng.", "error");
    return;
  }

  let values;
  try {
    values = readArtworkTextStyleValues();
  } catch (error) {
    setArtworkBatchFeedback(error.message, "error");
    return;
  }
  if (!values.font && values.size === "" && !values.color) {
    setArtworkBatchFeedback(
      "Hãy nhập ít nhất một giá trị Font, Size hoặc Color.",
      "error"
    );
    return;
  }

  const button = $("#apply-artwork-text-style");
  setArtworkBatchBusy(true);
  button.textContent = "Đang apply…";
  clearArtworkOperationResults();
  setArtworkBatchFeedback(
    `Đang áp dụng Text Style cho ${layerIndexes.length} layer…`
  );
  try {
    const tab = await getActiveCustomallTab();
    await preflightArtworkLayers(tab.id, selectedLayers);
    const response = await sendCustomallMessage(tab.id, {
      type: "APPLY_ARTWORK_TEXT_STYLE",
      layerIndexes,
      values
    });
    if (!response?.ok) {
      throw new Error(response?.error || "Không áp dụng được Text Style.");
    }
    const failed = response.failed?.length || 0;
    if (!response.updated) {
      const firstFailure = response.failed?.[0];
      throw new Error(
        firstFailure
          ? `${firstFailure.name || "Layer"}: ${firstFailure.error}`
          : "Customall không cập nhật được Text layer nào."
      );
    }
    renderArtworkOperationResults(selectedLayers, response);
    setArtworkBatchFeedback(
      `Đã apply Text Style ${response.updated}/${layerIndexes.length} layer${failed ? `; lỗi ${failed} layer` : ""}. Chưa bấm Save.`,
      failed ? "warning" : "success"
    );
    showToast(`Đã cập nhật Text Style cho ${response.updated} layer.`);
  } catch (error) {
    clearArtworkOperationResults();
    setArtworkBatchFeedback(error.message, "error");
  } finally {
    setArtworkBatchBusy(false);
    button.textContent = "Apply Text Style";
  }
}

function readArtworkStrokeValues() {
  const enabled = $("#bulk-stroke-enabled").value;
  const widthRaw = $("#bulk-stroke-width").value.trim().replace(",", ".");
  const color = $("#bulk-stroke-color").value.trim();
  const mode = $("#bulk-stroke-mode").value;
  const lineJoin = $("#bulk-stroke-line-join").value;
  if (widthRaw && (!Number.isFinite(Number(widthRaw)) || Number(widthRaw) < 0)) {
    throw new Error("Stroke Width phải là số lớn hơn hoặc bằng 0.");
  }
  if (color && !/^#[0-9a-f]{6}$/i.test(color)) {
    throw new Error("Stroke Color phải có dạng HEX, ví dụ #FF5500.");
  }
  return {
    enabled,
    width: widthRaw ? Number(widthRaw) : "",
    color,
    mode,
    lineJoin
  };
}

async function applyArtworkStroke() {
  if (state.artworkOperationRunning) return;
  const selectedLayers = getSelectedArtworkLayers({ textOnly: true });
  const layerIndexes = selectedLayers.map((layer) => Number(layer.index));
  if (!layerIndexes.length) {
    setArtworkBatchFeedback("Chưa chọn Text layer để áp dụng Stroke.", "error");
    return;
  }

  let values;
  try {
    values = readArtworkStrokeValues();
  } catch (error) {
    setArtworkBatchFeedback(error.message, "error");
    return;
  }
  if (
    values.enabled === "" &&
    values.width === "" &&
    !values.color &&
    !values.mode &&
    !values.lineJoin
  ) {
    setArtworkBatchFeedback(
      "Hãy chọn ít nhất một thuộc tính Stroke cần thay đổi.",
      "error"
    );
    return;
  }

  const button = $("#apply-artwork-stroke");
  setArtworkBatchBusy(true);
  button.textContent = "Đang apply…";
  clearArtworkOperationResults();
  setArtworkBatchFeedback(
    `Đang áp dụng Stroke cho ${layerIndexes.length} layer…`
  );
  try {
    const tab = await getActiveCustomallTab();
    await preflightArtworkLayers(tab.id, selectedLayers);
    const response = await sendCustomallMessage(tab.id, {
      type: "APPLY_ARTWORK_STROKE",
      layerIndexes,
      values
    });
    if (!response?.ok) {
      throw new Error(response?.error || "Không áp dụng được Stroke.");
    }
    const failed = response.failed?.length || 0;
    if (!response.updated) {
      const firstFailure = response.failed?.[0];
      throw new Error(
        firstFailure
          ? `${firstFailure.name || "Layer"}: ${firstFailure.error}`
          : "Customall không cập nhật được Stroke cho layer nào."
      );
    }
    renderArtworkOperationResults(selectedLayers, response);
    setArtworkBatchFeedback(
      `Đã apply Stroke ${response.updated}/${layerIndexes.length} layer${
        failed
          ? `; lỗi ${failed} layer. ${response.failed
              .slice(0, 2)
              .map((item) => `${item.name}: ${item.error}`)
              .join(" | ")}`
          : ""
      }. Chưa bấm Save.`,
      failed ? "warning" : "success"
    );
    showToast(
      failed
        ? `Stroke ${response.updated}/${layerIndexes.length}. ${response.failed[0]?.name}: ${response.failed[0]?.error}`
        : `Đã cập nhật Stroke cho ${response.updated} layer.`
    );
  } catch (error) {
    clearArtworkOperationResults();
    setArtworkBatchFeedback(error.message, "error");
  } finally {
    setArtworkBatchBusy(false);
    button.textContent = "Apply Stroke";
  }
}

async function applyArtworkChangeCase() {
  if (state.artworkOperationRunning) return;
  const selectedLayers = getSelectedArtworkLayers({ textOnly: true });
  const layerIndexes = selectedLayers.map((layer) => Number(layer.index));
  if (!layerIndexes.length) {
    setArtworkBatchFeedback(
      "Chưa chọn Text layer để áp dụng Change Case.",
      "error"
    );
    return;
  }

  const changeCase = $("#bulk-change-case").value;
  if (!changeCase) {
    setArtworkBatchFeedback("Hãy chọn Default, Uppercase hoặc Lowercase.", "error");
    return;
  }

  const button = $("#apply-artwork-change-case");
  setArtworkBatchBusy(true);
  button.textContent = "Đang apply…";
  clearArtworkOperationResults();
  setArtworkBatchFeedback(
    `Đang áp dụng ${changeCase} cho ${layerIndexes.length} Text layer…`
  );
  try {
    const tab = await getActiveCustomallTab();
    await preflightArtworkLayers(tab.id, selectedLayers);
    const response = await sendCustomallMessage(tab.id, {
      type: "APPLY_ARTWORK_CHANGE_CASE",
      layerIndexes,
      value: changeCase
    });
    if (!response?.ok) {
      throw new Error(response?.error || "Không áp dụng được Change Case.");
    }
    const failed = response.failed?.length || 0;
    if (!response.updated) {
      const firstFailure = response.failed?.[0];
      throw new Error(
        firstFailure
          ? `${firstFailure.name || "Layer"}: ${firstFailure.error}`
          : "Customall không cập nhật được Change Case cho layer nào."
      );
    }
    renderArtworkOperationResults(selectedLayers, response);
    setArtworkBatchFeedback(
      `Đã apply ${changeCase} ${response.updated}/${layerIndexes.length} layer${
        failed ? `; lỗi ${failed} layer` : ""
      }. Chưa bấm Save.`,
      failed ? "warning" : "success"
    );
    showToast(`Đã cập nhật Change Case cho ${response.updated} layer.`);
  } catch (error) {
    clearArtworkOperationResults();
    setArtworkBatchFeedback(error.message, "error");
  } finally {
    setArtworkBatchBusy(false);
    button.textContent = "Apply Change Case";
  }
}

async function replaceArtworkLabels() {
  if (state.artworkOperationRunning) return;
  const layers = getSelectedArtworkLayers();
  const layerIndexes = layers.map((layer) => Number(layer.index));
  const find = $("#artwork-label-find").value;
  const replacement = $("#artwork-label-replace").value;
  if (!layerIndexes.length) {
    setArtworkBatchFeedback("Chưa có layer. Hãy bấm Quét lại trước.", "error");
    return;
  }
  if (!find) {
    setArtworkBatchFeedback("Hãy nhập nội dung Label cần tìm.", "error");
    return;
  }
  const button = $("#replace-artwork-labels");
  setArtworkBatchBusy(true);
  button.textContent = "Đang quét & đổi…";
  setArtworkBatchFeedback(`Đang quét Label của ${layerIndexes.length} layer trong template hiện tại…`);
  try {
    const tab = await getActiveCustomallTab();
    const response = await sendCustomallMessage(tab.id, {
      type: "REPLACE_ARTWORK_LABELS",
      layerIndexes,
      layers: layers.map(({ index, name, type, groupPath, occurrence }) => ({
        index,
        name,
        type,
        groupPath,
        occurrence
      })),
      find,
      replacement
    });
    if (!response?.ok) {
      throw new Error(response?.error || "Không replace được Label.");
    }
    const notes = [];
    if (response.skippedGroups) notes.push(`${response.skippedGroups} group được bỏ qua`);
    if (response.noLabel?.length) notes.push(`${response.noLabel.length} layer không có Label`);
    if (response.noMatch?.length) notes.push(`${response.noMatch.length} layer không khớp`);
    if (response.failed?.length) notes.push(`${response.failed.length} layer lỗi`);
    const details = [];
    if (response.failed?.[0]) {
      details.push(
        `Lỗi: ${response.failed[0].name || "Layer"}: ${response.failed[0].error}`
      );
    }
    if (response.noMatch?.[0]) {
      details.push(`Không khớp: ${response.noMatch[0].name || "Layer"}`);
    }
    const scanned = Number(response.scanned) || layerIndexes.length;
    setArtworkBatchFeedback(
      `Đã đổi ${response.updated}/${scanned} Label${notes.length ? `; ${notes.join(", ")}` : ""}. ${details.join(" | ")}${details.length ? ". " : ""}Chưa Save Artwork.`,
      response.failed?.length || response.noMatch?.length ? "warning" : "success"
    );
    showToast(`Đã cập nhật ${response.updated} Label.`);
  } catch (error) {
    setArtworkBatchFeedback(error.message, "error");
  } finally {
    setArtworkBatchBusy(false);
    button.textContent = "Quét & đổi Label";
  }
}

async function sendCustomallMessage(tabId, message) {
  let needsInjection = false;
  try {
    const ping = await chrome.tabs.sendMessage(tabId, {
      type: "PING_CUSTOMALL_CONTENT"
    });
    needsInjection =
      ping?.version !== chrome.runtime.getManifest().version;
  } catch (error) {
    if (!/Receiving end does not exist|Could not establish connection/i.test(error.message)) {
      throw error;
    }
    needsInjection = true;
  }

  if (needsInjection) {
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ["src/content/customall.js"]
    });
  }
  return chrome.tabs.sendMessage(tabId, message);
}

function setTibFeedback(message = "", tone = "") {
  const feedback = $("#tib-feedback");
  feedback.textContent = message;
  feedback.className = `upload-feedback${message ? " show" : ""}${tone ? ` ${tone}` : ""}`;
}

function setTibSmartFeedback(message = "", tone = "") {
  const feedback = $("#tib-smart-feedback");
  feedback.textContent = message;
  feedback.className = `upload-feedback${message ? " show" : ""}${tone ? ` ${tone}` : ""}`;
}

function setTibSmart2Feedback(message = "", tone = "") {
  const feedback = $("#tib-smart2-feedback");
  feedback.textContent = message;
  feedback.className = `upload-feedback${message ? " show" : ""}${tone ? ` ${tone}` : ""}`;
}

async function getActiveTeeinblueTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  let hostname = "";
  try {
    hostname = new URL(tab?.url || "").hostname;
  } catch {
    hostname = "";
  }
  if (!tab?.id || !/(^|\.)teeinblue\.com$/i.test(hostname)) {
    throw new Error("Hãy mở Artwork trên portal.teeinblue.com rồi thử lại.");
  }
  return tab;
}

async function sendTeeinblueMessage(tabId, message, preferredFrameId = null) {
  const allFrames = await chrome.webNavigation.getAllFrames({ tabId });
  const tibFrames = allFrames.filter((frame) => {
    try {
      return /(^|\.)teeinblue\.com$/i.test(new URL(frame.url).hostname);
    } catch {
      return false;
    }
  });
  const pingFrame = async (frameId) => {
    try {
      const response = await chrome.tabs.sendMessage(
        tabId,
        { type: "PING_TEEINBLUE_CONTENT" },
        { frameId }
      );
      return response ? { frameId, response } : null;
    } catch {
      return null;
    }
  };
  let framePings = (
    await Promise.all(tibFrames.map((frame) => pingFrame(frame.frameId)))
  ).filter(Boolean);

  // After an unpacked extension is Reloaded, an already-open TeeInBlue tab
  // can temporarily have no content-script listener at all. This is the only
  // safe case for programmatic initialization. Never inject when any listener
  // answers: that could mix old and new bytecode in the same frame.
  if (!framePings.length && tibFrames.length) {
    try {
      await chrome.scripting.executeScript({
        target: {
          tabId,
          frameIds: tibFrames.map((frame) => frame.frameId)
        },
        files: ["src/content/teeinblue.js"]
      });
    } catch (error) {
      throw new Error(
        `Không khởi tạo được PS Copilot trong tab TeeInBlue: ${error?.message || error}`
      );
    }
    framePings = (
      await Promise.all(tibFrames.map((frame) => pingFrame(frame.frameId)))
    ).filter(Boolean);
  }

  const compatiblePings = framePings.filter(
    ({ response }) =>
      response.runtimeFingerprint === TIB_EXPECTED_RUNTIME_FINGERPRINT
  );
  if (!compatiblePings.length) {
    const observed = [
      ...new Set(
        framePings.map(({ response }) =>
          response.runtimeFingerprint || `manifest-only:${response.version || "unknown"}`
        )
      )
    ].join(", ") || "none";
    throw new Error(
      `Tab TeeInBlue đang chạy logic cũ (${observed}). Hãy đóng tab Artwork này, Reload PS Copilot rồi mở lại Artwork. Cần ${TIB_EXPECTED_RUNTIME_FINGERPRINT}.`
    );
  }

  const campaignTopFrameMessages = new Set([
    "GET_TIB_CAMPAIGN_SOURCE",
    "CREATE_TIB_CAMPAIGN_SHELL",
    "PREPARE_TIB_CAMPAIGN_PRODUCT",
    "LINK_TIB_CAMPAIGN_ARTWORK",
    "UPLOAD_TIB_CAMPAIGN_MOCKUPS"
  ]);
  const resolvedFrameId = Number.isInteger(preferredFrameId)
    ? preferredFrameId
    : campaignTopFrameMessages.has(message.type)
      ? 0
      : null;
  const compatibleFrameIds = new Set(
    compatiblePings.map(({ frameId }) => frameId)
  );
  if (
    Number.isInteger(resolvedFrameId) &&
    !compatibleFrameIds.has(resolvedFrameId)
  ) {
    throw new Error(
      `Frame TeeInBlue đã quét trước đó không còn chạy đúng logic ${TIB_EXPECTED_RUNTIME_FINGERPRINT}. Hãy Quét lại sau khi mở lại Artwork.`
    );
  }
  const targetFrames = Number.isInteger(resolvedFrameId)
    ? tibFrames.filter(
        (frame) =>
          frame.frameId === resolvedFrameId &&
          compatibleFrameIds.has(frame.frameId)
      )
    : tibFrames.filter((frame) => compatibleFrameIds.has(frame.frameId));
  const pingByFrame = new Map(
    compatiblePings.map((entry) => [entry.frameId, entry.response])
  );
  const responses = (
    await Promise.all(
      targetFrames.map(async (frame) => {
        try {
          const response = await chrome.tabs.sendMessage(tabId, message, {
            frameId: frame.frameId
          });
          const runtime = pingByFrame.get(frame.frameId);
          return response
            ? {
                ...response,
                frameId: frame.frameId,
                runtimeFingerprint: runtime?.runtimeFingerprint,
                runtimeStartedAt: runtime?.runtimeStartedAt
              }
            : null;
        } catch {
          return null;
        }
      })
    )
  ).filter(Boolean);
  if (!responses.length) {
    throw new Error("Không kết nối được Artwork Teeinblue. Hãy refresh trang rồi thử lại.");
  }
  if (["SCAN_TIB_LABELS", "SCAN_TIB_SMART_SETUP", "SCAN_TIB_SMART_SETUP_V2", "GET_TIB_SMART_SETUP_V2_SOURCES"].includes(message.type)) {
    return responses.sort(
      (left, right) =>
        ((right.matches?.length || right.mappings?.length || right.rows?.length || right.sourceOptions?.length || 0) -
          (left.matches?.length || left.mappings?.length || left.rows?.length || left.sourceOptions?.length || 0))
    )[0];
  }
  return responses[0];
}

function setTibMode(mode) {
  const selected = ["smart", "smart2"].includes(mode) ? mode : "labels";
  $$(".tib-mode-tab").forEach((button) =>
    button.classList.toggle("active", button.dataset.tibMode === selected)
  );
  $("#tib-label-tool").hidden = selected !== "labels";
  $("#tib-smart-tool").hidden = selected !== "smart";
  $("#tib-smart2-tool").hidden = selected !== "smart2";
  if (selected === "smart2" && !state.tibSmart2Sources.length) {
    loadTibSmart2Sources({ silent: true });
  }
}

function selectedTibSmart2AdditionalKeys() {
  return $$("#tib-smart2-additional-sources input[type='checkbox']:checked").map(
    (input) => input.value
  );
}

function renderTibSmart2Sources(options = [], selectedPrimaryKey = "", selectedAdditionalKeys = null) {
  state.tibSmart2Sources = options;
  const primary = $("#tib-smart2-primary-source");
  const currentPrimary = selectedPrimaryKey || primary.value;
  const checked = new Set(
    selectedAdditionalKeys || selectedTibSmart2AdditionalKeys()
  );
  primary.innerHTML = [
    '<option value="">Tự nhận diện Option khớp nhiều layer nhất</option>',
    ...options.map(
      (option) =>
        `<option value="${escapeHtml(option.key)}">${escapeHtml(option.title)} (${option.matchCount || 0} layer)</option>`
    )
  ].join("");
  if ([...primary.options].some((option) => option.value === currentPrimary)) {
    primary.value = currentPrimary;
  }
  const excluded = primary.value;
  const additional = options.filter((option) => option.key !== excluded);
  $("#tib-smart2-additional-sources").innerHTML = additional.length
    ? additional
        .map(
          (option) => `
            <label class="tib-smart2-source-option">
              <input type="checkbox" value="${escapeHtml(option.key)}" ${checked.has(option.key) ? "checked" : ""} />
              <span>${escapeHtml(option.title)}</span>
            </label>`
        )
        .join("")
    : '<span class="field-note">Chưa đọc được Option khác để ghép AND.</span>';
}

async function loadTibSmart2Sources({ silent = false } = {}) {
  const button = $("#reload-tib-smart2-sources");
  if (button) {
    button.disabled = true;
    button.textContent = "Đang đọc Option…";
  }
  if (!silent) setTibSmart2Feedback("Đang đọc Option và Value trên Artwork…");
  try {
    const tab = await getActiveTeeinblueTab();
    const response = await sendTeeinblueMessage(tab.id, {
      type: "GET_TIB_SMART_SETUP_V2_SOURCES",
      values: { rule: $("#tib-smart2-rule").value }
    });
    if (!response?.ok) throw new Error(response?.error || "Không đọc được Option.");
    state.tibTabId = tab.id;
    state.tibFrameId = response.frameId;
    state.tibRuntimeFingerprint = response.runtimeFingerprint;
    renderTibSmart2Sources(response.sourceOptions || []);
    if (!silent) setTibSmart2Feedback(`Đã đọc ${response.sourceOptions?.length || 0} Option.`, "success");
  } catch (error) {
    if (!silent) setTibSmart2Feedback(error.message, "error");
  } finally {
    if (button) {
      button.disabled = false;
      button.textContent = "Đọc lại Option";
    }
  }
}

function renderTibSmartSources(options = [], selectedKey = "") {
  const select = $("#tib-smart-source");
  const current = selectedKey || select.value;
  select.innerHTML = [
    '<option value="">Tự nhận diện Option có nhiều giá trị nhất</option>',
    ...options.map(
      (option) =>
        `<option value="${escapeHtml(option.key)}">${escapeHtml(option.title)} (${option.valueCount})</option>`
    )
  ].join("");
  if ([...select.options].some((option) => option.value === current)) {
    select.value = current;
  }
}

function tibSmartStatusLabel(status) {
  return {
    matched: "✓ Matched",
    missing: "Thiếu layer",
    extra: "Layer dư",
    duplicate: "Duplicate"
  }[status] || status;
}

function renderTibSmartPreview(result) {
  const card = $("#tib-smart-preview");
  if (!result) {
    card.classList.add("hidden");
    return;
  }
  card.classList.remove("hidden");
  const matched = (result.mappings || []).filter(
    (item) => item.status === "matched"
  );
  $("#tib-smart-source-label").textContent = result.selectedSourceTitle || "Option";
  $("#tib-smart-matched").textContent = matched.length;
  $("#tib-smart-missing").textContent = result.missing?.length || 0;
  $("#tib-smart-extra").textContent = result.extras?.length || 0;
  $("#tib-smart-duplicate").textContent = result.duplicateCount || 0;
  const rows = [
    ...(result.mappings || []),
    ...(result.missing || []).map((item) => ({
      option: item.option,
      layer: "—",
      status: "missing"
    })),
    ...(result.extras || []).map((item) => ({
      option: "—",
      layer: item.layer,
      status: "extra"
    }))
  ];
  $("#tib-smart-rows").innerHTML = rows
    .map(
      (row) => `
        <div class="tib-smart-table tib-smart-row ${escapeHtml(row.status)}">
          <span title="${escapeHtml(row.option)}">${escapeHtml(row.option)}</span>
          <span title="${escapeHtml(row.layer)}">${escapeHtml(row.layer)}</span>
          <strong>${escapeHtml(tibSmartStatusLabel(row.status))}</strong>
        </div>`
    )
    .join("");
  $("#apply-tib-smart").disabled = matched.length === 0;
}

async function scanTibSmartSetup() {
  const button = $("#scan-tib-smart");
  button.disabled = true;
  button.textContent = "Đang quét…";
  setTibSmartFeedback("Đang đọc Option, layer và kiểm tra mapping…");
  try {
    const tab = await getActiveTeeinblueTab();
    state.tibTabId = tab.id;
    const response = await sendTeeinblueMessage(tab.id, {
      type: "SCAN_TIB_SMART_SETUP",
      values: {
        sourceKey: $("#tib-smart-source").value,
        rule: $("#tib-smart-rule").value
      }
    });
    if (!response?.ok) {
      throw new Error(response?.error || "Không quét được Smart Setup.");
    }
    state.tibSmartResult = response;
    state.tibFrameId = response.frameId;
    state.tibRuntimeFingerprint = response.runtimeFingerprint;
    renderTibSmartSources(response.sourceOptions, response.selectedSourceKey);
    renderTibSmartPreview(response);
    const matched = response.mappings?.filter(
      (item) => item.status === "matched"
    ).length || 0;
    const issues =
      (response.missing?.length || 0) +
      (response.extras?.length || 0) +
      (response.duplicateCount || 0);
    setTibSmartFeedback(
      `Đã map ${matched} dòng${issues ? `; phát hiện ${issues} cảnh báo` : ""}. Kiểm tra Preview trước khi Apply.`,
      issues ? "warning" : "success"
    );
  } catch (error) {
    state.tibSmartResult = null;
    renderTibSmartPreview(null);
    setTibSmartFeedback(error.message, "error");
  } finally {
    button.disabled = false;
    button.textContent = "Quét & xem trước";
  }
}

async function applyTibSmartSetup() {
  const result = state.tibSmartResult;
  const keys = (result?.mappings || [])
    .filter((item) => item.status === "matched")
    .map((item) => item.key);
  if (!keys.length) {
    setTibSmartFeedback("Không có dòng Matched an toàn để Apply.", "error");
    return;
  }
  const button = $("#apply-tib-smart");
  button.disabled = true;
  button.textContent = `Đang Apply 0/${keys.length}…`;
  setTibSmartFeedback(
    `Đang tạo Condition cho ${keys.length} layer. Giữ nguyên tab TeeInBlue cho tới khi hoàn tất…`
  );
  try {
    const tab = await getActiveTeeinblueTab();
    const response = await sendTeeinblueMessage(
      tab.id,
      { type: "APPLY_TIB_SMART_SETUP", keys },
      state.tibFrameId
    );
    const updatedCount = response?.updated?.length || 0;
    const failedCount = response?.failed?.length || 0;
    if (!response?.ok && !updatedCount) {
      throw new Error(
        response?.failed?.[0]?.error || response?.error || "TeeInBlue không nhận Condition."
      );
    }
    setTibSmartFeedback(
      `Đã Apply ${updatedCount}/${keys.length} Condition${failedCount ? `; ${failedCount} dòng lỗi. Lỗi đầu tiên: ${response.failed?.[0]?.error || "không xác định"}` : ""}. Chưa Save Artwork.`,
      failedCount ? "warning" : "success"
    );
    showToast(`Smart Setup đã Apply ${updatedCount} Condition. Chưa Save.`);
  } catch (error) {
    setTibSmartFeedback(error.message, "error");
  } finally {
    button.disabled = false;
    button.textContent = "Batch Apply Condition";
  }
}

function updateTibSmart2ApplyState() {
  const selected = $$("#tib-smart2-rows input[data-tib-smart2-key]:checked");
  $("#apply-tib-smart2").disabled = selected.length === 0;
}

function renderTibSmart2Preview(result) {
  const card = $("#tib-smart2-preview");
  if (!result) {
    card.classList.add("hidden");
    return;
  }
  card.classList.remove("hidden");
  $("#tib-smart2-safe").textContent = result.safeCount || 0;
  $("#tib-smart2-conflict").textContent = result.conflictCount || 0;
  $("#tib-smart2-skip").textContent = result.skipCount || 0;
  $("#select-all-tib-smart2").checked = (result.safeCount || 0) > 0;
  $("#tib-smart2-rows").innerHTML = (result.rows || [])
    .map((row) => {
      const safe = ["new", "replace"].includes(row.action);
      return `
        <label class="tib-smart2-row ${escapeHtml(row.action)}">
          <input type="checkbox" data-tib-smart2-key="${escapeHtml(row.key)}" ${safe ? "checked" : "disabled"} />
          <span>
            <span class="tib-smart2-row-head">
            <strong title="${escapeHtml(row.layer)}">${escapeHtml(row.layer)}</strong>
              <strong class="tib-smart2-action">${escapeHtml(row.action)} · ${escapeHtml(row.confidence)}%</strong>
            </span>
            ${row.error ? `<small class="error-text">${escapeHtml(row.error)}</small>` : ""}
          </span>
        </label>`;
    })
    .join("");
  updateTibSmart2ApplyState();
}

async function scanTibSmartSetupV2() {
  const button = $("#scan-tib-smart2");
  button.disabled = true;
  button.textContent = "Đang Scan Condition…";
  setTibSmart2Feedback(
    "Đang đọc Layer, tất cả Category/Option và Condition hiện tại…"
  );
  try {
    const tab = await getActiveTeeinblueTab();
    state.tibTabId = tab.id;
    const response = await sendTeeinblueMessage(tab.id, {
      type: "SCAN_TIB_SMART_SETUP_V2",
      values: {
        rule: $("#tib-smart2-rule").value,
        joinMode: $("#tib-smart2-join").value,
        primarySourceKey: $("#tib-smart2-primary-source").value,
        additionalSourceKeys: selectedTibSmart2AdditionalKeys()
      }
    });
    if (!response?.ok) {
      throw new Error(response?.error || "Không Scan được Smart Setup 2.0.");
    }
    state.tibSmart2Result = response;
    state.tibFrameId = response.frameId;
    state.tibRuntimeFingerprint = response.runtimeFingerprint;
    renderTibSmart2Sources(
      response.sourceOptions || [],
      response.selectedPrimarySourceKey || "",
      response.selectedAdditionalSourceKeys || []
    );
    renderTibSmart2Preview(response);
    setTibSmart2Feedback(
      `Đã quét ${response.layerCount || 0} layer. Safe ${response.safeCount || 0}, Conflict ${response.conflictCount || 0}, Skip ${response.skipCount || 0}.`,
      response.conflictCount ? "warning" : "success"
    );
  } catch (error) {
    state.tibSmart2Result = null;
    renderTibSmart2Preview(null);
    setTibSmart2Feedback(error.message, "error");
  } finally {
    button.disabled = false;
    button.textContent = "Scan & Preview Condition";
  }
}

async function applyTibSmartSetupV2() {
  const keys = $$("#tib-smart2-rows input[data-tib-smart2-key]:checked").map(
    (input) => input.dataset.tibSmart2Key
  );
  if (!keys.length) {
    setTibSmart2Feedback("Chưa chọn dòng NEW/ADD an toàn để Apply.", "error");
    return;
  }
  const button = $("#apply-tib-smart2");
  button.disabled = true;
  button.textContent = `Đang Apply ${keys.length} layer…`;
  setTibSmart2Feedback(
    "Đang giữ Condition cũ và bổ sung Final Condition. Không đóng tab TeeInBlue…"
  );
  try {
    const tab = await getActiveTeeinblueTab();
    const response = await sendTeeinblueMessage(
      tab.id,
      { type: "APPLY_TIB_SMART_SETUP_V2", keys },
      state.tibFrameId
    );
    const updated = response?.updated?.length || 0;
    const failed = response?.failed?.length || 0;
    if (!response?.ok && !updated) {
      throw new Error(
        response?.failed?.[0]?.error || response?.error || "TeeInBlue không nhận Final Condition."
      );
    }
    setTibSmart2Feedback(
      `Đã Apply ${updated}/${keys.length} layer${failed ? `; ${failed} dòng lỗi. Lỗi đầu tiên: ${response?.failed?.[0]?.error || "không xác định"}` : ""}. Chưa Save Artwork.`,
      failed ? "warning" : "success"
    );
    showToast(`Smart Setup 2.0 đã Apply ${updated} layer. Chưa Save.`);
  } catch (error) {
    setTibSmart2Feedback(error.message, "error");
  } finally {
    button.textContent = "Apply Selected Safe Changes";
    updateTibSmart2ApplyState();
  }
}

function renderTibLabelPreview() {
  const card = $("#tib-preview-card");
  const list = $("#tib-label-preview");
  const matches = state.tibLabelMatches;
  card.classList.toggle("hidden", !matches.length);
  $("#tib-match-count").textContent = `${matches.length} thay đổi`;
  $("#select-all-tib-labels").checked = matches.length > 0;
  list.innerHTML = matches
    .map(
      (match) => `
        <label class="tib-label-change">
          <input type="checkbox" data-tib-label-key="${escapeHtml(match.key)}" checked />
          <span class="tib-label-change-copy">
            <strong>${escapeHtml(match.kind)} · ${escapeHtml(match.label)}</strong>
            <span class="tib-before">${escapeHtml(match.before)}</span>
            <span class="tib-arrow">→</span>
            <span class="tib-after">${escapeHtml(match.after)}</span>
            ${match.visible ? "" : '<em>Đang ẩn trong giao diện</em>'}
          </span>
        </label>`
    )
    .join("");
}

async function refreshTibContext() {
  try {
    const tab = await getActiveTeeinblueTab();
    state.tibTabId = tab.id;
    state.tibFrameId = null;
    state.tibSmart2Result = null;
    renderTibSmart2Preview(null);
    $("#tib-context-label").textContent = `Teeinblue · ${tab.title || "Artwork"}`;
    setTibFeedback("");
    return tab;
  } catch (error) {
    state.tibTabId = null;
    state.tibFrameId = null;
    state.tibSmart2Result = null;
    renderTibSmart2Preview(null);
    $("#tib-context-label").textContent = "Chưa nhận diện Teeinblue Artwork";
    setTibFeedback(error.message, "error");
    return null;
  }
}

async function scanTibLabels() {
  const button = $("#scan-tib-labels");
  button.disabled = true;
  button.textContent = "Đang quét & đổi…";
  setTibFeedback("Đang lần lượt đọc và sửa Label trên từng layer…");
  try {
    const tab = await getActiveTeeinblueTab();
    state.tibTabId = tab.id;
    const response = await sendTeeinblueMessage(tab.id, {
      type: "SCAN_TIB_LABELS",
      values: {
        find: $("#tib-label-find").value,
        replacement: $("#tib-label-replace").value,
        caseSensitive: $("#tib-case-sensitive").checked
      }
    });
    if (!response?.ok) throw new Error(response?.error || "Không quét được Label.");
    state.tibLabelMatches = response.matches || [];
    state.tibFrameId = response.frameId;
    if (!state.tibLabelMatches.length) {
      setTibFeedback(
        `Đã quét ${response.layerCount || 0} layer, không tìm thấy Label cần thay.`,
        "warning"
      );
      return;
    }
    const applyResponse = await sendTeeinblueMessage(
      tab.id,
      {
        type: "APPLY_TIB_LABELS",
        keys: state.tibLabelMatches.map((match) => match.key)
      },
      state.tibFrameId
    );
    if (!applyResponse?.ok && !applyResponse?.updated?.length) {
      throw new Error(
        applyResponse?.error ||
          applyResponse?.failed?.[0]?.error ||
          "Teeinblue không nhận thay đổi."
      );
    }
    const updatedCount = applyResponse.updated?.length || 0;
    const failedCount = applyResponse.failed?.length || 0;
    setTibFeedback(
      `Đã quét ${response.layerCount || 0} layer và đổi ${updatedCount} Label${failedCount ? `; ${failedCount} Label lỗi` : ""}. Chưa Save Artwork.`,
      failedCount ? "warning" : "success"
    );
    showToast(`Đã cập nhật ${updatedCount} Label Teeinblue. Chưa Save.`);
  } catch (error) {
    state.tibLabelMatches = [];
    setTibFeedback(error.message, "error");
  } finally {
    button.disabled = false;
    button.textContent = "Quét & đổi Label";
  }
}

async function applyTibLabels() {
  const keys = $$('[data-tib-label-key]:checked').map(
    (input) => input.dataset.tibLabelKey
  );
  if (!keys.length) {
    setTibFeedback("Chưa chọn Label để Apply.", "error");
    return;
  }
  const button = $("#apply-tib-labels");
  button.disabled = true;
  button.textContent = "Đang Apply…";
  try {
    const tab = await getActiveTeeinblueTab();
    const response = await sendTeeinblueMessage(
      tab.id,
      { type: "APPLY_TIB_LABELS", keys },
      state.tibFrameId
    );
    if (!response?.ok && !response?.updated?.length) {
      throw new Error(
        response?.error || response?.failed?.[0]?.error || "Teeinblue không nhận thay đổi."
      );
    }
    const updatedKeys = new Set((response.updated || []).map((item) => item.key));
    state.tibLabelMatches = state.tibLabelMatches.filter(
      (match) => !updatedKeys.has(match.key)
    );
    renderTibLabelPreview();
    const failedCount = response.failed?.length || 0;
    setTibFeedback(
      `Đã đổi ${response.updated?.length || 0} trường${failedCount ? `; ${failedCount} trường lỗi` : ""}. Chưa bấm Save Artwork.`,
      failedCount ? "warning" : "success"
    );
    showToast(`Đã cập nhật ${response.updated?.length || 0} Label Teeinblue.`);
  } catch (error) {
    setTibFeedback(error.message, "error");
  } finally {
    button.disabled = false;
    button.textContent = "Apply các Label đã chọn";
  }
}

async function getActiveCustomallTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id || !String(tab.url || "").includes("app.customall.io")) {
    throw new Error("Hãy mở đúng tab Customall rồi thử lại.");
  }
  return tab;
}

async function getArtworkListTab() {
  const tabs = await chrome.tabs.query({});
  const existing = tabs.find((tab) => {
    try {
      const url = new URL(tab.url || "");
      return (
        url.hostname === "app.customall.io" &&
        (url.pathname === "/artworks" || url.pathname === "/artworks/")
      );
    } catch {
      return false;
    }
  });
  if (existing?.id) {
    await chrome.tabs.update(existing.id, { active: true });
    return existing;
  }
  const tab = await chrome.tabs.create({
    url: "https://app.customall.io/artworks?create=true"
  });
  await waitForTabComplete(tab.id);
  return tab;
}

async function refreshArtworkContext() {
  try {
    const tab = await getActiveCustomallTab();
    const context = await sendCustomallMessage(tab.id, {
      type: "GET_PAGE_CONTEXT"
    });
    const labels = {
      list: "Customall · Artwork list",
      create: "Customall · Add new artwork",
      editor: `Customall · ${context?.artwork?.title || "Artwork editor"}`,
      campaign: "Customall · Campaign"
    };
    $("#artwork-context-label").textContent =
      labels[context?.artworkMode] || "Customall · Trang khác";
    return { tab, context };
  } catch (error) {
    $("#artwork-context-label").textContent = "Chưa nhận diện trang Customall Artwork";
    throw error;
  }
}

async function prepareArtwork() {
  const values = {
    title: $("#artwork-title").value.trim(),
    category: $("#artwork-category").value.trim(),
    productBase:
      $("#artwork-product-base").value.trim() ||
      $("#artwork-category").value.trim()
  };
  if (!values.title) {
    setArtworkFeedback("Thiếu Artwork title.", "error");
    return;
  }
  if (!values.category) {
    setArtworkFeedback("Thiếu Category.", "error");
    return;
  }
  if (!values.productBase) {
    setArtworkFeedback("Thiếu Product base.", "error");
    return;
  }

  const button = $("#prepare-artwork");
  button.disabled = true;
  button.textContent = "Đang mở Customall…";
  setArtworkFeedback("Đang mở và điền form Add new artwork…");
  try {
    const tab = await getArtworkListTab();
    const response = await sendCustomallMessage(tab.id, {
      type: "PREPARE_ARTWORK_FORM",
      values
    });
    if (!response?.ok) {
      throw new Error(response?.error || "Không điền được form Artwork.");
    }
    setArtworkFeedback(
      "Đã điền Title, Category, chọn Printarea size, Product base và PNG. Kiểm tra lại rồi bấm Save trên Customall.",
      "success"
    );
    $("#artwork-context-label").textContent = "Customall · Add new artwork";
    showToast("Đã điền form Artwork.");
  } catch (error) {
    setArtworkFeedback(error.message, "error");
  } finally {
    button.disabled = false;
    button.textContent = "Mở & điền Add new artwork";
  }
}

function renderArtworkAudit(result) {
  $("#artwork-template-count").textContent = result.templateCount ?? "—";
  $("#artwork-layer-count").textContent = result.layerCount ?? "—";
  $("#artwork-audit-results").innerHTML = (result.issues || [])
    .map(
      (issue) =>
        `<div class="issue ${escapeHtml(issue.severity || "warning")}">${escapeHtml(issue.message)}</div>`
    )
    .join("");
}

async function auditArtwork() {
  try {
    const tab = await getActiveCustomallTab();
    const result = await sendCustomallMessage(tab.id, {
      type: "AUDIT_ARTWORK"
    });
    if (!result?.ok) {
      throw new Error(result?.error || "Không kiểm tra được Artwork.");
    }
    renderArtworkAudit(result);
    $("#artwork-context-label").textContent =
      `Customall · ${tab.title?.replace(/^Edit Artwork\s*/i, "").replace(/\s*-\s*CustomAll$/i, "") || "Artwork editor"}`;
    showToast(`Đã kiểm tra ${result.templateCount} template, ${result.layerCount} layer.`);
  } catch (error) {
    $("#artwork-template-count").textContent = "—";
    $("#artwork-layer-count").textContent = "—";
    $("#artwork-audit-results").innerHTML =
      `<div class="issue error">${escapeHtml(error.message)}</div>`;
  }
}

function normalizeCampaignFolderText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\.(png|jpe?g|webp)$/i, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/^(?:(?:test|update|fix|mvp\s*\d+)\s+)+/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

function campaignMockupEntries(files = state.campaignMockupFiles) {
  return files
    .map((file) => {
      const path = normalizePath(file.webkitRelativePath || file.name);
      const segments = path.split("/").filter(Boolean);
      const fileName = segments.at(-1) || file.name;
      const nameMatch = fileName.match(
        /^mk-(\d+|default|detail|review)\.(png|jpe?g|webp)$/i
      );
      if (!nameMatch) return null;
      const suffix = nameMatch[1].toLowerCase();
      const numbered = /^\d+$/.test(suffix);
      const mockupIndex = segments.findIndex((segment, index) => {
        if (index >= segments.length - 1) return false;
        const key = segment.toLowerCase().replace(/[\s_-]+/g, "");
        return key === "mk" || key === "mockup" || key === "mockups";
      });
      if (mockupIndex < 0) return null;
      const directMockupFolder = mockupIndex === 0;
      const campaignFolder = directMockupFolder
        ? "Folder MK đã chọn"
        : segments[mockupIndex - 1];
      const recordMatch = campaignFolder.match(/^([a-z0-9]{8,})\s*-\s*(.+)$/i);
      const folderTitle = directMockupFolder
        ? ""
        : recordMatch?.[2] || campaignFolder;
      return {
        file,
        number: numbered ? Number(suffix) : null,
        kind: numbered ? "number" : suffix,
        sortGroup: suffix === "default" ? 0 : numbered ? 1 : 2,
        campaignFolder,
        campaignPath: directMockupFolder
          ? "__direct-mockup-folder__"
          : segments.slice(0, mockupIndex).join("/"),
        mockupPath: segments.slice(0, mockupIndex + 1).join("/"),
        recordId: recordMatch?.[1] || "",
        folderTitle,
        folderTitleKey: normalizeCampaignFolderText(folderTitle)
      };
    })
    .filter(Boolean);
}

function resolveCampaignMockups(title) {
  const entries = campaignMockupEntries();
  if (!entries.length) {
    throw new Error("Không tìm thấy MK-số, MK-Default, MK-Detail hoặc MK-Review trong folder MK / Mock up / Mockup.");
  }
  const titleKey = normalizeCampaignFolderText(title);
  const campaignGroups = new Map();
  entries.forEach((entry) => {
    if (!campaignGroups.has(entry.campaignPath)) {
      campaignGroups.set(entry.campaignPath, []);
    }
    campaignGroups.get(entry.campaignPath).push(entry);
  });
  let matches = [...campaignGroups.values()].filter((group) => {
    const folderKey = group[0].folderTitleKey;
    if (!folderKey && campaignGroups.size === 1) return true;
    return (
      folderKey === titleKey ||
      folderKey.includes(titleKey) ||
      titleKey.includes(folderKey)
    );
  });
  if (!matches.length && campaignGroups.size === 1) {
    matches = [[...campaignGroups.values()][0]];
  }
  if (!matches.length) {
    throw new Error(`Không tìm thấy folder Record ID khớp Campaign "${title}".`);
  }
  if (matches.length > 1) {
    throw new Error(`Có ${matches.length} folder Record ID khớp Campaign. Hãy chọn folder campaign cụ thể hơn.`);
  }
  const matchedEntries = matches[0];
  const mockupPaths = [...new Set(matchedEntries.map((entry) => entry.mockupPath))];
  if (mockupPaths.length > 1) {
    throw new Error("Có nhiều folder MK / Mock up / Mockup trong cùng Record ID. Hãy giữ lại một folder.");
  }
  const sorted = [...matchedEntries].sort(
    (left, right) =>
      left.sortGroup - right.sortGroup ||
      (left.number ?? 0) - (right.number ?? 0) ||
      left.file.name.localeCompare(right.file.name)
  );
  return {
    recordId: sorted[0].recordId,
    campaignFolder: sorted[0].campaignFolder,
    mockupPath: sorted[0].mockupPath,
    files: sorted.map((entry) => entry.file)
  };
}

function renderCampaignMockupSummary(selection = state.campaignMockupSelection) {
  const summary = $("#campaign-mockup-summary");
  if (!summary) return;
  if (selection?.files?.length) {
    summary.textContent = `${selection.recordId || "Đã khớp folder"} · ${selection.files.length} file: ${selection.files.map((file) => file.name).join(", ")}`;
    return;
  }
  const validCount = campaignMockupEntries().length;
  summary.textContent = state.campaignMockupFiles.length
    ? `Đã đọc folder · ${validCount} file mockup hợp lệ`
    : "Lấy MK-1, MK-2…, MK-Default, MK-Detail và MK-Review trong folder MK / Mock up / Mockup";
}

async function readCampaignDirectory(handle, path = handle.name) {
  const files = [];
  for await (const [name, entry] of handle.entries()) {
    const entryPath = `${path}/${name}`;
    if (entry.kind === "directory") {
      files.push(...(await readCampaignDirectory(entry, entryPath)));
      continue;
    }
    const sourceFile = await entry.getFile();
    const file = new File([sourceFile], sourceFile.name, {
      type: sourceFile.type,
      lastModified: sourceFile.lastModified
    });
    Object.defineProperty(file, "webkitRelativePath", {
      configurable: true,
      value: entryPath
    });
    files.push(file);
  }
  return files;
}

function acceptCampaignMockupFiles(files) {
  state.campaignMockupFiles = [...files];
  state.campaignMockupSelection = null;
  renderCampaignMockupSummary();
  setCampaignFeedback(
    state.campaignMockupFiles.length
      ? `Đã đọc ${state.campaignMockupFiles.length} file trong folder. Tool sẽ lấy MK-số, MK-Default, MK-Detail và MK-Review đúng Record ID.`
      : "",
    state.campaignMockupFiles.length ? "success" : ""
  );
  if (state.campaignMockupFiles.length) {
    state.campaignStartAfterFolderPick = false;
    setTimeout(() => {
      if (!$("#prepare-campaign").disabled) {
        prepareCampaignFromArtwork();
      }
    }, 100);
  } else {
    state.campaignStartAfterFolderPick = false;
  }
}

async function pickCampaignMockupFolder() {
  if (typeof window.showDirectoryPicker !== "function") {
    $("#campaign-mockup-folder").click();
    return;
  }
  try {
    const handle = await window.showDirectoryPicker({ mode: "read" });
    acceptCampaignMockupFiles(await readCampaignDirectory(handle));
  } catch (error) {
    if (error?.name !== "AbortError") {
      setCampaignFeedback(`Không đọc được folder: ${error.message}`, "error");
    }
    state.campaignStartAfterFolderPick = false;
  }
}

function setCampaignFeedback(message = "", tone = "") {
  const feedback = $("#campaign-feedback");
  feedback.textContent = message;
  feedback.className = `upload-feedback${message ? " show" : ""}${tone ? ` ${tone}` : ""}`;
}

function renderCampaignDraft(draft) {
  state.campaignDraft = draft || null;
  $("#campaign-artwork-title").value = draft?.title || "";
  $("#campaign-artwork-category").value = draft?.category || "";
  $("#campaign-context-label").textContent = draft?.title
    ? `Artwork · ${draft.title}`
    : "Chưa đọc Artwork hiện tại";
}

async function readCampaignArtworkSource() {
  const tab = await getActiveCustomallTab();
  const response = await sendCustomallMessage(tab.id, {
    type: "GET_ARTWORK_CAMPAIGN_SOURCE"
  });
  if (!response?.ok) {
    throw new Error(
      response?.error || "Không đọc được Title và Category của Artwork."
    );
  }
  const draft = {
    artworkId: response.artworkId || "",
    title: response.title,
    category: response.category,
    categories: response.categories || [response.category]
  };
  renderCampaignDraft(draft);
  await chrome.storage.local.set({ campaignDraft: draft });
  return draft;
}

async function openCampaignCreateTab() {
  const tab = await chrome.tabs.create({
    url: "https://app.customall.io/campaigns?create=true"
  });
  await waitForTabComplete(tab.id, 45_000);
  state.campaignTabId = tab.id;
  return tab;
}

async function finishCampaignBuild(productBase = null) {
  const draft = state.campaignDraft;
  if (!draft) throw new Error("Thiếu Artwork để tạo Campaign.");
  const tabId = state.campaignTabId;
  if (!tabId) throw new Error("Không tìm thấy tab Campaign.");
  await chrome.tabs.update(tabId, { active: true });
  const productBaseLabel = productBase?.title || "Product Base đã chọn";
  setCampaignFeedback(
    `Đang xử lý "${productBaseLabel}", điền Campaign và link Artwork…`
  );

  const currentTab = await chrome.tabs.get(tabId);
  let isCampaignEditor = false;
  try {
    const currentUrl = new URL(currentTab.url || "");
    isCampaignEditor =
      currentUrl.hostname === "app.customall.io" &&
      currentUrl.pathname.startsWith("/campaigns/new");
  } catch {
    isCampaignEditor = false;
  }

  if (!isCampaignEditor) {
    if (!productBase?.title) {
      throw new Error("Chưa chọn Product Base trên Customall.");
    }
    let selectionResponse;
    try {
      selectionResponse = await sendCustomallMessage(tabId, {
        type: "SELECT_CAMPAIGN_PRODUCT_BASE",
        productBase
      });
    } catch (error) {
      // Navigation can close the old message port immediately after the
      // Product Base is selected. The URL check below is authoritative.
      if (
        !/message port closed|Receiving end does not exist|Could not establish connection/i.test(
          error.message
        )
      ) {
        throw error;
      }
    }
    if (selectionResponse && !selectionResponse.ok) {
      throw new Error(
        selectionResponse.error || "Không chọn được Product Base."
      );
    }
    await waitForCampaignEditor(tabId, 30_000);
  }

  const mockupSelection =
    state.campaignMockupSelection || resolveCampaignMockups(draft.title);
  const mockupSessionId = crypto.randomUUID();
  await storePendingUpload(
    mockupSessionId,
    mockupSelection.files.map((file) => ({
      name: file.name,
      path: file.name,
      blob: file,
      type: file.type,
      lastModified: file.lastModified
    }))
  );
  let response;
  try {
    response = await sendCustomallMessage(tabId, {
      type: "BUILD_CAMPAIGN_FROM_ARTWORK",
      source: draft,
      productBase: productBase || {},
      mockupSessionId
    });
  } finally {
    await removePendingUpload(mockupSessionId).catch(() => {});
  }
  if (!response?.ok) {
    throw new Error(response?.error || "Không tạo được Campaign.");
  }
  setCampaignFeedback(
    response.saved
      ? `Đã upload ${response.mockupCount || 0} mockup, tạo và lưu Campaign "${response.title}" với Product Base "${productBaseLabel}".`
      : `Đã điền Campaign name và link Artwork vào "${productBaseLabel}".`,
    "success"
  );
  showToast(
    response.saved
      ? `Đã upload ${response.mockupCount || 0} mockup và lưu Campaign.`
      : "Đã chuẩn bị Campaign và link Artwork."
  );
}

async function prepareCampaignFromArtwork() {
  const button = $("#prepare-campaign");
  if (!state.campaignMockupFiles.length) {
    state.campaignStartAfterFolderPick = true;
    setCampaignFeedback(
      "Hãy chọn folder tháng, folder Record ID hoặc trực tiếp folder MK. Sau khi chọn, tool sẽ tự chạy tiếp.",
      "error"
    );
    await pickCampaignMockupFolder();
    return;
  }
  button.disabled = true;
  button.textContent = "Đang đọc Artwork…";
  setCampaignFeedback("Đang đọc Title và Category từ Artwork hiện tại…");
  try {
    const draft = await readCampaignArtworkSource();
    state.campaignMockupSelection = resolveCampaignMockups(draft.title);
    renderCampaignMockupSummary();
    button.textContent = "Đang tìm Product Base…";
    const tab = await openCampaignCreateTab();
    const response = await sendCustomallMessage(tab.id, {
      type: "SEARCH_CAMPAIGN_PRODUCT_BASES",
      category: draft.category
    });
    if (!response?.ok) {
      throw new Error(response?.error || "Không tìm thấy Product Base.");
    }
    const matches = response.matches || [];
    if (!matches.length) {
      throw new Error(
        `Không có Product Base nào chứa Category "${draft.category}".`
      );
    }
    if (matches.length === 1) {
      await finishCampaignBuild(matches[0]);
      return;
    }
    const armed = await sendCustomallMessage(tab.id, {
      type: "ARM_CAMPAIGN_PRODUCT_BASE_AUTO_CREATE"
    });
    if (!armed?.ok) {
      throw new Error(
        armed?.error || "Không bật được chế độ tự tạo Campaign."
      );
    }
    button.textContent = "Hãy chọn Product Base trên Customall…";
    setCampaignFeedback(
      `Có ${matches.length} kết quả. Hãy click Product Base ngay trên bảng Customall; extension sẽ tự Create campaign và làm tiếp.`,
      "warning"
    );
    await waitForCampaignEditor(tab.id, 180_000);
    await finishCampaignBuild();
  } catch (error) {
    setCampaignFeedback(error.message, "error");
  } finally {
    button.disabled = false;
    button.textContent = "Đọc Artwork & tìm Product Base";
  }
}

function setTibCampaignFeedback(message = "", tone = "") {
  const feedback = $("#tib-campaign-feedback");
  feedback.textContent = message;
  feedback.className = `upload-feedback${message ? " show" : ""}${tone ? ` ${tone}` : ""}`;
}

function tibCampaignMockups(files = state.tibCampaignMockupFiles) {
  return [...files]
    .filter((file) => {
      const stem = file.name.replace(/\.[^.]+$/, "");
      return /^mk-(?:\d+|default|detail|review)$/i.test(stem) && !/(?:ads|pre)/i.test(stem);
    })
    .sort((left, right) => left.name.localeCompare(right.name, undefined, { numeric: true }));
}

function renderTibCampaignMockups() {
  const files = tibCampaignMockups();
  $("#tib-campaign-mockup-summary").textContent = files.length
    ? `${files.length} file: ${files.map((file) => file.name).join(", ")}`
    : "Lấy MK-1, MK-2…, MK-Default, MK-Detail và MK-Review; bỏ ADS/Pre";
}

function acceptTibCampaignMockups(files) {
  state.tibCampaignMockupFiles = [...files];
  renderTibCampaignMockups();
  const valid = tibCampaignMockups();
  setTibCampaignFeedback(
    valid.length ? `Đã nhận ${valid.length} mockup hợp lệ.` : "Không tìm thấy mockup đúng quy tắc.",
    valid.length ? "success" : "error"
  );
  return valid.length;
}

async function readTibCampaignSource() {
  const tab = await getActiveTeeinblueTab();
  const response = await sendTeeinblueMessage(tab.id, { type: "GET_TIB_CAMPAIGN_SOURCE" });
  if (!response?.ok) throw new Error(response?.error || "Không đọc được TeeInBlue Artwork.");
  state.tibCampaignDraft = {
    title: response.title,
    artworkId: response.artworkId,
    productHint: response.productHint || ""
  };
  state.tibCampaignTabId = null;
  $("#tib-campaign-title").value = response.title;
  // Product Base keyword is tied to this Artwork. Never reuse the previous
  // Artwork's keyword after the source changes.
  $("#tib-campaign-product-hint").value = response.productHint || "";
  $("#tib-campaign-context-label").textContent = `Artwork #${response.artworkId} · ${response.title}`;
  await chrome.storage.local.set({ tibCampaignDraft: state.tibCampaignDraft });
  return state.tibCampaignDraft;
}

async function waitForTibCampaignEditor(tabId, timeout = 30000) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    const tab = await chrome.tabs.get(tabId);
    if (/\/campaigns\/\d+\/edit/i.test(new URL(tab.url || "https://invalid/").pathname)) {
      await waitForTabComplete(tabId, 20000).catch(() => {});
      return tab;
    }
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  throw new Error("TeeInBlue chưa mở Campaign editor sau khi Save title.");
}

async function finishTibCampaign(tabId, draft) {
  const keyword = $("#tib-campaign-product-hint").value.trim();
  if (!keyword) throw new Error("Thiếu Product Base keyword.");
  setTibCampaignFeedback(`Đang tìm Product Base chứa “${keyword}”…`);
  let result = await sendTeeinblueMessage(tabId, {
    type: "PREPARE_TIB_CAMPAIGN_PRODUCT",
    keyword
  });
  if (!result?.ok) throw new Error(result?.error || "Không tìm được Product Base.");
  if (!result.selected) {
    setTibCampaignFeedback(
      `Có ${result.matches?.length || 0} kết quả. Chọn một Product Base trên TeeInBlue; tool sẽ tự chạy tiếp.`,
      "warning"
    );
    const started = Date.now();
    let selectedByUser = false;
    while (Date.now() - started < 180000) {
      await new Promise((resolve) => setTimeout(resolve, 500));
      const tab = await chrome.tabs.get(tabId);
      if (/product-id=\d+/i.test(tab.url || "")) {
        selectedByUser = true;
        break;
      }
    }
    if (!selectedByUser) throw new Error("Hết thời gian chờ chọn Product Base.");
  }

  setTibCampaignFeedback("Đang link Artwork vào Product Base…");
  const artwork = await sendTeeinblueMessage(tabId, {
    type: "LINK_TIB_CAMPAIGN_ARTWORK",
    title: draft.title
  });
  if (!artwork?.ok) throw new Error(artwork?.error || "Không link được Artwork.");

  const mockups = tibCampaignMockups();
  if (!mockups.length) {
    setTibCampaignFeedback("Đã tạo Campaign và link Artwork. Chưa có mockup để upload.", "success");
    return;
  }
  const sessionId = crypto.randomUUID();
  await storePendingUpload(sessionId, mockups.map((file) => ({
    name: file.name,
    path: file.name,
    blob: file,
    type: file.type,
    lastModified: file.lastModified
  })));
  try {
    setTibCampaignFeedback(`Đang upload và auto-select ${mockups.length} mockup…`);
    const upload = await sendTeeinblueMessage(tabId, {
      type: "UPLOAD_TIB_CAMPAIGN_MOCKUPS",
      sessionId,
      fileNames: mockups.map((file) => file.name)
    });
    if (!upload?.ok) throw new Error(upload?.error || "Không upload được mockup.");
    setTibCampaignFeedback(
      `Đã tạo Campaign, chọn Product Base, link Artwork và chọn ${upload.count || mockups.length} mockup. Kiểm tra Preview trước khi Launch.`,
      "success"
    );
  } finally {
    await removePendingUpload(sessionId).catch(() => {});
  }
}

async function prepareTibCampaign() {
  const button = $("#prepare-tib-campaign");
  button.disabled = true;
  button.textContent = "Đang tạo Campaign…";
  try {
    const draft = await readTibCampaignSource();
    setTibCampaignFeedback("Đang mở New Campaign và điền title…");
    const tab = await chrome.tabs.create({ url: "https://portal.teeinblue.com/campaigns/new" });
    state.tibCampaignTabId = tab.id;
    await waitForTabComplete(tab.id, 30000);
    const created = await sendTeeinblueMessage(tab.id, {
      type: "CREATE_TIB_CAMPAIGN_SHELL",
      title: draft.title
    });
    if (!created?.ok) throw new Error(created?.error || "Không tạo được Campaign title.");
    await waitForTibCampaignEditor(tab.id);
    await finishTibCampaign(tab.id, draft);
  } catch (error) {
    setTibCampaignFeedback(error.message, "error");
  } finally {
    button.disabled = false;
    button.textContent = "Đọc Artwork & tạo Campaign";
  }
}

async function init() {
  renderArtworkFonts();
  $("#app-version").textContent = `v${chrome.runtime.getManifest().version}`;
  $$(".tab").forEach((button) => button.addEventListener("click", () => setActiveTab(button.dataset.tab)));
  $("#refresh-tib-context").addEventListener("click", refreshTibContext);
  $("#scan-tib-labels").addEventListener("click", scanTibLabels);
  $$(".tib-mode-tab").forEach((button) =>
    button.addEventListener("click", () => setTibMode(button.dataset.tibMode))
  );
  $("#scan-tib-smart").addEventListener("click", scanTibSmartSetup);
  $("#apply-tib-smart").addEventListener("click", applyTibSmartSetup);
  $("#scan-tib-smart2").addEventListener("click", scanTibSmartSetupV2);
  $("#reload-tib-smart2-sources").addEventListener("click", () => loadTibSmart2Sources());
  $("#apply-tib-smart2").addEventListener("click", applyTibSmartSetupV2);
  $("#tib-smart2-rows").addEventListener("change", updateTibSmart2ApplyState);
  $("#select-all-tib-smart2").addEventListener("change", (event) => {
    $$("#tib-smart2-rows input[data-tib-smart2-key]:not(:disabled)").forEach(
      (input) => {
        input.checked = event.target.checked;
      }
    );
    updateTibSmart2ApplyState();
  });
  $("#tib-smart2-rule").addEventListener("change", () => {
    state.tibSmart2Result = null;
    renderTibSmart2Preview(null);
    setTibSmart2Feedback("Đã đổi Rule. Bấm Scan & Preview Condition.", "warning");
  });
  $("#tib-smart2-join").addEventListener("change", () => {
    state.tibSmart2Result = null;
    renderTibSmart2Preview(null);
    setTibSmart2Feedback("Đã đổi logic AND/OR. Bấm Scan & Preview Condition.", "warning");
  });
  $("#tib-smart2-primary-source").addEventListener("change", () => {
    renderTibSmart2Sources(state.tibSmart2Sources, $("#tib-smart2-primary-source").value);
    state.tibSmart2Result = null;
    renderTibSmart2Preview(null);
    setTibSmart2Feedback("Đã đổi Option chính. Chỉ tick Option cần ghép AND rồi Scan.", "warning");
  });
  $("#tib-smart-source").addEventListener("change", () => {
    state.tibSmartResult = null;
    renderTibSmartPreview(null);
    setTibSmartFeedback("Đã đổi Option nguồn. Bấm Quét & xem trước.", "warning");
  });
  $("#tib-smart-rule").addEventListener("change", () => {
    state.tibSmartResult = null;
    renderTibSmartPreview(null);
    setTibSmartFeedback("Đã đổi Rule. Bấm Quét & xem trước.", "warning");
  });
  $("#clipart-input").addEventListener("change", (event) => analyzeCliparts([...event.target.files]));
  $("#file-table").addEventListener("click", (event) => {
    const cell = event.target.closest("[data-tooltip]");
    if (!cell) return;
    event.stopPropagation();
    showNameTooltip(cell, cell.dataset.tooltip);
  });
  $(".table-wrap").addEventListener("scroll", hideNameTooltip);
  document.addEventListener("click", hideNameTooltip);
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") hideNameTooltip();
  });
  $("#upload-customall").addEventListener("click", uploadCliparts);
  $("#export-report").addEventListener("click", exportReport);
  $("#rename-toggle").addEventListener("change", renderClipartResults);
  $("#apply-batch-edit").addEventListener("click", applyBatchReplace);
  $("#reset-batch-edit").addEventListener("click", () => {
    state.batchRules = [];
    renderBatchEditorState();
    renderClipartResults();
    showToast("Đã hoàn tác chỉnh sửa hàng loạt.");
  });
  ["#batch-find", "#batch-replace"].forEach((selector) => {
    $(selector).addEventListener("keydown", (event) => {
      if (event.key === "Enter") applyBatchReplace();
    });
  });
  $("#open-customall").addEventListener("click", () =>
    chrome.tabs.create({ url: "https://app.customall.io/cliparts" })
  );

  $("#refresh-artwork-context").addEventListener("click", () =>
    refreshArtworkContext().catch((error) => showToast(error.message))
  );
  $("#prepare-artwork").addEventListener("click", prepareArtwork);
  $("#audit-artwork").addEventListener("click", auditArtwork);
  $("#scan-artwork-layers").addEventListener("click", scanArtworkLayers);
  $$("[data-artwork-tool]").forEach((button) => {
    button.addEventListener("click", () =>
      setArtworkTool(button.dataset.artworkTool)
    );
  });
  $("#select-all-artwork-layers").addEventListener("change", (event) => {
    state.artworkSelectedLayerIndexes = event.target.checked
      ? new Set(
          state.artworkLayers
            .filter((layer) => layer.type !== "Group")
            .map((layer) => Number(layer.index))
        )
      : new Set();
    syncArtworkSelectionControls();
    renderArtworkSelectionSummary();
    clearArtworkOperationResults();
  });
  $("#select-text-artwork-layers").addEventListener("click", () => {
    state.artworkSelectedLayerIndexes = new Set(
      state.artworkLayers
        .filter((layer) => layer.type === "Text")
        .map((layer) => Number(layer.index))
    );
    syncArtworkSelectionControls();
    renderArtworkSelectionSummary();
    clearArtworkOperationResults();
  });
  $("#artwork-layer-list").addEventListener("click", (event) => {
    const toggle = event.target.closest("[data-artwork-group-toggle]");
    if (!toggle) return;
    const index = Number(toggle.dataset.artworkGroupToggle);
    if (state.artworkCollapsedGroupIndexes.has(index)) {
      state.artworkCollapsedGroupIndexes.delete(index);
    } else {
      state.artworkCollapsedGroupIndexes.add(index);
    }
    renderArtworkLayers();
  });
  $("#artwork-layer-list").addEventListener("change", (event) => {
    const input = event.target.closest("[data-artwork-layer-index]");
    if (!input) return;
    const index = Number(input.dataset.artworkLayerIndex);
    const layer = state.artworkLayers.find(
      (item) => Number(item.index) === index
    );
    const affectedLayers =
      layer?.type === "Group"
        ? getArtworkDescendantLayers(index)
        : layer
          ? [layer]
          : [];
    if (input.checked) {
      affectedLayers.forEach((item) =>
        state.artworkSelectedLayerIndexes.add(Number(item.index))
      );
    } else {
      affectedLayers.forEach((item) =>
        state.artworkSelectedLayerIndexes.delete(Number(item.index))
      );
    }
    syncArtworkSelectionControls();
    renderArtworkSelectionSummary();
    clearArtworkOperationResults();
  });
  $("#apply-artwork-transform").addEventListener("click", applyArtworkTransform);
  $("#apply-artwork-text-style").addEventListener(
    "click",
    applyArtworkTextStyle
  );
  $("#apply-artwork-stroke").addEventListener("click", applyArtworkStroke);
  $("#apply-artwork-change-case").addEventListener(
    "click",
    applyArtworkChangeCase
  );
  $("#bulk-text-font").addEventListener("input", (event) => {
    clearTimeout(searchCustomallFonts.timeout);
    searchCustomallFonts.timeout = setTimeout(
      () => searchCustomallFonts(event.target.value),
      450
    );
  });
  $("#replace-artwork-labels")?.addEventListener("click", replaceArtworkLabels);
  $("#open-artworks").addEventListener("click", () =>
    chrome.tabs.create({ url: "https://app.customall.io/artworks?create=true" })
  );
  $("#open-campaigns").addEventListener("click", () =>
    chrome.tabs.create({ url: "https://app.customall.io/campaigns?create=true" })
  );
  $("#prepare-campaign").addEventListener(
    "click",
    prepareCampaignFromArtwork
  );
  $("#campaign-mockup-picker").addEventListener("click", (event) => {
    if (event.target === $("#campaign-mockup-folder")) return;
    event.preventDefault();
    pickCampaignMockupFolder();
  });
  $("#campaign-mockup-folder").addEventListener("change", (event) => {
    acceptCampaignMockupFiles(event.target.files);
  });
  $("#refresh-campaign-source").addEventListener("click", async () => {
    try {
      const draft = await readCampaignArtworkSource();
      setCampaignFeedback(
        `Đã đọc "${draft.title}" · Category "${draft.category}".`,
        "success"
      );
    } catch (error) {
      setCampaignFeedback(error.message, "error");
    }
  });
  $("#prepare-tib-campaign").addEventListener("click", prepareTibCampaign);
  $("#refresh-tib-campaign-source").addEventListener("click", async () => {
    try {
      const draft = await readTibCampaignSource();
      setTibCampaignFeedback(`Đã đọc Artwork #${draft.artworkId}.`, "success");
    } catch (error) {
      setTibCampaignFeedback(error.message, "error");
    }
  });
  $("#tib-campaign-mockup-folder").addEventListener("change", async (event) => {
    const validCount = acceptTibCampaignMockups(event.target.files);
    if (validCount) await prepareTibCampaign();
  });

  $("#refresh-context").addEventListener("click", queryActiveContext);
  $("#mockup-input").addEventListener("change", (event) => {
    state.mockupFiles = [...event.target.files];
    renderMockups();
  });
  $("#product-id").addEventListener("input", renderMockups);
  $("#store-handle").addEventListener("input", renderMockups);
  $("#upload-shopify").addEventListener("click", uploadMockupsToShopify);
  $("#open-shopify").addEventListener("click", openShopifyFiles);
  $("#refresh-lark-context").addEventListener("click", async () => {
    const context = await queryActiveContext();
    if (context?.app !== "shopify") {
      showToast("Mở Shopify Product rồi bấm refresh.");
    } else if (context.productTypeResolution?.source === "tag" && !context.productTypeResolution.ok) {
      showToast(context.productTypeResolution.error);
    } else if (!context.productType) {
      showToast("Không tự đọc được Product Type. Hãy nhập thủ công.");
    } else if (context.productTypeResolution?.source === "tag") {
      showToast(`Đã chọn theo tag: ${context.productTypeResolution.productType}.`);
    } else if (context.productTypeResolution?.source === "mapping") {
      showToast(`Đã mapping sang Lark: ${context.productTypeResolution.productType}.`);
    }
  });
  $("#lookup-lark").addEventListener("click", lookupLatestLarkData);
  $("#lark-product-type").addEventListener("keydown", (event) => {
    if (event.key === "Enter") lookupLatestLarkData();
  });
  $("#save-lark-settings").addEventListener("click", saveLarkSettings);
  $("#lark-results").addEventListener("click", async (event) => {
    const button = event.target.closest("[data-copy-target]");
    if (!button) return;
    const target = $(`#${button.dataset.copyTarget}`);
    await navigator.clipboard.writeText(target.dataset.rawValue || "");
    showToast("Đã copy.");
  });
  $("#clear-history").addEventListener("click", async () => {
    await chrome.storage.local.remove("uploadHistory");
    renderHistory([]);
  });

  const { uploadHistory = [] } = await chrome.storage.local.get("uploadHistory");
  renderHistory(uploadHistory);
  const { campaignDraft = null } =
    await chrome.storage.local.get("campaignDraft");
  renderCampaignDraft(campaignDraft);
  const { tibCampaignDraft = null } = await chrome.storage.local.get("tibCampaignDraft");
  if (tibCampaignDraft) {
    state.tibCampaignDraft = tibCampaignDraft;
    $("#tib-campaign-title").value = tibCampaignDraft.title || "";
    $("#tib-campaign-product-hint").value = tibCampaignDraft.productHint || "";
    $("#tib-campaign-context-label").textContent = tibCampaignDraft.title
      ? `Artwork #${tibCampaignDraft.artworkId || "?"} · ${tibCampaignDraft.title}`
      : "Chưa đọc TeeInBlue Artwork hiện tại";
  }
  const larkSettings = await getLarkSettings();
  $("#lark-api-url").value = larkSettings.endpoint;
  $("#lark-api-key").value = larkSettings.apiKey;
  await queryActiveContext();
}

init().catch((error) => {
  console.error(error);
  showToast(`Khởi tạo thất bại: ${error.message}`);
});
