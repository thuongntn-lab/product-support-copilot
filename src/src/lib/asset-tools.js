export const LIMITS = {
  maxBytes: 64 * 1024 * 1024,
  warningBytes: 32 * 1024 * 1024,
  maxPixels: 64_000_000
};

const ALLOWED_EXTENSIONS = new Set(["png", "jpg", "jpeg"]);
const IGNORED_SYSTEM_FILES = new Set(["thumbs.db", "desktop.ini", ".ds_store"]);

export function isIgnoredSystemFile(name) {
  return IGNORED_SYSTEM_FILES.has(String(name).trim().toLowerCase());
}

export function extensionOf(name) {
  const match = String(name).toLowerCase().match(/\.([^.]+)$/);
  return match?.[1] || "";
}

export function sanitizeStem(value) {
  return String(value)
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\.[^.]+$/, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-+/g, "-")
    .toLowerCase() || "asset";
}

export function normalizePath(path) {
  return String(path).replaceAll("\\", "/").replace(/^\/+|\/+$/g, "");
}

export function buildFolderIssues(files) {
  const states = new Map();

  for (const file of files) {
    const path = normalizePath(file.webkitRelativePath || file.name);
    const parts = path.split("/");

    for (let index = 0; index < parts.length - 1; index += 1) {
      const folder = parts.slice(0, index + 1).join("/");
      const state = states.get(folder) || { directFiles: 0, childFolders: new Set() };

      if (index === parts.length - 2) {
        state.directFiles += 1;
      } else {
        state.childFolders.add(parts[index + 1]);
      }
      states.set(folder, state);
    }
  }

  return [...states.entries()]
    .filter(([, state]) => state.directFiles > 0 && state.childFolders.size > 0)
    .map(([folder, state]) => ({
      code: "MIXED_FOLDER",
      severity: "error",
      folder,
      message: `"${folder}" chứa cả ${state.directFiles} file và ${state.childFolders.size} folder con.`
    }));
}

export function proposeNames(files) {
  const proposals = new Map();
  files.forEach((file) => {
    const path = normalizePath(file.webkitRelativePath || file.name);
    const extension = extensionOf(file.name);
    const stem = file.name.replace(/\.[^.]+$/, "").trim();
    const match = stem.match(/^(.*?)[\s_-]+(\d+)\s*$/);

    if (!match || !match[1].trim()) {
      proposals.set(path, file.name.trim());
      return;
    }

    const base = match[1].replace(/[\s_-]+$/g, "").trim();
    const sequence = match[2].padStart(3, "0");
    proposals.set(path, `${base} ${sequence}.${extension}`);
  });

  return proposals;
}

export function analyzeOriginalNames(rows) {
  const rowIssues = new Map();
  const folderIssues = [];
  const groups = new Map();
  const duplicateKeys = new Map();

  for (const row of rows) {
    rowIssues.set(row.path, []);
    const stem = row.file.name.replace(/\.[^.]+$/, "").trim();
    const match = stem.match(/(?:^|[\s_-])(\d+)\s*$/);
    if (!match) {
      rowIssues.get(row.path).push({
        severity: "warning",
        code: "MISSING_SEQUENCE",
        message: "Tên file không có số thứ tự ở cuối."
      });
      continue;
    }

    const sequence = Number(match[1]);
    const base = stem
      .slice(0, match.index)
      .replace(/[\s_-]+$/g, "")
      .replace(/[\s_-]+/g, " ")
      .trim()
      .toLowerCase();
    const groupKey = `${row.folder.toLowerCase()}::${base}`;
    const group = groups.get(groupKey) || { sequences: new Map(), width: 3 };
    group.width = Math.max(group.width, match[1].length);
    group.sequences.set(sequence, [...(group.sequences.get(sequence) || []), row]);
    groups.set(groupKey, group);

    const duplicateKey = `${groupKey}::${sequence}`;
    duplicateKeys.set(duplicateKey, [...(duplicateKeys.get(duplicateKey) || []), row]);
  }

  for (const matches of duplicateKeys.values()) {
    if (matches.length < 2) continue;
    const sequence = matches[0].file.name
      .replace(/\.[^.]+$/, "")
      .trim()
      .match(/(\d+)\s*$/)?.[1];
    matches.forEach((row) =>
      rowIssues.get(row.path).push({
        severity: "error",
        code: "DUPLICATE_SEQUENCE",
        message: `Trùng tên và số thứ tự ${sequence}.`
      })
    );
  }

  for (const [groupKey, group] of groups) {
    const { sequences } = group;
    const sorted = [...sequences.keys()].sort((a, b) => a - b);
    if (sorted.length > 1) {
      const missing = [];
      for (let value = sorted[0]; value <= sorted.at(-1) && missing.length < 20; value += 1) {
        if (!sequences.has(value)) missing.push(value);
      }
      if (missing.length) {
        const [folder, base] = groupKey.split("::");
        folderIssues.push({
          code: "SEQUENCE_GAP",
          severity: "warning",
          folder,
          message: `"${base || folder || "Root"}" thiếu số: ${missing
            .map((value) => String(value).padStart(group.width, "0"))
            .join(", ")}${missing.length === 20 ? "…" : ""}`
        });
      }
    }
  }

  return { rowIssues, folderIssues };
}

export async function inspectImage(file) {
  const issues = [];
  const extension = extensionOf(file.name);

  if (!ALLOWED_EXTENSIONS.has(extension)) {
    issues.push({ severity: "error", code: "TYPE", message: "Chỉ hỗ trợ PNG/JPG/JPEG." });
  }
  if (file.size === 0) {
    issues.push({ severity: "error", code: "EMPTY", message: "File rỗng." });
  }
  if (file.size > LIMITS.maxBytes) {
    issues.push({ severity: "error", code: "SIZE", message: "Vượt giới hạn 64 MB." });
  } else if (file.size > LIMITS.warningBytes) {
    issues.push({ severity: "warning", code: "SIZE", message: "Lớn hơn mức khuyến nghị 32 MB." });
  }

  let width = 0;
  let height = 0;
  if (ALLOWED_EXTENSIONS.has(extension) && file.size > 0) {
    try {
      const bitmap = await createImageBitmap(file);
      width = bitmap.width;
      height = bitmap.height;
      bitmap.close();
      if (width * height > LIMITS.maxPixels) {
        issues.push({ severity: "error", code: "PIXELS", message: "Vượt giới hạn 64 megapixel." });
      }
    } catch {
      issues.push({ severity: "error", code: "DECODE", message: "Không đọc được nội dung ảnh." });
    }
  }

  return { width, height, issues };
}

export async function sha256(file) {
  const buffer = await file.arrayBuffer();
  const digest = await crypto.subtle.digest("SHA-256", buffer);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function createThumbnail(file, size = 300) {
  const bitmap = await createImageBitmap(file);
  const canvas = new OffscreenCanvas(size, size);
  const context = canvas.getContext("2d", { alpha: true });
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, size, size);

  const available = size - 30;
  const scale = Math.min(available / bitmap.width, available / bitmap.height);
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  context.drawImage(bitmap, (size - width) / 2, (size - height) / 2, width, height);
  bitmap.close();

  const extension = extensionOf(file.name);
  const type = extension === "png" ? "image/png" : "image/jpeg";
  return canvas.convertToBlob({ type, quality: 0.9 });
}

export function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const power = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / 1024 ** power).toFixed(power === 0 ? 0 : 1)} ${units[power]}`;
}
