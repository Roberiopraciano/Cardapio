import { describe, it, expect } from 'vitest'
import { whereConsumeForMode } from '../lib/whereConsume'

describe('whereConsumeForMode', () => {
  it('mesa só serve no local, mesmo que o cadastro permita levar', () => {
    expect(whereConsumeForMode('mesa', { allowedWhereConsume: ['OnLocal', 'OutsideLocal'] })).toEqual(['OnLocal'])
  })

  it('balcão e delivery seguem o cadastro', () => {
    const cfg = { allowedWhereConsume: ['OnLocal', 'OutsideLocal'] }
    expect(whereConsumeForMode('balcao', cfg)).toEqual(['OnLocal', 'OutsideLocal'])
    expect(whereConsumeForMode('delivery', cfg)).toEqual(['OnLocal', 'OutsideLocal'])
    expect(whereConsumeForMode('balcao', { allowedWhereConsume: ['OutsideLocal'] })).toEqual(['OutsideLocal'])
  })
})
