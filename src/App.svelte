<script lang="ts">
  import InstanceCard from './components/InstanceCard.svelte'
  import { loadEntries } from './lib/entries'
  import { probeAll, type Liveness } from './lib/probe'
  import { PROJECT_INSTANCE, projectCard } from './lib/project'
  import type { DirectoryCard, ResolvedInstance } from './lib/resolve'
  import type { KeyEntry } from './lib/validateKeys'

  export type Resolver = (entries: readonly KeyEntry[]) => Promise<ResolvedInstance[]>
  export type Prober = (urls: readonly string[]) => Promise<Record<string, Liveness>>

  /**
   * OpenPGP.js is ~385 kB and is only needed once entries are being checked, so
   * it is imported on demand rather than in the initial chunk. Injecting the
   * resolver also lets component tests render every status without pulling the
   * library into jsdom, where it cannot load at all.
   */
  const defaultResolver: Resolver = async (entries) =>
    (await import('./lib/resolve')).resolveAll(entries)

  const {
    entries = loadEntries(),
    resolver = defaultResolver,
    prober = (urls: readonly string[]) => probeAll(urls),
  }: { entries?: KeyEntry[]; resolver?: Resolver; prober?: Prober } = $props()

  let instances = $state<ResolvedInstance[] | null>(null)
  let liveness = $state<Record<string, Liveness>>({})

  $effect(() => {
    let cancelled = false

    resolver(entries).then((resolved) => {
      if (cancelled) return
      instances = resolved

      // Liveness runs after verification and never blocks it: a deployment being
      // slow to answer should not hold up rendering what its key says. The pinned
      // instance is probed like any other: it has no key, but it can still be down.
      prober([PROJECT_INSTANCE, ...resolved.map((instance) => instance.declaredInstance)]).then((probed) => {
        if (!cancelled) liveness = probed
      })
    })

    return () => {
      cancelled = true
    }
  })

  // Counted over listed entries only. The pinned instance verifies nothing, so
  // including it would only make the denominator lie.
  const verified = $derived(
    instances?.filter((instance) => instance.status === 'verified').length ?? 0,
  )

  const cards = $derived<DirectoryCard[]>(instances === null ? [] : [projectCard, ...instances])
</script>

<div class="wrap">
  <header>
    <div>
      <h1>Keyoxide Instance Directory</h1>
      <p class="subtitle">
        Deployments claimed by their operators, verified in your browser against published
        OpenPGP keys.
      </p>
    </div>
    {#if instances}
      <span class="pill" data-testid="summary">
        {verified} of {instances.length} verified
      </span>
    {/if}
  </header>

  <section>
    <h2 class="section-title">Instances</h2>

    {#if instances === null}
      <p class="panel" data-testid="loading">Fetching keys…</p>
    {:else}
      <!-- Never empty: the pinned project instance leads the grid. -->
      <div class="grid" data-testid="instances">
        {#each cards as instance (instance.declaredInstance)}
          <InstanceCard {instance} liveness={liveness[instance.declaredInstance] ?? null} />
        {/each}
      </div>

      {#if instances.length === 0}
        <p class="panel spaced" data-testid="empty">
          No instances listed yet. Add yours by opening a pull request against
          <span class="code inline">src/data/keys.json</span>.
        </p>
      {/if}
    {/if}
  </section>

  <footer>
    Keys are fetched by your browser, from
    <a href="https://keys.openpgp.org">keys.openpgp.org</a> or the operator's own Web Key
    Directory. Operator addresses are never stored or shown.
  </footer>
</div>

<style>
  .inline {
    display: inline-block;
    padding: 2px 6px;
  }

  .spaced {
    margin-top: 16px;
  }
</style>
