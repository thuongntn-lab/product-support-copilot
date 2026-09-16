(() => {
  if (window.__PS_COPILOT_CUSTOMALL_MAIN_BRIDGE__) return;
  window.__PS_COPILOT_CUSTOMALL_MAIN_BRIDGE__ = true;

  const wait = (milliseconds) =>
    new Promise((resolve) => setTimeout(resolve, milliseconds));

  async function setMaxFontSize(nextValue) {
    const nextMaxFontSize = Number(nextValue);
    if (!Number.isFinite(nextMaxFontSize) || nextMaxFontSize <= 0) {
      return { ok: false, error: "Max font size không hợp lệ." };
    }

    const enable = document.querySelector("#personalized_enable_max_size");
    if (!enable) {
      return { ok: false, error: "Không tìm thấy Enable max size." };
    }
    if (!enable.checked) {
      enable.click();
      await wait(450);
    }

    const input = document.querySelector("#personalized_max_font_size");
    if (!input) {
      return { ok: false, error: "Không tìm thấy ô Max font size." };
    }

    input.focus();
    input.select?.();
    const setter = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value"
    )?.set;
    setter?.call(input, String(nextMaxFontSize));
    input.dispatchEvent(new Event("input", { bubbles: true, composed: true }));
    await wait(220);
    input.dispatchEvent(new Event("change", { bubbles: true, composed: true }));
    await wait(180);
    input.blur();
    await wait(1300);

    const reactPropsKey = Object.getOwnPropertyNames(input).find((key) =>
      key.startsWith("__reactProps")
    );
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
    const domValue = Number(input.value);
    const reactValue = Number(input[reactPropsKey]?.value);
    const maxFontSize = Number(textNode?.getAttr?.("maxFontSize"));
    const actualFontSize = Number(
      textNode?.getAttr?.("actualFontSize") ??
        layerRect?.getAttr?.("actualFontSize")
    );
    const fontSize = Number(textNode?.getAttr?.("fontSize"));
    const modelConfirmed =
      enable.checked &&
      Number.isFinite(domValue) &&
      Math.abs(domValue - nextMaxFontSize) <= 0.0001 &&
      Number.isFinite(reactValue) &&
      Math.abs(reactValue - nextMaxFontSize) <= 0.0001 &&
      (!textNode ||
        (Number.isFinite(maxFontSize) &&
          Math.abs(maxFontSize - nextMaxFontSize) <= 0.0001));

    return {
      ok: modelConfirmed,
      checked: enable.checked,
      value: domValue,
      reactValue,
      layerId,
      maxFontSize,
      actualFontSize,
      fontSize,
      error: modelConfirmed
        ? ""
        : `Customall chưa lưu Max font size ${nextMaxFontSize} vào layer.`
    };
  }

  document.addEventListener("ps-copilot-max-font-size-request", async (event) => {
    const request = event.target;
    if (!(request instanceof HTMLElement) || !request.dataset.requestId) return;
    let result;
    try {
      result = await setMaxFontSize(request.dataset.value);
    } catch (error) {
      result = { ok: false, error: error?.message || String(error) };
    }
    request.dataset.result = JSON.stringify(result);
    request.dispatchEvent(
      new Event("ps-copilot-max-font-size-response", { bubbles: false })
    );
  });
})();
