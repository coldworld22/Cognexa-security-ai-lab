import path from "path";

export function getBackendRootDir(): string {
  return path.resolve(__dirname, "../..");
}

export function resolveBackendPath(targetPath: string): string {
  return path.isAbsolute(targetPath)
    ? targetPath
    : path.resolve(getBackendRootDir(), targetPath);
}
