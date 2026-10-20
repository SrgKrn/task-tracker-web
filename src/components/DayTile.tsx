import { useLayoutEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { tileClients, tileNumber, tileRhythm, useDayTiles, type DayTile } from '../lib/dayTile'
import { drawDayTile, prepCanvas, tileDayTitle, tilePalette, useThemeVersion } from '../lib/tileCanvas'
import { formatHoursMinutes } from '../lib/time'
import { Button, ClientDot, Overline, Sheet } from './ui'
import { ChevronRight } from './Icon'
import type { LabelColor } from '../lib/types'

/** Одна плитка фиксированного размера. */
export function TileCanvas({ tile, size, record = false, className = '' }: { tile: DayTile | undefined; size: number; record?: boolean; className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null)
  const theme = useThemeVersion()
  useLayoutEffect(() => {
    if (!ref.current) return
    drawDayTile(prepCanvas(ref.current, size, size), tilePalette(), tile, 0, 0, size, record)
  }, [tile, size, record, theme])
  return <canvas ref={ref} className={`block shrink-0 ${className}`} style={{ width: size, height: size }} aria-hidden />
}

/** Разбор дня: часы, клиенты, ритм. Общий для шторки «Сегодня» и мозаики. */
export function TileFacts({ tile, record = false }: { tile: DayTile; record?: boolean }) {
  const rhythm = tileRhythm(tile)
  if (tile.total <= 0) {
    return <p className="text-base text-text-secondary">{tile.live ? 'Учёта сегодня ещё не было — плитка начнёт собираться с первой записи.' : 'Учёта не было — плитка осталась пунктиром.'}</p>
  }
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="tabular font-mono text-xl font-medium text-text">{formatHoursMinutes(tile.total / 60)}</span>
        {tile.norm > 0 && <span className="text-sm text-text-secondary">из {formatHoursMinutes(tile.norm / 60)}</span>}
        {record && <span className="rounded-full bg-accent-soft px-2 py-0.5 text-xs font-medium text-accent-text">рекорд месяца</span>}
      </div>
      <ul className="flex flex-col gap-1.5">
        {tileClients(tile).map(({ client, minutes }) => (
          <li key={client.key} className="flex items-center gap-2 text-base">
            <ClientDot color={(client.color ?? 'label-8') as LabelColor} />
            <span className="min-w-0 flex-1 truncate text-text">{client.name}</span>
            <span className="tabular font-mono text-sm text-text-secondary">{formatHoursMinutes(minutes / 60)}</span>
          </li>
        ))}
      </ul>
      {rhythm && (
        <div className="flex flex-col gap-0.5 rounded-sm bg-surface-sunken px-3 py-2.5">
          <span className="font-medium text-text">{tile.live ? `Пока — ${rhythm.name.toLowerCase()}` : rhythm.name}</span>
          <span className="text-sm text-text-secondary">
            Самый длинный заход — {formatHoursMinutes(rhythm.longest.minutes / 60)}, {rhythm.longest.client.name}
          </span>
        </div>
      )}
    </div>
  )
}

/** Номер плитки за год — грузит учёт с 1 января, поэтому только в открытой шторке. */
function TileNumber({ day }: { day: string }) {
  const { tiles, loading } = useDayTiles(`${day.slice(0, 4)}-01-01`, day, day)
  if (loading) return null
  const n = tileNumber(tiles, day)
  return n > 0 ? <span className="tabular font-mono text-sm text-text-secondary">№ {n}</span> : null
}

/**
 * Плитка дня в шапке «Сегодня»: днём собирается, по нажатию — шторка с разбором и входом
 * в мозаику. Заменила цитату дня.
 */
export function TodayTile({ tile, day, className = '' }: { tile: DayTile; day: string; className?: string }) {
  const [open, setOpen] = useState(false)
  const navigate = useNavigate()
  const status = tile.total <= 0 ? 'начнётся с первой записи' : tile.norm > 0 && tile.total < tile.norm ? 'собирается' : 'норма набрана'
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-label={`Плитка дня: ${status}. Открыть`}
        className={`flex w-full items-center gap-3 rounded-md border border-border bg-surface py-1.5 pr-2 pl-1.5 text-left hover:border-border-strong ${className}`}
      >
        <TileCanvas tile={tile} size={40} />
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="text-sm font-medium text-text">Плитка дня</span>
          <span className="truncate text-sm text-text-secondary">{status}</span>
        </span>
        <ChevronRight size={16} className="shrink-0 text-text-tertiary" />
      </button>

      <Sheet open={open} onClose={() => setOpen(false)} title="Плитка дня" headerAction={open ? <TileNumber day={day} /> : undefined}>
        <div className="flex flex-col gap-4 pb-2">
          <Overline>{tileDayTitle(day)}</Overline>
          <TileCanvas tile={tile} size={232} className="self-center" />
          <TileFacts tile={tile} />
          <Button
            variant="secondary"
            onClick={() => {
              setOpen(false)
              navigate('/mosaic')
            }}
          >
            Мозаика
          </Button>
        </div>
      </Sheet>
    </>
  )
}
