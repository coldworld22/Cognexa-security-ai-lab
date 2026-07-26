import { createServer as createHttpServer } from "http";
import { readFileSync } from "fs";
import { createServer as createHttpsServer } from "https";
import next from "next";
import { parse } from "url";
import { resolve } from "path";

const dev = process.env.NODE_ENV !== "production";
const hostname = process.env.HOSTNAME ?? "0.0.0.0";
const port = Number.parseInt(process.env.PORT ?? "3000", 10);
const httpsEnabled = process.env.FRONTEND_HTTPS_ENABLED === "true";
const httpRedirectPort = parseOptionalPort(process.env.HTTP_REDIRECT_PORT);

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

await app.prepare();

const requestHandler = (request, response) => {
  const parsedUrl = parse(request.url ?? "/", true);
  void handle(request, response, parsedUrl);
};

const server = httpsEnabled
  ? createHttpsServer(
      {
        key: readFileSync(resolveTlsFile(process.env.FRONTEND_HTTPS_KEY_FILE, "../certs/localhost-key.pem")),
        cert: readFileSync(resolveTlsFile(process.env.FRONTEND_HTTPS_CERT_FILE, "../certs/localhost.pem")),
        ...(process.env.FRONTEND_HTTPS_CA_FILE?.trim()
          ? {
              ca: readFileSync(resolveTlsFile(process.env.FRONTEND_HTTPS_CA_FILE))
            }
          : {})
      },
      requestHandler
    )
  : createHttpServer(requestHandler);

const redirectServer =
  httpsEnabled && httpRedirectPort && httpRedirectPort !== port
    ? createHttpServer((request, response) => {
        const location = buildHttpsRedirectLocation(request, port);
        response.statusCode = 308;
        response.setHeader("Location", location);
        response.end();
      })
    : null;

server.listen(port, hostname, () => {
  console.log(
    `Frontend started on ${httpsEnabled ? "https" : "http"}://${hostname}:${port}`
  );
});

if (redirectServer && httpRedirectPort) {
  redirectServer.listen(httpRedirectPort, hostname, () => {
    console.log(
      `Frontend HTTP redirect server listening on http://${hostname}:${httpRedirectPort} -> https://${hostname}:${port}`
    );
  });
}

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    redirectServer?.close();
    server.close(() => {
      process.exit(0);
    });
  });
}

function parseOptionalPort(value) {
  if (!value?.trim()) {
    return null;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function resolveTlsFile(value, fallbackRelativePath) {
  const filePath = value?.trim() || fallbackRelativePath;

  if (!filePath) {
    throw new Error("A TLS certificate file path is required when FRONTEND_HTTPS_ENABLED=true.");
  }

  return resolve(process.cwd(), filePath);
}

function buildHttpsRedirectLocation(request, httpsPort) {
  const hostHeader = request.headers.host?.trim() || "localhost";
  const targetUrl = new URL(request.url ?? "/", `http://${hostHeader}`);

  targetUrl.protocol = "https:";
  targetUrl.port = httpsPort === 443 ? "" : String(httpsPort);

  return targetUrl.toString();
}
