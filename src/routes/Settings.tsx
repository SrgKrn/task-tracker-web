import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'

const links = [
  { to: '/sections', label: 'Разделы', hint: 'Категории для аналитики план/факт' },
  { to: '/projects', label: 'Проекты', hint: 'Клиенты или направления работы' },
  { to: '/statuses', label: 'Статусы', hint: 'Свой список статусов задач' },
]

export function Settings() {
  return (
    <div className="mx-auto max-w-lg px-4 py-6 safe-top">
      <h1 className="mb-4 text-xl font-semibold text-slate-100">Настройки</h1>

      <div className="space-y-2">
        {links.map((link) => (
          <Link
            key={link.to}
            to={link.to}
            className="flex items-center justify-between rounded-lg border border-slate-700 bg-slate-800/60 px-4 py-3"
          >
            <div>
              <p className="text-slate-100">{link.label}</p>
              <p className="text-xs text-slate-500">{link.hint}</p>
            </div>
            <span className="text-slate-500">→</span>
          </Link>
        ))}
      </div>

      <button
        onClick={() => supabase.auth.signOut()}
        className="mt-6 w-full rounded-lg border border-red-800 px-4 py-2.5 font-medium text-red-400 active:bg-red-950"
      >
        Выйти
      </button>
    </div>
  )
}
