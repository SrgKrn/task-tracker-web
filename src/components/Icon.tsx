/**
 * Векторные иконки вместо юникод-глифов (⇅ → ▲ ▼ ✕ ‹ › ▾ ↑ ✓). Глифы брались из
 * системного шрифта: их начертание, вес и положение по базовой линии менялись от
 * платформы к платформе и не подчинялись токенам. Один набор, одна толщина линии 1.5,
 * один размер по умолчанию 16 — иконки наконец выглядят как из одной семьи.
 */
interface IconProps {
  size?: number
  className?: string
}

function svg(path: React.ReactNode, { size = 16, className = '' }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`shrink-0 ${className}`}
      aria-hidden="true"
      focusable="false"
    >
      {path}
    </svg>
  )
}

export const ArrowLeft = (p: IconProps) => svg(<><path d="M19 12H5" /><path d="m12 19-7-7 7-7" /></>, p)
export const ArrowRight = (p: IconProps) => svg(<><path d="M5 12h14" /><path d="m12 5 7 7-7 7" /></>, p)
export const ArrowUp = (p: IconProps) => svg(<><path d="M12 19V5" /><path d="m5 12 7-7 7 7" /></>, p)
export const ChevronLeft = (p: IconProps) => svg(<path d="m15 18-6-6 6-6" />, p)
export const ChevronRight = (p: IconProps) => svg(<path d="m9 18 6-6-6-6" />, p)
export const ChevronDown = (p: IconProps) => svg(<path d="m6 9 6 6 6-6" />, p)
export const ChevronUp = (p: IconProps) => svg(<path d="m18 15-6-6-6 6" />, p)
export const Check = (p: IconProps) => svg(<path d="M20 6 9 17l-5-5" />, p)
export const Close = (p: IconProps) => svg(<><path d="M18 6 6 18" /><path d="m6 6 12 12" /></>, p)
export const Plus = (p: IconProps) => svg(<><path d="M12 5v14" /><path d="M5 12h14" /></>, p)
export const Minus = (p: IconProps) => svg(<path d="M5 12h14" />, p)
export const Search = (p: IconProps) =>
  svg(<><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></>, p)
/** сортировка: две встречные стрелки */
export const SortArrows = (p: IconProps) =>
  svg(<><path d="M8 4v16" /><path d="m4 8 4-4 4 4" /><path d="M16 20V4" /><path d="m12 16 4 4 4-4" /></>, p)
export const Eye = (p: IconProps) =>
  svg(<><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7Z" /><circle cx="12" cy="12" r="3" /></>, p)
export const EyeOff = (p: IconProps) =>
  svg(
    <>
      <path d="M10.7 6.2A9.9 9.9 0 0 1 12 6c6.4 0 10 6 10 6a17 17 0 0 1-2.8 3.5" />
      <path d="M6.6 6.9A16.6 16.6 0 0 0 2 12s3.6 6 10 6a9.7 9.7 0 0 0 4.2-.9" />
      <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" />
      <path d="m3 3 18 18" />
    </>,
    p,
  )
export const Paperclip = (p: IconProps) =>
  svg(<path d="m21.4 11.1-9.2 9.2a6 6 0 0 1-8.5-8.5l8.6-8.6a4 4 0 0 1 5.7 5.7l-8.6 8.6a2 2 0 0 1-2.8-2.8l8.5-8.5" />, p)
export const Bell = (p: IconProps) =>
  svg(<><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" /><path d="M10.3 21a1.9 1.9 0 0 0 3.4 0" /></>, p)
export const Send = (p: IconProps) =>
  svg(<><path d="M21.5 3.5 2.8 10.7c-.8.3-.8 1.4 0 1.7l4.7 1.6 1.8 5.6c.2.7 1.1.9 1.6.4l2.7-2.6 4.9 3.6c.6.4 1.4.1 1.6-.6l3-15.4c.2-.9-.7-1.6-1.6-1.3Z" /><path d="m7.5 14 9.5-6.5" /></>, p)
export const Comment = (p: IconProps) =>
  svg(<path d="M21 12a8 8 0 0 1-11.6 7.1L4 20.5l1.4-4.6A8 8 0 1 1 21 12Z" />, p)
export const Sparkle = (p: IconProps) =>
  svg(<><path d="M12 3v4M12 17v4M3 12h4M17 12h4" /><path d="m6.3 6.3 2.1 2.1M15.6 15.6l2.1 2.1M6.3 17.7l2.1-2.1M15.6 8.4l2.1-2.1" /></>, p)
export const MoreDots = (p: IconProps) =>
  svg(<><circle cx="5" cy="12" r="1.3" /><circle cx="12" cy="12" r="1.3" /><circle cx="19" cy="12" r="1.3" /></>, p)
export const Download = (p: IconProps) =>
  svg(<><path d="M12 4v11" /><path d="m7 10 5 5 5-5" /><path d="M5 20h14" /></>, p)
export const Calendar = (p: IconProps) =>
  svg(<><rect x="3.5" y="5" width="17" height="15" rx="2.5" /><path d="M3.5 10h17" /><path d="M8 3v4M16 3v4" /></>, p)
export const Drive = (p: IconProps) =>
  svg(<><path d="m8.5 4-6 10.5L5.5 20h13l3-5.5-6-10.5Z" /><path d="m8.5 4 6.5 11h6.5" /><path d="M2.5 14.5h13L12 20" /></>, p)

/* ── вкладки навигации: те же формы, что были собраны из span, но векторами ── */

/** «Сегодня» — кольцо дня с отметкой начала сверху */
export const TabToday = (p: IconProps) =>
  svg(<><circle cx="12" cy="13" r="8" strokeWidth={2.25} /><circle cx="12" cy="4.5" r="1.6" fill="currentColor" stroke="none" /></>, p)
/** «Задачи» — две полные строки и короткая */
export const TabTasks = (p: IconProps) =>
  svg(<><path d="M4 7h16" strokeWidth={2.25} /><path d="M4 12h16" strokeWidth={2.25} /><path d="M4 17h9" strokeWidth={2.25} /></>, p)
/** «Сводка» — три столбика разной высоты */
export const TabSummary = (p: IconProps) =>
  svg(
    <>
      <rect x="3.5" y="12" width="4.5" height="8.5" rx="1" fill="currentColor" stroke="none" />
      <rect x="9.75" y="4.5" width="4.5" height="16" rx="1" fill="currentColor" stroke="none" />
      <rect x="16" y="8.5" width="4.5" height="12" rx="1" fill="currentColor" stroke="none" />
    </>,
    p,
  )
/** «Ещё» — три точки */
export const TabMore = (p: IconProps) =>
  svg(
    <>
      <circle cx="6" cy="12" r="1.75" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12" r="1.75" fill="currentColor" stroke="none" />
      <circle cx="18" cy="12" r="1.75" fill="currentColor" stroke="none" />
    </>,
    p,
  )

/** «Фокус» — таймер: циферблат со стрелкой и кнопкой сверху */
export const TabFocus = (p: IconProps) =>
  svg(
    <>
      <circle cx="12" cy="13.5" r="7.5" strokeWidth={2.25} />
      <path d="M12 13.5V9.5" strokeWidth={2.25} />
      <path d="M9.5 3h5" strokeWidth={2.25} />
    </>,
    p,
  )
export const Pause = (p: IconProps) =>
  svg(<><rect x="6" y="5" width="4" height="14" rx="1" fill="currentColor" stroke="none" /><rect x="14" y="5" width="4" height="14" rx="1" fill="currentColor" stroke="none" /></>, p)
export const SkipForward = (p: IconProps) =>
  svg(<><path d="M5 5v14l10-7z" fill="currentColor" stroke="none" /><path d="M18 5v14" strokeWidth={2.5} /></>, p)
export const Square = (p: IconProps) => svg(<rect x="6" y="6" width="12" height="12" rx="2" fill="currentColor" stroke="none" />, p)
export const Camera = (p: IconProps) =>
  svg(<><path d="M4 8h3l2-2.5h6L17 8h3v11H4z" /><circle cx="12" cy="13" r="3.2" /></>, p)
export const Settings2 = (p: IconProps) =>
  svg(<><path d="M4 7h10M18 7h2M4 17h4M12 17h8" /><circle cx="16" cy="7" r="2" /><circle cx="10" cy="17" r="2" /></>, p)

/** «входит в» — строка спринта над подзадачей */
export const CornerDownRight = (p: IconProps) =>
  svg(<><path d="m15 10 5 5-5 5" /><path d="M4 4v7a4 4 0 0 0 4 4h12" /></>, p)
export const PanelLeft = (p: IconProps) => svg(<><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M9 4v16" /></>, p)
export const LogOut = (p: IconProps) => svg(<><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><path d="m16 17 5-5-5-5" /><path d="M21 12H9" /></>, p)
export const Play = (p: IconProps) => svg(<path d="M7 5v14l11-7z" />, p)
export const Keyboard = (p: IconProps) => svg(<><rect x="2" y="6" width="20" height="12" rx="2" /><path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M7 14h10" /></>, p)
/** хронология: часы со стрелкой назад */
export const History = (p: IconProps) =>
  svg(<><path d="M3 12a9 9 0 1 0 3-6.7" /><path d="M3 4v4h4" /><path d="M12 7v5l3 2" /></>, p)
/** мозаика: квадрат из пятен разной площади */
export const Mosaic = (p: IconProps) =>
  svg(<><rect x="3" y="3" width="10" height="11" rx="1.5" /><rect x="15" y="3" width="6" height="6" rx="1.5" /><rect x="15" y="11" width="6" height="10" rx="1.5" /><rect x="3" y="16" width="10" height="5" rx="1.5" /></>, p)
export const Pencil = (p: IconProps) =>
  svg(<><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" /></>, p)
export const Flag = (p: IconProps) => svg(<path d="M5 21V4h11l-2 4 2 4H5" />, p)

/* ── пресеты первого запуска ── */
export const Briefcase = (p: IconProps) =>
  svg(<><rect x="3" y="7" width="18" height="13" rx="2" /><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M3 12h18" /></>, p)
export const Users = (p: IconProps) =>
  svg(<><circle cx="9" cy="8" r="3.2" /><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6" /><circle cx="17" cy="9" r="2.5" /><path d="M17 14c2.3 0 4 1.9 4 4.5" /></>, p)
export const Book = (p: IconProps) =>
  svg(<><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15H6.5A2.5 2.5 0 0 0 4 20.5z" /><path d="M4 20.5A2.5 2.5 0 0 0 6.5 23H20" /></>, p)
export const Home = (p: IconProps) => svg(<path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z" />, p)
export const Rocket = (p: IconProps) =>
  svg(<><path d="M12 3c3.5 2 5.5 5.5 5.5 9.5L15 16H9l-2.5-3.5C6.5 8.5 8.5 5 12 3z" /><circle cx="12" cy="10" r="1.8" /><path d="M9 16l-2 5 3-1.5M15 16l2 5-3-1.5" /></>, p)
export const Dumbbell = (p: IconProps) => svg(<path d="M6.5 7v10M3.5 9.5v5M17.5 7v10M20.5 9.5v5M6.5 12h11" />, p)
export const Star = (p: IconProps & { filled?: boolean }) =>
  svg(
    <path
      d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z"
      fill={p.filled ? 'currentColor' : 'none'}
    />,
    p,
  )
export const Shield = (p: IconProps) => svg(<path d="M12 3 5 6v5c0 4.5 3 8.3 7 10 4-1.7 7-5.5 7-10V6z" />, p)
