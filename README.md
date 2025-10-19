# Firebase Token Helper

Small CLI tool to mint a Firebase custom token for a given UID (using Firebase Admin SDK) and exchange it for a Firebase ID token (auth token) via the REST API. Useful for local development, testing, or troubleshooting auth flows.

Quick facts
- Language: Node.js
- Intended usage: developer CLI (server-side only)
- No remote servers — runs locally using your service account

Prerequisites
- Node.js 18+ (or a recent Node release)
- A Firebase service account JSON file with privileges to create custom tokens. Get it from Firebase Console -> Project Settings -> Service accounts.
- Firebase Web API key (Project Settings -> General -> Web API Key).

Install

```powershell
npm install
```

Usage examples

- Use environment variables (PowerShell example):

```powershell
$env:GOOGLE_APPLICATION_CREDENTIALS = 'C:\path\to\serviceAccount.json'
$env:FIREBASE_API_KEY = 'your-web-api-key'
node index.js --uid some-uid
```

- Pass the service account and apiKey via flags:

```powershell
node index.js --uid some-uid --serviceAccount C:\path\to\serviceAccount.json --apiKey your-web-api-key
```

- Run without args and follow interactive prompts (the tool will also auto-detect a JSON service account in `.firebase/` if present):

```powershell
node index.js
```

What the tool does
- Initializes Firebase Admin using (priority): `--serviceAccount` -> `GOOGLE_APPLICATION_CREDENTIALS` env -> auto-detect `./.firebase/*.json`.
- Creates a custom token for the provided UID.
- Exchanges the custom token for a Firebase ID token via the Identity Toolkit REST API (requires the Web API key).
- Prints the custom token and the exchange result (contains `idToken`, `refreshToken`, `expiresIn`).

Options
- `--uid` — user UID to mint the custom token for. If omitted, the CLI will prompt you.
- `--serviceAccount` — path to service account JSON. If omitted, the CLI will search `.firebase/` and then prompt.
- `--apiKey` — Firebase Web API key. If omitted the CLI will prompt.
- `--projectId` — optional project id; the script will also respect `FIREBASE_PROJECT_ID` env var.

Example output

The CLI prints a JSON block similar to this after exchange:

```
{
  "idToken": "<jwt>",
  "refreshToken": "<token>",
  "expiresIn": "3600",
  "localId": "<uid>"
}
```

Security notes
- Never commit your service account JSON or API keys to source control.
- Use this tool only in trusted environments — service account JSON grants high privileges.

Troubleshooting
- If you see errors initializing Admin, confirm the service account path is valid and the JSON contains `client_email` and `private_key`.
- If the exchange fails, verify the `apiKey` is for the same Firebase project as the service account.
