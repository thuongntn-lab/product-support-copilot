const TELEMETRY_DEFAULT_ENDPOINT = "http://192.168.88.4:8787";
const TELEMETRY_DEFAULT_KEY = "";
let lastTelemetrySentAt = 0;

async function sendTelemetryHeartbeat(force = false, mvp = "") {
  if (!force && Date.now() - lastTelemetrySentAt < 60_000) return;
  lastTelemetrySentAt = Date.now();
  try {
    const settings = await chrome.storage.local.get(["larkApiUrl", "larkApiKey", "telemetryInstallationId"]);
    const installationId = settings.telemetryInstallationId || crypto.randomUUID();
    if (!settings.telemetryInstallationId) {
      await chrome.storage.local.set({ telemetryInstallationId: installationId });
    }
    const endpoint = String(settings.larkApiUrl || TELEMETRY_DEFAULT_ENDPOINT).replace(/\/+$/, "");
    await fetch(`${endpoint}/api/telemetry/heartbeat`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-API-Key": String(settings.larkApiKey || TELEMETRY_DEFAULT_KEY) },
      body: JSON.stringify({ installationId, extensionVersion: chrome.runtime.getManifest().version, mvp })
    });
  } catch (_) {
    // Telemetry must never interfere with the extension's workflow.
  }
}

chrome.runtime.onInstalled.addListener(() => {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});
  sendTelemetryHeartbeat(true);
});
chrome.runtime.onStartup.addListener(() => sendTelemetryHeartbeat(true));

const debuggerTarget = (tabId, sessionId) => ({
  tabId: Number(tabId),
  ...(sessionId ? { sessionId } : {})
});
const debuggerWait = (milliseconds) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));
const debuggerExecutionContexts = new Map();
const debuggerChildSessions = new Map();

chrome.debugger.onEvent.addListener((source, method, params) => {
  if (method === "Target.attachedToTarget" && source.tabId && params?.sessionId) {
    const sessions = debuggerChildSessions.get(Number(source.tabId));
    if (!sessions) return;
    sessions.add(params.sessionId);
    Promise.all([
      debuggerCommand(source.tabId, "Runtime.enable", {}, params.sessionId),
      debuggerCommand(
        source.tabId,
        "Target.setAutoAttach",
        {
          autoAttach: true,
          waitForDebuggerOnStart: false,
          flatten: true
        },
        params.sessionId
      )
    ]).catch(() => {});
    return;
  }
  if (method !== "Runtime.executionContextCreated" || !source.tabId) return;
  const context = params?.context;
  if (!context?.id) return;
  const contexts = debuggerExecutionContexts.get(Number(source.tabId));
  if (!contexts) return;
  const sessionId = source.sessionId || "";
  contexts.set(`${sessionId}:${context.id}`, {
    id: context.id,
    sessionId,
    frameId: context.auxData?.frameId || "",
    isDefault: context.auxData?.isDefault !== false
  });
});

async function debuggerCommand(tabId, method, params = {}, sessionId) {
  return chrome.debugger.sendCommand(
    debuggerTarget(tabId, sessionId),
    method,
    params
  );
}

async function debuggerEvaluate(tabId, expression, contextId, sessionId) {
  const response = await debuggerCommand(
    tabId,
    "Runtime.evaluate",
    {
      expression,
      awaitPromise: true,
      returnByValue: true,
      ...(contextId ? { contextId } : {})
    },
    sessionId
  );
  if (response.exceptionDetails) {
    throw new Error(response.exceptionDetails.text || "Không chạy được thao tác Shopify.");
  }
  return response.result?.value;
}

function deepPointExpression(finderBody) {
  return `(async () => {
    const elements = [];
    const walk = (root) => {
      for (const element of root.querySelectorAll("*")) {
        elements.push(element);
        if (element.shadowRoot) walk(element.shadowRoot);
      }
    };
    walk(document);
    const visible = (element) => {
      const rect = element?.getBoundingClientRect?.();
      const style = element ? getComputedStyle(element) : null;
      return Boolean(
        rect &&
        rect.width > 2 &&
        rect.height > 2 &&
        style?.visibility !== "hidden" &&
        style?.display !== "none"
      );
    };
    const normalize = (value) =>
      String(value || "").replace(/\\s+/g, " ").trim().toLowerCase();
    const element = (() => { ${finderBody} })();
    if (!element || !visible(element)) return null;
    element.scrollIntoView({
      behavior: "instant",
      block: "center",
      inline: "nearest"
    });
    await new Promise((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(resolve))
    );
    const rect = element.getBoundingClientRect();
    if (
      rect.bottom <= 0 ||
      rect.right <= 0 ||
      rect.top >= innerHeight ||
      rect.left >= innerWidth
    ) {
      return null;
    }
    let frameX = 0;
    let frameY = 0;
    try {
      let currentWindow = window;
      while (currentWindow !== currentWindow.top) {
        const frameElement = currentWindow.frameElement;
        if (!frameElement) break;
        const frameRect = frameElement.getBoundingClientRect();
        frameX += frameRect.left;
        frameY += frameRect.top;
        currentWindow = currentWindow.parent;
      }
    } catch (_error) {}
    return {
      x: frameX + rect.left + rect.width / 2,
      y: frameY + rect.top + rect.height / 2,
      text: String(element.innerText || element.textContent || "").trim(),
      tag: element.tagName
    };
  })()`;
}

async function scriptingPoint(tabId, descriptor) {
  if (!descriptor?.kind) return null;
  const results = await chrome.scripting.executeScript({
    target: { tabId: Number(tabId), allFrames: true },
    world: "ISOLATED",
    args: [descriptor],
    func: async (request) => {
      const elements = [];
      const walk = (root) => {
        for (const element of root.querySelectorAll("*")) {
          elements.push(element);
          if (element.shadowRoot) walk(element.shadowRoot);
        }
      };
      walk(document);
      const normalize = (value) =>
        String(value || "").replace(/\s+/g, " ").trim().toLowerCase();
      const visible = (element) => {
        const rect = element?.getBoundingClientRect?.();
        const style = element ? getComputedStyle(element) : null;
        return Boolean(
          rect &&
          rect.width > 2 &&
          rect.height > 2 &&
          style?.visibility !== "hidden" &&
          style?.display !== "none"
        );
      };
      const textOf = (element) =>
        normalize(
          element?.innerText ||
            element?.textContent ||
            element?.getAttribute?.("aria-label")
        );
      let element = null;
      if (request.kind === "category-field") {
        const anchor = document.getElementById("ProductCategoryPickerAnchor");
        element =
          anchor?.querySelector("s-internal-single-picker-field") ||
          anchor?.querySelector('[role="button"], button') ||
          anchor;
      } else if (request.kind === "shipping-anchor") {
        const anchor = document.getElementById(
          "PRODUCT.metafields.custom.shipping_page-anchor"
        );
        const candidates = anchor
          ? [
              ...anchor.querySelectorAll(
                'a, button, [role="button"], [tabindex], s-button, ui-button, polaris-button'
              )
            ].filter(visible)
          : [];
        element =
          candidates.find((item) => textOf(item) === "shipping page") ||
          candidates.find((item) =>
            normalize(item.getAttribute("aria-label")).includes("shipping page")
          ) ||
          (visible(anchor) ? anchor : null);
      } else if (request.kind === "category-search") {
        element = elements.find(
          (item) =>
            visible(item) &&
            item.matches("input, [role=searchbox]") &&
            normalize(item.getAttribute("placeholder")).includes(
              "search categories"
            )
        );
      } else if (request.kind === "page-search") {
        element = elements.find(
          (item) =>
            visible(item) &&
            item.matches("input, [role=searchbox]") &&
            normalize(item.getAttribute("placeholder")).includes("find pages")
        );
      } else if (request.kind === "page-picker-button") {
        element = elements.find((item) => {
          if (
            !visible(item) ||
            !item.matches(
              "button, [role=button], s-button, ui-button, polaris-button, s-internal-button"
            )
          ) {
            return false;
          }
          const text = textOf(item);
          return text === "select page" || text === "change";
        });
      } else if (request.kind === "page-option") {
        const needle = normalize(request.code);
        const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const token = new RegExp(
          `(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`,
          "i"
        );
        element = elements
          .filter(
            (item) =>
              visible(item) &&
              item.matches("s-internal-picker-option, [role=option]")
          )
          .map((item) => {
            const text = textOf(item);
            let score = token.test(text) ? 10 : 0;
            if (text.includes(`(${needle})`)) score += 20;
            if (text.includes("shipping")) score += 5;
            return { item, score };
          })
          .filter(({ score }) => score > 0)
          .sort((left, right) => right.score - left.score)[0]?.item;
      } else if (request.kind === "category-option") {
        const leaf = normalize(request.leaf);
        const parent = normalize(request.parent);
        element = elements
          .filter(
            (item) =>
              visible(item) &&
              item.matches("s-internal-picker-option, [role=option]")
          )
          .map((item) => {
            const text = textOf(item);
            let score = 0;
            if (text === leaf) score += 30;
            else if (text.startsWith(`${leaf} `) || text.includes(leaf)) {
              score += 20;
            }
            if (parent && text.includes(parent)) score += 15;
            return { item, score };
          })
          .filter(({ score }) => score > 0)
          .sort((left, right) => right.score - left.score)[0]?.item;
      } else if (request.kind === "save") {
        element = elements.find((item) => {
          if (
            !visible(item) ||
            !item.matches("button, [role=button], s-internal-button")
          ) {
            return false;
          }
          return (
            textOf(item) === "save" &&
            !item.disabled &&
            item.getAttribute("aria-disabled") !== "true"
          );
        });
      }
      if (!element || !visible(element)) return null;
      element.scrollIntoView({
        behavior: "instant",
        block: "center",
        inline: "nearest"
      });
      await new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(resolve))
      );
      const rect = element.getBoundingClientRect();
      let frameX = 0;
      let frameY = 0;
      try {
        let currentWindow = window;
        while (currentWindow !== currentWindow.top) {
          const frameElement = currentWindow.frameElement;
          if (!frameElement) break;
          const frameRect = frameElement.getBoundingClientRect();
          frameX += frameRect.left;
          frameY += frameRect.top;
          currentWindow = currentWindow.parent;
        }
      } catch (_error) {}
      return {
        x: frameX + rect.left + rect.width / 2,
        y: frameY + rect.top + rect.height / 2,
        text: String(element.innerText || element.textContent || "").trim(),
        tag: element.tagName
      };
    }
  });
  return results.map(({ result }) => result).find(Boolean) || null;
}

async function scriptingActivateShippingAnchor(tabId) {
  const results = await chrome.scripting.executeScript({
    target: { tabId: Number(tabId), allFrames: true },
    world: "ISOLATED",
    func: () => {
      const normalize = (value) =>
        String(value || "").replace(/\s+/g, " ").trim().toLowerCase();
      const visible = (element) => {
        const rect = element?.getBoundingClientRect?.();
        const style = element ? getComputedStyle(element) : null;
        return Boolean(
          rect &&
          rect.width > 2 &&
          rect.height > 2 &&
          style?.visibility !== "hidden" &&
          style?.display !== "none"
        );
      };
      const anchor = document.getElementById(
        "PRODUCT.metafields.custom.shipping_page-anchor"
      );
      if (!anchor) return null;
      const candidates = [
        ...anchor.querySelectorAll(
          'a, button, [role="button"], [tabindex], s-button, ui-button, polaris-button'
        )
      ].filter(visible);
      const element =
        candidates.find(
          (item) =>
            normalize(item.innerText || item.textContent) === "shipping page"
        ) ||
        candidates.find((item) =>
          normalize(item.getAttribute("aria-label")).includes("shipping page")
        ) ||
        (visible(anchor) ? anchor : null);
      if (!element) return null;

      element.scrollIntoView({
        behavior: "instant",
        block: "center",
        inline: "nearest"
      });
      element.focus?.({ preventScroll: true });
      const eventOptions = {
        bubbles: true,
        cancelable: true,
        composed: true,
        button: 0,
        buttons: 1,
        view: window
      };
      element.dispatchEvent(new PointerEvent("pointerdown", eventOptions));
      element.dispatchEvent(new MouseEvent("mousedown", eventOptions));
      element.dispatchEvent(
        new PointerEvent("pointerup", { ...eventOptions, buttons: 0 })
      );
      element.dispatchEvent(
        new MouseEvent("mouseup", { ...eventOptions, buttons: 0 })
      );
      element.dispatchEvent(
        new MouseEvent("click", { ...eventOptions, buttons: 0 })
      );
      return {
        tag: element.tagName,
        text: String(
          element.innerText ||
            element.textContent ||
            element.getAttribute("aria-label") ||
            ""
        ).trim()
      };
    }
  });
  return results.map(({ result }) => result).find(Boolean) || null;
}

async function debuggerAccessibilityPoint(tabId, descriptor) {
  if (!descriptor?.kind) return null;
  let response;
  try {
    await debuggerCommand(tabId, "Accessibility.enable");
    response = await debuggerCommand(tabId, "Accessibility.getFullAXTree");
  } catch (_error) {
    return null;
  }
  const normalize = (value) =>
    String(value || "").replace(/\s+/g, " ").trim().toLowerCase();
  const nodes = (response?.nodes || []).filter(
    (node) => node.backendDOMNodeId && !node.ignored
  );
  const candidates = nodes
    .map((node) => {
      const role = normalize(node.role?.value);
      const name = normalize(node.name?.value);
      const value = normalize(node.value?.value);
      const text = normalize(`${name} ${value}`);
      let score = 0;
      if (descriptor.kind === "shipping-anchor") {
        if (
          ["button", "combobox", "link"].includes(role) &&
          name.includes("shipping page")
        ) {
          score = 50;
        }
      } else if (descriptor.kind === "page-picker-button") {
        if (
          ["button", "link"].includes(role) &&
          (name === "select page" || name === "change")
        ) {
          score = name === "select page" ? 60 : 50;
        }
      } else if (descriptor.kind === "page-search") {
        if (
          ["searchbox", "textbox", "combobox"].includes(role) &&
          text.includes("find pages")
        ) {
          score = 60;
        }
      } else if (descriptor.kind === "page-option") {
        const code = normalize(descriptor.code);
        const escaped = code.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const token = new RegExp(
          `(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`,
          "i"
        );
        if (["option", "listitem", "button"].includes(role) && token.test(text)) {
          score = 40;
          if (text.includes(`(${code})`)) score += 30;
          if (text.includes("shipping")) score += 10;
        }
      } else if (descriptor.kind === "category-field") {
        if (
          ["button", "combobox", "textbox"].includes(role) &&
          (name === "category" ||
            name.includes("product category") ||
            text.includes("uncategorized"))
        ) {
          score = 60;
        }
      } else if (descriptor.kind === "category-search") {
        if (
          ["searchbox", "textbox", "combobox"].includes(role) &&
          text.includes("search categories")
        ) {
          score = 60;
        }
      } else if (descriptor.kind === "category-option") {
        const leaf = normalize(descriptor.leaf);
        const parent = normalize(descriptor.parent);
        if (
          text &&
          !["searchbox", "textbox", "combobox"].includes(role)
        ) {
          if (name === leaf || text === leaf) score += 70;
          else if (text.startsWith(`${leaf} `)) score += 55;
          else if (text.includes(leaf)) score += 40;
          if (parent && text.includes(parent)) score += 25;
          if (["option", "listitem", "button", "radio"].includes(role)) {
            score += 15;
          }
        }
      } else if (descriptor.kind === "save") {
        if (role === "button" && name === "save") score = 60;
      }
      return { node, score };
    })
    .filter(({ score }) => score > 0)
    .sort((left, right) => right.score - left.score);

  for (const { node } of candidates) {
    const backendNodeId = node.backendDOMNodeId;
    try {
      await debuggerCommand(tabId, "DOM.scrollIntoViewIfNeeded", {
        backendNodeId
      });
      await debuggerWait(120);
      const { model } = await debuggerCommand(tabId, "DOM.getBoxModel", {
        backendNodeId
      });
      const quad = model?.content || model?.border;
      if (!quad || quad.length < 8) continue;
      const xs = [quad[0], quad[2], quad[4], quad[6]];
      const ys = [quad[1], quad[3], quad[5], quad[7]];
      return {
        x: xs.reduce((sum, value) => sum + value, 0) / xs.length,
        y: ys.reduce((sum, value) => sum + value, 0) / ys.length,
        text: String(node.name?.value || node.value?.value || ""),
        tag: `AX:${node.role?.value || ""}`
      };
    } catch (_error) {
      // Stale accessibility nodes are expected during Shopify re-rendering.
    }
  }
  return null;
}

async function debuggerPoint(tabId, finderBody, fallbackDescriptor) {
  const contexts = [
    { id: undefined, sessionId: "" },
    ...[...(debuggerExecutionContexts.get(Number(tabId))?.values() || [])]
      .filter((context) => context.isDefault)
  ];
  const visited = new Set();
  for (const context of contexts) {
    const contextId = context.id;
    const sessionId = context.sessionId || "";
    const key = `${sessionId}:${contextId || "top"}`;
    if (visited.has(key)) continue;
    visited.add(key);
    try {
      const point = await debuggerEvaluate(
        tabId,
        deepPointExpression(finderBody),
        contextId,
        sessionId
      );
      if (point) return point;
    } catch (_error) {
      // Shopify can replace a frame while the picker is opening.
    }
  }
  const accessibilityPoint = await debuggerAccessibilityPoint(
    tabId,
    fallbackDescriptor
  );
  if (accessibilityPoint) return accessibilityPoint;
  return scriptingPoint(tabId, fallbackDescriptor);
}

async function debuggerWaitForPoint(
  tabId,
  finderBody,
  fallbackDescriptor,
  timeoutMs = 5000,
  intervalMs = 300
) {
  const deadline = Date.now() + timeoutMs;
  let point = null;
  while (!point && Date.now() < deadline) {
    point = await debuggerPoint(tabId, finderBody, fallbackDescriptor);
    if (!point) await debuggerWait(intervalMs);
  }
  return point;
}

async function debuggerEvaluateSomewhere(tabId, expression) {
  const contexts = [
    { id: undefined, sessionId: "" },
    ...[...(debuggerExecutionContexts.get(Number(tabId))?.values() || [])]
      .filter((context) => context.isDefault)
  ];
  const visited = new Set();
  for (const context of contexts) {
    const contextId = context.id;
    const sessionId = context.sessionId || "";
    const key = `${sessionId}:${contextId || "top"}`;
    if (visited.has(key)) continue;
    visited.add(key);
    try {
      const value = await debuggerEvaluate(
        tabId,
        expression,
        contextId,
        sessionId
      );
      if (value) return value;
    } catch (_error) {
      // Ignore execution contexts destroyed during Shopify re-rendering.
    }
  }
  return false;
}

async function debuggerClick(tabId, point) {
  if (!point) return false;
  await debuggerCommand(tabId, "Input.dispatchMouseEvent", {
    type: "mouseMoved",
    x: point.x,
    y: point.y
  });
  await debuggerCommand(tabId, "Input.dispatchMouseEvent", {
    type: "mousePressed",
    button: "left",
    clickCount: 1,
    x: point.x,
    y: point.y
  });
  await debuggerCommand(tabId, "Input.dispatchMouseEvent", {
    type: "mouseReleased",
    button: "left",
    clickCount: 1,
    x: point.x,
    y: point.y
  });
  return true;
}

async function debuggerReplaceFocusedText(tabId, value) {
  await debuggerCommand(tabId, "Input.dispatchKeyEvent", {
    type: "keyDown",
    key: "a",
    code: "KeyA",
    windowsVirtualKeyCode: 65,
    nativeVirtualKeyCode: 65,
    modifiers: 2
  });
  await debuggerCommand(tabId, "Input.dispatchKeyEvent", {
    type: "keyUp",
    key: "a",
    code: "KeyA",
    windowsVirtualKeyCode: 65,
    nativeVirtualKeyCode: 65,
    modifiers: 2
  });
  await debuggerCommand(tabId, "Input.insertText", { text: String(value || "") });
}

async function fillTrustedShippingPage(tabId, pageCode) {
  const code = String(pageCode || "").trim();
  if (!code) return { filled: false, missing: false, stage: "empty" };

  const pagePickerFinder = `return elements.find((element) => {
    if (
      !visible(element) ||
      !element.matches(
        "button, [role=button], s-button, ui-button, polaris-button, s-internal-button"
      )
    ) {
      return false;
    }
    const text = normalize(element.innerText || element.textContent || element.getAttribute("aria-label"));
    return text === "select page" || text === "change";
  });`;
  const pageSearchFinder = `return elements.find((element) =>
    visible(element) &&
    element.matches("input, [role=searchbox]") &&
    normalize(element.getAttribute("placeholder")).includes("find pages")
  );`;

  let search = await debuggerPoint(
    tabId,
    pageSearchFinder,
    { kind: "page-search" }
  );
  if (!search) {
    let openPicker = await debuggerPoint(
      tabId,
      pagePickerFinder,
      { kind: "page-picker-button" }
    );
    if (!openPicker) {
      const domActivation = await scriptingActivateShippingAnchor(tabId);
      await debuggerWait(350);
      openPicker = await debuggerWaitForPoint(
        tabId,
        pagePickerFinder,
        { kind: "page-picker-button" },
        3500
      );
      if (!openPicker) {
        const anchor = await debuggerPoint(
          tabId,
          `const anchor = document.getElementById("PRODUCT.metafields.custom.shipping_page-anchor");
          if (!anchor) return null;
          const candidates = [
            ...anchor.querySelectorAll(
              'a, button, [role="button"], [tabindex], s-button, ui-button, polaris-button'
            )
          ].filter(visible);
          return candidates.find((element) =>
            normalize(element.innerText || element.textContent) === "shipping page"
          ) ||
            candidates.find((element) =>
              normalize(element.getAttribute("aria-label")).includes("shipping page")
            ) ||
            (visible(anchor) ? anchor : null);`,
          { kind: "shipping-anchor" }
        );
        if (!anchor) {
          return {
            filled: false,
            missing: true,
            stage: domActivation
              ? `shipping-anchor-dom:${domActivation.tag}`
              : "shipping-anchor"
          };
        }
        await debuggerClick(tabId, anchor);
        await debuggerWait(250);

        const alreadySelected = await debuggerEvaluateSomewhere(
          tabId,
          `(() => {
            const elements = [];
            const walk = (root) => {
              for (const element of root.querySelectorAll("*")) {
                elements.push(element);
                if (element.shadowRoot) walk(element.shadowRoot);
              }
            };
            walk(document);
            const needle = ${JSON.stringify(`(${code})`.toLowerCase())};
            return elements.some((element) => {
              const rect = element.getBoundingClientRect?.();
              const text = String(element.innerText || element.textContent || "")
                .replace(/\\s+/g, " ")
                .trim()
                .toLowerCase();
              return rect?.width > 2 &&
                rect?.height > 2 &&
                text.length < 180 &&
                text.includes(needle);
            });
          })()`
        );
        if (alreadySelected) {
          return { filled: true, missing: false, stage: "already-selected" };
        }

        openPicker = await debuggerWaitForPoint(
          tabId,
          pagePickerFinder,
          { kind: "page-picker-button" },
          5000
        );
        if (!openPicker) {
          return {
            filled: false,
            missing: true,
            stage: domActivation
              ? `page-picker-after-dom:${domActivation.tag}`
              : "page-picker-button-after-anchor"
          };
        }
      }
    }
    await debuggerClick(tabId, openPicker);
    await debuggerWait(250);

    search = await debuggerWaitForPoint(
      tabId,
      pageSearchFinder,
      { kind: "page-search" },
      5000
    );
  }
  if (!search) {
    return { filled: false, missing: true, stage: "page-search-after-picker" };
  }
  await debuggerClick(tabId, search);
  await debuggerReplaceFocusedText(tabId, code);
  await debuggerWait(400);

  const option = await debuggerWaitForPoint(
    tabId,
    `const needle = ${JSON.stringify(code.toLowerCase())};
    const escaped = needle.replace(/[.*+?^$\\{\\}()|[\\]\\\\]/g, "\\\\$&");
    const token = new RegExp("(^|[^a-z0-9])" + escaped + "([^a-z0-9]|$)", "i");
    const options = elements.filter((element) =>
      visible(element) && element.matches("s-internal-picker-option, [role=option]")
    );
    return options
      .map((element) => {
        const text = normalize(element.innerText || element.textContent);
        let score = token.test(text) ? 10 : 0;
        if (text.includes("(" + needle + ")")) score += 20;
        if (text.includes("shipping")) score += 5;
        return { element, score };
      })
      .filter((item) => item.score > 0)
      .sort((left, right) => right.score - left.score)[0]?.element;`,
    { kind: "page-option", code },
    6000
  );
  if (!option) {
    return { filled: false, missing: true, stage: `page-option:${code}` };
  }
  await debuggerClick(tabId, option);
  await debuggerWait(600);
  return { filled: true, missing: false, stage: "selected" };
}

async function findAndFillCategoryOption(tabId, breadcrumb, query) {
  const segments = String(breadcrumb)
    .split(/\s*>\s*/)
    .map((segment) => segment.trim().toLowerCase())
    .filter(Boolean);
  const leaf = segments.at(-1) || "";
  const parent = segments.at(-2) || "";
  const search = await debuggerWaitForPoint(
    tabId,
    `return elements.find((element) =>
      visible(element) &&
      element.matches("input, [role=searchbox]") &&
      normalize(element.getAttribute("placeholder")).includes("search categories")
    );`,
    { kind: "category-search" },
    5000
  );
  if (!search) return false;
  await debuggerClick(tabId, search);
  await debuggerReplaceFocusedText(tabId, query);
  await debuggerWait(400);

  const option = await debuggerWaitForPoint(
    tabId,
    `const leaf = ${JSON.stringify(leaf)};
    const parent = ${JSON.stringify(parent)};
    const options = elements.filter((element) =>
      visible(element) && element.matches("s-internal-picker-option, [role=option]")
    );
    return options
      .map((element) => {
        const text = normalize(element.innerText || element.textContent);
        let score = 0;
        if (text === leaf) score += 30;
        else if (text.startsWith(leaf + " ") || text.includes(leaf)) score += 20;
        if (parent && text.includes(parent)) score += 15;
        return { element, score };
      })
      .filter((item) => item.score > 0)
      .sort((left, right) => right.score - left.score)[0]?.element;`,
    { kind: "category-option", leaf, parent },
    6000
  );
  if (!option) return false;
  await debuggerClick(tabId, option);
  await debuggerWait(600);
  return true;
}

async function fillTrustedCategory(tabId, categoryBreadcrumb) {
  const breadcrumb = String(categoryBreadcrumb || "").trim();
  if (!breadcrumb) return { filled: false, missing: false, stage: "empty" };

  let search = await debuggerPoint(
    tabId,
    `return elements.find((element) =>
      visible(element) &&
      element.matches("input, [role=searchbox]") &&
      normalize(element.getAttribute("placeholder")).includes("search categories")
    );`,
    { kind: "category-search" }
  );
  if (!search) {
    const field = await debuggerPoint(
      tabId,
      `const anchor = document.getElementById("ProductCategoryPickerAnchor");
      return anchor?.querySelector("s-internal-single-picker-field") ||
        anchor?.querySelector('[role="button"], button');`,
      { kind: "category-field" }
    );
    if (!field) {
      return { filled: false, missing: true, stage: "category-field" };
    }
    await debuggerClick(tabId, field);
    await debuggerWait(250);
    search = await debuggerWaitForPoint(
      tabId,
      `return elements.find((element) =>
        visible(element) &&
        element.matches("input, [role=searchbox]") &&
        normalize(element.getAttribute("placeholder")).includes("search categories")
      );`,
      { kind: "category-search" },
      5000
    );
  }
  if (!search) {
    return { filled: false, missing: true, stage: "category-search" };
  }

  let selected = await findAndFillCategoryOption(tabId, breadcrumb, breadcrumb);
  if (!selected) {
    const leaf = breadcrumb.split(/\s*>\s*/).filter(Boolean).at(-1) || breadcrumb;
    selected = await findAndFillCategoryOption(tabId, breadcrumb, leaf);
  }
  if (!selected) {
    return { filled: false, missing: true, stage: "category-option" };
  }
  return {
    filled: selected,
    missing: !selected,
    stage: selected ? "selected" : "category-option"
  };
}

async function saveTrustedShopifyProduct(tabId) {
  const save = await debuggerPoint(
    tabId,
    `return elements.find((element) => {
      if (!visible(element) || !element.matches("button, [role=button], s-internal-button")) {
        return false;
      }
      const text = normalize(element.innerText || element.textContent || element.getAttribute("aria-label"));
      return text === "save" &&
        !element.disabled &&
        element.getAttribute("aria-disabled") !== "true";
    });`,
    { kind: "save" }
  );
  if (!save) return { ok: false, error: "Không tìm thấy nút Save đang hoạt động." };
  await debuggerClick(tabId, save);
  await debuggerWait(700);
  return { ok: true };
}

async function withShopifyDebugger(tabId, task) {
  const target = debuggerTarget(tabId);
  await chrome.debugger.attach(target, "1.3");
  debuggerExecutionContexts.set(Number(tabId), new Map());
  debuggerChildSessions.set(Number(tabId), new Set());
  try {
    await debuggerCommand(tabId, "Runtime.disable").catch(() => {});
    await debuggerCommand(tabId, "Runtime.enable");
    await debuggerCommand(tabId, "DOM.enable");
    await debuggerCommand(tabId, "Accessibility.enable");
    await debuggerCommand(tabId, "Target.setAutoAttach", {
      autoAttach: true,
      waitForDebuggerOnStart: false,
      flatten: true
    });
    await debuggerWait(800);
    return await task();
  } finally {
    debuggerExecutionContexts.delete(Number(tabId));
    debuggerChildSessions.delete(Number(tabId));
    await chrome.debugger.detach(target).catch(() => {});
  }
}

async function fillTrustedShopifyPickers(tabId, values = {}) {
  return withShopifyDebugger(tabId, async () => {
    const filled = [];
    const missing = [];
    const category = await fillTrustedCategory(tabId, values.categoryBreadcrumb);
    if (category.filled) filled.push("Category");
    if (category.missing) missing.push("Category");

    const shipping = await fillTrustedShippingPage(tabId, values.shippingPage);
    if (shipping.filled) filled.push("Shipping Page");
    if (shipping.missing) missing.push("Shipping Page");
    const contextCount =
      debuggerExecutionContexts.get(Number(tabId))?.size || 0;
    const childCount =
      debuggerChildSessions.get(Number(tabId))?.size || 0;
    const debugSuffix = `@${contextCount}ctx/${childCount}child`;
    return {
      ok: filled.length > 0,
      filled,
      missing,
      diagnostics: {
        Category: `${category.stage}${debugSuffix}`,
        "Shipping Page": `${shipping.stage}${debugSuffix}`
      }
    };
  });
}

async function fillTrustedShopifyGiftbox(tabId, productHandle) {
  const handle = String(productHandle || "").trim();
  if (!handle) return { ok: false, missing: false, stage: "empty" };
  return withShopifyDebugger(tabId, async () => {
    const encoded = JSON.stringify(handle);
    const expression = `(async () => {
      const norm = (value) => String(value || "").replace(/\\s+/g, " ").trim().toLowerCase();
      const visible = (el) => { const r = el?.getBoundingClientRect?.(); const s = el ? getComputedStyle(el) : null; return Boolean(r && r.width > 2 && r.height > 2 && s?.display !== "none" && s?.visibility !== "hidden"); };
      const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
      const all = [];
      const walk = (root) => { for (const el of root.querySelectorAll("*")) { all.push(el); if (el.shadowRoot) walk(el.shadowRoot); } };
      walk(document);
      const giftboxAnchor = document.getElementById("PRODUCT.metafields.custom.giftbox-anchor");
      const editGiftbox = all.find((el) => visible(el) && norm(el.getAttribute?.("aria-label")) === "edit giftbox metafield") ||
        giftboxAnchor?.querySelector?.('[role="button"]');
      if (editGiftbox) {
        editGiftbox.click();
        await wait(350);
        all.length = 0;
        walk(document);
      }
      const isGiftboxText = (value) => /gift\\s*box/i.test(norm(value));
      const labels = all.filter((el) => visible(el) && isGiftboxText(el.innerText || el.textContent));
      const inputs = all.filter((el) => visible(el) && el.matches("input:not([type=hidden]), textarea, [contenteditable=true], [role=textbox]"));
      const compactName = (value) => norm(value).replace(/[^a-z0-9]/g, "");
      const giftboxNamed = (el) => {
        const names = [
          el.getAttribute?.("aria-label"),
          el.getAttribute?.("name"),
          el.id,
          el.getAttribute?.("data-label"),
          el.getAttribute?.("label"),
          el.getAttribute?.("placeholder"),
          el.getAttribute?.("data-key"),
          el.getAttribute?.("data-name"),
          el.getAttribute?.("data-field-key"),
          el.getAttribute?.("data-metafield-key"),
          el.getAttribute?.("data-testid"),
          el.getAttribute?.("title")
        ];
        return names.some((value) => compactName(value).includes("giftbox"));
      };
      const namedHost = all.find(giftboxNamed);
      let field = inputs.find(giftboxNamed) ||
        namedHost?.shadowRoot?.querySelector?.("input:not([type=hidden]), textarea, [contenteditable=true], [role=textbox]") ||
        namedHost?.querySelector?.("input:not([type=hidden]), textarea, [contenteditable=true], [role=textbox]");
      const byId = new Map(inputs.filter((input) => input.id).map((input) => [input.id, input]));
      const labelTextById = new Map(all.filter((el) => el.id && el.tagName === "LABEL").map((label) => [label.id, label.textContent || ""]));
      if (!field) {
        field = inputs.find((input) => {
          const labelledBy = String(input.getAttribute?.("aria-labelledby") || "").split(/\\s+/).filter(Boolean);
          return labelledBy.some((id) => isGiftboxText(labelTextById.get(id)));
        }) || null;
      }
      if (!field) {
        for (const label of labels) {
          const linkedId = label.getAttribute?.("for") || label.getAttribute?.("aria-controls");
          const linked = linkedId ? byId.get(linkedId) : null;
          if (linked) { field = linked; break; }
          if (label.control && inputs.includes(label.control)) { field = label.control; break; }
          const container = label.closest?.("label, fieldset, [role=group], [class*=field], [class*=metafield], [data-field]");
          const localInputs = inputs.filter((input) => container?.contains?.(input));
          if (localInputs.length === 1) { field = localInputs[0]; break; }
        }
      }
      if (!field) {
        let best = Infinity;
        for (const label of labels) {
          const lr = label.getBoundingClientRect();
          const lcx = lr.left + lr.width / 2;
          const lcy = lr.top + lr.height / 2;
          for (const input of inputs) {
            const ir = input.getBoundingClientRect();
            const distance = Math.hypot((ir.left + ir.width / 2) - lcx, (ir.top + ir.height / 2) - lcy);
            if (distance < best) { best = distance; field = input; }
          }
        }
      }
      if (!field) return { ok: false, missing: true, stage: "not-found", debug: { labels: labels.length, inputs: inputs.length, named: Boolean(namedHost) } };
      const previous = String(field.value ?? field.textContent ?? "");
      field.focus();
      field.select?.();
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
      try { document.execCommand?.("insertText", false, ${encoded}); } catch {}
      if (String(field.value ?? field.textContent ?? "") !== ${encoded}) {
        if ("value" in field && setter) setter.call(field, ${encoded}); else field.textContent = ${encoded};
      }
      field.dispatchEvent(new InputEvent("input", { bubbles: true, composed: true, inputType: "insertText", data: ${encoded} }));
      field.dispatchEvent(new Event("change", { bubbles: true, composed: true }));
      const propsKey = Object.getOwnPropertyNames(field).find((key) => key.startsWith("__reactProps"));
      const props = propsKey ? field[propsKey] : null;
      const reactEvent = { target: field, currentTarget: field, nativeEvent: new Event("input", { bubbles: true, composed: true }), type: "input", bubbles: true, cancelable: true, preventDefault() {}, stopPropagation() {}, persist() {} };
      props?.onInput?.(reactEvent); props?.onChange?.({ ...reactEvent, type: "change", nativeEvent: new Event("change", { bubbles: true, composed: true }) });
      field.blur?.(); await wait(220);
      const value = String(field.value ?? field.textContent ?? "");
      return { ok: value === ${encoded}, missing: value !== ${encoded}, stage: "devtools-dom", previous, value };
    })()`;
    const result = await debuggerEvaluateSomewhere(tabId, expression);
    return { ...(result || { ok: false, missing: true, stage: "no-context" }), diagnostics: `devtools@${debuggerExecutionContexts.get(Number(tabId))?.size || 0}ctx` };
  });
}

async function setCustomallMaxFontSizeMain(tabId, value) {
  const expected = Number(value);
  if (!Number.isFinite(expected) || expected <= 0) {
    return { ok: false, error: "Max font size không hợp lệ." };
  }
  const results = await chrome.scripting.executeScript({
    target: { tabId: Number(tabId) },
    world: "MAIN",
    args: [expected],
    func: async (nextMaxFontSize) => {
      const wait = (milliseconds) =>
        new Promise((resolve) => setTimeout(resolve, milliseconds));
      const enable = document.querySelector("#personalized_enable_max_size");
      if (!enable) {
        return { ok: false, error: "Không tìm thấy Enable max size." };
      }
      if (!enable.checked) {
        enable.click();
        await wait(450);
      }
      let input = document.querySelector("#personalized_max_font_size");
      if (!input) {
        return { ok: false, error: "Không tìm thấy ô Max font size." };
      }

      const setter = Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value"
      )?.set;
      const expectedText = String(nextMaxFontSize);
      const matchesExpected = (candidate) => {
        const numeric = Number(candidate);
        return (
          Number.isFinite(numeric) &&
          Math.abs(numeric - nextMaxFontSize) <= 0.0001
        );
      };
      const getReactProps = (field) => {
        const key = Object.getOwnPropertyNames(field || {}).find((name) =>
          name.startsWith("__reactProps")
        );
        return key ? field[key] : null;
      };
      const finishFormCommit = async () => {
        input =
          document.querySelector("#personalized_max_font_size") || input;
        input.dispatchEvent(
          new Event("change", { bubbles: true, composed: true })
        );
        await wait(180);
        input.blur();
        await wait(1100);
        input =
          document.querySelector("#personalized_max_font_size") || input;
        return matchesExpected(input.value);
      };

      const commitMountedReactHandlers = async () => {
        input =
          document.querySelector("#personalized_max_font_size") || input;
        input.focus();
        input.select?.();
        setter?.call(input, expectedText);
        const props = getReactProps(input);
        if (
          typeof props?.onChange !== "function" &&
          typeof props?.onBlur !== "function"
        ) {
          return false;
        }
        const nativeEvent = new Event("change", {
          bubbles: true,
          composed: true
        });
        const reactEvent = {
          target: input,
          currentTarget: input,
          nativeEvent,
          type: "change",
          bubbles: true,
          cancelable: true,
          defaultPrevented: false,
          eventPhase: 3,
          isTrusted: false,
          timeStamp: Date.now(),
          preventDefault() {},
          stopPropagation() {},
          persist() {},
          isDefaultPrevented: () => false,
          isPropagationStopped: () => false
        };
        props?.onChange?.(reactEvent);
        await wait(300);
        input =
          document.querySelector("#personalized_max_font_size") || input;
        const blurProps = getReactProps(input);
        blurProps?.onBlur?.({
          ...reactEvent,
          target: input,
          currentTarget: input,
          type: "blur"
        });
        return finishFormCommit();
      };

      let commitStrategy = "";

      // Follow the same editing route as typing in Customall.
      input.focus();
      input.select?.();
      try {
        document.execCommand?.("insertText", false, expectedText);
      } catch {
        // Fall through to the native/React paths below.
      }
      if (await finishFormCommit()) {
        commitStrategy = "insert-text";
      }

      // A controlled input can display the new number while Customall Redux
      // still holds the previous layer value. Always run the mounted React
      // handlers before treating that displayed value as committed.
      if (commitStrategy && (await commitMountedReactHandlers())) {
        commitStrategy += "+react";
      }

      // Keep the native setter path for older Customall artworks.
      if (!commitStrategy) {
        input.focus();
        input.select?.();
        setter?.call(input, expectedText);
        input.dispatchEvent(
          new Event("input", { bubbles: true, composed: true })
        );
        await wait(220);
        if (await finishFormCommit()) {
          commitStrategy = "native-events";
        }
      }

      // Controlled Ant inputs can restore their old value before the native
      // event reaches rc-field-form. Call the mounted React handlers using the
      // live input as target, then let Customall run its normal blur commit.
      if (!commitStrategy && (await commitMountedReactHandlers())) {
        commitStrategy = "react-handler";
      }

      input = document.querySelector("#personalized_max_font_size") || input;
      const formValue = Number(input.value);
      if (!commitStrategy || !matchesExpected(formValue)) {
        return {
          ok: false,
          checked: enable.checked,
          value: formValue,
          commitStrategy: commitStrategy || "rejected",
          error: `Customall still has ${Number.isFinite(formValue) ? formValue : "?"}; Max font size ${nextMaxFontSize} was not accepted.`
        };
      }

      // Never mutate the canvas model before Customall accepts the form.
      const reactProps = getReactProps(input);
      const layerId = String(document.querySelector("#id")?.value || "");
      const stage = window.stageRef?.current;
      const nodes = [];
      const walk = (node) => {
        for (const child of node?.getChildren?.() || []) {
          nodes.push(child);
          walk(child);
        }
      };
      if (stage) walk(stage);
      const layerRect = nodes.find(
        (node) => String(node.id?.() || "") === layerId
      );
      const siblings = layerRect?.parent?.getChildren?.() || [];
      const rectIndex = siblings.indexOf?.(layerRect) ?? -1;
      const textNode =
        rectIndex > 0 && siblings[rectIndex - 1]?.getClassName?.() === "Text"
          ? siblings[rectIndex - 1]
          : null;

      // Customall has two artwork storage shapes. Older artworks keep font
      // data on a Konva Text sibling; newer artworks keep it on the layer Rect
      // (type=Text). The form can update the live value while Rect.origin
      // remains stale, so dragging the layer restores the old font size.
      const rectBackedText =
        !textNode && String(layerRect?.getAttr?.("type") || "") === "Text";
      if (textNode) {
        textNode.setAttr?.("maxFontSize", nextMaxFontSize);
      } else if (rectBackedText) {
        const liveActualFontSize = Number(
          layerRect?.getAttr?.("actualFontSize")
        );
        layerRect.setAttr?.("enable_max_size", true);
        layerRect.setAttr?.("max_font_size", nextMaxFontSize);
        const origin = layerRect.getAttr?.("origin");
        if (origin && typeof origin === "object") {
          layerRect.setAttr?.("origin", {
            ...origin,
            enable_max_size: true,
            max_font_size: nextMaxFontSize,
            ...(Number.isFinite(liveActualFontSize)
              ? { actualFontSize: liveActualFontSize }
              : {})
          });
        }
        layerRect.getLayer?.()?.batchDraw?.();
      }

      const domValue = Number(input.value);
      const reactValue = Number(reactProps?.value);
      const maxFontSize = Number(textNode?.getAttr?.("maxFontSize"));
      const rectMaxFontSize = Number(layerRect?.getAttr?.("max_font_size"));
      const origin = layerRect?.getAttr?.("origin");
      const originMaxFontSize = Number(origin?.max_font_size);
      const actualFontSize = Number(
        textNode?.getAttr?.("actualFontSize") ?? layerRect?.getAttr?.("actualFontSize")
      );
      const originActualFontSize = Number(origin?.actualFontSize);
      const fontSize = Number(textNode?.getAttr?.("fontSize"));
      const textNodeConfirmed =
        !!textNode &&
        Number.isFinite(maxFontSize) &&
        Math.abs(maxFontSize - nextMaxFontSize) <= 0.0001;
      const rectLayerConfirmed =
        rectBackedText &&
        Number.isFinite(rectMaxFontSize) &&
        Math.abs(rectMaxFontSize - nextMaxFontSize) <= 0.0001 &&
        Number.isFinite(originMaxFontSize) &&
        Math.abs(originMaxFontSize - nextMaxFontSize) <= 0.0001 &&
        Number.isFinite(actualFontSize) &&
        actualFontSize <= nextMaxFontSize + 0.0001 &&
        Number.isFinite(originActualFontSize) &&
        Math.abs(originActualFontSize - actualFontSize) <= 0.0001;
      const modelConfirmed =
        enable.checked &&
        Number.isFinite(domValue) &&
        Math.abs(domValue - nextMaxFontSize) <= 0.0001 &&
        Number.isFinite(reactValue) &&
        Math.abs(reactValue - nextMaxFontSize) <= 0.0001 &&
        (textNodeConfirmed || rectLayerConfirmed);
      return {
        ok: modelConfirmed,
        checked: enable.checked,
        value: domValue,
        reactValue,
        commitStrategy,
        layerId,
        storageShape: textNode
          ? "text-node"
          : rectBackedText
            ? "rect-layer"
            : "unknown",
        maxFontSize,
        rectMaxFontSize,
        originMaxFontSize,
        actualFontSize,
        originActualFontSize,
        fontSize,
        error: modelConfirmed
          ? ""
          : `Customall chưa lưu Max font size ${nextMaxFontSize} vào layer.`
      };
    }
  });
  return results?.[0]?.result || {
    ok: false,
    error: "Không nhận được trạng thái Max font size từ Customall."
  };
}

async function setCustomallLabelMain(tabId, selector, value) {
  const expected = String(value ?? "");
  const allowedSelector = selector === "#title" ? "#title" : "#personalized_label";
  const results = await chrome.scripting.executeScript({
    target: { tabId: Number(tabId) },
    world: "MAIN",
    args: [allowedSelector, expected],
    func: async (labelSelector, nextLabel) => {
      const wait = (milliseconds) =>
        new Promise((resolve) => setTimeout(resolve, milliseconds));
      const visible = (element) => {
        const rect = element?.getBoundingClientRect?.();
        const style = element ? getComputedStyle(element) : null;
        return Boolean(
          rect && rect.width > 2 && rect.height > 2 &&
          style?.display !== "none" && style?.visibility !== "hidden"
        );
      };
      const inputs = [...document.querySelectorAll(labelSelector)].filter(visible);
      if (inputs.length !== 1) {
        return {
          ok: false,
          fieldCount: inputs.length,
          error: `Customall đang có ${inputs.length} field Label hiển thị.`
        };
      }

      let input = inputs[0];
      const previous = String(input.value || "");
      const setter = Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value"
      )?.set;
      const getReactProps = (field) => {
        const key = Object.getOwnPropertyNames(field || {}).find((name) =>
          name.startsWith("__reactProps")
        );
        return key ? field[key] : null;
      };
      const makeReactEvent = (field, type) => {
        const nativeEvent = new Event(type === "blur" ? "blur" : "input", {
          bubbles: true,
          composed: true
        });
        return {
          target: field,
          currentTarget: field,
          nativeEvent,
          type,
          bubbles: true,
          cancelable: true,
          defaultPrevented: false,
          eventPhase: 3,
          isTrusted: false,
          timeStamp: Date.now(),
          preventDefault() {},
          stopPropagation() {},
          persist() {},
          isDefaultPrevented: () => false,
          isPropagationStopped: () => false
        };
      };

      input.focus();
      input.select?.();
      let strategy = "";
      try {
        if (nextLabel) {
          document.execCommand?.("insertText", false, nextLabel);
          if (String(input.value || "") === nextLabel) strategy = "insert-text";
        }
      } catch {
        // Fall through to native setter and mounted React handlers.
      }
      if (String(input.value || "") !== nextLabel) {
        setter?.call(input, nextLabel);
        strategy = "native-setter";
      }
      input._valueTracker?.setValue?.(previous);
      input.dispatchEvent(
        new InputEvent("input", {
          bubbles: true,
          composed: true,
          inputType: nextLabel ? "insertText" : "deleteContentBackward",
          data: nextLabel || null
        })
      );
      input.dispatchEvent(new Event("change", { bubbles: true, composed: true }));

      let props = getReactProps(input);
      props?.onInput?.(makeReactEvent(input, "input"));
      props?.onChange?.(makeReactEvent(input, "change"));
      if (typeof props?.onChange === "function") strategy += "+react";
      await wait(320);

      input = [...document.querySelectorAll(labelSelector)].filter(visible)[0] || input;
      props = getReactProps(input);
      props?.onBlur?.(makeReactEvent(input, "blur"));
      input.blur();
      await wait(650);

      input = [...document.querySelectorAll(labelSelector)].filter(visible)[0] || input;
      const actual = String(input.value || "");
      const reactValue = String(getReactProps(input)?.value ?? actual);
      return {
        ok: actual === nextLabel && reactValue === nextLabel,
        previous,
        value: actual,
        reactValue,
        layerId: String(document.querySelector("#id")?.value || ""),
        strategy: strategy || "events",
        error:
          actual === nextLabel && reactValue === nextLabel
            ? ""
            : `Customall chưa nhận Label "${nextLabel}"; DOM="${actual}", React="${reactValue}".`
      };
    }
  });
  return results?.[0]?.result || {
    ok: false,
    error: "Không nhận được kết quả Label từ MAIN world Customall."
  };
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "TELEMETRY_MVP") {
    sendTelemetryHeartbeat(true, String(message.mvp || "").slice(0, 80));
    return;
  }
  sendTelemetryHeartbeat();
  if (message?.type === "OPEN_SHOPIFY_FILES") {
    const store = String(message.store || "").trim();
    if (!/^[a-z0-9][a-z0-9-]*$/i.test(store)) {
      sendResponse({ ok: false, error: "Store handle không hợp lệ." });
      return;
    }

    chrome.tabs
      .create({ url: `https://admin.shopify.com/store/${store}/content/files` })
      .then((tab) => sendResponse({ ok: true, tabId: tab.id }))
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  if (message?.type === "FILL_SHOPIFY_TRUSTED_PICKERS") {
    fillTrustedShopifyPickers(message.tabId, message.values)
      .then(sendResponse)
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  if (message?.type === "FILL_SHOPIFY_GIFTBOX") {
    fillTrustedShopifyGiftbox(message.tabId, message.productHandle)
      .then(sendResponse)
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  if (message?.type === "SAVE_SHOPIFY_TRUSTED") {
    withShopifyDebugger(message.tabId, () =>
      saveTrustedShopifyProduct(message.tabId)
    )
      .then(sendResponse)
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  if (message?.type === "SET_CUSTOMALL_MAX_FONT_SIZE_MAIN") {
    const tabId = _sender.tab?.id;
    if (!tabId) {
      sendResponse({ ok: false, error: "Không xác định được tab Customall." });
      return;
    }
    setCustomallMaxFontSizeMain(tabId, message.value)
      .then(sendResponse)
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  if (message?.type === "SET_CUSTOMALL_LABEL_MAIN") {
    const tabId = _sender.tab?.id;
    if (!tabId) {
      sendResponse({ ok: false, error: "Không xác định được tab Customall." });
      return;
    }
    setCustomallLabelMain(tabId, message.selector, message.value)
      .then(sendResponse)
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }

});
