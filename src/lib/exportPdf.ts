import { jsPDF } from 'jspdf'
import {
  PLEX_MONO_MEDIUM,
  PLEX_MONO_REGULAR,
  PLEX_SANS_REGULAR,
  PLEX_SANS_SEMIBOLD,
} from './pdfFont.generated'
import {
  dayMonth,
  f1,
  fh,
  formatStamp,
  hm,
  pct,
  pctLabel,
  type DayPoint,
  type ReportData,
  type WeekPoint,
} from './report'

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

const C = {
  ink: '#17171b',
  ink2: '#4c4c55',
  muted: '#6b6b74',
  faint: '#a2a2a9',
  rule: '#e6e4df',
  track: '#efede8',
  weekend: '#f6f4f0',
  brass: '#c98a2e',
  brassInk: '#8a5d17',
  brassSoft: '#ecd3a6',
  prev: '#b3afa6',
  terra: '#c1583f',
  terraInk: '#a8432c',
  green: '#4d8259',
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
    d.addFileToVFS('PlexSans-Regular.ttf', PLEX_SANS_REGULAR)
    d.addFont('PlexSans-Regular.ttf', 'sans', 'normal')
    d.addFileToVFS('PlexSans-SemiBold.ttf', PLEX_SANS_SEMIBOLD)
    d.addFont('PlexSans-SemiBold.ttf', 'sans', 'bold')
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

/* ── страница 1: обзор ───────────────────────────────────────────── */

function overview(p: Pdf, r: ReportData) {
  p.page(r.label, `сравнение — с ${r.prevWith}`)

  // главная цифра
  const big = f1(r.total)
  const y0 = p.y + 40
  p.text(big, MX, y0, { b: true, s: 50 })
  const bw = p.width(big, { b: true, s: 50 })
  p.text('ч', MX + bw + 4, y0, { s: 20, c: C.ink2 })
  const sx = MX + bw + 40
  let sy = y0 - 30
  if (r.target) {
    const share = pct(r.total, r.target.hours)
    const diff = r.total - r.target.hours
    const line = `${share}% ${r.target.label} ${fh(r.target.hours)} ч — ${diff >= 0 ? `на ${f1(diff)} ч больше` : `не хватает ${f1(-diff)} ч`}`
    p.text(line, sx, sy, { s: 9.5, c: C.ink2 })
    sy += 7
    // шкала цели: латунь — выполненная цель, светлая латунь — сверх неё
    const mw = 172
    const ratio = r.target.hours > 0 ? r.total / r.target.hours : 0
    p.rect(sx, sy, mw, 4.5, C.track)
    if (ratio <= 1) p.rect(sx, sy, mw * Math.max(0, ratio), 4.5, C.brass)
    else {
      const cut = mw / ratio
      p.rect(sx, sy, cut, 4.5, C.brass)
      p.rect(sx + cut, sy, mw - cut, 4.5, C.brassSoft)
    }
    sy += 16
  }
  if (r.prevTotal > 0) {
    const d = r.total - r.prevTotal
    p.text(
      `${d >= 0 ? '+' : '−'}${f1(Math.abs(d))} ч к ${r.prevDative} (${f1(r.prevTotal)} ч)${r.prevIncompleteSince ? ' *' : ''}`,
      sx,
      sy,
      { s: 9.5, c: C.ink2 },
    )
  }
  p.y = y0 + 14
  p.rule(p.y)

  const avg = r.avgPerWeekday
  p.tiles([
    {
      label: 'В будний день',
      value: avg === null ? '—' : f1(avg),
      unit: avg === null ? '' : 'ч',
      sub: r.dayNorm ? `в среднем · норма ${fh(r.dayNorm)} ч` : 'в среднем',
    },
    {
      label: 'Закрыто',
      value: String(r.closedCount),
      // «из 1 задачи», «из 21 задачи», но «из 5 задач»
      sub: `из ${r.inWorkCount} ${r.inWorkCount % 10 === 1 && r.inWorkCount % 100 !== 11 ? 'задачи' : 'задач'} в работе`,
    },
    {
      label: 'Сверх плана',
      value: f1(r.overHours),
      unit: 'ч',
      sub: r.overCount ? `в ${r.overCount} ${r.overCount === 1 ? 'спринте' : 'спринтах'}` : 'всё в плане',
      bad: r.overHours > 0.05,
    },
    {
      label: 'Без плана',
      value: f1(r.unplannedHours),
      unit: 'ч',
      sub: `${pctLabel(r.unplannedHours, r.total)} времени`,
    },
  ])

  // главное
  if (r.insights.length) {
    p.y += 20
    p.blockHead('Главное')
    p.y += 3
    for (const s of r.insights) {
      p.doc.setFillColor(C.brass)
      p.doc.circle(MX + 2.5, p.y - 3, 2.1, 'F')
      p.y += p.para(s, MX + 11, p.y, CW - 11, { s: 9.2 }) + 2.5
    }
  }

  // ритм: по дням, если их не слишком много, иначе только недели
  const showDays = r.days.length <= 62
  if (showDays) {
    p.y += 14
    const legend: LegendItem[] = [{ kind: 'bar', text: 'часы за день' }]
    if (r.dayNorm) legend.push({ kind: 'brassNorm', text: `норма ${fh(r.dayNorm)} ч` })
    if (r.days.some((d) => d.hours < -0.004)) legend.push({ kind: 'terra', text: 'день в минусе' })
    if (r.days.some((d) => d.weekend)) legend.push({ kind: 'weekend', text: 'выходные' })
    p.blockHead('По дням', legend)
    dailyChart(p, r.days, r.dayNorm, MX, p.y + 4, CW, 150)
    p.y += 4 + 150 + 26
    const negatives = r.days.filter((d) => d.hours < -0.004)
    if (negatives.length) {
      const n = negatives.length
      const s = `${n === 1 ? 'Один день ушёл' : `${n} ${n < 5 ? 'дня ушли' : 'дней ушли'}`} в минус: правки записаны не в тот день, к которому относятся. Итог периода это не меняет, а картину по дням искажает.`
      p.y += p.para(s, MX, p.y, CW, { s: 7.8, c: C.muted }) + 2
    }
  }

  // недели и направления
  p.y += 12
  const colW = (CW - 24) / 2
  const top = p.y
  if (!showDays || r.weeks.length > 1) {
    p.text('По неделям', MX, top, { b: true, s: 10 })
    if (r.dayNorm) {
      p.swatch('norm', MX + colW - 62, top - 3)
      p.text('норма недели', MX + colW, top, { f: 'mono', s: 7, c: C.ink2, a: 'right' })
    }
    weeklyChart(p, r.weeks, MX, top + 22, colW, 128)
  }
  const dx = MX + colW + 24
  p.text('По направлениям', dx, top, { b: true, s: 10 })
  if (r.prevTotal > 0) p.legend([{ kind: 'bar', text: shortName(r.curName) }, { kind: 'prev', text: shortName(r.prevName) }], top)
  const dirs = r.directions.slice(0, 5)
  const max = Math.max(...dirs.map((d) => Math.max(d.hours, d.prevHours)), 1)
  let ry = top + 16
  for (const d of dirs) {
    p.text(d.name, dx, ry + 6, { s: 8.6, w: 96 })
    p.text(
      r.prevTotal > 0 ? `${pctLabel(d.hours, r.total)} · было ${pctLabel(d.prevHours, r.prevTotal)}` : pctLabel(d.hours, r.total),
      dx,
      ry + 15,
      { f: 'mono', s: 6.6, c: C.muted },
    )
    p.barWithPrev(dx + 102, ry + 8, colW - 140, d.hours, d.prevHours, max)
    p.text(f1(d.hours), PW - MX, ry + 10, { f: 'mono', s: 8.3, a: 'right' })
    p.rule(ry + 20, dx, PW - MX, C.track)
    ry += 30
  }
  if (r.directions.length > dirs.length) {
    p.text(`и ещё ${r.directions.length - dirs.length} — на следующей странице`, dx, ry + 6, { s: 7.6, c: C.muted })
  }
  p.y = Math.max(top + 182, ry + 10)

  if (r.prevIncompleteSince) {
    p.text(
      `* Учёт ведётся с ${dayMonth(r.prevIncompleteSince)} — ${r.prevName} учтён не целиком, рост к нему завышен.`,
      MX,
      Math.min(p.y + 6, BOTTOM),
      { s: 7.6, c: C.muted },
    )
  }
}

/** «сентябрь» → «сен»; «этот период» и «прошлый период» — как есть */
function shortName(name: string): string {
  return name.includes(' ') ? name : name.slice(0, 3)
}

/** «хорошие» деления оси: 1, 2, 5, 10… — не больше пяти */
function niceStep(max: number): number {
  const raw = max / 4
  const mag = 10 ** Math.floor(Math.log10(raw || 1))
  for (const k of [1, 2, 2.5, 5, 10]) if (raw <= k * mag) return k * mag
  return 10 * mag
}

function dailyChart(p: Pdf, days: DayPoint[], norm: number | null, x0: number, y0: number, w: number, h: number) {
  const gx = 18
  const values = days.map((d) => d.hours)
  const maxV = Math.max(...values, norm ? norm * 1.3 : 1, 1)
  const minV = Math.min(...values, 0)
  const lo = minV < 0 ? minV * 1.18 : 0
  const hi = maxV * 1.08
  const y = (v: number) => y0 + ((hi - v) / (hi - lo)) * h
  const slot = (w - gx) / days.length
  const bw = Math.min(10, slot * 0.6)

  days.forEach((d, i) => {
    if (d.weekend) p.rect(x0 + gx + i * slot, y0, slot, h, C.weekend)
  })
  const step = niceStep(hi)
  for (let t = step; t <= hi; t += step) {
    p.line(x0 + gx, y(t), x0 + w, y(t), C.track)
    p.text(fh(t), x0 + gx - 4, y(t) + 2.2, { f: 'mono', s: 6.6, c: C.muted, a: 'right' })
  }
  p.text('0', x0 + gx - 4, y(0) + 2.2, { f: 'mono', s: 6.6, c: C.muted, a: 'right' })

  const maxIdx = values.indexOf(Math.max(...values))
  const labelEvery = Math.ceil(days.length / 31)
  days.forEach((d, i) => {
    const bx = x0 + gx + i * slot + (slot - bw) / 2
    p.vbar(bx, y(0), y(d.hours), bw, d.hours < 0 ? C.terra : C.brass, 2.2)
    if (i % labelEvery === 0) {
      p.text(String(d.day), x0 + gx + i * slot + slot / 2, y0 + h + 11, {
        f: 'mono',
        s: 6.6,
        c: d.weekend ? C.faint : C.ink2,
        a: 'center',
      })
    }
    if (d.hours < -0.004) p.text(f1(d.hours), bx + bw / 2, y(d.hours) + 8, { f: 'mono', s: 6.6, c: C.terraInk, a: 'center' })
    if (i === maxIdx && d.hours > 0) p.text(f1(d.hours), bx + bw / 2, y(d.hours) - 3, { f: 'mono', s: 6.6, a: 'center' })
  })
  p.line(x0 + gx, y(0), x0 + w, y(0), C.ink2)
  if (norm) {
    p.line(x0 + gx, y(norm), x0 + w, y(norm), C.brassInk)
    p.text(fh(norm), x0 + gx - 4, y(norm) + 2.2, { f: 'mono', s: 6.6, c: C.brassInk, a: 'right' })
  }
}

function weeklyChart(p: Pdf, weeks: WeekPoint[], x0: number, y0: number, w: number, h: number) {
  const hi = Math.max(...weeks.map((wk) => Math.max(wk.hours, wk.norm ?? 0)), 1) * 1.15
  const lo = Math.min(0, ...weeks.map((wk) => wk.hours))
  const y = (v: number) => y0 + ((hi - v) / (hi - lo)) * h
  const slot = w / weeks.length
  const bw = Math.min(18, slot * 0.5)
  weeks.forEach((wk, i) => {
    const cx = x0 + i * slot + slot / 2
    p.vbar(cx - bw / 2, y(0), y(wk.hours), bw, wk.hours < 0 ? C.terra : C.brass, 3)
    if (wk.norm) p.line(cx - bw / 2 - 5, y(wk.norm), cx + bw / 2 + 5, y(wk.norm), C.ink, 1.5)
    p.text(f1(wk.hours), cx, Math.min(y(wk.hours), wk.norm ? y(wk.norm) : Infinity) - 4, { f: 'mono', s: 7.4, a: 'center' })
    const lbl = slot >= 48 ? wk.label : wk.label.split(/[–\s]/)[0]
    p.text(lbl, cx, y0 + h + 11, { f: 'mono', s: 6.6, c: C.ink2, a: 'center' })
    if (wk.norm !== null && slot >= 40) {
      p.text(`норма ${fh(wk.norm)}`, cx, y0 + h + 20, { f: 'mono', s: 6.4, c: C.muted, a: 'center' })
    }
  })
  p.line(x0, y(0), x0 + w, y(0), C.ink2)
}

/* ── страница 2: направления и проекты ───────────────────────────── */

function directionsPage(p: Pdf, r: ReportData) {
  const prev = r.prevName === 'прошлый период' ? 'прошлый' : r.prevName
  p.page('Направления и проекты')
  p.legend([{ kind: 'bar', text: r.curName }, { kind: 'prev', text: r.prevName }], p.y - 18)

  // таблица направлений
  const max = Math.max(...r.directions.map((d) => Math.max(d.hours, d.prevHours)), 1)
  const cols = { name: MX, bar: MX + 116, barW: 150, h: MX + 316, share: MX + 350, prev: MX + 420, d: MX + 466, n: PW - MX }
  p.rule(p.y + 4)
  for (const [t, x, a] of [['направление', cols.name, 'left'], ['часы', cols.h, 'right'], ['доля', cols.share, 'right'], [prev, cols.prev, 'right'], ['разница', cols.d, 'right'], ['проектов', cols.n, 'right']] as const) {
    p.text(t.toUpperCase(), x, p.y, { f: 'mono', s: 6.4, c: C.muted, a })
  }
  p.y += 4
  for (const d of r.directions) {
    p.ensure(26)
    const cy = p.y + 13
    p.text(d.name, cols.name, cy + 3, { s: 9, b: true, w: 110 })
    p.barWithPrev(cols.bar, cy, cols.barW, d.hours, d.prevHours, max, 7.5)
    p.text(f1(d.hours), cols.h, cy + 3, { f: 'mono', s: 8.4, a: 'right' })
    p.text(pctLabel(d.hours, r.total), cols.share, cy + 3, { f: 'mono', s: 8, c: C.muted, a: 'right' })
    p.text(`${f1(d.prevHours)} · ${pctLabel(d.prevHours, r.prevTotal)}`, cols.prev, cy + 3, { f: 'mono', s: 8, c: C.muted, a: 'right' })
    const dl = p.delta(d.hours, d.prevHours)
    p.text(dl.s, cols.d, cy + 3, { f: 'mono', s: 8, c: dl.c, a: 'right' })
    p.text(String(d.projectCount), cols.n, cy + 3, { f: 'mono', s: 8, c: C.muted, a: 'right' })
    p.y += 26
    p.rule(p.y, MX, PW - MX, C.track)
  }

  // проекты внутри направлений
  p.y += 26
  p.ensure(60)
  p.text('Проекты внутри направлений', MX, p.y, { b: true, s: 10 })
  p.labelRight('шкала общая для всех строк', PW - MX, p.y)
  p.y += 10
  const pmax = Math.max(...r.groups.flatMap((g) => g.rows.map((row) => Math.max(row.hours, row.prevHours))), 1)
  const pc = { name: MX + 9, bar: MX + 124, barW: 196, h: MX + 360, share: MX + 394, prev: MX + 446, d: PW - MX }
  p.rule(p.y + 4)
  for (const [t, x, a] of [['проект', MX, 'left'], ['часы', pc.h, 'right'], ['доля', pc.share, 'right'], [prev, pc.prev, 'right'], ['разница', pc.d, 'right']] as const) {
    p.text(t.toUpperCase(), x, p.y, { f: 'mono', s: 6.4, c: C.muted, a })
  }
  p.y += 6
  for (const g of r.groups) {
    const noteH = g.note ? p.paraHeight(g.note, CW, { s: 7.8 }) + 6 : 0
    p.ensure(24 + Math.min(g.rows.length, 2) * 20 + noteH)
    p.y += 14
    p.text(g.name, MX, p.y, { b: true, s: 9.4 })
    p.text(f1(g.hours), pc.h, p.y, { f: 'mono', b: true, s: 8.6, a: 'right' })
    p.text(pctLabel(g.hours, r.total), pc.share, p.y, { f: 'mono', s: 8, c: C.muted, a: 'right' })
    p.y += 5
    p.rule(p.y)
    for (const row of g.rows) {
      p.ensure(20)
      const cy = p.y + 10
      const dropped = row.hours <= 0.004
      p.text(row.name, pc.name, cy + 3, { s: 8.6, c: dropped ? C.muted : C.ink, w: 108 })
      p.barWithPrev(pc.bar, cy, pc.barW, row.hours, row.prevHours, pmax, 5.5)
      p.text(dropped ? '—' : f1(row.hours), pc.h, cy + 3, { f: 'mono', s: 8.2, a: 'right' })
      p.text(dropped ? '' : pctLabel(row.hours, r.total), pc.share, cy + 3, { f: 'mono', s: 7.8, c: C.muted, a: 'right' })
      p.text(row.prevHours > 0.004 ? f1(row.prevHours) : '—', pc.prev, cy + 3, { f: 'mono', s: 7.8, c: C.muted, a: 'right' })
      const dl = p.delta(row.hours, row.prevHours)
      p.text(dl.s, pc.d, cy + 3, { f: 'mono', s: 7.8, c: dl.c, a: 'right' })
      p.y += 20
      p.rule(p.y, MX, PW - MX, C.track)
    }
    if (g.note) {
      // вывод под направлением: первая строка на 10 пт ниже последней строки проектов
      const step = 7.8 * 1.45
      p.y += 10 + p.para(g.note, MX, p.y + 10, CW, { s: 7.8, c: C.muted }) - step + 8
    }
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
      // название и проект в одной строке: проект серым, если влезает
      const nameW = p.width(s.name, { s: 8.2 })
      p.text(s.name, cols.name, cy + 3, { s: 8.2, w: 146 })
      if (nameW < 120) p.text(`· ${s.project}`, cols.name + nameW + 3, cy + 3, { s: 7.6, c: C.muted, w: 146 - nameW - 3 })

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

/* ── страница 4: как набраны часы, проверка и журнал ─────────────── */

function journalPage(p: Pdf, r: ReportData) {
  const c = r.composition
  p.page('Как набраны часы', `${c.sessions} сессий таймера · ${c.manualCount} ручных правок`)

  // водопад: таймер → добавлено → убрано → итог
  const colW = (CW - 24) / 2
  const x0 = MX
  const y0 = p.y + 14
  const h = 104
  const steps = [
    { name: 'таймер', a: 0, b: c.timer, color: C.brass, v: f1(c.timer) },
    { name: 'добавлено', a: c.timer, b: c.timer + c.added, color: C.brassSoft, v: `+${f1(c.added)}` },
    { name: 'убрано', a: c.timer + c.added, b: c.timer + c.added + c.removed, color: C.terra, v: f1(c.removed) },
    { name: 'итог', a: 0, b: r.total, color: C.ink, v: f1(r.total) },
  ]
  const hi = Math.max(...steps.map((s) => Math.max(s.a, s.b)), 1) * 1.12
  const y = (v: number) => y0 + ((hi - v) / hi) * h
  const slot = colW / steps.length
  const bw = 26
  steps.forEach((s, i) => {
    const cx = x0 + i * slot + slot / 2
    const top = y(Math.max(s.a, s.b))
    const bottom = y(Math.min(s.a, s.b))
    p.rect(cx - bw / 2, top, bw, Math.max(0.5, bottom - top), s.color)
    p.text(s.v, cx, top - 4, { f: 'mono', s: 7.6, c: s.color === C.terra ? C.terraInk : C.ink, a: 'center' })
    p.text(s.name, cx, y0 + h + 11, { f: 'mono', s: 7, c: C.ink2, a: 'center' })
    if (i < 3) p.line(cx + bw / 2, y(s.b), cx + slot - bw / 2, y(s.b), C.faint, 0.5)
  })
  p.line(x0, y(0), x0 + colW, y(0), C.ink2)
  const confirmed = pct(c.timer, r.total)
  p.para(
    `Таймер дал ${f1(c.timer)} ч. Правками добавлено ${f1(c.added)} ч и убрано ${f1(-c.removed)} ч. Итог — ${f1(r.total)} ч${r.total > 0 ? `, из них ${Math.min(100, confirmed)}% подтверждено таймером` : ''}.`,
    x0,
    y0 + h + 26,
    colW,
    { s: 7.8, c: C.muted },
  )

  // справа — нейтральные факты учёта
  const fx = MX + colW + 24
  let fy = p.y + 4
  const facts: [string, string][] = [
    ['Дней с записями', String(r.daysWithEntries)],
    ['Сессий таймера', String(c.sessions)],
    ['Средняя сессия', c.sessions ? hm(c.timer / c.sessions) : '—'],
    ['Ручных правок', String(c.manualCount)],
    ['Подтверждено таймером', r.total > 0 ? `${Math.min(100, confirmed)}%` : '—'],
  ]
  for (const [k, v] of facts) {
    fy += 22
    p.text(k, fx, fy, { s: 8.8, c: C.ink2 })
    p.text(v, PW - MX, fy, { f: 'mono', s: 9, a: 'right' })
    p.rule(fy + 7, fx, PW - MX, C.track)
  }
  p.y = Math.max(y0 + h + 70, fy + 24)

  // что проверить — только если попросили при выгрузке
  if (r.checks) {
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
      items.push({
        title: 'Будни без единой записи',
        lines: [r.checks.emptyWeekdays.map((d) => dayMonth(d)).join(', ')],
      })
    }
    p.ensure(40)
    p.text('Что проверить', MX, p.y, { b: true, s: 10 })
    p.y += 14
    if (!items.length) {
      p.text('Ничего подозрительного: ночных сессий, дней в минусе и пустых будней нет.', MX, p.y, { s: 8.6, c: C.muted })
      p.y += 16
    }
    items.forEach((it, i) => {
      const detail = it.lines.join('\n')
      const dh = p.paraHeight(detail, CW - 20, { s: 7.8 })
      p.ensure(14 + dh)
      p.doc.setDrawColor(C.terra)
      p.doc.setLineWidth(1)
      p.doc.circle(MX + 5, p.y - 3, 5, 'S')
      p.text(String(i + 1), MX + 5, p.y - 0.6, { f: 'mono', s: 6.4, c: C.terraInk, a: 'center' })
      p.text(it.title, MX + 18, p.y, { s: 8.8 })
      p.y += 11
      p.y += p.para(detail, MX + 18, p.y, CW - 20, { s: 7.8, c: C.muted }) + 6
    })
    p.y += 8
  }

  // журнал
  p.ensure(60)
  p.y += 10
  p.text('Журнал по дням', MX, p.y, { b: true, s: 10 })
  p.labelRight('задача за день — одной строкой, правки уже внутри', PW - MX, p.y)
  p.section('Журнал по дням')
  p.y += 6
  const dayHead = (label: string, total: string) => {
    p.rule(p.y + 4)
    p.y += 16
    p.text(label, MX, p.y, { b: true, s: 9 })
    p.text(total, PW - MX, p.y, { f: 'mono', b: true, s: 8.6, a: 'right' })
    p.y += 4
  }
  for (const day of r.journal) {
    p.ensure(36)
    dayHead(day.label, hm(day.total))
    for (const row of day.rows) {
      const notes = row.comments.length ? `«${row.comments.join(' · ')}»` : ''
      const nh = notes ? p.paraHeight(notes, CW - 12, { s: 7.4 }, 1.35) : 0
      // день переехал на новый лист — повторяем его заголовок, иначе строки ничьи
      const pageBefore = p.doc.getNumberOfPages()
      p.ensure(13 + nh)
      if (p.doc.getNumberOfPages() !== pageBefore) dayHead(`${day.label} — продолжение`, '')
      p.y += 12
      p.text(row.title, MX, p.y, { s: 8.3, w: CW - 170 })
      p.text(row.project, PW - MX - 150, p.y, { s: 7.8, c: C.muted, w: 90 })
      p.text(row.hours === 0 ? '—' : hm(row.hours), PW - MX, p.y, { f: 'mono', s: 8.2, c: row.hours < 0 ? C.terraInk : C.ink, a: 'right' })
      if (notes) {
        const step = 7.4 * 1.35
        p.y += 10 + p.para(notes, MX + 12, p.y + 10, CW - 12, { s: 7.4, c: C.muted }, 1.35) - step
      }
    }
    p.y += 6
  }
  if (!r.journal.length) {
    p.y += 16
    p.text('В этом периоде записей нет.', MX, p.y, { s: 9, c: C.muted })
  }
}

export async function exportPdf(r: ReportData) {
  const p = new Pdf(r)
  overview(p, r)
  directionsPage(p, r)
  sprintsPage(p, r)
  journalPage(p, r)
  p.footers()
  p.doc.save(`Отчёт_${r.from}_${r.to}.pdf`)
}

/** Тот же документ без скачивания — для просмотра и проверки вёрстки. */
export function renderPdf(r: ReportData): jsPDF {
  const p = new Pdf(r)
  overview(p, r)
  directionsPage(p, r)
  sprintsPage(p, r)
  journalPage(p, r)
  p.footers()
  return p.doc
}
