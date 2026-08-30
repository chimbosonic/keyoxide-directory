# Keyoxide Instance Directory

A directory of [Keyoxide](https://keyoxide.org) deployments, built entirely in
the browser. There is no backend: the page ships with a list of operator key
identifiers, fetches each key, and reads a notation off the key in which the
operator claims the deployment they run.

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

keyoxide.org leads the grid as a pinned card. It cannot arrive the ordinary way
— a card is earned by carrying an `instance@dp42.dev` notation, and the Keyoxide
project has no reason to sign a notation namespaced under this directory's
domain — so rather than leave the best-known deployment out of a directory of
deployments, it is pinned. It is probed for liveness like any other, and kept
out of the verified count, because nothing about it was verified.

Every other card shows two independent pills:

| | |
|---|---|
| **project instance** | pinned by the directory; no key, and nothing claimed |
| **verified** | the key's notation matches the declared deployment |
| **claims another deployment** | the key carries a notation, for somewhere else |
| **no claim on key** | the key was fetched but carries no notation |
| **key not found** | the source has no such key: the keyserver does not hold it, or the domain publishes none |
| **key unreadable** | the key was fetched but could not be parsed |
| **lookup failed** | network, CORS, or a server error |

and separately whether the deployment answered: **online**, **unreachable**, or
**no answer yet**. The two are kept apart because a deployment can be up while
its key says nothing, and can verify while being down.

Liveness uses a `no-cors` request, which resolves whenever something answers and
rejects only on a connection failure. A timeout is reported as *no answer yet*
rather than unreachable — a healthy deployment that simply does not allow this
origin must not be labelled down.

## Where keys are fetched from

Each entry names its own lookup, so the two routes are never confused:

| `type` | identified by | fetched from |
|---|---|---|
| `hkp` | `fingerprint` | keys.openpgp.org, over VKS |
| `wkd` | `domain` + `hash` | that domain's Web Key Directory |

keys.openpgp.org sends `access-control-allow-origin: *` on every VKS endpoint,
which is what makes a directory with no backend possible. The `hkp` name follows
Keyoxide's own URL vocabulary; the transport is really VKS, its REST interface,
not the HKP protocol.

A `wkd` entry is tried at the advanced URL first and the direct URL second, the
order the spec prescribes. There is no fallback between the two *types*: VKS can
look a key up only by fingerprint or by a plaintext address, and a `wkd` entry
stores neither, so if WKD does not answer there is nothing else to try. WKD also
depends on the operator's own server sending CORS headers, which many do not —
that is a real cost of the route, paid in exchange for not putting an address in
this repository.

## Privacy

The directory never renders a user id, an email address, or even a full
fingerprint. Cards show only a short key id: the last 16 hex characters,
grouped. User ids are absent from the parse result's type entirely, so they
cannot reach the page by accident, and both the unit and browser suites assert
that no address appears in the DOM.

No address is stored either. A `wkd` entry carries the z-base-32 SHA-1 of the
local part, which is all a WKD URL is built from, so nothing in this repository
or the shipped bundle is an address. `npm run wkd-hash <address>` computes it
locally and sends nothing anywhere.

Be clear-eyed about what that hash buys, though: it is an unsalted SHA-1 of a
lowercased local part, sitting next to the domain in the clear. It stops a
scraper's regex, not someone willing to run a wordlist of common local parts. An
`hkp` entry, which derives nothing from an address at all, is the stronger
choice.

## Development

```console
$ npm ci
$ npm run dev            # local dev server
$ npm run test:unit      # Vitest: library and component tests
$ npm run test:e2e       # Playwright, against the production build
$ npm run test:entries   # resolve every listed entry against the real network
$ npm run validate:keys  # schema-check src/data/keys.json
$ npm run wkd-hash <addr> # print the wkd entry for an address
$ npm run check          # svelte-check
$ npm run build          # -> dist/
```

Vitest runs as two projects. Library code runs under node, because OpenPGP.js
cannot be imported in jsdom at all — jsdom's `Uint8Array` is a different realm
and fails instanceof checks inside its stream helpers. Components run under
jsdom with the browser export condition Svelte needs.

Key fixtures under `tests/fixtures/keys` are real keys generated with gpg in a
throwaway keyring, so the parser is tested against packets GnuPG actually emits.
Their user ids use `@example.invalid` addresses. `claimed.gpg` is `claimed.asc`
run through `gpg --dearmor`: the same key in the unarmored form WKD serves.

The z-base-32 hashing is checked against the worked example published in
draft-koch-openpgp-webkey-service, so the directory cannot drift into looking
somewhere no other WKD client would.

`validate:keys` proves an entry is well-formed; `test:entries` proves it is
*true*. It loads the production build in a real browser with no stubbing and
checks that every entry in `keys.json` reaches **verified** — so a typo'd hash, a
key that was never published, a domain that stopped sending CORS headers, or a
notation edited to point elsewhere all fail there rather than on the live site.
It is the one suite that touches the network, which is why it is kept out of CI's
default path: it gates changes to `keys.json` and runs daily, so an operator's
outage cannot fail unrelated pull requests. Running against the real bundle also
means it exercises the `openpgp/lightweight` build visitors get, rather than the
full node build the unit tests use.

`dist/` is a flat static bundle — `index.html` plus hashed assets, relative
`base`, no server-side routing — and is uploaded as-is to Cloudflare R2.
