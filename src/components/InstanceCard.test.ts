import { render, screen } from '@testing-library/svelte'
import InstanceCard from './InstanceCard.svelte'
import type { DirectoryCard, ResolvedInstance, ResolvedStatus } from '../lib/resolve'

const FPR = 'A78357EB843206292AD791A33D150A4804FDAB79'

const resolved = (overrides: Partial<ResolvedInstance> = {}): ResolvedInstance => ({
  entry: { type: 'hkp' as const, fingerprint: FPR, instance: 'https://kx.example.org' },
  declaredInstance: 'https://kx.example.org',
  claimedInstance: 'https://kx.example.org',
  fingerprint: FPR,
  status: 'verified',
  ...overrides,
})

describe('InstanceCard, pinned project instance', () => {
  const project: DirectoryCard = {
    declaredInstance: 'https://keyoxide.org',
    claimedInstance: null,
    fingerprint: null,
    status: 'project',
  }

  it('links to the instance and labels it as the project instance', () => {
    render(InstanceCard, { instance: project })

    expect(screen.getByRole('link', { name: 'keyoxide.org' })).toHaveAttribute(
      'href',
      'https://keyoxide.org',
    )
    expect(screen.getByTestId('verification')).toHaveTextContent('project instance')
  })

  it('does not claim a key is missing, having never looked for one', () => {
    render(InstanceCard, { instance: project })

    expect(screen.queryByTestId('key-id')).toBeNull()
    expect(document.body.textContent).not.toContain('key not retrieved')
  })

  it('marks itself neither verified nor failing', () => {
    const { container } = render(InstanceCard, { instance: project })

    const dot = container.querySelector('[data-testid="verification"] .dot')
    expect(dot).not.toHaveClass('ok')
    expect(dot).not.toHaveClass('warn')
  })

  it('still shows liveness, because a pinned deployment can be down', () => {
    render(InstanceCard, { instance: project, liveness: 'unreachable' })

    expect(screen.getByTestId('liveness')).toHaveTextContent('unreachable')
  })
})

describe('InstanceCard', () => {
  it('shows the deployment host as a link to the deployment', () => {
    render(InstanceCard, { instance: resolved() })

    const link = screen.getByRole('link', { name: 'kx.example.org' })
    expect(link).toHaveAttribute('href', 'https://kx.example.org')
  })

  it('shows the short key id rather than the full fingerprint', () => {
    render(InstanceCard, { instance: resolved() })

    expect(screen.getByTestId('key-id')).toHaveTextContent('0x3D15 0A48 04FD AB79')
    expect(document.body.textContent).not.toContain(FPR)
  })

  it('marks a verified instance with the ok dot', () => {
    const { container } = render(InstanceCard, { instance: resolved() })

    expect(screen.getByTestId('verification')).toHaveTextContent('verified')
    expect(container.querySelector('.dot.ok')).not.toBeNull()
    expect(container.querySelector('.dot.warn')).toBeNull()
  })

  const failures: Array<[ResolvedStatus, string]> = [
    ['mismatch', 'claims another deployment'],
    ['no-notation', 'no claim on key'],
    ['not-found', 'key not found'],
    ['unreadable', 'key unreadable'],
    ['fetch-error', 'lookup failed'],
  ]

  it.each(failures)('marks %s with the warn dot and its label', (status, label) => {
    const { container } = render(InstanceCard, {
      instance: resolved({ status, claimedInstance: null }),
    })

    expect(screen.getByTestId('verification')).toHaveTextContent(label)
    expect(container.querySelector('.dot.warn')).not.toBeNull()
    expect(container.querySelector('.dot.ok')).toBeNull()
  })

  it('shows the competing deployment on a mismatch', () => {
    render(InstanceCard, {
      instance: resolved({
        status: 'mismatch',
        claimedInstance: 'https://elsewhere.example.org',
        reason: 'key claims a different deployment',
      }),
    })

    expect(screen.getByText(/elsewhere.example.org/)).toBeInTheDocument()
  })

  it('explains when the key was never retrieved', () => {
    render(InstanceCard, {
      instance: resolved({ status: 'not-found', fingerprint: null, claimedInstance: null }),
    })

    expect(screen.queryByTestId('key-id')).toBeNull()
    expect(screen.getByText('key not retrieved')).toBeInTheDocument()
  })

  it('does not restate the failure underneath the pill', () => {
    render(InstanceCard, {
      instance: resolved({
        status: 'fetch-error',
        fingerprint: null,
        claimedInstance: null,
        reason: 'Failed to fetch',
      }),
    })

    // The reason is still carried on the resolved entry, for tests and the live
    // check; the card simply does not render it.
    expect(screen.queryByText('Failed to fetch')).toBeNull()
    expect(screen.getByTestId('verification')).toHaveTextContent('lookup failed')
  })

  it('does not restate a no-notation key underneath the pill', () => {
    render(InstanceCard, {
      instance: resolved({
        status: 'no-notation',
        claimedInstance: null,
        reason: 'key claims no deployment',
      }),
    })

    expect(screen.queryByText('key claims no deployment')).toBeNull()
    expect(screen.getByTestId('verification')).toHaveTextContent('no claim on key')
  })

  it('shows no liveness pill until a probe has answered', () => {
    render(InstanceCard, { instance: resolved() })
    expect(screen.queryByTestId('liveness')).toBeNull()
  })

  it('shows an online deployment with the ok dot', () => {
    const { container } = render(InstanceCard, { instance: resolved(), liveness: 'online' })

    const pill = screen.getByTestId('liveness')
    expect(pill).toHaveTextContent('online')
    expect(container.querySelector('[data-testid="liveness"] .dot.ok')).not.toBeNull()
  })

  it('shows an unreachable deployment with the warn dot', () => {
    const { container } = render(InstanceCard, { instance: resolved(), liveness: 'unreachable' })

    expect(screen.getByTestId('liveness')).toHaveTextContent('unreachable')
    expect(container.querySelector('[data-testid="liveness"] .dot.warn')).not.toBeNull()
  })

  it('shows an unknown probe as neither ok nor warn, so a CORS-restricted deployment is not called down', () => {
    const { container } = render(InstanceCard, { instance: resolved(), liveness: 'unknown' })

    expect(screen.getByTestId('liveness')).toHaveTextContent('no answer yet')
    expect(container.querySelector('[data-testid="liveness"] .dot.ok')).toBeNull()
    expect(container.querySelector('[data-testid="liveness"] .dot.warn')).toBeNull()
  })

  it('keeps verification and liveness as separate pills', () => {
    render(InstanceCard, { instance: resolved({ status: 'no-notation' }), liveness: 'online' })

    expect(screen.getByTestId('verification')).toHaveTextContent('no claim on key')
    expect(screen.getByTestId('liveness')).toHaveTextContent('online')
  })
})
