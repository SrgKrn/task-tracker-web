import { describe, expect, it } from 'vitest'
import { clampListWidth } from './paneWidth'

describe('clampListWidth', () => {
  it('держит ширину в пределах', () => {
    expect(clampListWidth(100)).toBe(320)
    expect(clampListWidth(5000)).toBe(720)
    expect(clampListWidth(455.6)).toBe(456)
  })
})
