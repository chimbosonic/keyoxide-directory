import keysFile from '../data/keys.json'
import { ENTRIES_OVERRIDE, loadEntries } from './entries'

describe('loadEntries', () => {
  it('returns the compiled-in entries by default', () => {
    expect(loadEntries({})).toEqual(keysFile.keys)
  })

  it('prefers an override when one is present', () => {
    const entries = [{ fingerprint: '3AA5C34371567BD2', instance: 'https://kx.example.org' }]
    expect(loadEntries({ [ENTRIES_OVERRIDE]: entries })).toEqual(entries)
  })

  it('ignores a non-array override', () => {
    expect(loadEntries({ [ENTRIES_OVERRIDE]: 'nonsense' })).toEqual(keysFile.keys)
  })
})
