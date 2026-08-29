# Add a Keyoxide instance

Adding a deployment to the directory is a one-file change: an entry in
`src/data/keys.json`. CI validates it, so a malformed entry fails this pull
request rather than rendering as a broken card.

## 1. Claim the deployment on your key

The directory does not take your word for it from the JSON alone — your key has
to say the same thing. Add the notation to your key's user id:

```console
$ gpg --edit-key <YOUR-FINGERPRINT>
gpg> notation
Enter the notation: instance@dp42.dev=https://kx.example.org
gpg> save
```

Use the deployment's base URL, exactly as you will write it in the entry. The
comparison ignores a trailing slash and the case of the host, but the path is
compared as written.

## 2. Publish your key, and pick the lookup that matches

Every entry names the lookup the directory should use. Choose the one that
matches where your key lives.

### `hkp` — the key is on keys.openpgp.org

Publish it:

```console
$ gpg --export --armor <YOUR-FINGERPRINT> | curl -T - https://keys.openpgp.org/vks/v1/upload
```

and add an entry naming your fingerprint:

```json
{
  "type": "hkp",
  "fingerprint": "3AA5C34371567BD2C5A1F0F1D0F4C2E8B7A69C11",
  "instance": "https://kx.example.org"
}
```

`fingerprint` is a 40-character fingerprint or a 16-character long key id. Short
key ids are rejected because they are collision-prone.

### `wkd` — the key is in your domain's Web Key Directory

If you publish your own key over WKD, the directory can fetch it from you
directly, with no keyserver in between. Your address is *not* stored: the entry
carries only the hash WKD builds its URL from. Compute it:

```console
$ npm run wkd-hash you@example.org
{
  "type": "wkd",
  "domain": "example.org",
  "hash": "tm4s53wnx8fs6zsorm3tihcmu9ghamw1",
  "instance": "https://kx.example.org"
}
```

Paste that into `src/data/keys.json`, with your own `instance`. The address is
only ever an argument to that local command — it is not sent anywhere, and is
not what you commit.

Two things worth knowing before choosing `wkd`:

- **Your server must send CORS headers.** The lookup runs in the visitor's
  browser, so your WKD host needs `access-control-allow-origin: *` on the
  `/.well-known/openpgpkey/` path. Without it the fetch is blocked and your card
  reads *lookup failed*. keys.openpgp.org sends it on every endpoint, which is
  why `hkp` entries need nothing from you.
- **There is no fallback.** A `wkd` entry is resolved only over WKD. If your
  domain stops serving the key, the entry does not quietly fall back to a
  keyserver — it reports that nothing was published.

The hash is not a secret, incidentally. It is an unsalted SHA-1 of your
lowercased local part next to your domain in the clear, so it defeats address
scrapers, not a determined person with a wordlist. Use `hkp` with a fingerprint
if you want nothing derived from your address in the file at all.

## 3. Check it locally

```console
$ npm ci
$ npm run validate:keys
$ npm run test:unit
```

## Checklist

- [ ] My key carries the `instance@dp42.dev` notation, and its value matches the
      `instance` in my entry.
- [ ] My key can be fetched: published to keys.openpgp.org for an `hkp` entry,
      or served over WKD with CORS headers for a `wkd` entry.
- [ ] I added exactly one entry, and its `type` matches how my key is published.
- [ ] `npm run validate:keys` passes.
- [ ] I operate this deployment.

## What the site will show

Your card shows the deployment host, a short key id (the last 16 hex characters
of your fingerprint) and two pills: whether the claim verified, and whether the
deployment answered. Your user id and address are never rendered.

If something is wrong the entry still appears, marked with the reason — a key
that claims a different deployment, a key carrying no notation, or a key that
could not be found where the entry said it would be.
