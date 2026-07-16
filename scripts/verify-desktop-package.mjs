import { spawnSync } from "node:child_process";
import { Buffer } from "node:buffer";
import { existsSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

const bundleDirectory = resolve("src-tauri/target/release/bundle/deb");

function fail(message) {
  console.error(`Desktop package verification failed: ${message}`);
  process.exit(1);
}

function command(commandName, args, input, binaryOutput = false) {
  const result = spawnSync(commandName, args, {
    encoding: binaryOutput ? undefined : "utf8",
    input,
    maxBuffer: 32 * 1024 * 1024,
  });

  if (result.error) fail(`${commandName} could not run: ${result.error.message}`);
  if (result.status !== 0) {
    const detail = Buffer.isBuffer(result.stderr)
      ? result.stderr.toString("utf8")
      : result.stderr;
    fail(`${commandName} exited ${result.status}: ${detail.trim()}`);
  }

  return result.stdout;
}

if (!existsSync(bundleDirectory)) fail("no Debian bundle directory exists");

const packages = readdirSync(bundleDirectory)
  .filter((name) => name.endsWith(".deb"))
  .sort();

if (packages.length !== 1) {
  fail(`expected one Debian package, found ${packages.length}`);
}

const packagePath = resolve(bundleDirectory, packages[0]);
const archiveMembers = command("ar", ["t", packagePath]);
for (const member of ["debian-binary", "control.tar.gz", "data.tar.gz"]) {
  if (!archiveMembers.split("\n").includes(member)) {
    fail(`package is missing ${member}`);
  }
}

const controlArchive = command(
  "ar",
  ["p", packagePath, "control.tar.gz"],
  undefined,
  true,
);
const control = command("tar", ["xOzf", "-", "control"], controlArchive).toString(
  "utf8",
);

for (const field of [
  "Package: dark-bear",
  "Version: 3.0.0",
  "Description: DarkBear chat client for Orochi",
]) {
  if (!control.includes(field)) fail(`control metadata is missing ${field}`);
}

const dataArchive = command(
  "ar",
  ["p", packagePath, "data.tar.gz"],
  undefined,
  true,
);
const members = command("tar", ["tzf", "-"], dataArchive)
  .toString("utf8")
  .split("\n");

for (const member of [
  "usr/bin/darkbear",
  "usr/share/applications/DarkBear.desktop",
  "usr/share/icons/hicolor/128x128/apps/darkbear.png",
]) {
  if (!members.includes(member)) fail(`payload is missing ${member}`);
}

const desktopEntry = command(
  "tar",
  ["xOzf", "-", "usr/share/applications/DarkBear.desktop"],
  dataArchive,
).toString("utf8");

for (const line of [
  "Name=DarkBear",
  "Exec=darkbear",
  "Terminal=false",
  "MimeType=x-scheme-handler/darkbear",
]) {
  if (!desktopEntry.split("\n").includes(line)) {
    fail(`desktop entry is missing ${line}`);
  }
}

console.log(`Verified installable desktop package: ${packagePath}`);
