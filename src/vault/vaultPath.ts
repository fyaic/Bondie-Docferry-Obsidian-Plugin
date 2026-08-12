export const MAX_VAULT_PATH_BYTES = 4096;
export const MAX_VAULT_PATH_SEGMENT_BYTES = 255;

const WINDOWS_DEVICE_NAME_PATTERN =
  /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:[ .]|$)/iu;
const FORBIDDEN_SEGMENT_CHARACTERS = '<>:"|?*#^[]';

export function validateVaultRelativePath(
  value: string,
  label = "Vault path",
): string {
  if (!value) {
    throw new Error(`${label} must not be empty.`);
  }
  if (value.startsWith("/") || /^[A-Za-z]:(?:\/|$)/u.test(value)) {
    throw new Error(`${label} must be relative to the vault.`);
  }
  if (value.includes("\\")) {
    throw new Error(`${label} must use forward slashes.`);
  }
  if ([...value].some(isControlCharacter)) {
    throw new Error(`${label} contains a control character.`);
  }
  if (utf8ByteLength(value) > MAX_VAULT_PATH_BYTES) {
    throw new Error(`${label} is too long.`);
  }

  for (const segment of value.split("/")) {
    validateVaultPathSegment(segment, label);
  }

  return value;
}

function isControlCharacter(character: string): boolean {
  const codePoint = character.codePointAt(0) ?? 0;
  return codePoint <= 0x1f || (codePoint >= 0x7f && codePoint <= 0x9f);
}

export function joinVaultPath(
  folderPath: string,
  relativePath: string,
  label = "Vault path",
): string {
  const safeFolderPath = validateVaultRelativePath(folderPath, "Vault folder");
  const safeRelativePath = validateVaultRelativePath(relativePath, label);
  return validateVaultRelativePath(`${safeFolderPath}/${safeRelativePath}`, label);
}

function validateVaultPathSegment(segment: string, label: string): void {
  if (!segment) {
    throw new Error(`${label} contains an empty path segment.`);
  }
  if (segment === "." || segment === "..") {
    throw new Error(`${label} contains a traversal segment.`);
  }
  if (segment.trim() !== segment || segment.endsWith(".")) {
    throw new Error(`${label} contains an unsafe path segment.`);
  }
  if (
    [...segment].some((character) => FORBIDDEN_SEGMENT_CHARACTERS.includes(character)) ||
    WINDOWS_DEVICE_NAME_PATTERN.test(segment)
  ) {
    throw new Error(`${label} contains an unsafe path segment.`);
  }
  if (utf8ByteLength(segment) > MAX_VAULT_PATH_SEGMENT_BYTES) {
    throw new Error(`${label} contains a path segment that is too long.`);
  }
}

function utf8ByteLength(value: string): number {
  let byteLength = 0;
  for (const character of value) {
    const codePoint = character.codePointAt(0) ?? 0;
    if (codePoint <= 0x7f) {
      byteLength += 1;
    } else if (codePoint <= 0x7ff) {
      byteLength += 2;
    } else if (codePoint <= 0xffff) {
      byteLength += 3;
    } else {
      byteLength += 4;
    }
  }
  return byteLength;
}
