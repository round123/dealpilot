import { requestToken } from "./native-messaging";

export type WorkbenchDestination =
  | "home"
  | "customers"
  | "new-customer"
  | "reminders"
  | "projects"
  | { customerId: string };

export interface WorkbenchPairing {
  token: string;
  port: number;
  workbenchOrigin?: string;
}

export function workbenchHash(destination: WorkbenchDestination): string {
  if (destination === "home") return "#/";
  if (destination === "customers") return "#/contacts";
  if (destination === "new-customer") return "#/contacts/create";
  if (destination === "reminders") return "#/reminders";
  if (destination === "projects") return "#/deals";
  return `#/contacts/${encodeURIComponent(destination.customerId)}/show`;
}

export function buildWorkbenchUrl(
  pairing: WorkbenchPairing,
  destination: WorkbenchDestination,
): string {
  const fallbackOrigin = `http://127.0.0.1:${pairing.port}`;
  const origin = normalizeLoopbackOrigin(pairing.workbenchOrigin) ?? fallbackOrigin;
  const url = new URL("/", origin);
  url.searchParams.set("token", pairing.token);
  url.hash = workbenchHash(destination).slice(1);
  return url.toString();
}

function normalizeLoopbackOrigin(value?: string): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (
      url.origin !== value ||
      url.protocol !== "http:" ||
      (url.hostname !== "127.0.0.1" && url.hostname !== "localhost")
    ) {
      return null;
    }
    return url.origin;
  } catch {
    return null;
  }
}

export async function openWorkbench(
  destination: WorkbenchDestination = "home",
): Promise<void> {
  const pairing = await requestToken();
  await chrome.tabs.create({ url: buildWorkbenchUrl(pairing, destination) });
}
