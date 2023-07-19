import fetch from 'node-fetch'
import { LocalStorage } from '@raycast/api'
import moment from 'moment'

export interface PrayerTimeItem {
  label: string
  time: moment.Moment
  value: string
  different: string
  isCurrent: boolean
  isNext: boolean
}

export interface PrayerTime {
  hijri: string
  date: string
  day: string
  imsak: string
  fajr: string
  syuruk: string
  dhuhr: string
  asr: string
  maghrib: string
  isha: string
  items?: PrayerTimeItem[]
}

type PrayerKey = keyof PrayerTime

const prayerNameMap: Map<PrayerKey, string> = new Map<PrayerKey, string>([
  ['imsak', 'Imsak'],
  ['fajr', 'Subuh'],
  ['syuruk', 'Syuruk'],
  ['dhuhr', 'Zohor'],
  ['asr', 'Asar'],
  ['maghrib', 'Maghrib'],
  ['isha', `Isya`],
])

export interface SolatApiData {
  prayerTime: PrayerTime[]
  status: string
  serverTime: string
  periodType: string
  lang: string
  zone: string
  bearing: string
}

export async function fetchSolatData(zoneId = 'WLY01'): Promise<SolatApiData | undefined> {
  console.log('fetch prayer times for', zoneId)
  const url = `https://www.e-solat.gov.my/index.php?r=esolatApi/takwimsolat&period=year&zone=${zoneId}`
  try {
    const res = await fetch(url)
    return (await res.json()) as SolatApiData
  } catch (e) {
    console.error('failed to retrieve prayer times', e)
  }
  return
}

export async function loadSolatData(zoneId = 'WLY01') {
  const CACHE_KEY = `prayer-time-${zoneId}-${new Date().getFullYear()}`
  const raw = (await LocalStorage.getItem(CACHE_KEY)) as string
  if (raw) {
    try {
      return JSON.parse(raw as string) as SolatApiData
    } catch (e) {
      // noinspection ES6MissingAwait
      LocalStorage.removeItem(CACHE_KEY)
    }
  }
  const res = await fetchSolatData(zoneId)
  if (res) {
    // noinspection ES6MissingAwait
    LocalStorage.setItem(CACHE_KEY, JSON.stringify(res))
    return res
  }
  return
}

export async function loadTodaySolat(zoneId: string): Promise<PrayerTime | undefined> {
  const data = await loadSolatData(zoneId)

  return data?.prayerTime
    ?.filter((t) => {
      const input = moment(t.date, 'DD-MMM-YYYY')
      const currentDate = moment()
      return currentDate.isSame(input, 'date')
    })
    .map((t) => {
      const keys: PrayerKey[] = ['imsak', 'fajr', 'syuruk', 'dhuhr', 'asr', 'maghrib', 'isha']
      t.items = keys.map((key) => {
        const value: string = t[key as PrayerKey] as string
        const time = moment(value, 'HH:mm:ss')
        const diffSec = time.diff(moment(), 'seconds')
        return {
          value: time.format('hh:mm A'),
          label: prayerNameMap.get(key)!,
          different: moment.duration(diffSec, 'seconds').humanize(true),
          time,
        } as PrayerTimeItem
      })
      const current = t.items.find(
        (item, i) => moment().isSameOrAfter(item.time) || (t.items && i == t.items?.length - 1)
      )
      if (current) {
        current.isCurrent = true
        const currentIndex = t.items.indexOf(current)
        if (t.items.length > 1) {
          t.items[currentIndex + 1 < t.items.length ? currentIndex + 1 : 0].isNext = true
        }
      }
      return t
    })
    .find(Boolean)
}