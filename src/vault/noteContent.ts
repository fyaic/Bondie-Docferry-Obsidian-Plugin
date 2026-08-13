export function removeMatchingLeadingTitle(markdown: string, title: string): string {
  const match = /^\uFEFF?[ \t]*#[ \t]+([^\r\n]+)\r?\n(?:[ \t]*\r?\n)?/.exec(markdown);
  if (!match) return markdown;

  if (normalizeTitle(match[1]) !== normalizeTitle(title)) return markdown;
  return markdown.slice(match[0].length);
}

function normalizeTitle(value: string): string {
  return value
    .replace(/\\([\\`*_[\]{}<>()#+.!|-])/g, "$1")
    .normalize("NFC")
    .replace(/\s+/g, " ")
    .trim();
}
