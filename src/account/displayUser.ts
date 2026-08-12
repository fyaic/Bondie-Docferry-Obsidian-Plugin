import type { DisplayUser } from "../api/auth";

export function displayNameFromUser(user: DisplayUser | null): string {
  return user?.name?.trim() || user?.email?.trim() || "Bondie account";
}

export function initialsFromDisplayUser(user: DisplayUser | null): string {
  const parts = displayNameFromUser(user).split(/[\s@._-]+/).filter(Boolean);
  const initials = parts.slice(0, 2).map((part) => part[0]?.toUpperCase()).join("");
  return initials || "BD";
}
