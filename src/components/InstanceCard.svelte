<script lang="ts">
  import { instanceHost, shortKeyId } from '../lib/format'
  import type { ResolvedInstance } from '../lib/resolve'

  const { instance }: { instance: ResolvedInstance } = $props()

  const LABELS: Record<ResolvedInstance['status'], string> = {
    verified: 'verified',
    mismatch: 'claims another deployment',
    'no-notation': 'no claim on key',
    'not-found': 'key not found',
    unreadable: 'key unreadable',
    'fetch-error': 'lookup failed',
  }

  const keyId = $derived(shortKeyId(instance.fingerprint))
  const label = $derived(LABELS[instance.status])
  const ok = $derived(instance.status === 'verified')
</script>

<article class="panel" data-status={instance.status}>
  <h3>
    <a href={instance.declaredInstance} rel="noopener noreferrer">
      {instanceHost(instance.declaredInstance)}
    </a>
  </h3>

  <p class="pill" data-testid="verification">
    <span class="dot" class:ok class:warn={!ok}></span>
    {label}
  </p>

  {#if keyId}
    <p class="code" data-testid="key-id">{keyId}</p>
  {:else}
    <p class="muted">key not retrieved</p>
  {/if}

  {#if instance.status === 'mismatch' && instance.claimedInstance}
    <p class="muted">
      key claims <span class="code inline">{instance.claimedInstance}</span>
    </p>
  {:else if instance.reason}
    <p class="muted">{instance.reason}</p>
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
