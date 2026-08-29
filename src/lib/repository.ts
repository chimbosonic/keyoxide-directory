/**
 * The directory is a static page with nothing behind it to accept a submission,
 * so the way in is a pull request against the file the entries live in. These
 * links are the page's only call to action, and are kept here rather than
 * inlined so the repository is named in exactly one place.
 */
export const REPOSITORY_URL = 'https://github.com/chimbosonic/keyoxide-directory'

/**
 * Instructions for adding an instance: the notation to sign, the entry shape,
 * and which lookup to pick. The README points at the same file, so a contributor
 * arriving from either direction reads the same thing.
 */
export const ADD_INSTANCE_URL = `${REPOSITORY_URL}/blob/main/.github/pull_request_template.md`

/** The file an entry is added to, opened in GitHub's editor. */
export const KEYS_FILE_URL = `${REPOSITORY_URL}/blob/main/src/data/keys.json`
