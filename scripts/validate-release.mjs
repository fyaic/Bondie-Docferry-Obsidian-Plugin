import { readFile, stat } from "node:fs/promises";

const manifest = JSON.parse(await readFile("manifest.json", "utf8"));
const packageJson = JSON.parse(await readFile("package.json", "utf8"));
const versions = JSON.parse(await readFile("versions.json", "utf8").catch(() => "{}"));

const failures = [];
const pluginIdPattern = /^[a-z0-9][a-z0-9-]*[a-z0-9]$/;

if (!pluginIdPattern.test(manifest.id) || manifest.id.includes("obsidian") || manifest.id.endsWith("plugin")) {
  failures.push("manifest id does not satisfy Community plugin rules");
}
if (manifest.version !== packageJson.version) failures.push("manifest and package versions differ");
if (manifest.isDesktopOnly !== false) failures.push("mobile release must set isDesktopOnly to false");
if (!manifest.minAppVersion) failures.push("manifest minAppVersion is required");
if (Object.keys(versions).length > 0 && versions[manifest.version] !== manifest.minAppVersion) {
  failures.push("versions.json does not map the release to minAppVersion");
}

for (const file of ["main.js", "manifest.json", "styles.css"]) {
  try {
    const details = await stat(file);
    if (!details.isFile() || details.size === 0) failures.push(`${file} is empty`);
  } catch {
    failures.push(`${file} is missing`);
  }
}

const bundle = await readFile("main.js", "utf8").catch(() => "");
for (const forbidden of ["require(\"fs\")", "require(\"electron\")", "node:fs", "node:path"]) {
  if (bundle.includes(forbidden)) failures.push(`mobile bundle contains ${forbidden}`);
}

if (failures.length > 0) {
  for (const failure of failures) console.error(`release validation: ${failure}`);
  process.exitCode = 1;
} else {
  console.log(`release validation passed for ${manifest.id} ${manifest.version}`);
}
