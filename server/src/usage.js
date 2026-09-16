import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import nodePath from "node:path";

const DATA_FILE = nodePath.join(process.cwd(), "data", "usage.json");
const ACTIVE_WINDOW_MS = 10 * 60 * 1000;
const MAX_HEARTBEAT_GAP_SECONDS = 5 * 60;

async function load() {
  try {
    return JSON.parse(await readFile(DATA_FILE, "utf8"));
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    return { devices: {} };
  }
}

async function save(data) {
  await mkdir(nodePath.dirname(DATA_FILE), { recursive: true });
  const temporary = `${DATA_FILE}.tmp`;
  await writeFile(temporary, JSON.stringify(data, null, 2), "utf8");
  await rename(temporary, DATA_FILE);
}

function validId(value) {
  return typeof value === "string" && /^[a-zA-Z0-9_-]{16,128}$/.test(value);
}

export async function recordHeartbeat({ installationId, extensionVersion, mvp = "", now = Date.now() }) {
  if (!validId(installationId)) throw new Error("installationId không hợp lệ.");
  const data = await load();
  const previous = data.devices[installationId] || {
    installationId,
    firstSeen: new Date(now).toISOString(),
    activeSeconds: 0,
    lastVersion: String(extensionVersion || "unknown"),
    dailyActiveSeconds: {}
  };
  const previousMs = Date.parse(previous.lastSeen || previous.firstSeen);
  if (Number.isFinite(previousMs) && now >= previousMs) {
    const gap = Math.floor((now - previousMs) / 1000);
    if (gap <= MAX_HEARTBEAT_GAP_SECONDS) {
      previous.activeSeconds += gap;
      const day = new Date(previousMs).toISOString().slice(0, 10);
      previous.dailyActiveSeconds ||= {};
      previous.dailyActiveSeconds[day] = Number(previous.dailyActiveSeconds[day] || 0) + gap;
    }
  }
  previous.lastSeen = new Date(now).toISOString();
  previous.lastVersion = String(extensionVersion || previous.lastVersion || "unknown").slice(0, 40);
  if (mvp && /^[A-Za-z0-9 .·_-]{1,80}$/.test(String(mvp))) {
    previous.mvpCounts ||= {};
    previous.mvpCounts[mvp] = Number(previous.mvpCounts[mvp] || 0) + 1;
  }
  data.devices[installationId] = previous;
  await save(data);
  return previous;
}

export async function getUsageSummary(now = Date.now()) {
  const data = await load();
  const devices = Object.values(data.devices || {}).sort((a, b) =>
    String(b.lastSeen).localeCompare(String(a.lastSeen))
  );
  const today = new Date(now);
  today.setUTCHours(0, 0, 0, 0);
  const periodTotals = (startMs) => devices.reduce((sum, device) =>
    sum + Object.entries(device.dailyActiveSeconds || {}).reduce((deviceSum, [day, seconds]) =>
      Date.parse(`${day}T00:00:00Z`) >= startMs ? deviceSum + Number(seconds || 0) : deviceSum, 0), 0);
  const mvpCounts = {};
  for (const device of devices) {
    for (const [mvp, count] of Object.entries(device.mvpCounts || {})) {
      mvpCounts[mvp] = Number(mvpCounts[mvp] || 0) + Number(count || 0);
    }
  }
  return {
    generatedAt: new Date(now).toISOString(),
    totals: {
      installed: devices.length,
      active: devices.filter((device) => now - Date.parse(device.lastSeen) <= ACTIVE_WINDOW_MS).length,
      activeSeconds: devices.reduce((sum, device) => sum + Number(device.activeSeconds || 0), 0)
    },
    periods: {
      day: periodTotals(today.getTime()),
      week: periodTotals(today.getTime() - 6 * 86400000),
      month: periodTotals(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1))
    },
    mvpUsage: Object.entries(mvpCounts).sort((a, b) => b[1] - a[1]).map(([mvp, count]) => ({ mvp, count })),
    devices: devices.map((device) => ({
      installationId: device.installationId,
      firstSeen: device.firstSeen,
      lastSeen: device.lastSeen,
      lastVersion: device.lastVersion,
      activeSeconds: Number(device.activeSeconds || 0),
      dailyActiveSeconds: device.dailyActiveSeconds || {}
    }))
  };
}
