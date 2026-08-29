import { render, screen, waitFor } from '@testing-library/svelte'
import App from '../../src/App.svelte'
import type { ResolvedInstance } from '../../src/lib/resolve'
import type { KeyEntry } from '../../src/lib/validateKeys'

const FPR = 'A78357EB843206292AD791A33D150A4804FDAB79'

const entry = (instance: string): KeyEntry => ({ fingerprint: FPR, instance })

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

  it('shows the empty state when nothing is listed', async () => {
    render(App, { entries: [], resolver: async () => [] })

    await waitFor(() => expect(screen.getByTestId('empty')).toBeInTheDocument())
    expect(screen.queryByTestId('instances')).toBeNull()
  })

  it('renders a card per resolved entry', async () => {
    const entries = [entry('https://one.example.org'), entry('https://two.example.org')]
    const resolver = async () => [
      resolved('https://one.example.org'),
      resolved('https://two.example.org', 'no-notation'),
    ]

    render(App, { entries, resolver })

    await waitFor(() => expect(screen.getByTestId('instances')).toBeInTheDocument())
    expect(screen.getAllByRole('article')).toHaveLength(2)
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
})
