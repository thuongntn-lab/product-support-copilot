if (!globalThis.__customallUploadCopilotMainInstalled) {
  globalThis.__customallUploadCopilotMainInstalled = true;

  document.addEventListener(
    "customall-upload-copilot-paths",
    (event) => {
      const marker = event.target;
      if (!(marker instanceof HTMLElement)) return;

      let entries;
      try {
        entries = JSON.parse(marker.dataset.entries || "[]");
      } catch {
        return;
      }

      const selector = marker.dataset.selector;
      const input = selector ? document.querySelector(selector) : null;
      if (!(input instanceof HTMLInputElement) || !input.files) return;

      [...input.files].forEach((file, index) => {
        const entry = entries[index];
        if (!entry?.path) return;
        try {
          Object.defineProperty(file, "webkitRelativePath", {
            configurable: true,
            value: entry.path
          });
        } catch {
          // Some Chrome versions preserve webkitRelativePath automatically.
        }
      });
    },
    true
  );
}
