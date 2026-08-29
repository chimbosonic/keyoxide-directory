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

Then publish the updated key so the directory can fetch it:

```console
$ gpg --export --armor <YOUR-FINGERPRINT> | curl -T - https://keys.openpgp.org/vks/v1/upload
```

## 2. Add your entry

In `src/data/keys.json`, append one object to `keys`. Identify yourself by
fingerprint:

```json
{ "fingerprint": "3AA5C34371567BD2C5A1F0F1D0F4C2E8B7A69C11", "instance": "https://kx.example.org" }
```

or by an address the keyserver can look you up by:

```json
{ "email": "you@example.org", "instance": "https://kx.example.org" }
```

Either a `fingerprint` or an `email`, never both. Fingerprints are a 40-character
fingerprint or a 16-character long key id — short key ids are rejected because
they are collision-prone. `instance` must be `https`.

Note that an `email` entry is published in this public repository and inlined
into the site's JavaScript bundle. A `fingerprint` entry is not an address and is
the better choice if you would rather not have yours sitting in a public file.

## 3. Check it locally

```console
$ npm ci
$ npm run validate:keys
$ npm run test:unit
```

## Checklist

- [ ] My key carries the `instance@dp42.dev` notation, and its value matches the
      `instance` in my entry.
- [ ] My updated key is published to keys.openpgp.org and can be fetched.
- [ ] I added exactly one entry, with either a fingerprint or an email.
- [ ] `npm run validate:keys` passes.
- [ ] I operate this deployment.

## What the site will show

Your card shows the deployment host, a short key id (the last 16 hex characters
of your fingerprint) and two pills: whether the claim verified, and whether the
deployment answered. Your user id and address are never rendered.

If something is wrong the entry still appears, marked with the reason — a key
that claims a different deployment, a key carrying no notation, or a key the
keyserver does not have.
