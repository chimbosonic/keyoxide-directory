# Keyoxide Instance Directory

A directory of [Keyoxide](https://keyoxide.org) deployments, built entirely in
the browser. There is no backend: the page ships with a list of operator key
identifiers, fetches each key, and reads the DNS proofs the operator has already
published to Keyoxide.

**[Add your deployment](.github/pull_request_template.md)** — it is a one-entry
change to `src/data/keys.json`.

## How a deployment is verified

Keyoxide defines no notation meaning "this is the deployment I run", and it never
needed one: every deployment renders any key, so a key is not bound to one.

What operators do already have is a DNS proof — Keyoxide's own, read by doipjs
under the `proof@ariadne.id` notation and its legacy alias `proof@metacode.biz`:

```
key  ──  proof@ariadne.id=dns:example.org?type=TXT  ──▶  domain
key  ◀──  TXT "openpgp4fpr:<fingerprint>"           ──   domain
```

Both halves are needed. The notation alone is the operator saying "I control this
domain", which anyone can sign about a domain they have nothing to do with; the
record alone is a domain naming a key that never answered. Together they prove
the key controls the domain's DNS.

The directory adds one step: from a domain to a deployment served under it. An
entry verifies when a domain the key proves **covers the deployment's host** —
the host itself, or a parent of it. Publishing at `example.org` takes control of
that zone, and `kx.example.org` ordinarily lives in it.

Ordinarily, not always. A delegated subdomain has its own operator, and this rule
lets the parent's holder confirm a deployment they do not run. So the card names
the domain the confirmation came from whenever it was not the deployment's own
host — *verified via example.org* rather than a bare *verified*.

Verification is by host, never by path: an instance at
`https://example.org/keyoxide` is confirmed by a record on `example.org`, and no
proof can say anything narrower than the host it names. And the trust is not
cryptographic: the record is read over DNS-over-HTTPS, so we believe what the
resolver tells us. Its DNSSEC `AD` flag is the resolver's own claim rather than
something checked here.

## Consent, and where it is checked

A proof says the key controls the host. It never mentions this directory — it was
published for Keyoxide — and anyone can read it on an operator's behalf. So each
entry also carries a detached signature, made by the operator's own key, over a
string naming the deployment being listed:

```
keyoxide-directory listing v1
instance=https://kx.example.org
```

That signature is a merge-time gate, not a rendering state. `npm run
verify:entries` checks it in CI, where a pull request can be refused; the page
never reads it, and no card status depends on it. A visitor could do nothing with
the answer, and by the time an entry is merged the directory has already taken
the operator's word for it.

The instance is signed verbatim, so editing the URL afterwards invalidates the
signature even if it still resolves to the same place.

## What a card shows

keyoxide.org leads the grid as a pinned card. It cannot arrive the ordinary way
— an entry is listed on the operator's signature over it, and the Keyoxide
project has signed nothing of the sort — so rather than leave the best-known
deployment out of a directory of deployments, it is pinned. It is probed for
liveness like any other, and kept out of the verified count, because nothing
about it was verified.

Every other card shows two independent pills:

| | |
|---|---|
| **project instance** | pinned by the directory; no key, and nothing proven |
| **verified** | the key proves the deployment's own host, and that host names the key |
| **verified via `<domain>`** | the same, but proven on a parent of the host rather than the host itself |
| **domain name does not confirm key** | the key proves the domain, but the domain publishes no record |
| **domain name links another key** | the domain publishes a record, for somebody else |
| **domain name lookup failed** | no resolver could be reached, so ownership is unknown |
| **key proves another domain** | the key carries dns proofs, none covering this deployment |
| **no domain proof on key** | the key was fetched but proves no domain over dns |
| **key not found** | the source has no such key: the keyserver does not hold it, or the domain publishes none |
| **key unreadable** | the key was fetched but could not be parsed |
| **key lookup failed** | network, CORS, or a server error |

and separately whether the deployment answered: **online**, **unreachable**, or
**no answer yet**. The two are kept apart because a deployment can be up while
its key proves nothing, and can verify while being down.

Liveness uses a `no-cors` request, which resolves whenever something answers and
rejects only on a connection failure. A timeout is reported as *no answer yet*
rather than unreachable — a healthy deployment that simply does not allow this
origin must not be labelled down.

## Publishing the proof

If you already have a Keyoxide DNS proof for the domain your deployment runs
under, there is nothing to publish: that is what the directory reads. Otherwise
it is Keyoxide's ordinary DNS proof, useful everywhere Keyoxide is, and not
something this directory invented:

```
proof@ariadne.id=dns:example.org?type=TXT   # on your key's user id
example.org.  IN  TXT  "openpgp4fpr:3AA5C34371567BD2C5A1F0F1D0F4C2E8B7A69C11"
```

Several records are allowed and any one of them matching confirms the key, so
rotating a key or running a deployment with someone else needs no flag day. A TXT
record under the name that names no fingerprint is ignored rather than read as a
competing claim — which covers the `NAME@DOMAIN` record form Keyoxide also
allows, carrying an address this directory neither has nor wants.

The record is matched the way doipjs matches it, on the URI appearing anywhere in
the record rather than at its start. A record Keyoxide already accepts has to
verify here too, or reusing an existing proof would not reuse much.

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

Checking ownership means the page also asks a DNS-over-HTTPS resolver about each
proven domain, which is a third party it did not previously contact. What that
resolver learns is the domains named by proofs already published on public keys,
not anything about the visitor beyond their having opened the directory. It is
still a party in the loop, and worth knowing about.

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
$ npm run verify:entries # check each entry's signature against its own key
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
Their user ids use `@example.invalid` addresses. `proof.gpg` is `proof.asc` run
through `gpg --dearmor`: the same key in the unarmored form WKD serves, and
`proof.entry-sig.b64` is a real `gpg --detach-sign` over that key's entry.

`proofs.asc` is the one that earns its keep. It carries two `proof@ariadne.id`
dns proofs, a third `proof@ariadne.id` that is a Mastodon URL, a legacy
`proof@metacode.biz` proof, and a second user id with no notations at all.
openpgp.js's `notations` map is keyed by notation name and so keeps only the last
subpacket parsed under each — against this key it reports the Mastodon URL and
loses both dns proofs. That is why the parser reads `rawNotations` instead.

The z-base-32 hashing is checked against the worked example published in
draft-koch-openpgp-webkey-service, so the directory cannot drift into looking
somewhere no other WKD client would.

`validate:keys` proves an entry is well-formed, `verify:entries` proves the
operator asked for it, and `test:entries` proves it is *true*. It loads the production build in a real browser with no stubbing and
checks that every entry in `keys.json` reaches **verified** — so a typo'd hash, a
key that was never published, a domain that stopped sending CORS headers, or a
proof withdrawn from a key all fail there rather than on the live site.
It is the one suite that touches the network, which is why it is kept out of CI's
default path: it gates changes to `keys.json` and runs daily, so an operator's
outage cannot fail unrelated pull requests. Running against the real bundle also
means it exercises the `openpgp/lightweight` build visitors get, rather than the
full node build the unit tests use.

`dist/` is a flat static bundle — `index.html` plus hashed assets, relative
`base`, no server-side routing — and is uploaded as-is to Cloudflare R2.
