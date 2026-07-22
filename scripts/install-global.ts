import { chmod, copyFile, lstat, mkdir, rename, rm } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

const projectRoot = join(import.meta.dir, "..");
const executableName = process.platform === "win32" ? "tmsg.exe" : "tmsg";
const builtExecutable = join(projectRoot, "dist", executableName);
const globalBinDirectory =
  process.env.BUN_INSTALL_BIN ??
  join(process.env.BUN_INSTALL ?? join(homedir(), ".bun"), "bin");
const installedExecutable = join(globalBinDirectory, executableName);
const temporaryExecutable = join(
  globalBinDirectory,
  `.tmsg.${process.pid}.${crypto.randomUUID()}.tmp`,
);

const build = Bun.spawn({
  cmd: [process.execPath, "run", "build"],
  cwd: projectRoot,
  stdout: "inherit",
  stderr: "inherit",
});

if ((await build.exited) !== 0) {
  console.error("Failed to build tmsg; the global executable was not changed.");
  process.exit(1);
}

await mkdir(globalBinDirectory, { recursive: true });

try {
  await copyFile(builtExecutable, temporaryExecutable);
  await chmod(temporaryExecutable, 0o755);
  await rename(temporaryExecutable, installedExecutable);
} catch (error) {
  await rm(temporaryExecutable, { force: true }).catch(() => undefined);
  throw error;
}

const installedFile = await lstat(installedExecutable);
if (!installedFile.isFile() || installedFile.isSymbolicLink()) {
  throw new Error(`Global tmsg installation is not a regular file: ${installedExecutable}`);
}

const verification = Bun.spawnSync({
  cmd: [installedExecutable, "--version"],
  stdout: "pipe",
  stderr: "pipe",
});

if (verification.exitCode !== 0) {
  throw new Error("The installed tmsg executable failed its version check.");
}

console.log(`Installed standalone tmsg ${verification.stdout.toString().trim()} at:`);
console.log(installedExecutable);
