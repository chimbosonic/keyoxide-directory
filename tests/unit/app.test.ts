import { render, screen } from '@testing-library/svelte'
import App from '../../src/App.svelte'

describe('App', () => {
  it('renders the directory heading', () => {
    render(App)
    expect(
      screen.getByRole('heading', { level: 1, name: /keyoxide instance directory/i }),
    ).toBeInTheDocument()
  })

  it('renders an instances section', () => {
    render(App)
    expect(screen.getByRole('heading', { level: 2, name: /instances/i })).toBeInTheDocument()
  })
})
