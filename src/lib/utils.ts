import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Hashes an employee code with SHA-256 before it leaves the browser.
 *
 * The value is normalized (trimmed + lowercased) so the same code always
 * produces the same digest, which keeps one-response-per-employee checks
 * reliable regardless of how the nurse typed it.
 *
 * Returns null for empty input so optional fields stay null in the database.
 */
export async function hashEmployeeCode(employeeCode: string): Promise<string | null> {
  const normalized = employeeCode.trim().toLowerCase();
  if (!normalized) return null;
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(normalized));
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Pulls the message off a thrown Supabase/PostgREST error.
 *
 * `instanceof Error` is the obvious way to do this and it is the wrong one. The
 * raised exceptions this app relies on (duplicate_employee_code,
 * survey_not_available, not_authorized) arrive as PostgREST error payloads, and
 * the shape of that object has changed between postgrest-js versions: some
 * versions throw a real Error subclass, others a plain object literal. Under a
 * plain object `instanceof Error` is false, the message reads as empty, and
 * every database rejection silently collapses into a generic failure message.
 *
 * Reading the property structurally works for both shapes and cannot be broken
 * by a dependency upgrade.
 */
export function errorMessage(error: unknown): string {
  if (typeof error === "string") return error;
  if (error && typeof error === "object" && "message" in error) {
    const { message } = error as { message?: unknown };
    if (typeof message === "string") return message;
  }
  return "";
}
