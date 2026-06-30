# Local HTTPS

This repo now supports trusted local HTTPS for the Next.js frontend on `https://localhost:3000` and the Express backend on `https://localhost:5000`.

## Recommended flow

1. Install `mkcert` on your machine.
2. Run `npm run certs:dev`
3. Run `npm run dev:backend:https`
4. Run `npm run dev:frontend:https`
5. Open `https://localhost:3000`

The `certs:dev` script prefers `mkcert` and generates:

- `certs/localhost.pem`
- `certs/localhost-key.pem`
- `certs/localhost-ca.pem`

If `mkcert` is available, it also installs a local CA so modern browsers trust the certificate automatically.

On Windows, if `mkcert` is not installed, `npm run certs:dev` falls back to PowerShell and creates a trusted localhost certificate in the current user certificate store before exporting PEM files for Node.js and Next.js.

## Tool behavior

- `npm run dev:backend:https` starts the backend with `HTTPS_ENABLED=true`
- `npm run dev:frontend:https` starts Next with `--experimental-https` and points the frontend API client at `https://localhost:5000/api/v1`
- Both HTTPS scripts set `NODE_EXTRA_CA_CERTS=certs/localhost-ca.pem` so server-side Node fetch calls trust the local certificate too
- `npm run dev:frontend:https` also loads `JWT_SECRET` from `backend/.env` when needed, so middleware can validate signed access tokens locally without calling the backend over localhost TLS

## Environment

Relevant backend variables are documented in [backend/.env.example](../backend/.env.example).

- `HTTPS_ENABLED`
- `HTTPS_KEY_FILE`
- `HTTPS_CERT_FILE`
- `HTTPS_CA_FILE`

Frontend local API configuration is documented in [frontend/.env.example.local](../frontend/.env.example.local).

## Fallback

If `mkcert` is not installed and you are not on Windows, but `openssl` is available, `npm run certs:dev` generates a self-signed certificate instead.

That fallback is useful for transport testing, but browsers will still show trust warnings until you manually trust the certificate. For browser-trusted localhost development, use `mkcert`.
