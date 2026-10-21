// Проверка, что вёрстка идёт по дизайн-системе (src/design-system). Запускается в npm run lint.
//
// Запрещено:
//  - старые имена, убранные в 0.27: var(--s-*), классы slate/brass/terra/sage-N;
//  - стандартные цвета Tailwind (white, red-500, gray-400…): пакет их стирает
//    (--color-*: initial), и такой класс молча ничего не красит — цвет только из токенов;
//  - радиусы и кегли в квадратных скобках: rounded-[14px], text-[13px] — только ступени
//    системы (rounded-xs…lg, text-xs…2xl). Радиусы до 2 px — часть рисунка значков, их можно;
//  - hex и rgb() в компонентах: цвета только через токены (var(--…) или классы).
// Произвольные отступы и размеры вида px-[13px] пока остаются, но их число не должно расти:
// SPACING_BASELINE — текущее количество, его можно только уменьшать.
//
// Запуск: node scripts/check-tokens.mjs
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const SPACING_BASELINE = 88

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'src')

const RULES = [
  {
    re: /var\(--s-[a-z0-9-]+\)/g,
    why: 'старый токен --s-*: возьмите токен дизайн-системы (src/design-system/DESIGN.md)',
  },
  {
    re: /(?<=[\s"'`:{-])(?:slate|brass|terra|sage)-\d+(?![\w-])/g,
    why: 'старая шкала slate/brass/terra/sage: используйте bg-surface, text-text-secondary, text-accent…',
    tsxOnly: true,
  },
  {
    re: /(?<=[\s"'`:{])[a-z:]*(?:bg|text|border|ring|fill|stroke|from|to|via|outline|decoration|accent|caret|divide)-(?:white|black|(?:red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|gray|zinc|neutral|stone)-\d+)(?![\w-])/g,
    why: 'стандартного цвета Tailwind нет — пакет стирает палитру; возьмите токен (text-text-inverse, bg-danger…)',
    tsxOnly: true,
  },
  {
    re: /rounded(?:-[a-z]+)?-\[(?!(?:[0-1](?:\.\d+)?|2)px\])[^\]]+\]/g,
    why: 'произвольный радиус: только rounded-xs / sm / md / lg / full',
    tsxOnly: true,
  },
  {
    re: /(?<=[\s"'`:{])text-\[\d+(?:\.\d+)?px\]/g,
    why: 'произвольный кегль: только text-xs … text-2xl (шкала пакета)',
    tsxOnly: true,
  },
  {
    re: /(?<![\w&])#[0-9a-fA-F]{3,8}\b|rgba?\(/g,
    why: 'цвет литералом: только токены — var(--…) или классы',
    tsxOnly: true,
  },
]

const SPACING_RE =
  /(?<=[\s"'`:{])-?(?:p|px|py|pt|pb|pl|pr|m|mx|my|mt|mb|ml|mr|gap|gap-x|gap-y|h|w|min-h|min-w|max-w|max-h|top|bottom|left|right|inset)-\[\d+(?:\.\d+)?px\]/g

const files = []
;(function walk(dir) {
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name)
    if (fs.statSync(p).isDirectory()) {
      if (name !== 'design-system' && name !== 'assets') walk(p)
    } else if (/\.(tsx|css)$/.test(name)) files.push(p)
  }
})(root)

const problems = []
let spacing = 0
for (const file of files) {
  const rel = path.relative(path.join(root, '..'), file).replace(/\\/g, '/')
  const isTsx = file.endsWith('.tsx')
  const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/)
  lines.forEach((line, i) => {
    // комментарии не проверяем: в них упоминаются старые имена и примеры
    const code = line.replace(/\/\/.*$/, '').replace(/\/\*.*?\*\//g, '').replace(/\{\/\*.*?\*\/\}/g, '')
    if (/^\s*(\*|\/\*)/.test(line)) return
    for (const rule of RULES) {
      if (rule.tsxOnly && !isTsx) continue
      for (const m of code.matchAll(rule.re)) problems.push(`${rel}:${i + 1}  ${m[0]}  — ${rule.why}`)
    }
    if (isTsx) spacing += (code.match(SPACING_RE) ?? []).length
  })
}

let failed = false
if (problems.length) {
  failed = true
  console.error(`check-tokens: найдено ${problems.length}:\n` + problems.map((p) => '  ' + p).join('\n'))
}
if (spacing > SPACING_BASELINE) {
  failed = true
  console.error(
    `check-tokens: произвольных отступов и размеров стало ${spacing} (было ${SPACING_BASELINE}). ` +
      'Возьмите ступень сетки 4 px (p-3, gap-2, h-11…) вместо px-[13px].',
  )
} else if (spacing < SPACING_BASELINE) {
  console.log(`check-tokens: произвольных отступов ${spacing} — меньше базы, понизьте SPACING_BASELINE до ${spacing}.`)
}
if (failed) process.exit(1)
console.log(`check-tokens: ок (${files.length} файлов, произвольных отступов ${spacing} из ${SPACING_BASELINE})`)
