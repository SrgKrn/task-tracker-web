/**
 * Ссылки в свободном тексте (описание задачи, 0.67): режем текст на куски «текст / ссылка».
 * Знаки препинания в конце адреса («…/dogovor.», «(…/x)») к ссылке не относятся.
 */
export type TextPart = { kind: 'text'; text: string } | { kind: 'link'; text: string; href: string }

const URL_RE = /\b(?:https?:\/\/|www\.)[^\s<>«»"]+/gi
const TRAILING = /[.,;:!?…'"»)\]]+$/

export function linkifyParts(text: string): TextPart[] {
  const parts: TextPart[] = []
  let last = 0
  for (const m of text.matchAll(URL_RE)) {
    let url = m[0]
    // закрывающую скобку оставляем, если открывающая — внутри адреса (вики-ссылки)
    const trail = url.match(TRAILING)?.[0] ?? ''
    let cut = trail.length
    if (trail.startsWith(')') && (url.match(/\(/g)?.length ?? 0) > 0) cut = trail.length - 1
    if (cut > 0) url = url.slice(0, url.length - cut)
    const start = m.index ?? 0
    if (start > last) parts.push({ kind: 'text', text: text.slice(last, start) })
    parts.push({ kind: 'link', text: url, href: /^https?:\/\//i.test(url) ? url : `https://${url}` })
    last = start + url.length
  }
  if (last < text.length) parts.push({ kind: 'text', text: text.slice(last) })
  return parts
}

/** Короткая подпись адреса: без протокола и www, длинный хвост — многоточием. */
export function shortUrl(url: string, max = 42): string {
  const bare = url.replace(/^https?:\/\//i, '').replace(/^www\./i, '').replace(/\/$/, '')
  if (bare.length <= max) return bare
  // начало (сайт и раздел) и конец (обычно имя страницы), между ними — многоточие
  const head = Math.ceil((max - 1) * 0.6)
  const tail = max - 1 - head
  return `${bare.slice(0, head)}…${bare.slice(bare.length - tail)}`
}
