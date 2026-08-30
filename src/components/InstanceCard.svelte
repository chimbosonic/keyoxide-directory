<script lang="ts">
  import { deploymentHost, instanceHost, shortKeyId } from '../lib/format'
  import type { Liveness } from '../lib/probe'
  import type { CardStatus, DirectoryCard } from '../lib/resolve'

  const {
    instance,
    liveness = null,
  }: { instance: DirectoryCard; liveness?: Liveness | null } = $props()

  const LABELS: Record<CardStatus, string> = {
    project: 'project instance',
    verified: 'verified',
    unconfirmed: 'domain name does not confirm key',
    contested: 'domain name links another key',
    'dns-error': 'domain name lookup failed',
    mismatch: 'key proves another domain',
    'no-notation': 'no domain proof on key',
    'not-found': 'key not found',
    unreadable: 'key unreadable',
    'fetch-error': 'key lookup failed',
  }

  const LIVENESS_LABELS: Record<Liveness, string> = {
    online: 'online',
    unreachable: 'unreachable',
    unknown: 'no answer yet',
  }

  const keyId = $derived(shortKeyId(instance.fingerprint))

  /**
   * A proof on a parent domain confirms a deployment on a subdomain, because
   * publishing the record takes control of the zone the subdomain sits in. That
   * is not the same as controlling the subdomain — a delegated one has its own
   * operator — so the card names the domain the confirmation actually came from
   * rather than presenting it as the deployment's own.
   */
  const via = $derived(
    instance.status === 'verified' &&
      instance.confirmedVia !== null &&
      instance.confirmedVia !== deploymentHost(instance.declaredInstance)
      ? instance.confirmedVia
      : null,
  )
  const label = $derived(via === null ? LABELS[instance.status] : `verified via ${via}`)
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
    it underneath in other words ("no domain proof on key" / "key proves no
    domain over dns") added noise rather than information. The domains the key
    does prove stay, because the pill cannot name them.
  -->
  {#if instance.status === 'mismatch' && instance.provenDomains.length > 0}
    <p class="muted">
      key proves <span class="code inline">{instance.provenDomains.join(', ')}</span>
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
