import { describe, expect, it } from 'vitest'
import telegram from './telegram/plan.ts?raw'
import reminders from './timer-reminders/plan.ts?raw'
import calendar from './calendar/plan.ts?raw'
import google from './google/plan.ts?raw'

describe('plan.ts в функциях', () => {
  it('копии одинаковые', () => {
    for (const copy of [reminders, calendar, google]) expect(copy).toBe(telegram)
  })
})
