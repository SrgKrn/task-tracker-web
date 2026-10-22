import { describe, expect, it } from 'vitest'
import { fitBox } from './logo'

describe('логотип в рамку', () => {
  it('широкий упирается в ширину', () => {
    expect(fitBox(1200, 300, 600, 200)).toEqual({ w: 600, h: 150 })
  })
  it('высокий упирается в высоту', () => {
    expect(fitBox(400, 400, 600, 200)).toEqual({ w: 200, h: 200 })
  })
  it('маленький не увеличивается', () => {
    expect(fitBox(120, 40, 600, 200)).toEqual({ w: 120, h: 40 })
  })
  it('пустая картинка — ноль', () => {
    expect(fitBox(0, 10, 600, 200)).toEqual({ w: 0, h: 0 })
  })
})
