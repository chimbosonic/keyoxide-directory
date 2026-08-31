# Add a Keyoxide instance

Adding a deployment to the directory is a one-file change: an entry in
`src/data/keys.json`. CI validates it, so a malformed entry fails this pull
request rather than rendering as a broken card.

## 1. Prove your domain to Keyoxide

If you already have a Keyoxide DNS proof for the domain your deployment is served
from, this step is done: the directory reads the proof you already published,
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
it needs control of that domain's DNS. Check it before opening the pull request:

```console
$ dig +short TXT example.org
"openpgp4fpr:3AA5C34371567BD2C5A1F0F1D0F4C2E8B7A69C11"
```

The domain you prove has to cover your deployment's **host**. Proving
`example.org` covers a deployment at `https://kx.example.org` and at
`https://example.org/keyoxide`; it does not cover `https://kx.example.net`. A
proof on the host itself is the tightest fit, and your card says which domain
confirmed it when the proof came from further up.

Several records under one name are fine; any one matching confirms you, so
rotating a key does not need a flag day.

## 2. Sign your entry

The proof says you control the domain. It does not say you want a card here, and
anyone could read your proof on your behalf, so the entry carries your signature
over the deployment being listed:

```console
$ printf 'keyoxide-directory listing v1\ninstance=https://kx.example.org\n' \
    | gpg --detach-sign --local-user <YOUR-FINGERPRINT> | base64 -w0
```

Put the output in the entry's `signature` field, which is required. Sign the
instance URL exactly as you write it in the entry; a trailing slash added
afterwards invalidates it. `npm run verify:entries` checks this, and it is the
one thing about your entry nobody else could have produced.

## 3. Publish your key, and list where it can be found

An entry lists every place its key can be fetched from, and you can declare all
three. They are a fallback chain: the same key in several places, tried `dane`,
then `wkd`, then `hkp`, whatever order you write them in. The first that answers
settles it, and a route that has nothing to say does not sink the entry.

The finished entry looks like this:

```json
{
  "instance": "https://kx.example.org",
  "signature": "<the base64 from step 2>",
  "sources": [
    { "type": "dane", "domain": "example.org", "hash": "c93f1e400f26708f98cb19d936620da35eec8f72e57f9eec01c1afd6" },
    { "type": "wkd", "domain": "example.org", "hash": "tm4s53wnx8fs6zsorm3tihcmu9ghamw1" },
    { "type": "hkp", "fingerprint": "3AA5C34371567BD2C5A1F0F1D0F4C2E8B7A69C11" }
  ]
}
```

Every source must be the same key. `npm run verify:entries` fetches all of them
and fails if their fingerprints disagree.

### `dane` the key is an OPENPGPKEY record in your DNS

The route that asks least of you: no web server, no CORS headers, nothing to keep
running. Compute the record name:

```console
$ npm run dane-hash you@example.org
{
  "type": "dane",
  "domain": "example.org",
  "hash": "c93f1e400f26708f98cb19d936620da35eec8f72e57f9eec01c1afd6"
}
```

and publish your key there, as RFC 7929 prescribes:

```console
$ gpg --export you@example.org | gpg --dearmor > key.bin   # binary, not armored
$ # then publish key.bin as the OPENPGPKEY rdata at
$ #   <hash>._openpgpkey.example.org
```

Two things worth knowing:

- **Your zone must be DNSSEC-signed.** The directory only accepts a DANE record
  when the resolver reports it validated. Over this route the resolver hands the
  page both your key and the record confirming it, so DNSSEC is the only thing
  left standing; without it your card reads *key record not dnssec-signed*.
- **`dig` will usually show you nothing.** A key does not fit in a UDP answer, so
  `dig` comes back empty at default settings and the record looks missing when it
  is fine. Check it the way the directory does, over DNS-over-HTTPS:

```console
$ curl -s -H 'accept: application/dns-json' \
    'https://dns.google/resolve?name=<hash>._openpgpkey.example.org&type=61'
```

Note `type=61` rather than `type=OPENPGPKEY`: dns.google rejects the name with a
400.

### `wkd` the key is in your domain's Web Key Directory

If you publish your own key over WKD, the directory can fetch it from you
directly, with no keyserver in between. Your address is *not* stored: the source
carries only the hash WKD builds its URL from. Compute it:

```console
$ npm run wkd-hash you@example.org
{
  "type": "wkd",
  "domain": "example.org",
  "hash": "tm4s53wnx8fs6zsorm3tihcmu9ghamw1"
}
```

**Your server must send CORS headers.** The lookup runs in the visitor's browser,
so your WKD host needs `access-control-allow-origin: *` on the
`/.well-known/openpgpkey/` path. Without it the fetch is blocked.

### `hkp` the key is on keys.openpgp.org

Publish it:

```console
$ gpg --export --armor <YOUR-FINGERPRINT> | curl -T - https://keys.openpgp.org/vks/v1/upload
```

and name your fingerprint:

```json
{ "type": "hkp", "fingerprint": "3AA5C34371567BD2C5A1F0F1D0F4C2E8B7A69C11" }
```

`fingerprint` is a 40-character fingerprint or a 16-character long key id. Short
key ids are rejected because they are collision-prone.

Neither hash is a secret, incidentally. Both are unsalted digests of your
lowercased local part next to your domain in the clear, so they defeat address
scrapers, not a determined person with a wordlist. Use `hkp` alone if you want
nothing derived from your address in the file at all.

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
- [ ] Every source I listed serves the same key, and I checked each one resolves.
- [ ] If I listed `dane`, my zone is DNSSEC-signed.
- [ ] If I listed `wkd`, my server sends CORS headers on `/.well-known/openpgpkey/`.
- [ ] I added exactly one entry, with at least one source.
- [ ] `npm run validate:keys` passes.

## What the site will show

Your card shows the deployment host, a short key id (the last 16 hex characters
of your fingerprint) and two pills: whether the proof verified, and whether the
deployment answered. Your user id and address are never rendered.

If something is wrong the entry still appears, marked with what was wrong: a key
proving only other domains, a key carrying no dns proof, a key that none of your
sources could produce, or a domain that does not name your key back.
