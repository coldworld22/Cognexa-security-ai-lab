import { existsSync, readFileSync } from "fs";
import { createRequire } from "module";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";
import { spawn } from "child_process";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const frontendRoot = resolve(repoRoot, "frontend");
const require = createRequire(import.meta.url);
const nextBin = require.resolve("next/dist/bin/next", {
  paths: [frontendRoot, repoRoot]
});
const certFile = resolve(repoRoot, "certs", "localhost.pem");
const keyFile = resolve(repoRoot, "certs", "localhost-key.pem");
const caFile = resolve(repoRoot, "certs", "localhost-ca.pem");
const backendEnvFile = resolve(repoRoot, "backend", ".env");
const frontendEnvFile = resolve(frontendRoot, ".env.local");

const httpsPort = process.env.PORT ?? "3000";
const httpRedirectPort = process.env.HTTP_REDIRECT_PORT?.trim() ?? "";
const apiUrl =
  process.env.NEXT_PUBLIC_API_URL ??
  readDotEnvValue(frontendEnvFile, "NEXT_PUBLIC_API_URL") ??
  "https://localhost:5000/api/v1";
const jwtSecret = process.env.JWT_SECRET ?? readDotEnvValue(backendEnvFile, "JWT_SECRET");
const useHttpsFrontend = !isLocalhostHttpUrl(apiUrl);
const insecureLocalTlsBypass = shouldBypassTlsForLocalApi(apiUrl);

if (useHttpsFrontend) {
  ensureCertificates();
}

if (!useHttpsFrontend) {
  console.warn(
    [
      "Frontend dev launcher detected an HTTP localhost API endpoint.",
      "Starting Next.js over HTTP to avoid mixed-content login failures."
    ].join("\n")
  );
} else if (insecureLocalTlsBypass) {
  console.warn(
    "Frontend local HTTPS runtime is bypassing TLS verification for localhost API calls."
  );
}

const child = spawn(
  process.execPath,
  [
    nextBin,
    "dev",
    "--hostname",
    "localhost",
    "--port",
    httpsPort,
    ...(useHttpsFrontend
      ? [
          "--experimental-https",
          "--experimental-https-key",
          keyFile,
          "--experimental-https-cert",
          certFile,
          "--experimental-https-ca",
          caFile
        ]
      : [])
  ],
  {
    cwd: frontendRoot,
    stdio: "inherit",
    env: {
      ...process.env,
      HOSTNAME: "localhost",
      NEXT_PUBLIC_API_URL: apiUrl,
      ...(useHttpsFrontend
        ? {
          NODE_EXTRA_CA_CERTS: caFile,
          ...(insecureLocalTlsBypass
            ? {
                NODE_TLS_REJECT_UNAUTHORIZED: "0"
              }
            : {}),
          FRONTEND_HTTPS_ENABLED: "true",
          FRONTEND_HTTPS_CERT_FILE: certFile,
          FRONTEND_HTTPS_KEY_FILE: keyFile,
          FRONTEND_HTTPS_CA_FILE: caFile,
          LOCAL_HTTPS: "true",
          ENFORCE_HTTPS: "true",
          ...(httpRedirectPort
            ? {
                HTTP_REDIRECT_PORT: httpRedirectPort
              }
            : {})
        }
      : {
          FRONTEND_HTTPS_ENABLED: "false",
          LOCAL_HTTPS: "false",
          ENFORCE_HTTPS: "false"
        }),
      ...(jwtSecret
        ? {
            JWT_SECRET: jwtSecret
          }
        : {}),
      PORT: httpsPort
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

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    child.kill(signal);
  });
}

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

function shouldBypassTlsForLocalApi(url) {
  try {
    const parsedUrl = new URL(url);
    return parsedUrl.protocol === "https:" && isLocalhostHostname(parsedUrl.hostname);
  } catch {
    return false;
  }
}

function isLocalhostHttpUrl(url) {
  try {
    const parsedUrl = new URL(url);
    return parsedUrl.protocol === "http:" && isLocalhostHostname(parsedUrl.hostname);
  } catch {
    return false;
  }
}

function isLocalhostHostname(hostname) {
  const normalizedHostname = hostname.replace(/^\[|\]$/g, "").toLowerCase();

  return (
    normalizedHostname === "localhost" ||
    normalizedHostname === "127.0.0.1" ||
    normalizedHostname === "::1"
  );
}
