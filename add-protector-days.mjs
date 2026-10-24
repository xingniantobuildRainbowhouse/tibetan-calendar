import { createHash } from 'node:crypto'
import { readFile, writeFile } from 'node:fs/promises'

import { CalendarTibetan } from '@hnw/date-tibetan'

const calendarPath = new URL('./main.ics', import.meta.url)
const eventPattern = /BEGIN:VEVENT\r?\n.*?END:VEVENT\r?\n?/gs

function field(block, name) {
  const match = block.match(new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}:(.+)$`, 'm'))
  return match?.[1]?.replace(/\r$/, '') || ''
}

function compactDate(date) {
  return `${date.getUTCFullYear()}${String(date.getUTCMonth() + 1).padStart(2, '0')}${String(date.getUTCDate()).padStart(2, '0')}`
}

function parseCompact(value) {
  return new Date(Date.UTC(Number(value.slice(0, 4)), Number(value.slice(4, 6)) - 1, Number(value.slice(6, 8))))
}

function tibetanParts(date) {
  return new CalendarTibetan()
    .fromGregorian(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate())
    .get()
}

function monthKey(parts) {
  const [cycle, year, month, leapMonth] = parts
  return `${cycle}:${year}:${month}:${leapMonth ? 1 : 0}`
}

function protectorEvent(date, descriptionPrefix, dtstamp, newline) {
  const start = compactDate(date)
  const endDate = new Date(date)
  endDate.setUTCDate(endDate.getUTCDate() + 1)
  const digest = createHash('sha256').update(`protector:${start}:${descriptionPrefix}`).digest('hex').slice(0, 24)
  return [
    'BEGIN:VEVENT',
    `UID:protector-${digest}@tibetan-calendar`,
    'SEQUENCE:0',
    `DTSTAMP:${dtstamp}`,
    `DTSTART;VALUE=DATE:${start}`,
    `DTEND;VALUE=DATE:${compactDate(endDate)}`,
    'X-MICROSOFT-CDO-ALLDAYEVENT:TRUE',
    'X-MICROSOFT-MSNCALENDAR-ALLDAYEVENT:TRUE',
    'SUMMARY:护法日',
    `DESCRIPTION:${descriptionPrefix}廿九`,
    'END:VEVENT',
    '',
  ].join(newline)
}

const raw = await readFile(calendarPath, 'utf8')
// Git stores this calendar as text. Use LF for generated blocks so `git diff`
// stays clean even when the checkout itself uses Windows CRLF elsewhere.
const newline = '\n'
const originalEvents = [...raw.matchAll(eventPattern)].map((match) => match[0])
const withoutGenerated = raw.replace(eventPattern, (block) => (
  field(block, 'SUMMARY') === '护法日' ? '' : block
))
const events = [...withoutGenerated.matchAll(eventPattern)].map((match) => match[0])

const descriptionsByMonth = new Map()
for (const block of events) {
  const description = field(block, 'DESCRIPTION')
  const start = field(block, 'DTSTART;VALUE=DATE')
  if (!description.endsWith('三十') || !start) continue
  descriptionsByMonth.set(monthKey(tibetanParts(parseCompact(start))), description.slice(0, -2))
}

const starts = events.map((block) => field(block, 'DTSTART;VALUE=DATE')).filter(Boolean).sort()
const cursor = parseCompact(starts[0])
const finalDate = parseCompact(starts.at(-1))
const protectorByStart = new Map()
const dtstamp = field(events[0], 'DTSTAMP')

while (cursor <= finalDate) {
  const parts = tibetanParts(cursor)
  const [, , , , day, leapDay] = parts
  // Keep the source calendar's rule: use the second occurrence of a repeated
  // date, and create nothing when lunar day 29 is omitted.
  if (day === 29 && !leapDay) {
    const prefix = descriptionsByMonth.get(monthKey(parts))
    if (prefix) protectorByStart.set(compactDate(cursor), protectorEvent(cursor, prefix, dtstamp, newline))
  }
  cursor.setUTCDate(cursor.getUTCDate() + 1)
}

const protectorEvents = [...protectorByStart.entries()]
  .sort(([left], [right]) => left.localeCompare(right))
  .map(([, event]) => event)
  .join('')
const updated = withoutGenerated.replace('END:VCALENDAR', `${protectorEvents}END:VCALENDAR`)

await writeFile(calendarPath, updated, 'utf8')
console.log(`Added ${protectorByStart.size} protector events; removed ${originalEvents.length - events.length} previous generated events.`)
