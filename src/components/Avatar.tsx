import { Link } from 'react-router-dom'
import { useProfile } from '../lib/profile'

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

/**
 * Кружок профиля справа вверху главных экранов — вход в бывшее «Ещё»: аккаунт, структура,
 * методика, интеграции. На десктопе профиль внизу боковой панели, кружок не нужен.
 */
export function ProfileButton({ className = '' }: { className?: string }) {
  const profile = useProfile()
  return (
    <Link to="/settings" aria-label={`Профиль: ${profile.name}`} className={`hit-44 shrink-0 rounded-full lg:hidden ${className}`}>
      <Avatar size={36} />
    </Link>
  )
}
