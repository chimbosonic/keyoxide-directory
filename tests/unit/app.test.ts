import { render, screen, waitFor, within } from '@testing-library/svelte'
import App from '../../src/App.svelte'
import { PROJECT_INSTANCE } from '../../src/lib/project'
import { ADD_INSTANCE_URL, KEYS_FILE_URL } from '../../src/lib/repository'
import type { ResolvedInstance } from '../../src/lib/resolve'
import type { KeyEntry } from '../../src/lib/validateKeys'

const FPR = 'A78357EB843206292AD791A33D150A4804FDAB79'

const entry = (instance: string): KeyEntry => ({ type: 'hkp', fingerprint: FPR, instance })

const resolved = (
  instance: string,
  status: ResolvedInstance['status'] = 'verified',
): ResolvedInstance => ({
  entry: entry(instance),
  declaredInstance: instance,
  claimedInstance: status === 'verified' ? instance : null,
  fingerprint: status === 'not-found' ? null : FPR,
  status,
})

describe('App', () => {
  it('renders the directory heading', () => {
    render(App, { entries: [], resolver: async () => [] })

    expect(
      screen.getByRole('heading', { level: 1, name: /keyoxide instance directory/i }),
    ).toBeInTheDocument()
  })

  it('shows the empty state when nothing is listed, alongside the pinned card', async () => {
    render(App, { entries: [], resolver: async () => [] })

    await waitFor(() => expect(screen.getByTestId('empty')).toBeInTheDocument())
    expect(screen.getAllByRole('article')).toHaveLength(1)
    expect(screen.getByRole('link', { name: 'keyoxide.org' })).toBeInTheDocument()
  })

  it('always offers a route to adding an instance, not only when the list is empty', async () => {
    const resolver = async () => [resolved('https://one.example.org')]

    render(App, { entries: [], resolver })

    await waitFor(() => expect(screen.queryByTestId('empty')).toBeNull())

    const cta = screen.getByTestId('add-instance')
    expect(cta).toHaveTextContent(/add it to the directory/i)
    expect(within(cta).getByRole('link', { name: /add it to the directory/i })).toHaveAttribute(
      'href',
      ADD_INSTANCE_URL,
    )
    expect(within(cta).getByRole('link', { name: 'src/data/keys.json' })).toHaveAttribute(
      'href',
      KEYS_FILE_URL,
    )
  })

  it('links the empty state to the same instructions', async () => {
    render(App, { entries: [], resolver: async () => [] })

    const empty = await screen.findByTestId('empty')
    expect(within(empty).getByRole('link', { name: 'opening a pull request' })).toHaveAttribute(
      'href',
      ADD_INSTANCE_URL,
    )
  })

  it('renders a card per resolved entry, after the pinned one', async () => {
    const entries = [entry('https://one.example.org'), entry('https://two.example.org')]
    const resolver = async () => [
      resolved('https://one.example.org'),
      resolved('https://two.example.org', 'no-notation'),
    ]

    render(App, { entries, resolver })

    await waitFor(() => expect(screen.getByTestId('instances')).toBeInTheDocument())

    const cards = screen.getAllByRole('article')
    expect(cards).toHaveLength(3)
    expect(cards[0]).toHaveTextContent('keyoxide.org')
    expect(cards[0]).toHaveTextContent('project instance')
    expect(screen.queryByTestId('empty')).toBeNull()
  })

  it('pins keyoxide.org without counting it as verified', async () => {
    const resolver = async () => [resolved('https://one.example.org')]

    render(App, { entries: [], resolver })

    await waitFor(() => expect(screen.getByTestId('summary')).toHaveTextContent('1 of 1 verified'))
  })

  it('summarises how many entries verified', async () => {
    const resolver = async () => [
      resolved('https://one.example.org'),
      resolved('https://two.example.org', 'mismatch'),
      resolved('https://three.example.org', 'not-found'),
    ]

    render(App, { entries: [], resolver })

    await waitFor(() => expect(screen.getByTestId('summary')).toHaveTextContent('1 of 3 verified'))
  })

  it('passes the entries it was given to the resolver', async () => {
    const entries = [entry('https://one.example.org')]
    const resolver = vi.fn(async () => [])

    render(App, { entries, resolver })

    await waitFor(() => expect(resolver).toHaveBeenCalledWith(entries))
  })

  it('probes the deployments it resolved, and the pinned one', async () => {
    const resolver = async () => [resolved('https://one.example.org')]
    const prober = vi.fn(async () => ({}))

    render(App, { entries: [], resolver, prober })

    await waitFor(() =>
      expect(prober).toHaveBeenCalledWith([PROJECT_INSTANCE, 'https://one.example.org']),
    )
  })

  it('renders liveness once the probe answers', async () => {
    const resolver = async () => [resolved('https://one.example.org')]
    const prober = async () => ({ 'https://one.example.org': 'online' as const })

    render(App, { entries: [], resolver, prober })

    await waitFor(() => expect(screen.getByTestId('liveness')).toHaveTextContent('online'))
  })

  it('renders cards before the probe answers', async () => {
    const resolver = async () => [resolved('https://one.example.org')]
    const prober = () => new Promise<Record<string, never>>(() => {})

    render(App, { entries: [], resolver, prober })

    await waitFor(() => expect(screen.getAllByRole('article')).toHaveLength(2))
    expect(screen.queryByTestId('liveness')).toBeNull()
  })
})
