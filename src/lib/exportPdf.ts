import { jsPDF } from 'jspdf'
import {
  ONEST_REGULAR,
  ONEST_SEMIBOLD,
  PLEX_MONO_MEDIUM,
  PLEX_MONO_REGULAR,
} from './pdfFont.generated'
import {
  dayMonth,
  f1,
  fh,
  formatStamp,
  hm,
  pct,
  pctLabel,
  ALL_SECTIONS,
  type JournalEntry,
  type ReportData,
} from './report'
import { layoutTile, PNG_PALETTE, type DayTile } from '../../supabase/functions/telegram/tile.ts'
import type { StageTone } from './stage'

/*
 * Отчёт на бумаге: белый лист, графит и латунь. Латунь — текущий период, серая риска —
 * прошлый, терракота — перерасход и дни в минусе, зелень — закрытое. Числа — Plex Mono,
 * текст — Plex Sans. Всё в пунктах, лист A4 книжный.
 */

const PW = 595.28
const PH = 841.89
const MX = 39
const MT = 30
const CW = PW - MX * 2
/** ниже этой линии — только подвал */
const BOTTOM = PH - 46

/*
 * Палитра отчёта — светлая тема дизайн-системы: тёплые нейтрали, терракотовый акцент,
 * малиновый для переработки, зелёный для готового. Ключи остались прежними (brass, terra),
 * чтобы не трогать вёрстку отчёта: brass — теперь акцент, terra — «сверх плана».
 */
const C = {
  ink: '#1C1B19', // --text
  ink2: '#4A4842',
  muted: '#6B6860', // --text-secondary
  faint: '#9A978E', // --text-tertiary
  rule: '#E6E3DC', // --border
  track: '#F0EEE8', // --surface-sunken
  weekend: '#F7F6F2', // --bg
  brass: '#B4532A', // --accent
  brassInk: '#8A3B19', // --accent-text
  brassSoft: '#E2B5A0', // акцент 40 % на белом
  prev: '#D6D2C8', // --border-strong
  terra: '#C2304F', // --danger
  terraInk: '#8A1F38', // --danger-text
  green: '#2E9B5E', // --success
  greenSoft: '#E5F3EA', // --success-soft
  greenInk: '#1F6B3F', // --success-text
  info: '#4A72C9', // --info
  infoSoft: '#E8EEF8', // --info-soft
  infoInk: '#2A4A85', // --info-text
  white: '#ffffff',
}

type Font = 'sans' | 'mono'
type SwatchKind = 'bar' | 'prev' | 'norm' | 'terra' | 'brassNorm' | 'weekend'
interface LegendItem {
  kind: SwatchKind
  text: string
}
interface TextOpts {
  f?: Font
  b?: boolean
  s?: number
  c?: string
  a?: 'left' | 'right' | 'center'
  /** ширина, в которую строку надо уместить многоточием */
  w?: number
  /** разрядка для надписей капсом; только для выравнивания влево */
  sp?: number
}

class Pdf {
  doc: jsPDF
  y = 0
  /** заголовок, который повторяется на листах-продолжениях */
  private continuation = ''
  private r: ReportData

  constructor(r: ReportData) {
    this.r = r
    this.doc = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' })
    const d = this.doc
    // текст — Onest, как в приложении; числа — IBM Plex Mono
    d.addFileToVFS('Onest-Regular.ttf', ONEST_REGULAR)
    d.addFont('Onest-Regular.ttf', 'sans', 'normal')
    d.addFileToVFS('Onest-SemiBold.ttf', ONEST_SEMIBOLD)
    d.addFont('Onest-SemiBold.ttf', 'sans', 'bold')
    d.addFileToVFS('PlexMono-Regular.ttf', PLEX_MONO_REGULAR)
    d.addFont('PlexMono-Regular.ttf', 'mono', 'normal')
    d.addFileToVFS('PlexMono-Medium.ttf', PLEX_MONO_MEDIUM)
    d.addFont('PlexMono-Medium.ttf', 'mono', 'bold')
    d.setProperties({
      title: `Отчёт: ${r.label}`,
      subject: 'Отчёт по задачам и времени',
      creator: 'Semternity',
    })
  }

  font(o: TextOpts) {
    this.doc.setFont(o.f ?? 'sans', o.b ? 'bold' : 'normal')
    this.doc.setFontSize(o.s ?? 9)
    this.doc.setTextColor(o.c ?? C.ink)
  }

  width(s: string, o: TextOpts): number {
    this.font(o)
    return this.doc.getTextWidth(s)
  }

  clip(s: string, w: number): string {
    if (this.doc.getTextWidth(s) <= w) return s
    let out = s
    while (out.length > 1 && this.doc.getTextWidth(`${out}…`) > w) out = out.slice(0, -1)
    return `${out.trimEnd()}…`
  }

  text(s: string, x: number, y: number, o: TextOpts = {}) {
    this.font(o)
    const str = o.w ? this.clip(s, o.w) : s
    this.doc.text(str, x, y, { align: o.a ?? 'left', charSpace: o.sp })
  }

  /** абзац с переносами; возвращает высоту */
  para(s: string, x: number, y: number, w: number, o: TextOpts = {}, lh = 1.45): number {
    this.font(o)
    const lines = this.doc.splitTextToSize(s, w) as string[]
    const step = (o.s ?? 9) * lh
    lines.forEach((line, i) => this.doc.text(line, x, y + i * step))
    return lines.length * step
  }

  paraHeight(s: string, w: number, o: TextOpts = {}, lh = 1.45): number {
    this.font(o)
    return (this.doc.splitTextToSize(s, w) as string[]).length * (o.s ?? 9) * lh
  }

  rule(y: number, x0 = MX, x1 = PW - MX, color = C.rule) {
    this.doc.setDrawColor(color)
    this.doc.setLineWidth(0.75)
    this.doc.line(x0, y, x1, y)
  }

  line(x0: number, y0: number, x1: number, y1: number, color: string, w = 0.75) {
    this.doc.setDrawColor(color)
    this.doc.setLineWidth(w)
    this.doc.line(x0, y0, x1, y1)
  }

  rect(x: number, y: number, w: number, h: number, color: string) {
    if (w <= 0 || h <= 0) return
    this.doc.setFillColor(color)
    this.doc.rect(x, y, w, h, 'F')
  }

  /** столбец: скруглён только конец данных, у базы угол прямой */
  vbar(x: number, yBase: number, yEnd: number, w: number, color: string, r = 2.5) {
    const h = Math.abs(yEnd - yBase)
    if (h < 0.3) return
    const top = Math.min(yBase, yEnd)
    const rr = Math.min(r, h / 2, w / 2)
    this.doc.setFillColor(color)
    this.doc.roundedRect(x, top, w, h, rr, rr, 'F')
    if (yEnd < yBase) this.doc.rect(x, yBase - rr, w, rr, 'F')
    else this.doc.rect(x, yBase, w, rr, 'F')
  }

  /** полоса слева направо со скруглённым правым концом */
  hbar(x0: number, x1: number, y: number, h: number, color: string, r = 2) {
    const w = x1 - x0
    if (w < 0.3) return
    const rr = Math.min(r, w / 2, h / 2)
    this.doc.setFillColor(color)
    this.doc.roundedRect(x0, y, w, h, rr, rr, 'F')
    this.doc.rect(x0, y, rr, h, 'F')
  }

  label(s: string, x: number, y: number, c = C.muted) {
    this.text(s.toUpperCase(), x, y, { f: 'mono', s: 6.6, c, sp: 0.7 })
  }

  labelRight(s: string, right: number, y: number, c = C.muted) {
    const str = s.toUpperCase()
    const w = this.width(str, { f: 'mono', s: 6.6 }) + 0.7 * (str.length - 1)
    this.label(s, right - w, y, c)
  }

  /** раздел, чьё имя повторяется на листах-продолжениях */
  section(title: string) {
    this.continuation = title
  }

  /* ── листы ─────────────────────────────────────────────────────── */

  page(title: string, aside = '') {
    if (this.doc.getNumberOfPages() > 1 || this.y > 0) this.doc.addPage()
    this.runhead()
    this.y = MT + 34
    this.text(title, MX, this.y, { b: true, s: 16 })
    if (aside) this.text(aside, PW - MX, this.y, { f: 'mono', s: 7.6, c: C.muted, a: 'right' })
    this.y += 18
    this.continuation = title
  }

  /** новый лист, если блок высотой h не помещается */
  ensure(h: number) {
    if (this.y + h <= BOTTOM) return
    this.doc.addPage()
    this.runhead()
    this.y = MT + 34
    this.text(`${this.continuation} — продолжение`, MX, this.y, { b: true, s: 12 })
    this.y += 16
  }

  private runhead() {
    const d = this.doc
    // свой логотип (тариф «Про») — вместо знака и имени Semternity
    if (this.r.logo) {
      try {
        const { width, height } = d.getImageProperties(this.r.logo)
        const h = Math.min(18, (110 * height) / width)
        const w = (h * width) / height
        d.addImage(this.r.logo, 'PNG', MX, MT + 9 - h, w, h, 'report-logo')
        this.text('ОТЧЁТ ЗА ПЕРИОД', MX + w + 8, MT + 5.5, { f: 'mono', s: 7, c: C.ink2, sp: 0.5 })
        this.text(this.r.label.toUpperCase(), PW - MX, MT + 5.5, { f: 'mono', s: 7, c: C.muted, a: 'right' })
        this.rule(MT + 13)
        return
      } catch {
        // испорченная картинка — шапка как обычно, отчёт всё равно нужен
      }
    }
    // знак: незамкнутое кольцо с точкой в разрыве
    const cx = MX + 4.5
    const cy = MT + 3
    d.setDrawColor(C.brass)
    d.setLineWidth(1.3)
    d.circle(cx, cy, 3.6, 'S')
    d.setFillColor(C.white)
    d.circle(cx, cy - 3.6, 1.9, 'F')
    d.setFillColor(C.brass)
    d.circle(cx, cy - 3.6, 1.15, 'F')
    this.text('SEMTERNITY · ОТЧЁТ ЗА ПЕРИОД', MX + 13, MT + 5.5, { f: 'mono', s: 7, c: C.ink2, sp: 0.5 })
    this.text(this.r.label.toUpperCase(), PW - MX, MT + 5.5, { f: 'mono', s: 7, c: C.muted, a: 'right' })
    this.rule(MT + 13)
  }

  footers() {
    const n = this.doc.getNumberOfPages()
    const stamp = formatStamp(this.r.generatedAt)
    for (let i = 1; i <= n; i++) {
      this.doc.setPage(i)
      this.rule(PH - 34)
      this.text(`Сформирован ${stamp}`, MX, PH - 24, { f: 'mono', s: 7, c: C.muted })
      this.text(`стр. ${i} из ${n}`, PW - MX, PH - 24, { f: 'mono', s: 7, c: C.muted, a: 'right' })
    }
  }

  /* ── общие элементы ────────────────────────────────────────────── */

  tiles(items: { label: string; value: string; unit?: string; sub: string; bad?: boolean }[]) {
    const y0 = this.y
    const w = CW / items.length
    items.forEach((t, i) => {
      const x = MX + i * w + (i === 0 ? 0 : 10)
      if (i > 0) this.line(MX + i * w, y0 + 2, MX + i * w, y0 + 50, C.rule)
      this.label(t.label, x, y0 + 13)
      this.text(t.value, x, y0 + 32, { b: true, s: 15.5, c: t.bad ? C.terraInk : C.ink })
      if (t.unit) {
        const vw = this.width(t.value, { b: true, s: 15.5 })
        this.text(t.unit, x + vw + 3, y0 + 32, { s: 10, c: C.ink2 })
      }
      this.text(t.sub, x, y0 + 45, { s: 7.6, c: C.muted, w: w - 14 })
    })
    this.y = y0 + 56
    this.rule(this.y)
  }

  blockHead(title: string, items: LegendItem[] = []) {
    this.text(title, MX, this.y, { b: true, s: 10 })
    this.legend(items, this.y)
    this.y += 10
  }

  /** легенда, прижатая к правому краю `right` на базовой линии y */
  legend(items: LegendItem[], y: number, right = PW - MX) {
    let x = right
    for (let i = items.length - 1; i >= 0; i--) {
      const l = items[i]
      x -= this.width(l.text, { f: 'mono', s: 7 })
      this.text(l.text, x, y, { f: 'mono', s: 7, c: C.ink2 })
      x -= 13
      this.swatch(l.kind, x, y - 2.6)
      x -= 10
    }
  }

  swatch(kind: SwatchKind, x: number, cy: number) {
    if (kind === 'bar') this.rect(x, cy - 2.6, 9, 5.2, C.brass)
    if (kind === 'terra') this.rect(x, cy - 2.6, 9, 5.2, C.terra)
    if (kind === 'prev') this.rect(x + 4, cy - 4, 1.5, 8, C.prev)
    if (kind === 'norm') this.rect(x, cy - 0.75, 9, 1.5, C.ink)
    if (kind === 'brassNorm') this.rect(x, cy - 0.5, 9, 1, C.brassInk)
    if (kind === 'weekend') this.rect(x, cy - 4, 9, 8, '#ebe8e2')
  }

  /** полоса текущего периода с риской прошлого — основной элемент разрезов */
  barWithPrev(x: number, cy: number, w: number, value: number, prev: number, max: number, h = 6) {
    this.rect(x, cy - h / 2, w, h, C.track)
    if (value > 0) this.hbar(x, x + (w * Math.min(value, max)) / max, cy - h / 2, h, C.brass)
    if (prev > 0) this.rect(x + (w * Math.min(prev, max)) / max - 0.75, cy - 5.5, 1.5, 11, C.prev)
  }

  delta(cur: number, prev: number): { s: string; c: string } {
    if (prev <= 0.004 && cur > 0.004) return { s: 'новый', c: C.brassInk }
    if (cur <= 0.004 && prev > 0.004) return { s: 'выпал', c: C.terraInk }
    const d = cur - prev
    return { s: `${d >= 0 ? '+' : ''}${f1(d)}`, c: d < 0 ? C.terraInk : C.ink2 }
  }
}

/* ── страница 3: спринты ─────────────────────────────────────────── */

function sprintsPage(p: Pdf, r: ReportData) {
  p.page('Спринты: план и факт')
  p.legend([{ kind: 'bar', text: 'факт' }, { kind: 'terra', text: 'сверх плана' }, { kind: 'norm', text: 'план' }], p.y - 18)

  p.rule(p.y - 4)
  p.y -= 4
  p.tiles([
    { label: 'В работе', value: String(r.inWorkCount), sub: 'с часами или сроком в периоде' },
    { label: 'Закрыто', value: String(r.closedCount), sub: 'в финальный статус' },
    {
      label: 'Вышли за план',
      value: String(r.overCount),
      unit: r.overCount ? `· +${f1(r.overHours)} ч` : '',
      sub: 'факт за всё время спринта',
      bad: r.overCount > 0,
    },
    { label: 'Срок прошёл', value: String(r.overdueCount), sub: `не закрыты к ${dayMonth(r.to)}`, bad: r.overdueCount > 0 },
  ])

  const BW = 138
  // шкала в долях плана, общая для всех строк: черта «план» у всех в одном месте
  const maxShare = Math.max(...r.sprints.map((s) => (s.pct ?? 0) / 100), 1)
  const MAXP = Math.min(4, Math.max(1.2, Math.ceil(maxShare * 10) / 10))
  const cols = { name: MX, bullet: MX + 152, fact: MX + 362, period: MX + 408, status: MX + 474, end: PW - MX }

  p.y += 16
  for (const [t, x, a] of [['спринт', cols.name, 'left'], [`0 · план · ${Math.round(MAXP * 100)}%`, cols.bullet, 'left'], ['факт / план', cols.fact, 'right'], ['в периоде', cols.period, 'right'], ['статус', cols.status, 'right'], ['срок', cols.end, 'right']] as const) {
    p.text(t.toUpperCase(), x, p.y, { f: 'mono', s: 6.2, c: C.muted, a })
  }
  p.y += 4
  p.rule(p.y)

  const titles: Record<string, string> = { over: 'Вышли за план', inplan: 'В плане', noplan: 'Без плана' }
  for (const group of ['over', 'inplan', 'noplan'] as const) {
    const rows = r.sprints.filter((s) => s.group === group)
    if (!rows.length) continue
    p.ensure(36)
    p.y += 14
    p.text(titles[group], MX, p.y, { b: true, s: 8.8 })
    p.text(String(rows.length), PW - MX, p.y, { f: 'mono', s: 7, c: C.muted, a: 'right' })
    p.y += 4
    p.rule(p.y)
    for (const s of rows) {
      p.ensure(17)
      const cy = p.y + 9
      // название и значение группы в одной строке: значение серым, если влезает
      const nameW = p.width(s.name, { s: 8.2 })
      const tag = s.inner || s.outer
      p.text(s.name, cols.name, cy + 3, { s: 8.2, w: 146 })
      if (tag && nameW < 120) p.text(`· ${tag}`, cols.name + nameW + 3, cy + 3, { s: 7.6, c: C.muted, w: 146 - nameW - 3 })

      // пуля: доля плана на общей для всех шкале
      p.rect(cols.bullet, cy - 3, BW, 6, C.track)
      if (s.plan > 0) {
        const share = s.factTotal / s.plan
        const xp = cols.bullet + BW / MAXP
        if (share <= 1) p.hbar(cols.bullet, cols.bullet + (BW * share) / MAXP, cy - 3, 6, C.brass)
        else {
          p.rect(cols.bullet, cy - 3, xp - cols.bullet - 0.75, 6, C.brass)
          p.hbar(xp + 0.75, cols.bullet + (BW * Math.min(share, MAXP)) / MAXP, cy - 3, 6, C.terra)
        }
        p.rect(xp - 0.75, cy - 6, 1.5, 12, C.ink)
      } else {
        p.text('плана нет', cols.bullet + 4, cy + 2.4, { f: 'mono', s: 6.4, c: C.muted })
      }

      const pctText = s.pct !== null ? ` ${s.pct}%` : ''
      const factText = `${f1(s.factTotal)}${s.plan > 0 ? ` / ${f1(s.plan).replace(',0', '')}` : ''}`
      const pw = p.width(pctText, { f: 'mono', s: 7.6 })
      p.text(pctText, cols.fact, cy + 3, { f: 'mono', s: 7.6, c: (s.pct ?? 0) > 100 ? C.terraInk : C.muted, a: 'right' })
      p.text(factText, cols.fact - pw, cy + 3, { f: 'mono', s: 7.6, a: 'right' })
      p.text(f1(s.factPeriod), cols.period, cy + 3, { f: 'mono', s: 7.6, c: C.muted, a: 'right' })
      p.text(s.status, cols.status, cy + 3, {
        f: 'mono',
        s: 6.8,
        c: s.isFinal ? C.green : s.status === 'без статуса' ? C.faint : C.ink2,
        a: 'right',
        w: 62,
      })
      // прошедший срок незакрытого спринта — терракотой прямо в колонке срока
      p.text(s.endDate ? `${s.endDate.slice(8, 10)}.${s.endDate.slice(5, 7)}` : '—', cols.end, cy + 3, {
        f: 'mono',
        b: s.overdue,
        s: 7.4,
        c: s.overdue ? C.terraInk : C.muted,
        a: 'right',
      })
      p.y += 17
      p.rule(p.y, MX, PW - MX, C.track)
    }
  }
  if (!r.sprints.length) {
    p.y += 20
    p.text('В этом периоде не было задач с часами или сроком.', MX, p.y, { s: 9, c: C.muted })
  } else if (r.overdueCount) {
    p.y += 14
    p.text(`Срок терракотой — прошёл к ${dayMonth(r.to)}, а спринт не закрыт.`, MX, p.y, { s: 7.6, c: C.muted })
  }
}

/* ── к оплате: ставка × часы, переработка отдельно ───────────────── */

/** 1 250,50 BYN — код валюты и обычные пробелы: знаков €/₽ и неразрывного пробела в шрифте отчёта может не быть */
function money(value: number, currency: string): string {
  const fixed = Math.abs(value - Math.round(value)) < 0.005 ? String(Math.round(value)) : value.toFixed(2)
  const [int, frac] = fixed.split('.')
  return `${int.replace(/\B(?=(\d{3})+(?!\d))/g, ' ')}${frac ? `,${frac}` : ''} ${currency}`
}

/** часы к оплате — с сотыми: сумма считается от точных часов */
const h2 = (h: number) => h.toFixed(2).replace('.', ',')

function billingPage(p: Pdf, r: ReportData) {
  if (!r.billing.length) return
  const withOver = r.options.includeOvertime === true
  p.page('К оплате', withOver ? 'переработка включена в итог' : 'переработка — отдельно, не в итоге')

  p.tiles(
    r.billing.map((t) => ({
      label: `Итого, ${t.currency}`,
      value: money(t.due, t.currency),
      sub: t.overHours > 0.004 ? `сверх плана ${h2(t.overHours)} ч · ${money(t.overAmount, t.currency)}` : `${h2(t.hours)} ч к оплате`,
    })),
  )

  const cols = { name: MX, hours: MX + 300, rate: MX + 380, sum: PW - MX }
  p.y += 16
  for (const [t, x, a] of [['спринт', cols.name, 'left'], ['часы', cols.hours, 'right'], ['ставка', cols.rate, 'right'], ['сумма', cols.sum, 'right']] as const) {
    p.text(t.toUpperCase(), x, p.y, { f: 'mono', s: 6.2, c: C.muted, a })
  }
  p.y += 4
  p.rule(p.y)

  const rows = r.sprints.filter((s) => s.bill)
  for (const s of rows) {
    const b = s.bill!
    const extra = b.overHours > 0.004
    p.ensure(extra ? 30 : 17)
    const cy = p.y + 9
    const tag = s.inner || s.outer
    p.text(tag ? `${s.name} · ${tag}` : s.name, cols.name, cy + 3, { s: 8.2, w: 280 })
    // с сотыми: сумма считается от точных часов, и «часы × ставка» должно сходиться
    p.text(h2(b.hours), cols.hours, cy + 3, { f: 'mono', s: 7.6, a: 'right' })
    p.text(money(b.rate, b.currency), cols.rate, cy + 3, { f: 'mono', s: 7.6, c: C.muted, a: 'right' })
    p.text(money(b.amount, b.currency), cols.sum, cy + 3, { f: 'mono', s: 7.6, b: true, a: 'right' })
    p.y += 17
    if (extra) {
      const oy = p.y + 3
      p.text(withOver ? 'сверх плана' : 'сверх плана — не в итоге', cols.name + 10, oy, { s: 7.4, c: C.terraInk })
      p.text(h2(b.overHours), cols.hours, oy, { f: 'mono', s: 7.4, c: C.terraInk, a: 'right' })
      p.text(money(b.overAmount, b.currency), cols.sum, oy, { f: 'mono', s: 7.4, c: C.terraInk, a: 'right' })
      p.y += 13
    }
    p.rule(p.y, MX, PW - MX, C.track)
  }

  for (const t of r.billing) {
    p.ensure(18)
    p.y += 14
    p.text(`Итого к оплате, ${t.currency}`, cols.name, p.y, { b: true, s: 9 })
    p.text(h2(t.hours + (withOver ? t.overHours : 0)), cols.hours, p.y, { f: 'mono', s: 8, a: 'right' })
    p.text(money(t.due, t.currency), cols.sum, p.y, { f: 'mono', s: 9, b: true, a: 'right' })
  }
  p.y += 16
  p.text(
    'С планом — часы спринта в пределах плана × ставка; без плана — часы за период отчёта. Ставка — спринта или клиента.',
    MX,
    p.y,
    { s: 7.4, c: C.muted, w: CW },
  )
}

/** «сентябрь» → «сен»; «этот период» и «прошлый период» — как есть */
function shortName(name: string): string {
  return name.includes(' ') ? name : name.slice(0, 3)
}

/* ── 0.42: дашборд — общие куски ────────────────────────────────── */

/** цвет клиента на бумаге: метка дизайн-системы (светлая тема), без цвета — нейтральный */
function labelHex(color: string | null | undefined): string {
  return (color && PNG_PALETTE[color]) || C.faint
}

/** «хорошие» деления оси: 1, 2, 5, 10… — не больше пяти */
function niceStep(max: number): number {
  const raw = max / 4
  const mag = 10 ** Math.floor(Math.log10(raw || 1))
  for (const k of [1, 2, 2.5, 5, 10]) if (raw <= k * mag) return k * mag
  return 10 * mag
}

function plural3(n: number, forms: [string, string, string]): string {
  const a = n % 100
  const b = n % 10
  return forms[a > 10 && a < 20 ? 2 : b === 1 ? 0 : b > 1 && b < 5 ? 1 : 2]
}

function card(p: Pdf, x: number, y: number, w: number, h: number, fill = C.weekend) {
  p.doc.setFillColor(fill)
  p.doc.roundedRect(x, y, w, h, 5, 5, 'F')
}

/** кольцо: дорожка и дуга от 12 часов по часовой стрелке */
function ring(p: Pdf, cx: number, cy: number, r: number, w: number, frac: number) {
  const d = p.doc
  d.setDrawColor(C.track)
  d.setLineWidth(w)
  d.circle(cx, cy, r, 'S')
  const f = Math.max(0, Math.min(1, frac))
  if (f <= 0) return
  d.setDrawColor(C.brass)
  d.setLineCap('round')
  const n = Math.max(8, Math.ceil(90 * f))
  let px = cx
  let py = cy - r
  for (let i = 1; i <= n; i++) {
    const a = -Math.PI / 2 + 2 * Math.PI * f * (i / n)
    const x = cx + r * Math.cos(a)
    const y = cy + r * Math.sin(a)
    d.line(px, py, x, y)
    px = x
    py = y
  }
  d.setLineCap('butt')
}

function dashed(p: Pdf, x0: number, y: number, x1: number, color: string, w = 0.9) {
  p.doc.setLineDashPattern([3, 2.4], 0)
  p.line(x0, y, x1, y, color, w)
  p.doc.setLineDashPattern([], 0)
}

function dot(p: Pdf, x: number, y: number, color: string, r = 3.2) {
  p.doc.setFillColor(color)
  p.doc.circle(x, y, r, 'F')
}

const STAGE_COLORS: Record<StageTone, [string, string]> = {
  todo: [C.track, C.ink2],
  progress: [C.infoSoft, C.infoInk],
  done: [C.greenSoft, C.greenInk],
}

/** чип этапа, как в приложении; возвращает ширину */
function stageChip(p: Pdf, x: number, y: number, label: string, tone: StageTone | null): number {
  const [bg, fg] = tone ? STAGE_COLORS[tone] : [C.track, C.muted]
  const w = p.width(label, { s: 6.8 }) + 12
  p.doc.setFillColor(bg)
  p.doc.roundedRect(x, y - 8.6, w, 11.6, 5.8, 5.8, 'F')
  p.text(label, x + w / 2, y, { s: 6.8, c: fg, a: 'center' })
  return w
}

/** легенда клиентов справа на базовой линии y */
function clientLegend(p: Pdf, clients: ReportData['clients'], y: number, max = 5) {
  let x = PW - MX
  const list = clients.slice(0, max)
  for (let i = list.length - 1; i >= 0; i--) {
    const c = list[i]
    const name = c.name.length > 16 ? `${c.name.slice(0, 15)}…` : c.name
    x -= p.width(name, { s: 7 })
    p.text(name, x, y, { s: 7, c: C.ink2 })
    x -= 7
    dot(p, x, y - 2.4, labelHex(c.color), 2.6)
    x -= 10
  }
}

/** столбики по дням: каждый день — стопка клиентов, пунктир — норма дня */
function stackedDays(p: Pdf, r: ReportData, x0: number, y0: number, w: number, h: number, only?: string) {
  const gx = 18
  const clients = only ? r.clients.filter((c) => c.key === only) : r.clients
  const totals = r.days.map((_, i) => clients.reduce((a, c) => a + Math.max(0, c.byDay[i]), 0))
  const negatives = r.days.map((d) => (only ? 0 : Math.min(0, d.hours)))
  const norm = only ? null : r.dayNorm
  const hi = Math.max(...totals, norm ? norm * 1.25 : 1, 1) * 1.08
  const lo = Math.min(...negatives, 0) * 1.15
  const y = (v: number) => y0 + ((hi - v) / (hi - lo)) * h
  const slot = (w - gx) / r.days.length
  const bw = Math.min(12, slot * 0.62)
  r.days.forEach((d, i) => {
    if (d.weekend) p.rect(x0 + gx + i * slot, y0, slot, h, C.weekend)
  })
  const step = niceStep(hi)
  for (let t = step; t <= hi; t += step) {
    p.line(x0 + gx, y(t), x0 + w, y(t), C.track)
    p.text(fh(t), x0 + gx - 4, y(t) + 2.2, { f: 'mono', s: 6.4, c: C.muted, a: 'right' })
  }
  p.text('0', x0 + gx - 4, y(0) + 2.2, { f: 'mono', s: 6.4, c: C.muted, a: 'right' })
  const maxIdx = totals.indexOf(Math.max(...totals))
  const labelEvery = Math.ceil(r.days.length / 31)
  r.days.forEach((d, i) => {
    const bx = x0 + gx + i * slot + (slot - bw) / 2
    let acc = 0
    const parts = clients.map((c) => ({ v: Math.max(0, c.byDay[i]), color: labelHex(c.color) })).filter((x) => x.v > 0.004)
    parts.forEach((part, k) => {
      const top = y(acc + part.v)
      const bottom = y(acc)
      if (k === parts.length - 1) p.vbar(bx, bottom, top, bw, part.color, 2.2)
      else p.rect(bx, top, bw, bottom - top, part.color)
      acc += part.v
    })
    if (negatives[i] < -0.004) p.vbar(bx, y(0), y(negatives[i]), bw, C.terra, 2.2)
    if (i % labelEvery === 0) {
      p.text(String(d.day), x0 + gx + i * slot + slot / 2, y0 + h + 10, {
        f: 'mono',
        s: 6.2,
        c: d.weekend ? C.faint : C.ink2,
        a: 'center',
      })
    }
    if (i === maxIdx && totals[i] > 0) p.text(f1(totals[i]), bx + bw / 2, y(totals[i]) - 3, { f: 'mono', s: 6.4, a: 'center' })
  })
  p.line(x0 + gx, y(0), x0 + w, y(0), C.ink2)
  if (norm) {
    dashed(p, x0 + gx, y(norm), x0 + w, C.brass)
    p.text(`норма ${fh(norm)} ч`, x0 + w, y(norm) - 3, { s: 6.4, c: C.brassInk, a: 'right' })
  }
}

/* ── лист 1: сводка ──────────────────────────────────────────────── */

function summaryPage(p: Pdf, r: ReportData) {
  p.page(`Сводка · ${r.label}`, r.prevTotal > 0 ? `сравнение — с ${r.prevWith}` : '')
  const top = p.y + 4

  // кольцо нормы
  const cx = MX + 46
  const cy = top + 48
  const share = r.target && r.target.hours > 0 ? r.total / r.target.hours : null
  ring(p, cx, cy, 40, 8.5, share ?? 0)
  p.text(share !== null ? `${Math.round(share * 100)}%` : f1(r.total), cx, cy + 3, { f: 'mono', b: true, s: 14, a: 'center' })
  p.text(share !== null ? 'нормы' : 'часов', cx, cy + 15, { s: 7, c: C.muted, a: 'center' })

  // главная цифра и разница с прошлым
  const hx = MX + 104
  p.text('Факт за период', hx, top + 16, { s: 8.4, c: C.muted })
  const big = f1(r.total)
  p.text(big, hx, top + 54, { b: true, s: 38 })
  p.text('ч', hx + p.width(big, { b: true, s: 38 }) + 4, top + 54, { s: 16, c: C.ink2 })
  let ly = top + 72
  if (r.prevTotal > 0) {
    const d = r.total - r.prevTotal
    p.text(`${d >= 0 ? '+' : '−'}${f1(Math.abs(d))} ч к ${r.prevDative} (${f1(r.prevTotal)} ч)${r.prevIncompleteSince ? ' *' : ''}`, hx, ly, {
      s: 8.6,
      b: true,
      c: d >= 0 ? C.greenInk : C.terraInk,
    })
    ly += 13
  }
  if (r.target) {
    const left = r.target.hours - r.total
    p.text(
      `Норма ${fh(r.target.hours)} ч · ${r.weekdays} ${plural3(r.weekdays, ['рабочий день', 'рабочих дня', 'рабочих дней'])} · ${
        left > 0.05 ? `не хватает ${f1(left)} ч` : 'выполнена'
      }`,
      hx,
      ly,
      { s: 7.8, c: C.ink2, w: 250 },
    )
  }

  // справа: прогноз месяца или дни с учётом
  const bw = 150
  const bx = PW - MX - bw
  card(p, bx, top, bw, 96)
  if (r.forecast) {
    const fc = r.forecast
    p.text('Прогноз на месяц', bx + 12, top + 17, { s: 7.6, c: C.muted })
    p.text(`≈ ${Math.round(fc.hours)} ч`, bx + 12, top + 43, { b: true, s: 19 })
    p.text(fc.monthNorm ? `норма месяца ${fh(fc.monthNorm)} ч` : `темп ${f1(fc.pace)} ч в рабочий день`, bx + 12, top + 58, { s: 7, c: C.ink2 })
    if (fc.monthNorm) {
      const tw = bw - 24
      const full = Math.max(fc.monthNorm, fc.hours)
      p.rect(bx + 12, top + 68, tw, 5, C.track)
      p.hbar(bx + 12, bx + 12 + (tw * Math.min(r.total, full)) / full, top + 68, 5, C.brass)
      if (fc.hours > r.total) p.rect(bx + 12 + (tw * r.total) / full, top + 68, (tw * (fc.hours - r.total)) / full, 5, C.brassSoft)
      p.rect(bx + 12 + (tw * fc.monthNorm) / full - 0.6, top + 65, 1.2, 11, C.ink)
    }
    p.text(`при темпе ${f1(fc.pace)} ч в рабочий день`, bx + 12, top + 88, { s: 6.6, c: C.muted, w: bw - 24 })
  } else {
    p.text('Дней с учётом', bx + 12, top + 17, { s: 7.6, c: C.muted })
    p.text(String(r.daysWithEntries), bx + 12, top + 43, { b: true, s: 19 })
    p.text(`из ${r.weekdays} ${plural3(r.weekdays, ['рабочего', 'рабочих', 'рабочих'])}`, bx + 12, top + 58, { s: 7, c: C.ink2 })
    if (r.dayNorm) p.text(`норма дня ${fh(r.dayNorm)} ч`, bx + 12, top + 88, { s: 6.6, c: C.muted })
  }

  // четыре плитки
  p.y = top + 112
  const cards: { label: string; value: string; sub: string; bad?: boolean }[] = [
    {
      label: 'В рабочий день',
      value: r.avgPerWeekday === null ? '—' : `${f1(r.avgPerWeekday)} ч`,
      sub: r.dayNorm ? `в среднем · норма ${fh(r.dayNorm)} ч` : 'в среднем',
    },
    {
      label: 'Закрыто',
      value: `${r.closedCount} из ${r.inWorkCount}`,
      sub: `${plural3(r.inWorkCount, ['задачи', 'задач', 'задач'])} в работе`,
    },
    {
      label: 'Сверх плана',
      value: `${f1(r.overHours)} ч`,
      sub: r.overCount ? `в ${r.overCount} ${plural3(r.overCount, ['спринте', 'спринтах', 'спринтах'])}` : 'всё в плане',
      bad: r.overHours > 0.05,
    },
    r.billing.length
      ? {
          label: 'К оплате',
          value: money(r.billing[0].due, r.billing[0].currency),
          sub: r.billing.length > 1 ? `и ${r.billing.slice(1).map((b) => money(b.due, b.currency)).join(', ')}` : 'переработка — отдельно',
        }
      : { label: 'Без плана', value: `${f1(r.unplannedHours)} ч`, sub: `${pctLabel(r.unplannedHours, r.total)} времени` },
  ]
  const cw = (CW - 24) / 4
  cards.forEach((c, i) => {
    const x = MX + i * (cw + 8)
    card(p, x, p.y, cw, 62)
    p.text(c.label, x + 10, p.y + 16, { s: 7.2, c: C.muted })
    p.text(c.value, x + 10, p.y + 38, { f: 'mono', b: true, s: 13, c: c.bad ? C.terraInk : C.ink, w: cw - 18 })
    p.text(c.sub, x + 10, p.y + 53, { s: 6.6, c: C.ink2, w: cw - 18 })
  })
  p.y += 62 + 28

  // ритм по дням — стопками клиентов
  if (r.days.length <= 62) {
    p.text('Ритм по дням', MX, p.y, { b: true, s: 10.5 })
    clientLegend(p, r.clients, p.y)
    stackedDays(p, r, MX, p.y + 12, CW, 112)
    p.y += 12 + 112 + 36
    const negatives = r.days.filter((d) => d.hours < -0.004)
    if (negatives.length) {
      const n = negatives.length
      p.y += p.para(
        `${n === 1 ? 'Один день ушёл' : `${n} ${n < 5 ? 'дня ушли' : 'дней ушли'}`} в минус: правки записаны не в тот день. Итог периода это не меняет.`,
        MX,
        p.y - 8,
        CW,
        { s: 7, c: C.muted },
      )
    }
  }

  // клиенты: доли, сравнение и сумма
  if (r.clients.length) {
    p.ensure(80)
    p.text('Клиенты', MX, p.y, { b: true, s: 10.5 })
    if (r.prevTotal > 0) p.text(`черта — ${r.prevName}`, PW - MX, p.y, { s: 7, c: C.muted, a: 'right' })
    p.y += 9
    const positive = r.clients.filter((c) => c.hours > 0)
    const sum = positive.reduce((a, c) => a + c.hours, 0)
    let x = MX
    for (const c of positive) {
      const w = (CW * c.hours) / Math.max(sum, 0.001)
      p.rect(x, p.y, Math.max(0, w - 1.5), 7, labelHex(c.color))
      x += w
    }
    p.y += 24
    const anyMoney = r.clients.some((c) => c.money.length)
    const col = { bar: MX + 170, hours: MX + 372, share: MX + 412, delta: MX + 458, money: PW - MX }
    p.text('часы', col.hours, p.y - 6, { s: 6.4, c: C.muted, a: 'right' })
    p.text('доля', col.share, p.y - 6, { s: 6.4, c: C.muted, a: 'right' })
    if (r.prevTotal > 0) p.text(`к ${shortName(r.prevName)}`, col.delta, p.y - 6, { s: 6.4, c: C.muted, a: 'right' })
    if (anyMoney) p.text('к оплате', col.money, p.y - 6, { s: 6.4, c: C.muted, a: 'right' })
    const maxH = Math.max(...r.clients.map((c) => Math.max(c.hours, c.prevHours)), 0.001)
    const shown = r.clients.slice(0, 7)
    for (const c of shown) {
      p.ensure(30)
      const yy = p.y + 10
      dot(p, MX + 4, yy - 3, labelHex(c.color))
      p.text(c.name, MX + 13, yy, { b: true, s: 9.2, w: 150 })
      const nSprints = r.sprints.filter((s) => s.clientKey === c.key).length
      const sub = [nSprints ? `${nSprints} ${plural3(nSprints, ['спринт', 'спринта', 'спринтов'])}` : '', c.rate ? `${money(c.rate.value, c.rate.currency)}/ч` : '']
        .filter(Boolean)
        .join(' · ')
      if (sub) p.text(sub, MX + 13, yy + 10, { s: 6.6, c: C.muted, w: 150 })
      const bw2 = 160
      p.rect(col.bar, yy - 6, bw2, 5.5, C.track)
      if (c.hours > 0) p.hbar(col.bar, col.bar + (bw2 * c.hours) / maxH, yy - 6, 5.5, labelHex(c.color))
      if (r.prevTotal > 0 && c.prevHours > 0) p.rect(col.bar + (bw2 * c.prevHours) / maxH - 0.6, yy - 9, 1.2, 11.5, C.ink)
      p.text(f1(c.hours), col.hours, yy, { f: 'mono', s: 9, a: 'right' })
      p.text(pctLabel(c.hours, r.total), col.share, yy, { f: 'mono', s: 7.6, c: C.ink2, a: 'right' })
      if (r.prevTotal > 0) {
        const dl = p.delta(c.hours, c.prevHours)
        p.text(dl.s, col.delta, yy, { f: 'mono', s: 7.6, c: dl.c === C.ink2 ? C.greenInk : dl.c, a: 'right' })
      }
      if (anyMoney) {
        p.text(c.money.length ? c.money.map((m) => money(m.amount, m.currency)).join(' · ') : '—', col.money, yy, {
          f: 'mono',
          s: 7.8,
          c: c.money.length ? C.ink : C.faint,
          a: 'right',
          w: 84,
        })
      }
      p.y += 30
      p.rule(p.y - 8, MX, PW - MX, C.track)
    }
    if (r.clients.length > shown.length) {
      p.text(`и ещё ${r.clients.length - shown.length} — на листе «Клиенты и спринты»`, MX, p.y, { s: 7, c: C.muted })
      p.y += 10
    }
  }

  // главное
  if (r.insights.length) {
    p.ensure(30 + r.insights.length * 16)
    p.y += 10
    p.text('Главное', MX, p.y, { b: true, s: 10.5 })
    p.y += 15
    for (const s of r.insights) {
      p.ensure(16)
      dot(p, MX + 2.5, p.y - 2.8, C.brass, 2)
      p.y += p.para(s, MX + 11, p.y, CW - 11, { s: 8.4 }) + 3
    }
  }
  if (r.prevIncompleteSince) {
    p.ensure(14)
    p.y += 4
    p.text(`* Учёт ведётся с ${dayMonth(r.prevIncompleteSince)} — ${r.prevName} учтён не целиком, рост к нему завышен.`, MX, p.y, {
      s: 7,
      c: C.muted,
    })
  }
}

/* ── лист 2: клиенты и спринты ───────────────────────────────────── */

function clientsPage(p: Pdf, r: ReportData) {
  if (!r.sprints.length && !r.clients.length) return
  p.page('Клиенты и спринты', r.to >= toIsoToday() ? `этап, срок и подзадачи — на ${dayMonth(toIsoToday())}` : '')
  const open = r.sprints.filter((s) => !s.isFinal)
  const subDone = r.sprints.reduce((a, s) => a + s.subDone, 0)
  const subTotal = r.sprints.reduce((a, s) => a + s.subTotal, 0)
  const strip: [string, string, boolean][] = [
    ['Спринтов в работе', String(open.length), false],
    ['Подзадачи', subTotal ? `${subDone} из ${subTotal}` : '—', false],
    ['Срок прошёл', String(r.overdueCount), r.overdueCount > 0],
    ['Сверх плана', `${f1(r.overHours)} ч`, r.overHours > 0.05],
  ]
  const sw = (CW - 24) / 4
  strip.forEach(([l, v, bad], i) => {
    const x = MX + i * (sw + 8)
    card(p, x, p.y, sw, 42)
    p.text(l, x + 10, p.y + 15, { s: 7, c: C.muted })
    p.text(v, x + 10, p.y + 33, { f: 'mono', b: true, s: 11.5, c: bad ? C.terraInk : C.ink })
  })
  p.y += 42 + 30

  const known = new Set(r.clients.map((c) => c.key))
  const blocks = [
    ...r.clients.map((c) => ({ client: c as ReportData['clients'][number] | null, rows: r.sprints.filter((s) => s.clientKey === c.key) })),
    { client: null, rows: r.sprints.filter((s) => !known.has(s.clientKey)) },
  ].filter((b) => b.client || b.rows.length)

  for (const b of blocks) {
    p.ensure(40 + Math.min(b.rows.length, 2) * 38)
    const c = b.client
    const color = c ? labelHex(c.color) : C.faint
    dot(p, MX + 5, p.y - 4, color, 4.5)
    p.text(c ? c.name : 'Без часов в периоде', MX + 16, p.y, { b: true, s: 12, w: 330 })
    if (c) p.text(`${f1(c.hours)} ч`, PW - MX, p.y, { f: 'mono', b: true, s: 11.5, a: 'right' })
    const sub = c
      ? [
          `${pctLabel(c.hours, r.total)} учёта`,
          c.rate ? `${money(c.rate.value, c.rate.currency)}/ч` : '',
          c.money.length ? `к оплате ${c.money.map((m) => money(m.amount, m.currency)).join(' · ')}` : '',
        ]
          .filter(Boolean)
          .join(' · ')
      : 'спринты со сроком в периоде, по которым не было учёта'
    p.text(sub, MX + 16, p.y + 13, { s: 7.4, c: C.ink2, w: CW - 16 })
    p.y += 30
    if (!b.rows.length) {
      p.text('Учёт без спринта', MX + 16, p.y + 2, { s: 8, c: C.muted })
      p.y += 22
    }
    for (const s of b.rows) {
      p.ensure(38)
      const yy = p.y
      p.rule(yy - 10, MX, PW - MX, C.track)
      p.text(s.name, MX + 16, yy + 3, { s: 9.2, w: 250 })
      let mx = MX + 16
      mx += stageChip(p, mx, yy + 17, s.isFinal ? 'Готово' : s.status === 'без статуса' ? 'Без этапа' : s.status, s.isFinal ? 'done' : s.stageTone) + 6
      const meta = [
        s.endDate ? (s.overdue ? `срок прошёл ${dayMonth(s.endDate)}` : `до ${dayMonth(s.endDate)}`) : '',
        s.subTotal ? `подзадачи ${s.subDone}/${s.subTotal}` : '',
      ]
        .filter(Boolean)
        .join(' · ')
      if (meta) p.text(meta, mx, yy + 17, { s: 6.8, c: s.overdue ? C.terraInk : C.muted, w: 300 - mx + MX })
      const bx = MX + 316
      const bwid = 118
      if (s.plan > 0) {
        const scale = Math.max(s.plan, s.factTotal)
        const inPlan = Math.min(s.factTotal, s.plan)
        p.rect(bx, yy - 1, (bwid * s.plan) / scale, 6.5, C.track)
        p.hbar(bx, bx + (bwid * inPlan) / scale, yy - 1, 6.5, c ? color : C.brass)
        if (s.factTotal > s.plan) p.hbar(bx + (bwid * s.plan) / scale + 1, bx + bwid, yy - 1, 6.5, C.terra)
        p.rect(bx + (bwid * s.plan) / scale - 0.6, yy - 4, 1.2, 12.5, C.ink)
        p.text(`${f1(s.factTotal)} / ${fh(s.plan)} ч`, PW - MX, yy + 4, { f: 'mono', s: 8.2, a: 'right' })
        p.text(
          s.factTotal > s.plan ? `+${f1(s.factTotal - s.plan)} ч сверх плана` : `осталось ${f1(s.plan - s.factTotal)} ч`,
          PW - MX,
          yy + 15,
          { s: 6.6, c: s.factTotal > s.plan ? C.terraInk : C.muted, a: 'right' },
        )
      } else {
        p.text(`${f1(s.factTotal)} ч`, PW - MX, yy + 4, { f: 'mono', s: 8.2, a: 'right' })
        p.text('без плана', PW - MX, yy + 15, { s: 6.6, c: C.muted, a: 'right' })
      }
      p.y += 38
    }
    p.y += 14
  }
  p.ensure(14)
  p.text('Шкала: заливка — факт в плане, малиновым — сверх плана, черта — план. Факт — за всё время спринта.', MX, p.y, {
    s: 6.8,
    c: C.muted,
  })
}

/* ── лист 3: как шла работа ──────────────────────────────────────── */

function workPage(p: Pdf, r: ReportData) {
  if (r.total === 0 && !r.tiles.some((t) => t.tile.total > 0)) return
  p.page('Как шла работа', 'ритм, мозаика, фокус и встречи')
  p.y += 10

  // когда идёт работа: дни недели × часы суток
  const heatTotal = r.heat.reduce((a, row) => a + row.reduce((b, v) => b + v, 0), 0)
  if (heatTotal > 0.05) {
    let h0 = 8
    let h1 = 21
    r.heat.forEach((row) =>
      row.forEach((v, h) => {
        if (v > 0.05) {
          h0 = Math.min(h0, h)
          h1 = Math.max(h1, h)
        }
      }),
    )
    const hours = Array.from({ length: h1 - h0 + 1 }, (_, i) => h0 + i)
    const max = Math.max(...r.heat.flat(), 0.001)
    p.text('Когда идёт работа', MX, p.y, { b: true, s: 10.5 })
    p.text('часы таймера по дням недели и часам суток', PW - MX, p.y, { s: 7, c: C.muted, a: 'right' })
    const gx = MX + 20
    const gy = p.y + 18
    const cw = (CW - 20) / hours.length
    const ch = 15
    hours.forEach((h, i) => p.text(String(h), gx + i * cw + cw / 2, gy - 4, { f: 'mono', s: 6, c: C.muted, a: 'center' }))
    const wd = ['пн', 'вт', 'ср', 'чт', 'пт', 'сб', 'вс']
    wd.forEach((d, row) => {
      p.text(d, MX, gy + row * ch + 10.5, { s: 6.8, c: row >= 5 ? C.faint : C.ink2 })
      hours.forEach((h, i) => {
        const v = r.heat[row][h]
        const x = gx + i * cw + 1
        const y = gy + row * ch + 1
        if (v < 0.02) {
          p.doc.setFillColor(C.weekend)
        } else {
          // от светлой терракоты к насыщенной — смесь с белым по доле
          const k = 0.15 + 0.85 * (v / max)
          p.doc.setFillColor(mix(C.brass, '#ffffff', k))
        }
        p.doc.roundedRect(x, y, cw - 2, ch - 2, 1.6, 1.6, 'F')
      })
    })
    p.y = gy + 7 * ch + 12
    p.text('Ручные правки без времени суток сюда не входят.', MX, p.y, { s: 6.6, c: C.muted })
    p.y += 26
  }

  // мозаика: день — плитка, как на «Сегодня»
  const tiles = r.tiles
  if (tiles.length && tiles.length <= 42) {
    p.ensure(140)
    p.text('Мозаика периода', MX, p.y, { b: true, s: 10.5 })
    p.text('день — плитка: цвет — клиент, пустое — недобор до нормы', PW - MX, p.y, { s: 7, c: C.muted, a: 'right' })
    const ts = 40
    const tg = 7
    const x0 = MX
    const y0 = p.y + 22
    const wd = ['пн', 'вт', 'ср', 'чт', 'пт', 'сб', 'вс']
    wd.forEach((d, i) => p.text(d, x0 + i * (ts + tg) + ts / 2, y0 - 6, { s: 6.4, c: i >= 5 ? C.faint : C.muted, a: 'center' }))
    const firstCol = (parseIsoDate(tiles[0].date).getDay() + 6) % 7
    const record = tiles.reduce((a, t) => (t.tile.total > a.tile.total ? t : a), tiles[0])
    let rows = 0
    tiles.forEach((t, i) => {
      const idx = firstCol + i
      const col = idx % 7
      const row = Math.floor(idx / 7)
      rows = Math.max(rows, row + 1)
      const x = x0 + col * (ts + tg)
      const y = y0 + row * (ts + tg + 3)
      // дни впереди — пунктирной рамкой, чтобы не путать с днями без учёта
      if (t.date > toIsoToday()) {
        p.doc.setDrawColor(C.rule)
        p.doc.setLineWidth(0.8)
        p.doc.setLineDashPattern([2, 2], 0)
        p.doc.roundedRect(x, y, ts, ts, 3, 3, 'S')
        p.doc.setLineDashPattern([], 0)
        p.text(String(parseIsoDate(t.date).getDate()), x + ts, y + ts + 7.5, { f: 'mono', s: 5.8, c: C.faint, a: 'right' })
        return
      }
      drawTile(p, t.tile, x, y, ts)
      const over = t.tile.norm > 0 && t.tile.total >= t.tile.norm
      if (t === record && record.tile.total > 0) {
        p.doc.setDrawColor(C.brass)
        p.doc.setLineWidth(1.6)
        p.doc.roundedRect(x - 2, y - 2, ts + 4, ts + 4, 4, 4, 'S')
      } else if (over) {
        p.doc.setDrawColor(C.brass)
        p.doc.setLineWidth(0.8)
        p.doc.roundedRect(x - 1.5, y - 1.5, ts + 3, ts + 3, 3.5, 3.5, 'S')
      }
      p.text(String(parseIsoDate(t.date).getDate()), x + ts, y + ts + 7.5, { f: 'mono', s: 5.8, c: C.muted, a: 'right' })
    })
    // факты справа
    const fx = x0 + 7 * (ts + tg) + 14
    const withEntries = tiles.filter((t) => t.tile.total > 0).length
    const normDays = tiles.filter((t) => t.tile.norm > 0 && t.tile.total >= t.tile.norm).length
    let best = 0
    let run = 0
    for (const t of tiles) {
      if (t.tile.norm === 0) continue
      run = t.tile.total >= t.tile.norm ? run + 1 : 0
      best = Math.max(best, run)
    }
    const facts: [string, string][] = [
      ['Дней с учётом', `${withEntries} из ${tiles.length}`],
      ['Норма набрана', `${normDays} ${plural3(normDays, ['день', 'дня', 'дней'])}`],
      ['Рекорд', record.tile.total > 0 ? `${dayMonth(record.date)} · ${f1(record.tile.total / 60)} ч` : '—'],
      ['Лучшая серия', best ? `${best} ${plural3(best, ['день', 'дня', 'дней'])} по норме` : '—'],
    ]
    facts.forEach(([l, v], i) => {
      const yy = y0 + 6 + i * 34
      p.text(l, fx, yy, { s: 7, c: C.muted })
      p.text(v, fx, yy + 14, { f: 'mono', b: true, s: 10, w: PW - MX - fx })
    })
    p.y = y0 + rows * (ts + tg + 3) + 18
  }

  // из чего сложился учёт и методика — двумя колонками
  p.ensure(150)
  const colW = (CW - 24) / 2
  const top = p.y
  const w = r.work
  p.text('Из чего сложился учёт', MX, top, { b: true, s: 10.5 })
  const parts: [string, number, string][] = [
    ['Таймер', w.timer, C.ink],
    ['Фокус: Pomodoro и 90/30', w.focus, C.brass],
    ['Встречи из календаря', w.meetings, C.info],
    ['Вручную', w.manual, C.faint],
  ]
  const positive = parts.filter(([, v]) => v > 0.004)
  const sum = positive.reduce((a, [, v]) => a + v, 0)
  let x = MX
  for (const [, v, color] of positive) {
    const pw = (colW * v) / Math.max(sum, 0.001)
    p.rect(x, top + 10, Math.max(0, pw - 1.5), 7, color)
    x += pw
  }
  parts.forEach(([l, v, color], i) => {
    const yy = top + 38 + i * 18
    dot(p, MX + 3.5, yy - 2.8, color, 3)
    p.text(l, MX + 12, yy, { s: 8 })
    p.text(`${f1(v)} ч`, MX + colW, yy, { f: 'mono', s: 8, a: 'right', c: v < 0 ? C.terraInk : C.ink })
  })
  const line = [
    w.pomodoro ? `${w.pomodoro} pomodoro` : '',
    w.deep ? `${w.deep} ${plural3(w.deep, ['глубокая сессия', 'глубокие сессии', 'глубоких сессий'])}` : '',
    w.longest > 0 ? `самый долгий заход ${hm(w.longest)}` : '',
    w.meetingCount ? `${w.meetingCount} ${plural3(w.meetingCount, ['встреча', 'встречи', 'встреч'])}` : '',
  ]
    .filter(Boolean)
    .join(' · ')
  if (line) p.para(line, MX, top + 116, colW, { s: 7, c: C.ink2 })

  const ex = MX + colW + 24
  if (r.method) {
    p.text('По методике', ex, top, { b: true, s: 10.5 })
    p.text(r.method.title, PW - MX, top, { s: 7, c: C.muted, a: 'right' })
    const toneColor: Record<string, string> = { danger: C.terra, accent: C.brass, info: C.info, neutral: C.faint }
    const rows = r.method.rows
    const two = rows.length === 4 || rows.length === 5
    const cellW = two ? (colW - 6) / 2 : colW
    rows.forEach((row, i) => {
      const cx = ex + (two ? (i % 2) * (cellW + 6) : 0)
      const cy = top + 10 + (two ? Math.floor(i / 2) : i) * 40
      card(p, cx, cy, cellW, 34)
      p.rect(cx, cy, 3, 34, toneColor[row.tone])
      p.text(row.label, cx + 10, cy + 13, { s: 6.8, c: C.ink2, w: cellW - 16 })
      p.text(`${f1(row.hours)} ч`, cx + 10, cy + 27, { f: 'mono', b: true, s: 9.5 })
      p.text(pctLabel(row.hours, r.total), cx + cellW - 7, cy + 27, { f: 'mono', s: 7, c: C.muted, a: 'right' })
    })
  } else {
    p.text('Учёт в цифрах', ex, top, { b: true, s: 10.5 })
    const c = r.composition
    const facts: [string, string][] = [
      ['Сессий таймера', String(c.sessions)],
      ['Средняя сессия', c.sessions ? hm(c.timer / c.sessions) : '—'],
      ['Ручных правок', String(c.manualCount)],
      ['Подтверждено таймером', r.total > 0 ? `${Math.min(100, pct(c.timer, r.total))}%` : '—'],
    ]
    facts.forEach(([k, v], i) => {
      const yy = top + 22 + i * 22
      p.text(k, ex, yy, { s: 8.4, c: C.ink2 })
      p.text(v, PW - MX, yy, { f: 'mono', s: 8.6, a: 'right' })
      p.rule(yy + 7, ex, PW - MX, C.track)
    })
  }
  p.y = top + 140
  checksBlock(p, r)
}

/** «Что проверить» — только если попросили при выгрузке */
function checksBlock(p: Pdf, r: ReportData) {
  if (!r.checks) return
  const items: { title: string; lines: string[] }[] = []
  const n = r.checks.overnight.length
  if (n) {
    items.push({
      title: `${n === 1 ? 'Таймер шёл' : `${n} ${n < 5 ? 'таймера шли' : 'таймеров шли'}`} через ночь`,
      lines: r.checks.overnight.map((o) => `${dayMonth(o.date)} — «${o.task}», ${hm(o.hours)}, до ${o.endedAt}`),
    })
  }
  if (r.checks.negativeDays.length) {
    items.push({
      title: 'Дни в минусе — правки записаны не в тот день',
      lines: [r.checks.negativeDays.map((d) => `${dayMonth(d.date)} ${f1(d.hours)} ч`).join(', ')],
    })
  }
  if (r.checks.emptyWeekdays.length) {
    items.push({ title: 'Будни без единой записи', lines: [r.checks.emptyWeekdays.map((d) => dayMonth(d)).join(', ')] })
  }
  p.ensure(40)
  p.y += 6
  p.text('Что проверить', MX, p.y, { b: true, s: 10.5 })
  p.y += 14
  if (!items.length) {
    p.text('Ничего подозрительного: ночных сессий, дней в минусе и пустых будней нет.', MX, p.y, { s: 8.2, c: C.muted })
    p.y += 16
  }
  items.forEach((it, i) => {
    const detail = it.lines.join('\n')
    const dh = p.paraHeight(detail, CW - 20, { s: 7.6 })
    p.ensure(14 + dh)
    p.doc.setDrawColor(C.terra)
    p.doc.setLineWidth(1)
    p.doc.circle(MX + 5, p.y - 3, 5, 'S')
    p.text(String(i + 1), MX + 5, p.y - 0.6, { f: 'mono', s: 6.4, c: C.terraInk, a: 'center' })
    p.text(it.title, MX + 18, p.y, { s: 8.6 })
    p.y += 11
    p.y += p.para(detail, MX + 18, p.y, CW - 20, { s: 7.6, c: C.muted }) + 6
  })
}

/** плитка дня в квадрате size: пятна клиентов, пустое — фон */
function drawTile(p: Pdf, tile: DayTile, x: number, y: number, size: number) {
  p.doc.setFillColor(C.track)
  p.doc.roundedRect(x, y, size, size, 3, 3, 'F')
  const gap = 1
  for (const rc of layoutTile(tile)) {
    if (!rc.seg) continue
    const w = rc.w * size - gap
    const h = rc.h * size - gap
    if (w <= 0.4 || h <= 0.4) continue
    p.doc.setFillColor(labelHex(rc.seg.client.color))
    p.doc.roundedRect(x + rc.x * size + gap / 2, y + rc.y * size + gap / 2, w, h, Math.min(1.5, w / 2, h / 2), Math.min(1.5, w / 2, h / 2), 'F')
  }
}

/* ── лист 5: журнал ──────────────────────────────────────────────── */

const TAG_LABEL: Record<NonNullable<JournalEntry['tag']>, string> = {
  meeting: 'встреча',
  pomodoro: 'Pomodoro',
  deep: '90/30',
  manual: 'вручную',
}

function journalPage(p: Pdf, r: ReportData) {
  if (!r.journal.length) return
  p.page('Журнал', 'все записи учёта по дням')
  const colorOf = new Map(r.clients.map((c) => [c.key, labelHex(c.color)]))
  const dayHead = (label: string, total: string) => {
    p.y += 6
    p.text(label, MX, p.y, { b: true, s: 10 })
    if (total) p.text(total, PW - MX, p.y, { f: 'mono', b: true, s: 9.4, a: 'right' })
    p.y += 6
    p.rule(p.y, MX, PW - MX, C.faint)
  }
  for (const day of r.journal) {
    if (!day.entries.length) continue
    p.ensure(40)
    dayHead(`${day.label[0].toUpperCase()}${day.label.slice(1)}`, hm(day.total))
    for (const e of day.entries) {
      const nh = e.note ? p.paraHeight(e.note, CW - 92, { s: 7.6 }, 1.35) + 3 : 0
      const before = p.doc.getNumberOfPages()
      p.ensure(18 + nh)
      if (p.doc.getNumberOfPages() !== before) dayHead(`${day.label} — продолжение`, '')
      p.y += 15
      p.text(e.start ? `${e.start}–${e.end}` : '—', MX, p.y, { f: 'mono', s: 7.6, c: C.ink2 })
      dot(p, MX + 76, p.y - 2.6, colorOf.get(e.clientKey) ?? C.faint, 3)
      const tag = e.tag ? TAG_LABEL[e.tag] : ''
      const tagW = tag ? p.width(tag, { s: 6.4 }) + 12 : 0
      const durX = PW - MX
      const tagX = durX - 66 - tagW
      p.text(e.title, MX + 85, p.y, { s: 8.6, w: tagX - (MX + 85) - 8, c: e.hours < 0 ? C.terraInk : C.ink })
      if (tag) {
        card(p, tagX, p.y - 8.4, tagW, 11.2)
        p.text(tag, tagX + tagW / 2, p.y - 0.4, { s: 6.4, c: C.ink2, a: 'center' })
      }
      p.text(hm(e.hours), durX, p.y, { f: 'mono', s: 8.2, a: 'right', c: e.hours < 0 ? C.terraInk : C.ink })
      if (e.note) {
        // значок комментария — пузырёк терракотой
        const by = p.y + 6
        p.doc.setDrawColor(C.brass)
        p.doc.setLineWidth(0.8)
        p.doc.roundedRect(MX + 85, by + 1, 8, 5.5, 1.5, 1.5, 'S')
        p.y += 10
        p.y += p.para(e.note, MX + 97, p.y, CW - 97, { s: 7.6, c: C.ink2 }, 1.35) - 7.6 * 1.35
      }
      p.rule(p.y + 6, MX + 76, PW - MX, C.track)
    }
    p.y += 12
  }
  p.ensure(40)
  p.y += 6
  card(p, MX, p.y, CW, 30)
  p.text('цвет — клиент · пузырёк — комментарий к учёту · «встреча» — засчитано из календаря · «вручную» — правка без времени', MX + 12, p.y + 18.5, {
    s: 6.8,
    c: C.ink2,
    w: CW - 24,
  })
  p.y += 36
}

/** смесь двух цветов #rrggbb: k — доля первого */
function mix(a: string, b: string, k: number): string {
  const pa = [1, 3, 5].map((i) => parseInt(a.slice(i, i + 2), 16))
  const pb = [1, 3, 5].map((i) => parseInt(b.slice(i, i + 2), 16))
  return `#${pa.map((v, i) => Math.round(v * k + pb[i] * (1 - k)).toString(16).padStart(2, '0')).join('')}`
}

function parseIsoDate(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d)
}

function toIsoToday(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** листы «для себя» в выбранном составе */
function ownPages(p: Pdf, r: ReportData) {
  const s = r.options.sections ?? ALL_SECTIONS
  summaryPage(p, r)
  if (s.clients) clientsPage(p, r)
  if (s.work) workPage(p, r)
  if (s.billing) billingPage(p, r)
  if (s.journal) journalPage(p, r)
}

export async function exportPdf(r: ReportData) {
  const p = new Pdf(r)
  ownPages(p, r)
  p.footers()
  p.doc.save(`Отчёт_${r.from}_${r.to}.pdf`)
}

/**
 * PDF для клиента по ссылке: только спринты и сумма к оплате — без обзора, разрезов
 * и журнала. r — снимок, приведённый к виду отчёта (snapshotAsReport).
 */
export function renderClientPdf(r: ReportData): jsPDF {
  const p = new Pdf(r)
  sprintsPage(p, r)
  billingPage(p, r)
  p.footers()
  return p.doc
}

/** Тот же документ без скачивания — для просмотра и проверки вёрстки. */
export function renderPdf(r: ReportData): jsPDF {
  const p = new Pdf(r)
  ownPages(p, r)
  p.footers()
  return p.doc
}
