import type { ReactNode } from 'react'

/** Знак Semternity: незамкнутое кольцо с одной движущейся точкой. */
export function Logo({ size = 22, color = 'var(--s-accent)' }: { size?: number; color?: string }) {
  const dot = Math.max(4, Math.round(size * 0.22))
  return (
    <span
      className="relative block shrink-0 rounded-full"
      style={{ width: size, height: size, border: `${size > 30 ? 2 : 1.5}px solid ${color}` }}
    >
      <span
        className="absolute rounded-full"
        style={{ width: dot, height: dot, top: -dot / 2, left: '50%', marginLeft: -dot / 2, background: color }}
      />
      <span
        className="absolute rounded-full"
        style={{ inset: size * 0.23, border: `1px solid rgba(232,163,61,.35)` }}
      />
    </span>
  )
}

/** Надзаголовок / метка группы: Mono, разрядка, капс. */
export function Overline({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <span
      className={`font-mono text-2xs font-medium uppercase tracking-[.16em] text-slate-500 ${className}`}
    >
      {children}
    </span>
  )
}

/** Микро-метка над полем. */
export function FieldLabel({ children }: { children: ReactNode }) {
  return (
    <span className="font-mono text-2xs uppercase tracking-[.12em] text-slate-500">{children}</span>
  )
}

interface ChipProps {
  active?: boolean
  onClick?: () => void
  children: ReactNode
  className?: string
}

/** Чип фильтра/группировки: активный — латунь, неактивный — графит с рамкой. */
export function Chip({ active = false, onClick, children, className = '' }: ChipProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`min-h-9 shrink-0 rounded-[9px] px-[13px] py-[9px] text-xs ${
        active
          ? 'bg-sky-600 font-medium text-[var(--s-on-accent)]'
          : 'border border-slate-700 bg-slate-800 text-[#8f8f98]'
      } ${className}`}
    >
      {children}
    </button>
  )
}

/**
 * Сегментированный переключатель для взаимоисключающего выбора. Отдельный вид от чипов:
 * чипы — это множественный фильтр, и раньше ряды «Разделы / Проекты / Все» и ряды фильтров
 * выглядели одинаково, хотя работают по-разному.
 */
export function Segmented<T extends string>({
  value,
  options,
  onChange,
  className = '',
}: {
  value: T
  options: { value: T; label: string }[]
  onChange: (value: T) => void
  className?: string
}) {
  return (
    <div
      className={`flex shrink-0 gap-0.5 rounded-[11px] p-0.5 ${className}`}
      style={{ background: 'var(--s-surface-2)', border: '1px solid var(--s-border)' }}
      role="tablist"
    >
      {options.map((o) => {
        const active = o.value === value
        return (
          <button
            key={o.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(o.value)}
            className="min-h-8 rounded-[9px] px-2.5 text-xs"
            style={{
              background: active ? 'var(--s-accent)' : 'transparent',
              color: active ? 'var(--s-on-accent)' : '#8f8f98',
              fontWeight: active ? 500 : 400,
            }}
          >
            {o.label}
          </button>
        )
      })}
    </div>
  )
}

export type TagTone = 'neutral' | 'accent' | 'success' | 'danger'

const TAG_TONE: Record<TagTone, string> = {
  neutral: 'bg-white/6 text-slate-400',
  accent: 'bg-[rgba(232,163,61,.14)] text-sky-600',
  success: 'bg-[rgba(127,184,148,.14)] text-emerald-400',
  danger: 'bg-[rgba(217,114,86,.12)] text-red-400',
}

/** Тег статуса: пользовательские статусы нейтральны, латунь и зелень зарезервированы. */
export function Tag({ tone = 'neutral', children }: { tone?: TagTone; children: ReactNode }) {
  return (
    <span className={`shrink-0 rounded-md px-2 py-[3px] text-2xs font-medium ${TAG_TONE[tone]}`}>
      {children}
    </span>
  )
}

/** Карточка-контейнер: рамка без тени — теней в системе только две. */
export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div className={`rounded-2xl border border-slate-700 bg-slate-800 ${className}`}>{children}</div>
  )
}

/** Переключатель-пилюля (например «скрыть готовые»). */
export function Switch({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label?: string }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!on)}
      className="flex shrink-0 items-center gap-[7px]"
      aria-pressed={on}
    >
      <span
        className="flex h-[18px] w-[30px] items-center rounded-full p-[2px]"
        style={{
          background: on ? 'var(--s-accent)' : 'var(--s-ring-track)',
          justifyContent: on ? 'flex-end' : 'flex-start',
        }}
      >
        <span className="h-[14px] w-[14px] rounded-full" style={{ background: 'var(--s-on-accent)' }} />
      </span>
      {label && <span className="whitespace-nowrap text-left text-2xs text-[#8f8f98]">{label}</span>}
    </button>
  )
}

/** Единый стиль поля ввода из макета. */
export const fieldClass =
  'h-10 w-full rounded-xl border border-slate-700 bg-slate-800 px-3 text-sm text-slate-100 focus:border-sky-600'

/** Заглушка-плейсхолдер на время первой загрузки — вместо пустого экрана. */
export function Skeleton({ className = '', rounded = '15px' }: { className?: string; rounded?: string }) {
  return (
    <span
      className={`skeleton block ${className}`}
      style={{ borderRadius: rounded, background: 'var(--s-surface)' }}
      aria-hidden
    />
  )
}

/** Строка-заглушка под карточку задачи (кольцо + две строки текста). */
export function TaskRowSkeleton() {
  return (
    <div
      className="flex items-center gap-3 rounded-[15px] px-[13px] py-[11px]"
      style={{ background: 'var(--s-surface)', border: '1px solid var(--s-border)' }}
    >
      <Skeleton className="h-8 w-8 shrink-0" rounded="999px" />
      <span className="flex min-w-0 flex-1 flex-col gap-1.5">
        <Skeleton className="h-[13px] w-3/5" rounded="6px" />
        <Skeleton className="h-[10px] w-2/5" rounded="6px" />
      </span>
    </div>
  )
}

/**
 * Пустое состояние: знак кольца вместо голого текста — экран не выглядит сломанным.
 */
export function EmptyState({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2.5 py-8 text-center">
      <span
        className="relative block h-9 w-9 rounded-full"
        style={{ border: '1.5px dashed var(--s-border-strong-2)' }}
      >
        <span
          className="absolute h-1.5 w-1.5 rounded-full"
          style={{
            top: -3,
            left: '50%',
            marginLeft: -3,
            background: 'var(--s-border-strong-2)',
          }}
        />
      </span>
      <p className="max-w-[260px] text-sm leading-[1.5] text-slate-600">{children}</p>
    </div>
  )
}
