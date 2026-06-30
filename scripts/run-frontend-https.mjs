import { existsSync, readFileSync } from "fs";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";
import { spawn } from "child_process";
import { createRequire } from "module";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const frontendRoot = resolve(repoRoot, "frontend");
const certFile = resolve(repoRoot, "certs", "localhost.pem");
const keyFile = resolve(repoRoot, "certs", "localhost-key.pem");
const caFile = resolve(repoRoot, "certs", "localhost-ca.pem");
const backendEnvFile = resolve(repoRoot, "backend", ".env");
const require = createRequire(import.meta.url);
const nextBinPath = require.resolve("next/dist/bin/next", {
  paths: [frontendRoot, repoRoot]
});

ensureCertificates();

const port = process.env.PORT ?? "3000";
const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "https://localhost:5000/api/v1";
const jwtSecret = process.env.JWT_SECRET ?? readDotEnvValue(backendEnvFile, "JWT_SECRET");

const child = spawn(
  process.execPath,
  [
    nextBinPath,
    "dev",
    "--hostname",
    "localhost",
    "--port",
    port,
    "--experimental-https",
    "--experimental-https-key",
    keyFile,
    "--experimental-https-cert",
    certFile
  ],
  {
    cwd: frontendRoot,
    stdio: "inherit",
    env: {
      ...process.env,
      NEXT_PUBLIC_API_URL: apiUrl,
      NODE_EXTRA_CA_CERTS: caFile,
      LOCAL_HTTPS: "true",
      ...(jwtSecret
        ? {
            JWT_SECRET: jwtSecret
          }
        : {}),
      PORT: port
    }
  }
);

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }

  process.exit(code ?? 0);
});

function ensureCertificates() {
  if (existsSync(certFile) && existsSync(keyFile) && existsSync(caFile)) {
    return;
  }

  console.error(
    [
      "Local HTTPS certificate files were not found.",
      "Run `npm run certs:dev` first."
    ].join("\n")
  );
  process.exit(1);
}

function readDotEnvValue(filePath, key) {
  if (!existsSync(filePath)) {
    return undefined;
  }

  const lines = readFileSync(filePath, "utf8").split(/\r?\n/u);
  for (const line of lines) {
    const trimmedLine = line.trim();
    if (!trimmedLine || trimmedLine.startsWith("#")) {
      continue;
    }

    const separatorIndex = trimmedLine.indexOf("=");
    if (separatorIndex === -1) {
      continue;
    }

    const currentKey = trimmedLine.slice(0, separatorIndex).trim();
    if (currentKey !== key) {
      continue;
    }

    let value = trimmedLine.slice(separatorIndex + 1).trim();
    const isQuoted =
      (value.startsWith("\"") && value.endsWith("\"")) ||
      (value.startsWith("'") && value.endsWith("'"));

    if (isQuoted) {
      value = value.slice(1, -1);
    }

    return value;
  }

  return undefined;
}
