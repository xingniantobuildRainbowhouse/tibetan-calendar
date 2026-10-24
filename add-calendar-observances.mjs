import { createHash } from 'node:crypto'
import { readFile, writeFile } from 'node:fs/promises'

import { CalendarTibetan } from '@hnw/date-tibetan'

const calendarPath = new URL('./main.ics', import.meta.url)
const eventPattern = /BEGIN:VEVENT\r?\n.*?END:VEVENT\r?\n?/gs
const newline = '\n'
const dayLabels = [
  '', '初一', '初二', '初三', '初四', '初五', '初六', '初七', '初八', '初九',
  '初十', '十一', '十二', '十三', '十四', '十五', '十六', '十七', '十八', '十九',
  '二十', '廿一', '廿二', '廿三', '廿四', '廿五', '廿六', '廿七', '廿八', '廿九', '三十',
]

const bigNagaDays = new Set(['1:25', '6:29', '8:29', '9:17'])
const smallNagaDays = new Set([
  '2:7', '2:8', '2:9', '2:10', '2:11', '2:12', '2:13', '2:23', '2:28',
  '3:9', '3:14', '3:20', '3:22', '3:23', '3:25', '3:28', '3:30',
  '4:4', '4:5', '4:10', '4:14', '4:16', '4:20', '4:25', '4:26', '4:29', '4:30',
  '5:1', '5:4', '5:8', '5:9', '5:12', '5:13', '5:15', '5:16', '5:17', '5:19', '5:20', '5:23', '5:25', '5:27',
  '6:8', '6:15', '6:17', '6:18', '6:23', '6:25', '6:27', '6:28', '6:30',
  '7:1', '7:5', '7:11', '7:14', '7:16', '7:21', '7:23', '7:29',
  '8:2', '8:3', '8:4', '8:5', '8:6', '8:7', '8:8', '8:11', '8:12', '8:13', '8:15', '8:16', '8:17', '8:20', '8:22', '8:23', '8:25', '8:27', '8:28', '8:30',
  '9:1', '9:7', '9:8', '9:11', '9:12', '9:14', '9:15', '9:21', '9:27',
  '11:4', '11:9', '11:11', '11:14', '11:29',
  '12:2', '12:3', '12:7', '12:10', '12:16', '12:17', '12:30',
])

function isPrayerFlagDay(month, day) {
  if ([1, 5, 9].includes(month)) return [10, 22].includes(day)
  if ([2, 6, 10].includes(month)) return [7, 19].includes(day)
  if ([3, 7, 11].includes(month)) return [4, 16, 28].includes(day)
  return [1, 13, 25].includes(day) // Months 4, 8 and 12.
}

function field(block, name) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const match = block.match(new RegExp(`^${escaped}:(.+)$`, 'm'))
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

function generatedEvent({ date, descriptionPrefix, dtstamp, kind, summary, day }) {
  const start = compactDate(date)
  const endDate = new Date(date)
  endDate.setUTCDate(endDate.getUTCDate() + 1)
  const digest = createHash('sha256').update(`${kind}:${start}:${descriptionPrefix}`).digest('hex').slice(0, 24)
  return [
    'BEGIN:VEVENT',
    `UID:observance-${kind}-${digest}@tibetan-calendar`,
    'SEQUENCE:0',
    `DTSTAMP:${dtstamp}`,
    `DTSTART;VALUE=DATE:${start}`,
    `DTEND;VALUE=DATE:${compactDate(endDate)}`,
    'X-MICROSOFT-CDO-ALLDAYEVENT:TRUE',
    'X-MICROSOFT-MSNCALENDAR-ALLDAYEVENT:TRUE',
    `SUMMARY:${summary}`,
    `DESCRIPTION:${descriptionPrefix}${dayLabels[day]}`,
    'END:VEVENT',
    '',
  ].join(newline)
}

const raw = await readFile(calendarPath, 'utf8')
const originalEvents = [...raw.matchAll(eventPattern)].map((match) => match[0])
const withoutGenerated = raw.replace(eventPattern, (block) => (
  field(block, 'UID').startsWith('observance-') || field(block, 'UID').startsWith('protector-')
    ? ''
    : block
))
const events = [...withoutGenerated.matchAll(eventPattern)].map((match) => match[0])

const descriptionByMonth = new Map()
for (const block of events) {
  const description = field(block, 'DESCRIPTION')
  const start = field(block, 'DTSTART;VALUE=DATE')
  if (!description || !start) continue
  const parts = tibetanParts(parseCompact(start))
  const dayLabel = dayLabels[parts[4]]
  if (description.endsWith(dayLabel)) {
    descriptionByMonth.set(monthKey(parts), description.slice(0, -dayLabel.length))
  }
}

const starts = events.map((block) => field(block, 'DTSTART;VALUE=DATE')).filter(Boolean).sort()
const cursor = parseCompact(starts[0])
const finalDate = parseCompact(starts.at(-1))
const dtstamp = field(events[0], 'DTSTAMP')
const generated = []
const counts = { protector: 0, bigNaga: 0, smallNaga: 0, prayerFlag: 0 }

while (cursor <= finalDate) {
  const parts = tibetanParts(cursor)
  const [, , month, , day, leapDay] = parts
  const prefix = descriptionByMonth.get(monthKey(parts))
  if (prefix) {
    // Monthly practice days follow the source calendar's existing convention:
    // on a repeated date, use the second occurrence. Missing dates generate no event.
    if (day === 29 && !leapDay) {
      generated.push(generatedEvent({ date: cursor, descriptionPrefix: prefix, dtstamp, kind: 'protector', summary: '护法日', day }))
      counts.protector += 1
    }

    // Naga and prayer-flag indications are day qualities, so both occurrences
    // of a repeated Tibetan date carry the indication. Missing dates still do not.
    const nagaKey = `${month}:${day}`
    if (bigNagaDays.has(nagaKey)) {
      generated.push(generatedEvent({ date: cursor, descriptionPrefix: prefix, dtstamp, kind: 'big-naga', summary: '大出龙日', day }))
      counts.bigNaga += 1
    } else if (smallNagaDays.has(nagaKey)) {
      generated.push(generatedEvent({ date: cursor, descriptionPrefix: prefix, dtstamp, kind: 'small-naga', summary: '小出龙日', day }))
      counts.smallNaga += 1
    }
    if (isPrayerFlagDay(month, day)) {
      generated.push(generatedEvent({ date: cursor, descriptionPrefix: prefix, dtstamp, kind: 'prayer-flag', summary: '飞幡日（不宜悬挂经幡）', day }))
      counts.prayerFlag += 1
    }
  }
  cursor.setUTCDate(cursor.getUTCDate() + 1)
}

const updated = withoutGenerated.replace('END:VCALENDAR', `${generated.join('')}END:VCALENDAR`)
await writeFile(calendarPath, updated, 'utf8')
console.log({ added: counts, removed: originalEvents.length - events.length })
