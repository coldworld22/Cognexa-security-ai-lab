import { existsSync } from "fs";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";
import { spawn } from "child_process";
import { createRequire } from "module";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const backendRoot = resolve(repoRoot, "backend");
const certFile = resolve(repoRoot, "certs", "localhost.pem");
const keyFile = resolve(repoRoot, "certs", "localhost-key.pem");
const caFile = resolve(repoRoot, "certs", "localhost-ca.pem");
const require = createRequire(import.meta.url);
const tsxCliPath = require.resolve("tsx/cli", {
  paths: [backendRoot, repoRoot]
});

ensureCertificates();

const child = spawn(
  process.execPath,
  [tsxCliPath, "watch", "src/main.ts"],
  {
    cwd: backendRoot,
    stdio: "inherit",
    env: {
      ...process.env,
      HTTPS_ENABLED: "true",
      HTTPS_CERT_FILE: certFile,
      HTTPS_KEY_FILE: keyFile,
      NODE_EXTRA_CA_CERTS: caFile,
      PORT: process.env.PORT ?? "5000"
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
