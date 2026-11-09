import { revealFrom } from '../lib/screenMotion'
import { Link } from 'react-router-dom'
import { useProfile } from '../lib/profile'
import { useProfileAttention } from '../lib/profileAttention'
import { Settings2 } from './Icon'

/** Фото профиля или первая буква имени — в круге. */
export function Avatar({ size = 36, className = '' }: { size?: number; className?: string }) {
  const profile = useProfile()
  return (
    <span
      className={`flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-accent-soft font-semibold text-accent-text ${className}`}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.42) }}
      aria-hidden
    >
      {profile.avatarUrl ? <img src={profile.avatarUrl} alt="" className="h-full w-full object-cover" /> : profile.initial}
    </span>
  )
}

/** Точка «в профиле новое» — в углу аватара, с обводкой цветом фона */
export function AttentionDot({ size = 10 }: { size?: number }) {
  return (
    <span
      className="absolute -top-0.5 -right-0.5 rounded-full border-2 border-surface bg-accent"
      style={{ width: size, height: size }}
      aria-hidden
    />
  )
}

/**
 * Кружок профиля справа вверху главных экранов — вход в бывшее «Ещё»: аккаунт, структура,
 * методика, интеграции. На десктопе профиль внизу боковой панели, кружок не нужен.
 * 0.65.2: шестерёнка в углу — видно, что здесь настройки; точка — внутри есть новое.
 */
export function ProfileButton({ className = '' }: { className?: string }) {
  const profile = useProfile()
  const attention = useProfileAttention()
  return (
    <Link
      to="/settings"
      data-tip="profile"
      aria-label={`Профиль и настройки: ${profile.name}${attention ? `. ${attention}` : ''}`}
      // профиль раскрывается кругом из аватара, а не въезжает справа (0.60)
      onClick={(e) => revealFrom(e.currentTarget)}
      className={`avatar-btn hit-44 relative shrink-0 rounded-full lg:hidden ${className}`}
    >
      <Avatar size={36} />
      <span
        className="absolute -right-1 -bottom-1 flex h-4.5 w-4.5 items-center justify-center rounded-full border border-border bg-surface text-text-secondary"
        aria-hidden
      >
        <Settings2 size={11} />
      </span>
      {attention && <AttentionDot />}
    </Link>
  )
}
