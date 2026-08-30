<script lang="ts">
  import { instanceHost, shortKeyId } from '../lib/format'
  import type { Liveness } from '../lib/probe'
  import type { CardStatus, DirectoryCard } from '../lib/resolve'

  const {
    instance,
    liveness = null,
  }: { instance: DirectoryCard; liveness?: Liveness | null } = $props()

  const LABELS: Record<CardStatus, string> = {
    project: 'project instance',
    verified: 'verified',
    unconfirmed: 'deployment does not confirm',
    contested: 'deployment names another key',
    'dns-error': 'confirmation lookup failed',
    mismatch: 'claims another deployment',
    'no-notation': 'no claim on key',
    'not-found': 'key not found',
    unreadable: 'key unreadable',
    'fetch-error': 'lookup failed',
  }

  const LIVENESS_LABELS: Record<Liveness, string> = {
    online: 'online',
    unreachable: 'unreachable',
    unknown: 'no answer yet',
  }

  const keyId = $derived(shortKeyId(instance.fingerprint))
  const label = $derived(LABELS[instance.status])
  const ok = $derived(instance.status === 'verified')
  // The pinned card is neither verified nor failing: it makes no claim to check,
  // so its dot stays neutral rather than warning about a key that never existed.
  const warn = $derived(instance.status !== 'verified' && instance.status !== 'project')
</script>

<article class="panel" data-status={instance.status}>
  <h3>
    <a href={instance.declaredInstance} rel="noopener noreferrer">
      {instanceHost(instance.declaredInstance)}
    </a>
  </h3>

  <p class="pill" data-testid="verification">
    <span class="dot" class:ok class:warn></span>
    {label}
  </p>

  {#if liveness}
    <p class="pill" data-testid="liveness" data-liveness={liveness}>
      <span
        class="dot"
        class:ok={liveness === 'online'}
        class:warn={liveness === 'unreachable'}
      ></span>
      {LIVENESS_LABELS[liveness]}
    </p>
  {/if}

  {#if keyId}
    <p class="code" data-testid="key-id">{keyId}</p>
  {:else if instance.status !== 'project'}
    <p class="muted">key not retrieved</p>
  {/if}

  <!--
    No reason line. The status pill already names what went wrong, and repeating
    it underneath in other words ("no claim on key" / "key claims no deployment")
    added noise rather than information. The competing deployment stays, because
    which one a key claims is not something the pill can say.
  -->
  {#if instance.status === 'mismatch' && instance.claimedInstance}
    <p class="muted">
      key claims <span class="code inline">{instance.claimedInstance}</span>
    </p>
  {/if}
</article>

<style>
  h3 {
    margin: 0 0 10px;
    font-size: 16px;
    overflow-wrap: anywhere;
  }

  p {
    margin: 10px 0 0;
  }

  .muted {
    color: var(--muted);
    font-size: 13px;
  }

  .inline {
    display: inline-block;
    padding: 2px 6px;
  }
</style>
