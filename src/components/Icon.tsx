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
