import { copyFileSync, existsSync, mkdirSync, unlinkSync, writeFileSync } from "fs";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";
import { spawnSync } from "child_process";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const certDir = resolve(repoRoot, "certs");
const certFile = resolve(certDir, "localhost.pem");
const keyFile = resolve(certDir, "localhost-key.pem");
const caFile = resolve(certDir, "localhost-ca.pem");
const opensslConfigFile = resolve(certDir, "localhost-openssl.cnf");
const powershellScriptFile = resolve(certDir, "generate-localhost-certificates.ps1");

mkdirSync(certDir, { recursive: true });

if (hasCommand("mkcert")) {
  run("mkcert", ["-install"]);
  run("mkcert", [
    "-cert-file",
    certFile,
    "-key-file",
    keyFile,
    "localhost",
    "127.0.0.1",
    "::1"
  ]);

  const caroot = spawnSync("mkcert", ["-CAROOT"], {
    cwd: repoRoot,
    encoding: "utf8"
  }).stdout?.trim();
  if (caroot) {
    copyFileSync(resolve(caroot, "rootCA.pem"), caFile);
  }

  console.log(`Created trusted localhost certificate:\n- ${certFile}\n- ${keyFile}\n- ${caFile}`);
  if (caroot) {
    console.log(`mkcert CA root: ${caroot}`);
  }
  process.exit(0);
}

if (hasCommand("openssl")) {
  writeFileSync(
    opensslConfigFile,
    [
      "[req]",
      "default_bits = 2048",
      "prompt = no",
      "default_md = sha256",
      "x509_extensions = req_ext",
      "distinguished_name = dn",
      "",
      "[dn]",
      "CN = localhost",
      "",
      "[req_ext]",
      "subjectAltName = @alt_names",
      "",
      "[alt_names]",
      "DNS.1 = localhost",
      "IP.1 = 127.0.0.1",
      "IP.2 = ::1"
    ].join("\n"),
    "utf8"
  );

  run("openssl", [
    "req",
    "-x509",
    "-nodes",
    "-days",
    "825",
    "-newkey",
    "rsa:2048",
    "-keyout",
    keyFile,
    "-out",
    certFile,
    "-config",
    opensslConfigFile
  ]);

  if (existsSync(opensslConfigFile)) {
    unlinkSync(opensslConfigFile);
  }
  copyFileSync(certFile, caFile);

  console.warn(
    [
      "Created a self-signed localhost certificate with OpenSSL.",
      "Browsers will still warn until you manually trust this certificate or use mkcert.",
      `Certificate: ${certFile}`,
      `Private key: ${keyFile}`,
      `Trust bundle: ${caFile}`
    ].join("\n")
  );
  process.exit(0);
}

if (process.platform === "win32") {
  writeFileSync(
    powershellScriptFile,
    [
      "$ErrorActionPreference = 'Stop'",
      `$certPath = '${escapeForPowerShell(certFile)}'`,
      `$keyPath = '${escapeForPowerShell(keyFile)}'`,
      "$existing = Get-ChildItem Cert:\\CurrentUser\\My | Where-Object { $_.Subject -eq 'CN=localhost' } | Sort-Object NotAfter -Descending | Select-Object -First 1",
      "if ($existing -and $existing.NotAfter -gt (Get-Date).AddDays(7)) {",
      "  $cert = $existing",
      "} else {",
      "  $cert = New-SelfSignedCertificate -FriendlyName 'Security AI Lab Localhost Dev' -Subject 'CN=localhost' -CertStoreLocation 'Cert:\\CurrentUser\\My' -KeyAlgorithm RSA -KeyLength 2048 -HashAlgorithm 'SHA256' -KeyExportPolicy Exportable -NotAfter (Get-Date).AddYears(2) -TextExtension @('2.5.29.17={text}DNS=localhost&IPAddress=127.0.0.1&IPAddress=::1')",
      "}",
      "$rootStore = New-Object System.Security.Cryptography.X509Certificates.X509Store('Root', 'CurrentUser')",
      "$rootStore.Open([System.Security.Cryptography.X509Certificates.OpenFlags]::ReadWrite)",
      "try {",
      "  $alreadyTrusted = $rootStore.Certificates | Where-Object { $_.Thumbprint -eq $cert.Thumbprint } | Select-Object -First 1",
      "  if (-not $alreadyTrusted) {",
      "    $rootStore.Add($cert)",
      "  }",
      "} finally {",
      "  $rootStore.Close()",
      "}",
      "$certBytes = $cert.Export([System.Security.Cryptography.X509Certificates.X509ContentType]::Cert)",
      "$certPem = \"-----BEGIN CERTIFICATE-----`n$([Convert]::ToBase64String($certBytes, [System.Base64FormattingOptions]::InsertLineBreaks))`n-----END CERTIFICATE-----`n\"",
      "[System.IO.File]::WriteAllText($certPath, $certPem, [System.Text.Encoding]::ASCII)",
      "$rsa = [System.Security.Cryptography.X509Certificates.RSACertificateExtensions]::GetRSAPrivateKey($cert)",
      "if ($rsa -is [System.Security.Cryptography.RSACng]) {",
      "  $keyBytes = $rsa.Key.Export([System.Security.Cryptography.CngKeyBlobFormat]::Pkcs8PrivateBlob)",
      "} else {",
      "  $keyBytes = $rsa.ExportPkcs8PrivateKey()",
      "}",
      "$keyPem = \"-----BEGIN PRIVATE KEY-----`n$([Convert]::ToBase64String($keyBytes, [System.Base64FormattingOptions]::InsertLineBreaks))`n-----END PRIVATE KEY-----`n\"",
      "[System.IO.File]::WriteAllText($keyPath, $keyPem, [System.Text.Encoding]::ASCII)"
    ].join("\n"),
    "utf8"
  );

  run("powershell", [
    "-NoProfile",
    "-ExecutionPolicy",
    "Bypass",
    "-File",
    powershellScriptFile
  ]);

  if (existsSync(powershellScriptFile)) {
    unlinkSync(powershellScriptFile);
  }
  copyFileSync(certFile, caFile);

  console.log(
    `Created and trusted a localhost certificate with PowerShell:\n- ${certFile}\n- ${keyFile}\n- ${caFile}`
  );
  process.exit(0);
}

console.error(
  [
    "No certificate tool was found.",
    "Install mkcert for browser-trusted local HTTPS, then rerun `npm run certs:dev`.",
    "Fallback: install OpenSSL to generate an untrusted self-signed certificate."
  ].join("\n")
);
process.exit(1);

function hasCommand(command) {
  const result = spawnSync(command, ["--help"], {
    cwd: repoRoot,
    stdio: "ignore",
    shell: process.platform === "win32"
  });
  return result.status === 0;
}

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: repoRoot,
    stdio: "inherit",
    shell: process.platform === "win32"
  });

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function escapeForPowerShell(value) {
  return value.replace(/'/g, "''");
}
