import { API_ERROR_CODES, ApiError } from "@dealpilot/api-client";

export type WorkbenchDestination =
  | "home"
  | "customers"
  | "new-customer"
  | "reminders"
  | "projects"
  | { customerId: string };

export function workbenchHash(destination: WorkbenchDestination): string {
  if (destination === "home") return "#/";
  if (destination === "customers") return "#/contacts";
  if (destination === "new-customer") return "#/contacts/create";
  if (destination === "reminders") return "#/reminders";
  if (destination === "projects") return "#/deals";
  return `#/contacts/${encodeURIComponent(destination.customerId)}/show`;
}

export function buildWorkbenchUrl(
  origin: string,
  destination: WorkbenchDestination,
): string {
  const url = new URL(origin);
  if (url.protocol !== "https:" && url.hostname !== "localhost") {
    throw new ApiError({
      code: API_ERROR_CODES.validation,
      message: "The Cloud workbench URL must use HTTPS",
    });
  }
  url.search = "";
  url.hash = workbenchHash(destination).slice(1);
  return url.toString();
}

export async function openWorkbench(
  destination: WorkbenchDestination = "home",
): Promise<void> {
  const origin = import.meta.env.VITE_DEALPILOT_WEB_URL;
  if (!origin) {
    throw new ApiError({
      code: API_ERROR_CODES.invalidResponse,
      message: "VITE_DEALPILOT_WEB_URL is not configured",
    });
  }
  await chrome.tabs.create({ url: buildWorkbenchUrl(origin, destination) });
}
