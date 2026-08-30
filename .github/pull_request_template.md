# Add a Keyoxide instance

Adding a deployment to the directory is a one-file change: an entry in
`src/data/keys.json`. CI validates it, so a malformed entry fails this pull
request rather than rendering as a broken card.

## 1. Prove your domain to Keyoxide

If you already have a Keyoxide DNS proof for the domain your deployment is served
from, this step is done — the directory reads the proof you already published,
and there is nothing to add to your key.

If you do not, it is Keyoxide's ordinary DNS proof, and it works everywhere
Keyoxide does. Add the claim to your key's user id:

```console
$ gpg --edit-key <YOUR-FINGERPRINT>
gpg> notation
Enter the notation: proof@ariadne.id=dns:example.org?type=TXT
gpg> save
```

and have the domain name you back, with a TXT record in its own zone:

```
example.org.  IN  TXT  "openpgp4fpr:<YOUR-FINGERPRINT>"
```

The value is your full 40-character fingerprint after `openpgp4fpr:`. Publishing
it needs control of that domain's DNS, which is the thing an impersonator does
not have. Check it before opening the pull request:

```console
$ dig +short TXT example.org
"openpgp4fpr:3AA5C34371567BD2C5A1F0F1D0F4C2E8B7A69C11"
```

The domain you prove has to cover your deployment's **host**. Proving
`example.org` covers a deployment at `https://kx.example.org` and at
`https://example.org/keyoxide`; it does not cover `https://kx.example.net`. A
proof on the host itself is the tightest fit, and your card says which domain
confirmed it when the proof came from further up.

Several records under one name are fine — any one matching confirms you, so
rotating a key does not need a flag day.

## 2. Sign your entry

The proof says you control the domain. It does not say you want a card here, and
anyone could read your proof on your behalf, so the entry carries your signature
over the deployment being listed:

```console
$ printf 'keyoxide-directory listing v1\ninstance=https://kx.example.org\n' \
    | gpg --detach-sign --local-user <YOUR-FINGERPRINT> | base64 -w0
```

Put the output in the entry's `signature` field. Sign the instance URL exactly as
you write it in the entry — a trailing slash added afterwards invalidates it.
`npm run verify:entries` checks this, and it is the one thing about your entry
nobody else could have produced.

## 3. Publish your key, and pick the lookup that matches

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
  "instance": "https://kx.example.org",
  "signature": "<the base64 from step 2>"
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

Paste that into `src/data/keys.json`, with your own `instance` and `signature`. The address is
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

## 4. Check it locally

```console
$ npm ci
$ npm run validate:keys
$ npm run verify:entries
$ npm run test:unit
```

## Checklist

- [ ] My key carries a `proof@ariadne.id` dns claim for a domain covering my
      deployment's host.
- [ ] That domain publishes an `openpgp4fpr` TXT record naming my fingerprint,
      and `dig` shows it.
- [ ] My entry carries a `signature` over the instance exactly as written.
- [ ] My key can be fetched: published to keys.openpgp.org for an `hkp` entry,
      or served over WKD with CORS headers for a `wkd` entry.
- [ ] I added exactly one entry, and its `type` matches how my key is published.
- [ ] `npm run validate:keys` passes.

## What the site will show

Your card shows the deployment host, a short key id (the last 16 hex characters
of your fingerprint) and two pills: whether the proof verified, and whether the
deployment answered. Your user id and address are never rendered.

If something is wrong the entry still appears, marked with what was wrong — a key
proving only other domains, a key carrying no dns proof, a key that could not be
found where the entry said it would be, or a domain that does not name your key
back.
