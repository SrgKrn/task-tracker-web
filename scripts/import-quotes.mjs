// Импорт цитат в таблицу quotes из CSV с колонками text;author;source;tags;verified.
// Теги — через запятую (см. TAGS в supabase/functions/telegram/insight.ts), verified — true/false/1/0/да/нет.
// Поле с «;» или переводом строки берётся в двойные кавычки, кавычка внутри — удвоенная ("").
// Первая строка — заголовок. Повторный импорт не задваивает: совпадение текста и автора
// обновляет источник, теги и verified.
//
//   SUPABASE_URL=https://….supabase.co SUPABASE_SERVICE_ROLE_KEY=… node scripts/import-quotes.mjs quotes/*.csv
//   node scripts/import-quotes.mjs --check quotes/*.csv   — только проверить файлы, ничего не загружая
import { readFileSync } from 'node:fs'

const TAGS = new Set([
  'rhythm', 'clients', 'general',
  'peak_hours', 'best_weekday', 'streak', 'long_focus', 'day_record', 'hours_milestone',
  'client_share', 'sprint_on_track', 'sprint_burn', 'sprint_closed', 'client_hours', 'client_return',
])

/** разбор CSV с разделителем «;» и кавычками */
function parseCsv(text) {
  const rows = []
  let row = []
  let field = ''
  let quoted = false
  const src = text.replace(/^﻿/, '')
  for (let i = 0; i < src.length; i++) {
    const ch = src[i]
    if (quoted) {
      if (ch === '"' && src[i + 1] === '"') {
        field += '"'
        i++
      } else if (ch === '"') quoted = false
      else field += ch
    } else if (ch === '"' && field === '') quoted = true
    else if (ch === ';') {
      row.push(field)
      field = ''
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++
      row.push(field)
      if (row.some((f) => f.trim() !== '')) rows.push(row)
      row = []
      field = ''
    } else field += ch
  }
  row.push(field)
  if (row.some((f) => f.trim() !== '')) rows.push(row)
  return rows
}

const truthy = (v) => /^(true|1|да|yes)$/i.test(v.trim())

function readQuotes(path) {
  const [header, ...rows] = parseCsv(readFileSync(path, 'utf8'))
  const cols = header.map((h) => h.trim().toLowerCase())
  for (const need of ['text', 'author', 'source', 'tags', 'verified']) {
    if (!cols.includes(need)) throw new Error(`${path}: нет колонки ${need}`)
  }
  const at = (r, name) => (r[cols.indexOf(name)] ?? '').trim()
  const errors = []
  const quotes = rows.map((r, i) => {
    const line = i + 2
    const tags = at(r, 'tags').split(',').map((t) => t.trim()).filter(Boolean)
    const bad = tags.filter((t) => !TAGS.has(t))
    if (!at(r, 'text')) errors.push(`${path}:${line}: пустой текст`)
    if (!at(r, 'author')) errors.push(`${path}:${line}: нет автора`)
    if (!tags.length) errors.push(`${path}:${line}: нет тегов`)
    if (bad.length) errors.push(`${path}:${line}: неизвестные теги ${bad.join(', ')}`)
    return {
      text: at(r, 'text'),
      author: at(r, 'author'),
      source: at(r, 'source') || null,
      tags,
      verified: truthy(at(r, 'verified')),
    }
  })
  return { quotes, errors }
}

async function main() {
  const args = process.argv.slice(2)
  const check = args.includes('--check')
  const files = args.filter((a) => a !== '--check')
  if (!files.length) {
    console.error('Укажите CSV-файлы: node scripts/import-quotes.mjs quotes/*.csv')
    process.exit(1)
  }
  const all = []
  const errors = []
  for (const f of files) {
    const r = readQuotes(f)
    all.push(...r.quotes)
    errors.push(...r.errors)
  }
  // дубли внутри файлов: база всё равно оставит одну, но лучше знать
  const seen = new Map()
  for (const q of all) {
    const key = `${q.text}\u0000${q.author}`
    if (seen.has(key)) errors.push(`дубль: «${q.text.slice(0, 50)}» — ${q.author}`)
    seen.set(key, q)
  }
  if (errors.length) {
    console.error(errors.join('\n'))
    process.exit(1)
  }
  const byTag = {}
  for (const q of all) for (const t of q.tags) byTag[t] = (byTag[t] ?? 0) + 1
  console.log(`цитат: ${all.length}, проверено авторство: ${all.filter((q) => q.verified).length}`)
  console.log(Object.entries(byTag).sort().map(([t, n]) => `  ${t}: ${n}`).join('\n'))
  if (check) return

  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    console.error('Нужны SUPABASE_URL и SUPABASE_SERVICE_ROLE_KEY (сервисный ключ: писать в quotes может только он)')
    process.exit(1)
  }
  const unique = [...seen.values()]
  for (let i = 0; i < unique.length; i += 200) {
    const r = await fetch(`${url}/rest/v1/quotes?on_conflict=text,author`, {
      method: 'POST',
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
        Prefer: 'resolution=merge-duplicates,return=minimal',
      },
      body: JSON.stringify(unique.slice(i, i + 200)),
    })
    if (!r.ok) {
      console.error(`ошибка загрузки: ${r.status} ${await r.text()}`)
      process.exit(1)
    }
  }
  console.log(`загружено: ${unique.length}`)
}

await main()
