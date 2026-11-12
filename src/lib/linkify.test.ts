import { describe, expect, it } from 'vitest'
import { linkifyParts, shortUrl } from './linkify'

describe('ссылки в тексте', () => {
  it('режет текст на куски, точка после адреса — не часть ссылки', () => {
    expect(linkifyParts('Макеты: https://figma.com/x. Вопросы — в чат')).toEqual([
      { kind: 'text', text: 'Макеты: ' },
      { kind: 'link', text: 'https://figma.com/x', href: 'https://figma.com/x' },
      { kind: 'text', text: '. Вопросы — в чат' },
    ])
  })
  it('www без протокола получает https', () => {
    expect(linkifyParts('www.sanq.by')).toEqual([{ kind: 'link', text: 'www.sanq.by', href: 'https://www.sanq.by' }])
  })
  it('скобки: внешняя — текст, внутренняя (вики) — часть адреса', () => {
    expect(linkifyParts('(см. https://a.by/x)')[1]).toMatchObject({ text: 'https://a.by/x' })
    expect(linkifyParts('https://ru.wikipedia.org/wiki/Код_(значения)')[0]).toMatchObject({
      text: 'https://ru.wikipedia.org/wiki/Код_(значения)',
    })
  })
  it('текст без ссылок — один кусок; почта ссылкой не становится', () => {
    expect(linkifyParts('пишите на a@b.by')).toEqual([{ kind: 'text', text: 'пишите на a@b.by' }])
  })
  it('короткая подпись: без протокола и www, длинное — многоточием посередине', () => {
    expect(shortUrl('https://www.sanq.by/')).toBe('sanq.by')
    const s = shortUrl('https://www.figma.com/design/AbCdEfGhJkLmNoPqRsTuVw/sprint-9-final-version-copy')
    expect(s.length).toBe(42)
    expect(s.startsWith('figma.com/design/')).toBe(true)
    expect(s.endsWith('version-copy')).toBe(true)
  })
})
