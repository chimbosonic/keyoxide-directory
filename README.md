# Keyoxide Instance Directory

A directory of [Keyoxide](https://keyoxide.org) deployments, built entirely in
the browser. There is no backend: the page ships with a list of operator key
identifiers, fetches each key from a keyserver, and reads a notation off the key
in which the operator claims the deployment they run.

**[Add your deployment](.github/pull_request_template.md)** — it is a one-entry
change to `src/data/keys.json`.

## How a deployment is claimed

Keyoxide itself defines no notation meaning "this is the deployment I run". Its
parsing library reads only `proof@ariadne.id` and the legacy
`proof@metacode.biz`, and both carry identity *proofs* — Mastodon, Keybase, DNS —
rather than deployment URLs. That is deliberate on Keyoxide's part: every
deployment renders any key, so a key is not bound to one.

This directory therefore defines its own notation, `instance@dp42.dev`,
namespaced under a controlled domain as RFC 9580 requires. An entry verifies when
the URL in that notation matches the URL declared in `keys.json`. Both halves are
required, so a typo or a claim on someone else's deployment shows up rather than
passing silently.

## What a card shows

Two independent pills:

| | |
|---|---|
| **verified** | the key's notation matches the declared deployment |
| **claims another deployment** | the key carries a notation, for somewhere else |
| **no claim on key** | the key was fetched but carries no notation |
| **key not found** | the keyserver has no such key |
| **key unreadable** | the key was fetched but could not be parsed |
| **lookup failed** | network, CORS, or a keyserver error |

and separately whether the deployment answered: **online**, **unreachable**, or
**no answer yet**. The two are kept apart because a deployment can be up while
its key says nothing, and can verify while being down.

Liveness uses a `no-cors` request, which resolves whenever something answers and
rejects only on a connection failure. A timeout is reported as *no answer yet*
rather than unreachable — a healthy deployment that simply does not allow this
origin must not be labelled down.

## Privacy

The directory never renders a user id, an email address, or even a full
fingerprint. Cards show only a short key id: the last 16 hex characters,
grouped. User ids are absent from the parse result's type entirely, so they
cannot reach the page by accident, and both the unit and browser suites assert
that no address appears in the DOM.

Entries listed by `email` are the exception, and it is worth understanding: that
address sits in plaintext in this public repository and in the shipped bundle.
Identify yourself by fingerprint if you would rather it did not.

## Keys are fetched from keys.openpgp.org

It is the only source, for both fingerprint and email entries. It sends
`access-control-allow-origin: *` on every VKS endpoint, which is what makes a
directory with no backend possible.

Web Key Directory would have been the natural route for email entries, but the
CORS header there is each domain's own server configuration and most do not send
it, so a client-side WKD lookup would fail for most operators through no fault of
their own.

## Development

```console
$ npm ci
$ npm run dev            # local dev server
$ npm run test:unit      # Vitest: library and component tests
$ npm run test:e2e       # Playwright, against the production build
$ npm run validate:keys  # schema-check src/data/keys.json
$ npm run check          # svelte-check
$ npm run build          # -> dist/
```

Vitest runs as two projects. Library code runs under node, because OpenPGP.js
cannot be imported in jsdom at all — jsdom's `Uint8Array` is a different realm
and fails instanceof checks inside its stream helpers. Components run under
jsdom with the browser export condition Svelte needs.

Key fixtures under `tests/fixtures/keys` are real keys generated with gpg in a
throwaway keyring, so the parser is tested against packets GnuPG actually emits.
Their user ids use `@example.invalid` addresses.

`dist/` is a flat static bundle — `index.html` plus hashed assets, relative
`base`, no server-side routing — and is uploaded as-is to Cloudflare R2.
