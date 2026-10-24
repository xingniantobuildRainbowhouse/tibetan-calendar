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

const specialDays = new Map([
  [8, { kind: 'medicine', summary: '药师佛节日（作何善恶成千倍）' }],
  [10, { kind: 'guru', summary: '莲师荟供日（作何善恶成十万倍）' }],
  [15, { kind: 'amitabha', summary: '阿弥陀佛节日（作何善恶成百万倍）' }],
  [25, { kind: 'dakini', summary: '空行母荟供日' }],
  [29, { kind: 'protector', summary: '护法日' }],
  [30, { kind: 'shakyamuni', summary: '释迦牟尼佛节日（作何善恶成九亿倍）' }],
])
const specialSummaries = new Set([...specialDays.values()].map((item) => item.summary))

const dudjomNagaDays = new Map([
  ...'20250103:s 20250108:b 20250110:s 20250112:s 20250128:s 20250131:b 20250201:s 20250204:s 20250205:s 20250207:s 20250213:b 20250214:b 20250324:b 20250404:s 20250405:s 20250406:s 20250407:s 20250408:s 20250409:s 20250410:s 20250421:s 20250502:s 20250506:s 20250511:s 20250517:s 20250519:s 20250520:s 20250522:s 20250525:s 20250527:s 20250531:b 20250603:s 20250605:s 20250610:s 20250612:s 20250616:s 20250618:s 20250622:s 20250625:s 20250626:s 20250627:s 20250628:s 20250630:s 20250702:s 20250704:b 20250707:s 20250708:s 20250710:s 20250711:s 20250712:s 20250714:b 20250715:s 20250718:s 20250720:s 20250722:s 20250801:s 20250809:b 20250811:s 20250812:s 20250814:s 20250818:s 20250820:s 20250821:s 20250822:b 20250823:b 20250824:b 20250826:s 20250827:s 20250831:s 20250903:b 20250906:s 20250908:s 20250913:b 20250920:b 20250923:s 20250924:s 20250925:s 20250926:s 20250927:s 20250928:s 20250929:s 20250930:b 20251002:s 20251003:b 20251004:s 20251005:s 20251007:b 20251008:s 20251009:s 20251010:s 20251011:s 20251013:s 20251014:s 20251016:s 20251018:s 20251019:s 20251020:b 20251021:b 20251022:s 20251028:b 20251029:s 20251101:s 20251102:s 20251104:s 20251105:s 20251107:b 20251110:s 20251116:s 20251223:s 20251228:b 20251230:s'.split(' ').map((entry) => {
    const [date, type] = entry.split(':')
    return [date, type === 'b' ? 'big-naga' : 'small-naga']
  }),
  ['20260102', 'small-naga'], ['20260117', 'small-naga'], ['20260120', 'big-naga'], ['20260121', 'small-naga'], ['20260125', 'small-naga'], ['20260128', 'small-naga'],
  ['20260202', 'big-naga'], ['20260203', 'big-naga'], ['20260217', 'small-naga'],
  ['20260313', 'big-naga'], ['20260324', 'small-naga'], ['20260325', 'small-naga'], ['20260326', 'small-naga'], ['20260327', 'small-naga'], ['20260328', 'small-naga'], ['20260329', 'small-naga'], ['20260330', 'small-naga'],
  ['20260410', 'small-naga'], ['20260415', 'small-naga'], ['20260425', 'small-naga'], ['20260430', 'small-naga'],
  ['20260504', 'small-naga'], ['20260505', 'small-naga'], ['20260506', 'small-naga'], ['20260508', 'small-naga'], ['20260510', 'small-naga'], ['20260511', 'small-naga'], ['20260515', 'small-naga'], ['20260516', 'small-naga'], ['20260521', 'big-naga'], ['20260525', 'small-naga'], ['20260527', 'small-naga'], ['20260530', 'small-naga'],
  ['20260601', 'small-naga'], ['20260605', 'small-naga'], ['20260610', 'big-naga'], ['20260611', 'small-naga'], ['20260614', 'small-naga'], ['20260615', 'small-naga'], ['20260617', 'small-naga'], ['20260618', 'small-naga'], ['20260622', 'small-naga'], ['20260623', 'big-naga'], ['20260626', 'small-naga'], ['20260628', 'small-naga'], ['20260629', 'small-naga'], ['20260630', 'small-naga'],
  ['20260701', 'small-naga'], ['20260702', 'big-naga'], ['20260703', 'small-naga'], ['20260705', 'small-naga'], ['20260708', 'small-naga'], ['20260709', 'small-naga'], ['20260710', 'small-naga'], ['20260711', 'small-naga'], ['20260722', 'small-naga'], ['20260729', 'big-naga'], ['20260731', 'small-naga'],
  ['20260801', 'small-naga'], ['20260804', 'small-naga'], ['20260806', 'small-naga'], ['20260809', 'small-naga'], ['20260810', 'small-naga'], ['20260811', 'big-naga'], ['20260812', 'big-naga'], ['20260813', 'big-naga'], ['20260817', 'small-naga'], ['20260823', 'big-naga'], ['20260825', 'small-naga'], ['20260830', 'small-naga'],
  ['20260901', 'big-naga'], ['20260902', 'big-naga'], ['20260904', 'big-naga'], ['20260910', 'big-naga'], ['20260913', 'small-naga'], ['20260914', 'small-naga'], ['20260915', 'small-naga'], ['20260916', 'small-naga'], ['20260917', 'small-naga'], ['20260918', 'small-naga'], ['20260919', 'big-naga'], ['20260922', 'small-naga'], ['20260923', 'big-naga'], ['20260924', 'small-naga'], ['20260926', 'big-naga'], ['20260927', 'small-naga'], ['20260928', 'small-naga'],
  ['20261001', 'small-naga'], ['20261003', 'small-naga'], ['20261004', 'small-naga'], ['20261005', 'small-naga'], ['20261007', 'small-naga'], ['20261008', 'small-naga'], ['20261009', 'big-naga'], ['20261010', 'big-naga'], ['20261011', 'small-naga'], ['20261017', 'big-naga'], ['20261018', 'small-naga'], ['20261022', 'small-naga'], ['20261023', 'small-naga'], ['20261025', 'small-naga'], ['20261026', 'small-naga'], ['20261031', 'small-naga'],
  ['20261106', 'small-naga'],
  ['20261213', 'small-naga'], ['20261218', 'big-naga'], ['20261220', 'small-naga'], ['20261223', 'small-naga'],
])

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

function sameTibetanDate(left, right) {
  return left[0] === right[0]
    && left[1] === right[1]
    && left[2] === right[2]
    && left[3] === right[3]
    && left[4] === right[4]
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
    || specialSummaries.has(field(block, 'SUMMARY'))
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
const counts = { special: 0, shiftedSpecial: 0, bigNaga: 0, smallNaga: 0, prayerFlag: 0 }

while (cursor <= finalDate) {
  const parts = tibetanParts(cursor)
  const [, , month, , day] = parts
  const prefix = descriptionByMonth.get(monthKey(parts))
  if (prefix) {
    const previousDate = new Date(cursor)
    previousDate.setUTCDate(previousDate.getUTCDate() - 1)
    const nextDate = new Date(cursor)
    nextDate.setUTCDate(nextDate.getUTCDate() + 1)
    const previousParts = tibetanParts(previousDate)
    const nextParts = tibetanParts(nextDate)

    // Dudjom convention: mark the first occurrence of a repeated date.
    if (!sameTibetanDate(previousParts, parts) && specialDays.has(day)) {
      const special = specialDays.get(day)
      generated.push(generatedEvent({ date: cursor, descriptionPrefix: prefix, dtstamp, kind: `special-${special.kind}`, summary: special.summary, day }))
      counts.special += 1
    }

    // If a special Tibetan date is omitted, observe it on the preceding civil
    // date. The ICS has no visual border, so its description records the shift.
    if (!sameTibetanDate(parts, nextParts)) {
      const missingDays = month === nextParts[2]
        ? Array.from({ length: Math.max(0, nextParts[4] - day - 1) }, (_, index) => day + index + 1)
        : Array.from({ length: Math.max(0, 30 - day) }, (_, index) => day + index + 1)
      for (const missingDay of missingDays) {
        if (!specialDays.has(missingDay)) continue
        const special = specialDays.get(missingDay)
        generated.push(generatedEvent({
          date: cursor,
          descriptionPrefix: `${prefix}缺日提前：`,
          dtstamp,
          kind: `special-${special.kind}-shifted`,
          summary: special.summary,
          day: missingDay,
        }))
        counts.special += 1
        counts.shiftedSpecial += 1
      }
    }

    const nagaKey = `${month}:${day}`
    const start = compactDate(cursor)
    const verifiedDudjomYear = cursor.getUTCFullYear() === 2025 || cursor.getUTCFullYear() === 2026
    const dudjomNagaType = verifiedDudjomYear ? dudjomNagaDays.get(start) : null
    if (dudjomNagaType === 'big-naga' || (!verifiedDudjomYear && bigNagaDays.has(nagaKey))) {
      generated.push(generatedEvent({ date: cursor, descriptionPrefix: prefix, dtstamp, kind: 'big-naga', summary: '大出龙日', day }))
      counts.bigNaga += 1
    } else if (dudjomNagaType === 'small-naga' || (!verifiedDudjomYear && smallNagaDays.has(nagaKey))) {
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
