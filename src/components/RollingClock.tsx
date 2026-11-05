import { useState } from 'react'

/**
 * Часы с цифрами-барабаном (0.60): сменившаяся цифра уезжает вверх, новая приходит снизу с
 * лёгким перелётом. Разряды левее запаздывают на 70 мс каждый — как перенос в счётчике.
 * Меняется только то, что изменилось; остальное стоит.
 */
export function RollingClock({ value }: { value: string }) {
  const chars = [...value]
  // ранг разряда справа: единицы секунд — 0, десятки — 1… (двоеточия не считаются)
  const ranks: number[] = []
  let rank = 0
  for (let i = chars.length - 1; i >= 0; i--) ranks[i] = /\d/.test(chars[i]) ? rank++ : -1
  return (
    <span className="roll-clock" aria-label={value}>
      {chars.map((ch, i) =>
        ranks[i] < 0 ? (
          <span key={`${chars.length}-${i}`} aria-hidden>
            {ch}
          </span>
        ) : (
          // ключ от позиции с конца: «9:59:59» → «10:00:00» не перетасовывает разряды
          <RollDigit key={`d${chars.length - i}`} ch={ch} delay={ranks[i] * 70} />
        ),
      )}
    </span>
  )
}

function RollDigit({ ch, delay }: { ch: string; delay: number }) {
  const [shown, setShown] = useState(ch)
  const [prev, setPrev] = useState<string | null>(null)
  const [turn, setTurn] = useState(0)
  if (ch !== shown) {
    setPrev(shown)
    setShown(ch)
    setTurn(turn + 1)
  }
  const style = { animationDelay: `${delay}ms` }
  return (
    <span className="roll-digit" aria-hidden>
      {prev !== null && (
        <span key={`o${turn}`} className="roll-out" style={style} onAnimationEnd={() => setPrev(null)}>
          {prev}
        </span>
      )}
      <span key={`i${turn}`} className={prev !== null ? 'roll-in' : undefined} style={prev !== null ? style : undefined}>
        {shown}
      </span>
    </span>
  )
}
