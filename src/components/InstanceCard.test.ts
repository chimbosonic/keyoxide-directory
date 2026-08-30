import { render, screen } from '@testing-library/svelte'
import InstanceCard from './InstanceCard.svelte'
import type { DirectoryCard, ResolvedInstance, ResolvedStatus } from '../lib/resolve'

const FPR = 'A78357EB843206292AD791A33D150A4804FDAB79'

const resolved = (overrides: Partial<ResolvedInstance> = {}): ResolvedInstance => ({
  entry: { type: 'hkp' as const, fingerprint: FPR, instance: 'https://kx.example.org' },
  declaredInstance: 'https://kx.example.org',
  provenDomains: ['kx.example.org'],
  confirmedVia: 'kx.example.org',
  fingerprint: FPR,
  status: 'verified',
  ...overrides,
})

describe('InstanceCard, pinned project instance', () => {
  const project: DirectoryCard = {
    declaredInstance: 'https://keyoxide.org',
    provenDomains: [],
    confirmedVia: null,
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
    ['mismatch', 'key proves another domain'],
    ['no-notation', 'no domain proof on key'],
    ['not-found', 'key not found'],
    ['unreadable', 'key unreadable'],
    ['fetch-error', 'key lookup failed'],
  ]

  it.each(failures)('marks %s with the warn dot and its label', (status, label) => {
    const { container } = render(InstanceCard, {
      instance: resolved({ status, provenDomains: [], confirmedVia: null }),
    })

    expect(screen.getByTestId('verification')).toHaveTextContent(label)
    expect(container.querySelector('.dot.warn')).not.toBeNull()
    expect(container.querySelector('.dot.ok')).toBeNull()
  })

  it('shows the domains the key proves instead, on a mismatch', () => {
    render(InstanceCard, {
      instance: resolved({
        status: 'mismatch',
        provenDomains: ['elsewhere.example.org', 'other.example.org'],
        confirmedVia: null,
        reason: 'the key proves no domain covering this deployment',
      }),
    })

    expect(screen.getByText(/elsewhere.example.org, other.example.org/)).toBeInTheDocument()
  })

  /**
   * A proof on a parent confirms the host, but the parent's holder is not
   * always the host's operator, so the card names where the confirmation came
   * from rather than letting it read as the deployment's own.
   */
  it('names the parent domain when the proof came from higher up the zone', () => {
    const { container } = render(InstanceCard, {
      instance: resolved({
        declaredInstance: 'https://kx.example.org',
        provenDomains: ['example.org'],
        confirmedVia: 'example.org',
      }),
    })

    expect(screen.getByTestId('verification')).toHaveTextContent('verified via example.org')
    expect(container.querySelector('.dot.ok')).not.toBeNull()
  })

  it('says plain verified when the deployment’s own host is what was proven', () => {
    render(InstanceCard, { instance: resolved({ confirmedVia: 'kx.example.org' }) })

    expect(screen.getByTestId('verification')).toHaveTextContent('verified')
    expect(screen.getByTestId('verification')).not.toHaveTextContent('via')
  })

  // The host a proof is compared against carries no port, so a deployment on a
  // non-default port must not read as confirmed by somewhere else.
  it('says plain verified for a deployment on a port', () => {
    render(InstanceCard, {
      instance: resolved({
        declaredInstance: 'https://kx.example.org:8443',
        confirmedVia: 'kx.example.org',
      }),
    })

    expect(screen.getByTestId('verification')).not.toHaveTextContent('via')
  })

  it('explains when the key was never retrieved', () => {
    render(InstanceCard, {
      instance: resolved({
        status: 'not-found',
        fingerprint: null,
        provenDomains: [],
        confirmedVia: null,
      }),
    })

    expect(screen.queryByTestId('key-id')).toBeNull()
    expect(screen.getByText('key not retrieved')).toBeInTheDocument()
  })

  it('does not restate the failure underneath the pill', () => {
    render(InstanceCard, {
      instance: resolved({
        status: 'fetch-error',
        fingerprint: null,
        provenDomains: [],
        confirmedVia: null,
        reason: 'Failed to fetch',
      }),
    })

    // The reason is still carried on the resolved entry, for tests and the live
    // check; the card simply does not render it.
    expect(screen.queryByText('Failed to fetch')).toBeNull()
    expect(screen.getByTestId('verification')).toHaveTextContent('lookup failed')
  })

  it.each([
    ['unconfirmed', 'domain name does not confirm key'],
    ['contested', 'domain name links another key'],
    ['dns-error', 'domain name lookup failed'],
  ] as const)('labels the %s state without calling it verified', (status, label) => {
    const { container } = render(InstanceCard, { instance: resolved({ status }) })

    expect(screen.getByTestId('verification')).toHaveTextContent(label)
    expect(container.querySelector('.dot.ok')).toBeNull()
    expect(container.querySelector('.dot.warn')).not.toBeNull()
  })

  it('does not restate a no-notation key underneath the pill', () => {
    render(InstanceCard, {
      instance: resolved({
        status: 'no-notation',
        provenDomains: [],
        confirmedVia: null,
        reason: 'key proves no domain over dns',
      }),
    })

    expect(screen.queryByText('key proves no domain over dns')).toBeNull()
    expect(screen.getByTestId('verification')).toHaveTextContent('no domain proof on key')
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

    expect(screen.getByTestId('verification')).toHaveTextContent('no domain proof on key')
    expect(screen.getByTestId('liveness')).toHaveTextContent('online')
  })
})
