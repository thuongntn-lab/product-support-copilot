const DB_NAME = "customall-upload-copilot";
const STORE_NAME = "pending-uploads";

function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) {
        request.result.createObjectStore(STORE_NAME, { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function readUpload(id) {
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, "readonly");
    const request = transaction.objectStore(STORE_NAME).get(id);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    transaction.oncomplete = () => database.close();
  });
}

const sessionId = new URLSearchParams(location.search).get("session");
const targetOrigin = document.referrer ? new URL(document.referrer).origin : "*";

try {
  const upload = await readUpload(sessionId);
  if (!Array.isArray(upload?.files) || !upload.files.length) {
    throw new Error("Không tìm thấy clipart tạm trong extension.");
  }
  const files = upload.files.map((entry) => {
    const file = new File([entry.blob], entry.name, {
      type: entry.type || "application/octet-stream",
      lastModified: entry.lastModified || Date.now()
    });
    Object.defineProperty(file, "webkitRelativePath", {
      configurable: true,
      value: entry.path
    });
    return file;
  });
  window.parent.postMessage(
    {
      type: "CUSTOMALL_UPLOAD_FILES_READY",
      sessionId,
      files,
      entries: upload.files.map((entry) => ({
        name: entry.name,
        path: entry.path,
        size: entry.blob.size,
        lastModified: entry.lastModified
      }))
    },
    targetOrigin
  );
} catch (error) {
  window.parent.postMessage(
    {
      type: "CUSTOMALL_UPLOAD_FILE_ERROR",
      sessionId,
      error: error.message
    },
    targetOrigin
  );
}
