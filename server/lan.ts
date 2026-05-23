import os from "node:os";
import { execFile } from "node:child_process";

export type LanInfo = {
  hostname: string;
  ips: string[];
  primaryIp: string | null;
};

export function getLanInfo(): LanInfo {
  const interfaces = os.networkInterfaces();
  const ips: string[] = [];
  for (const name of Object.keys(interfaces)) {
    for (const addr of interfaces[name] ?? []) {
      if (addr.family !== "IPv4" || addr.internal) continue;
      ips.push(addr.address);
    }
  }
  const primaryIp =
    ips.find((ip) => ip.startsWith("192.168.")) ??
    ips.find((ip) => ip.startsWith("10.")) ??
    ips.find((ip) => /^172\.(1[6-9]|2\d|3[01])\./.test(ip)) ??
    ips[0] ??
    null;
  return {
    hostname: os.hostname(),
    ips,
    primaryIp,
  };
}

let ssidCache: { value: string | null; at: number } | null = null;
const SSID_TTL_MS = 30_000;

export async function getSsid(): Promise<string | null> {
  if (ssidCache && Date.now() - ssidCache.at < SSID_TTL_MS) return ssidCache.value;
  const value = await detectSsid().catch(() => null);
  ssidCache = { value, at: Date.now() };
  return value;
}

function detectSsid(): Promise<string | null> {
  if (process.platform !== "darwin") return Promise.resolve(null);
  // macOS 14.4+ removed `airport`; `networksetup -getairportnetwork` often returns
  // "not associated" even when connected; `ipconfig getsummary` works but
  // returns "<redacted>" without the Location entitlement. We try each in turn
  // and accept the first non-redacted, non-empty result.
  return new Promise((resolve) => {
    execFile("networksetup", ["-getairportnetwork", "en0"], { timeout: 1500 }, (err, stdout) => {
      if (!err) {
        const m = stdout.match(/Current Wi-Fi Network:\s*(.+)/);
        const ssid = m?.[1]?.trim();
        if (ssid && ssid !== "You are not associated with an AirPort network.") {
          return resolve(ssid);
        }
      }
      execFile("ipconfig", ["getsummary", "en0"], { timeout: 1500 }, (err2, stdout2) => {
        if (err2) return resolve(null);
        const m = stdout2.match(/^\s*SSID\s*:\s*(.+)$/m);
        const ssid = m?.[1]?.trim();
        if (!ssid || ssid === "<redacted>") return resolve(null);
        resolve(ssid);
      });
    });
  });
}
