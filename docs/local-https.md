# Local HTTPS

This repo now supports trusted local HTTPS for the Next.js frontend on `https://localhost:3000` and the Express backend on `https://localhost:5000`.

## Recommended flow

1. Install `mkcert` on your machine.
2. Run `npm run certs:dev`
3. Run `npm run dev:backend`
4. Run `npm run dev:frontend`
5. Open `https://localhost:3000`

The `certs:dev` script prefers `mkcert` and generates:

- `certs/localhost.pem`
- `certs/localhost-key.pem`
- `certs/localhost-ca.pem`

If `mkcert` is available, it also installs a local CA so modern browsers trust the certificate automatically.

On Windows, if `mkcert` is not installed, `npm run certs:dev` falls back to PowerShell and creates a trusted localhost certificate in the current user certificate store before exporting PEM files for Node.js and Next.js.

## Tool behavior

- `npm run dev:backend` starts the backend with `HTTPS_ENABLED=true` on `https://localhost:5000`
- `npm run dev:frontend` starts Next with `--experimental-https` on `https://localhost:3000`
- Both HTTPS scripts set `NODE_EXTRA_CA_CERTS=certs/localhost-ca.pem` so server-side Node fetch calls trust the local certificate too
- `npm run dev:frontend` also sets `NODE_TLS_REJECT_UNAUTHORIZED=0` for localhost API calls because the Next middleware sandbox does not reliably honor the local CA during self-signed HTTPS development
- `npm run dev:frontend` also loads `JWT_SECRET` from `backend/.env` when needed, so middleware can validate signed access tokens locally without calling the backend over localhost TLS

If you explicitly need plain HTTP for transport testing, use:

- `npm run dev:backend:http`
- `npm run dev:frontend:http`

That path is intentionally insecure and keeps Private Mode security modules in review-only state.

Important limitation:

- Direct localhost development cannot auto-redirect `http://localhost:3000` to `https://localhost:3000` on the same port. HTTPS now runs directly on `3000`, so use the `https://` URL.
- If you need real HTTP-to-HTTPS redirects, run behind a reverse proxy or configure a separate `HTTP_REDIRECT_PORT`.

## Environment

Relevant backend variables are documented in [backend/.env.example](../backend/.env.example).

- `PORT`
- `HTTP_REDIRECT_PORT`
- `HTTPS_ENABLED`
- `FORCE_HTTPS`
- `HTTPS_KEY_FILE`
- `HTTPS_CERT_FILE`
- `HTTPS_CA_FILE`
- `TRUST_PROXY`

Frontend local API configuration is documented in [frontend/.env.example.local](../frontend/.env.example.local).

## Fallback

If `mkcert` is not installed and you are not on Windows, but `openssl` is available, `npm run certs:dev` generates a self-signed certificate instead.

That fallback is useful for transport testing, but browsers will still show trust warnings until you manually trust the certificate. For browser-trusted localhost development, use `mkcert`.
