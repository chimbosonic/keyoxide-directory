# Keyoxide Instance Directory

A directory of [Keyoxide](https://keyoxide.org) deployments, verified in your
browser. There is no backend: the page ships with a list of operator key
identifiers, fetches each key, and reads the DNS proofs its operator already
published to Keyoxide.

**[Add your deployment](.github/pull_request_template.md)** — one entry in
`src/data/keys.json`.

## How verification works

Nothing here is this directory's invention. Keyoxide's own DNS proof is two
halves, and an operator who has one has already done the work:

```
key  ──  proof@ariadne.id=dns:example.org?type=TXT  ──▶  domain
key  ◀──  TXT "openpgp4fpr:<fingerprint>"           ──   domain
```

Together they prove the key controls the domain's DNS. Either alone is one party
talking to itself.

The directory adds one step: an entry verifies when a domain the key proves
**covers the deployment's host** — that host, or a parent of it. A parent is the
weaker case, since a delegated subdomain has its own operator, so the card says
*verified via example.org* rather than a bare *verified*.

Two limits worth stating plainly. Verification is by host, never by path: an
instance at `https://example.org/keyoxide` is confirmed by a record on
`example.org`. And it is not cryptographic — the record is read over
DNS-over-HTTPS, so it rests on believing the resolver.

A proof says nothing about *wanting to be listed here*. So each entry also
carries a detached signature by the operator's key over the instance it names,
checked at merge time by `verify:entries` and never by the page.

## What a card shows

Two independent pills. First, what was proven:

| | |
|---|---|
| **verified** | the key proves the deployment's own host, and that host names the key |
| **verified via `<domain>`** | the same, proven on a parent of the host |
| **domain name does not confirm key** | the key proves the domain, but it publishes no record |
| **domain name links another key** | the domain publishes a record, for somebody else |
| **domain name lookup failed** | no resolver could be reached |
| **key proves another domain** | the key's dns proofs cover no part of this deployment |
| **no domain proof on key** | the key was fetched but proves no domain over dns |
| **key record not dnssec-signed** | a DANE record exists, in a zone the resolver would not vouch for |
| **key not found** | no source has the key |
| **key unreadable** | the key was fetched but could not be parsed |
| **key lookup failed** | network, CORS, or a server error |
| **project instance** | pinned by the directory; no key, nothing proven |

Second, whether the deployment answered: **online**, **unreachable**, or **no
answer yet**. The two are kept apart because a deployment can be up while its key
proves nothing, and can verify while being down.

keyoxide.org and dev.keyoxide.org are pinned rather than listed — the project has
signed no entry, and would have no reason to — and are kept out of the verified
count.

## Where keys are fetched from

An entry lists every place its key can be found. They are tried in this order,
whatever order the entry writes them in:

| `type` | identified by | fetched from | needs |
|---|---|---|---|
| `dane` | `domain` + `hash` | an RFC 7929 OPENPGPKEY record | a DNSSEC-signed zone |
| `wkd` | `domain` + `hash` | that domain's Web Key Directory | CORS headers on the operator's server |
| `hkp` | `fingerprint` | keys.openpgp.org, over VKS | nothing |

A fallback chain, not alternatives: the same key in several places, so the first
that answers settles it. `dane` leads because it asks least of the operator —
WKD's CORS requirement is the most common reason a source goes quiet — and the
keyserver comes last because it is the one copy the operator does not serve.

## Privacy

No user id, address, or full fingerprint is ever rendered; cards show a short key
id, and user ids are absent from the parse result's type entirely, so they cannot
reach the DOM by accident. Both suites assert as much.

No address is stored either. A `wkd` source carries the z-base-32 SHA-1 of the
local part, a `dane` source the truncated SHA-256, which is all their URLs and
record names are built from. `npm run wkd-hash <addr>` and `npm run dane-hash
<addr>` compute them locally and send nothing anywhere.

Be clear-eyed about what those hashes buy: both are unsalted digests of a
lowercased local part, sitting beside the domain in the clear. They stop a
scraper's regex, not a wordlist. An `hkp` source derives nothing from an address
at all, and is the stronger choice.

The page also asks a DNS-over-HTTPS resolver about each proven domain — a third
party it did not otherwise contact. What that resolver learns is domains already
named by public keys, not anything about the visitor beyond their having opened
the page.

## Development

```console
$ npm ci
$ npm run dev              # local dev server
$ npm run test:unit        # Vitest: library and component tests
$ npm run test:e2e         # Playwright, against the production build
$ npm run test:entries     # resolve every listed entry against the real network
$ npm run validate:keys    # schema-check src/data/keys.json
$ npm run verify:entries   # check each entry's signature against its own key
$ npm run wkd-hash <addr>  # print the wkd source for an address
$ npm run dane-hash <addr> # print the dane source for an address
$ npm run check            # svelte-check
$ npm run build            # -> dist/
```

Three checks guard `keys.json`, in increasing strength: `validate:keys` proves an
entry is well-formed, `verify:entries` proves the operator asked for it, and
`test:entries` proves it is *true* — the production bundle in a real browser,
nothing stubbed, every entry reaching **verified**. The last two touch the
network, so they gate changes to `keys.json` and run daily rather than on every
pull request, where an operator's outage would fail unrelated work.

Key fixtures under `tests/fixtures/keys` are real keys made with gpg in a
throwaway keyring, with `@example.invalid` user ids, so the parser meets packets
GnuPG actually emits. `dist/` is a flat static bundle uploaded as-is to
Cloudflare R2.

The reasoning behind each decision lives beside the code it constrains rather
than here: why proofs are read off `rawNotations` (`src/lib/parseKey.ts`), why a
DANE record needs `AD` and why two rdata decoders exist (`src/lib/dane.ts`), why
the signature is a merge-time gate (`src/lib/entrySignature.ts`), why library
tests cannot run under jsdom (`vite.config.ts`).
