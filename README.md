# Keyoxide Instance Directory

A directory of [Keyoxide](https://keyoxide.org) deployments, verified in your
browser. There is no backend: the page ships with a list of operator key
identifiers, fetches each key, and reads the DNS proofs its operator already
published to Keyoxide.

**[Add your deployment](.github/pull_request_template.md)**: one entry in
`src/data/keys.json`.

## How verification works

All instances in the directory follow Keyoxide's own DNS proof:

```
key  ──  proof@ariadne.id=dns:example.org?type=TXT  ──▶  domain
key  ◀──  TXT "openpgp4fpr:<fingerprint>"           ──   domain
```

Two limits worth stating plainly. Verification is by host, never by path: an
instance at `https://example.org/keyoxide` is confirmed by a record on
`example.org`. And it is not cryptographic: the record is read over
DNS-over-HTTPS, so it rests on believing the resolver.

A proof says nothing about _wanting to be listed here_. So each entry also
carries a detached signature by the operator's key over the instance it names,
checked at merge time by `verify:entries` and never by the page.

## Keyoxide.org

keyoxide.org and dev.keyoxide.org are pinned rather than listed (the project has
signed no entry, and would have no reason to) and are kept out of the verified
count.

## Where keys are fetched from

An entry lists every place its key can be found. They are tried in this order,
whatever order the entry writes them in:

| `type` | identified by     | fetched from                    | needs                                 |
| ------ | ----------------- | ------------------------------- | ------------------------------------- |
| `dane` | `domain` + `hash` | an RFC 7929 OPENPGPKEY record   | a DNSSEC-signed zone                  |
| `wkd`  | `domain` + `hash` | that domain's Web Key Directory | CORS headers on the operator's server |
| `hkp`  | `fingerprint`     | keys.openpgp.org, over VKS      | nothing                               |

## Privacy

No user id, address, or full fingerprint is ever rendered; cards show a short key
id, and user ids are absent from the parse result's type entirely, so they cannot
reach the DOM by accident. Both suites assert as much.

No address is stored either. A `wkd` source carries the z-base-32 SHA-1 of the
local part, a `dane` source the truncated SHA-256, which is all their URLs and
record names are built from. `npm run wkd-hash <addr>` and `npm run dane-hash
<addr>` compute them locally and send nothing anywhere.

Those hashes both are unsalted digests of a lowercased local part, sitting beside
the domain in the clear. They stop a scraper's regex, not a wordlist. An `hkp`
source derives nothing from an address at all, and is the stronger choice.

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

Key fixtures under `tests/fixtures/keys` are real keys made with gpg in a
throwaway keyring, with `@example.invalid` user ids, so the parser meets packets
GnuPG actually emits. `dist/` is a flat static bundle uploaded as-is to
Cloudflare R2.

## LLM disclosure

An LLM generated most of the code. Design, architecture and technology choices
are mine. Nothing is signed off unless I have reviewed it: I read the diff and
message of the commit, read the tests and run the code where running it is
possible.

The use of an LLM allows me to find time for projects such as this one in
between work and family life. You are free not to use the software; this
repository is not a venue for debating the use of AI.
