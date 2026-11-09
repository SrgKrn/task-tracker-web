import { describe, expect, it } from 'vitest'
import { namePastedFiles, pastedName } from './pastedFiles'

const at = new Date(2026, 10, 9, 14, 5, 7)

describe('pastedName', () => {
  it('безымянный снимок получает имя по времени', () => {
    expect(pastedName('image.png', 'image/png', at)).toBe('Снимок 2026-11-09 14-05-07.png')
    expect(pastedName('', 'image/jpeg', at)).toBe('Снимок 2026-11-09 14-05-07.jpg')
  })
  it('настоящее имя файла не трогаем', () => {
    expect(pastedName('Договор.pdf', 'application/pdf', at)).toBe('Договор.pdf')
    expect(pastedName('image-final.png', 'image/png', at)).toBe('image-final.png')
  })
})

describe('namePastedFiles', () => {
  it('переименовывает только снимки', () => {
    const [shot, doc] = namePastedFiles([new File(['a'], 'image.png', { type: 'image/png' }), new File(['b'], 'ТЗ.docx')], at)
    expect(shot.name).toBe('Снимок 2026-11-09 14-05-07.png')
    expect(shot.type).toBe('image/png')
    expect(doc.name).toBe('ТЗ.docx')
  })
})
