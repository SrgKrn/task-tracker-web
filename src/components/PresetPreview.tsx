import type { ReactNode } from 'react'
import { Book, Briefcase, Dumbbell, Home, Plus, Rocket, Users } from './Icon'
import { ClientDot, ListGroup, Overline } from './ui'
import type { Preset } from '../lib/presets'

export const PRESET_ICON: Record<string, (p: { size?: number }) => ReactNode> = {
  clients: Briefcase,
  team: Users,
  study: Book,
  personal: Home,
  project: Rocket,
  sport: Dumbbell,
  blank: Plus,
}

/**
 * Что поставит пресет: группы со связями и постоянными значениями, этапы. Примерные
 * значения («Студия Север») — только если включены примеры задач.
 */
export function PresetStructure({
  preset,
  examples,
  skip = [],
  merge = false,
}: {
  preset: Preset
  examples: boolean
  skip?: string[]
  /** добавление к своей структуре: группы не обязательные */
  merge?: boolean
}) {
  const groups = preset.groups.filter((g) => !skip.includes(g.name.toLowerCase()))
  const byKey = new Map(preset.groups.map((g) => [g.key, g]))
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-2">
        <Overline>Группы</Overline>
        <ListGroup>
          {groups.map((g) => {
            const values = g.values.filter((v) => examples || !v.example)
            const parent = g.parent ? byKey.get(g.parent) : undefined
            return (
              <div key={g.key} className="flex flex-col gap-1.5 px-3.5 py-2.5">
                <span className="flex items-baseline justify-between gap-2">
                  <span className="text-base font-medium text-text">{g.name}</span>
                  <span className="text-xs text-text-tertiary">
                    {[g.required && !merge ? 'обязательная' : null, parent ? `входит в «${parent.name}»` : null].filter(Boolean).join(' · ') ||
                      `поле «${g.item_name}»`}
                  </span>
                </span>
                {values.length > 0 ? (
                  <span className="flex flex-wrap gap-1">
                    {values.map((v) => (
                      <span key={v.name} className="inline-flex h-6 items-center gap-1 rounded-full bg-surface-sunken px-2 text-xs text-text-secondary">
                        <ClientDot color={v.color} size={6} />
                        {v.name}
                      </span>
                    ))}
                  </span>
                ) : (
                  <span className="text-xs text-text-tertiary">Значения — ваши: добавите, когда появятся</span>
                )}
              </div>
            )
          })}
        </ListGroup>
      </div>
    </div>
  )
}

export function StageChips({ stages }: { stages: Preset['stages'] }) {
  return (
    <span className="flex flex-wrap items-center gap-1">
      {stages.map((s, i) => (
        <span key={s.label} className="flex items-center gap-1">
          {i > 0 && <span className="text-xs text-text-tertiary" aria-hidden>→</span>}
          <span
            className={`inline-flex h-6 items-center rounded-full px-2.5 text-xs font-medium ${
              s.is_final ? 'bg-status-done-bg text-status-done-text' : 'bg-surface-sunken text-text-secondary'
            }`}
          >
            {s.label}
          </span>
        </span>
      ))}
    </span>
  )
}
