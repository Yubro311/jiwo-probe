const KEY = 'probe-visitor-logs-v1'
export interface VisitorEntry { at: number; ip: string; country?: string; region?: string; city?: string; isp?: string; asn?: number; colo?: string; ua?: string; ipType?: string; risk?: number | null; proxy?: string }
export interface VisitorStore { total: number; todayDate: string; today: number; entries: VisitorEntry[] }

export function maskVisitorIp(ip: string): string {
  const raw = ip.trim()
  if (/^\d+\.\d+\.\d+\.\d+$/.test(raw)) return `${raw.split('.').slice(0, 2).join('.')}.*.*`
  if (raw.includes(':')) return `${raw.split(':').slice(0, 2).join(':')}:*:*`
  return '***'
}

export async function lookupIpRisk(ip: string): Promise<{ ipType?: string; risk: number | null; proxy: 'yes' | 'no' | 'unknown' }> {
  try {
    const res = await fetch(`https://api.ipquery.io/${encodeURIComponent(ip)}`, { signal: AbortSignal.timeout(2500) })
    if (!res.ok) return { risk: null, proxy: 'unknown' }
    const json = await res.json() as { risk?: { is_mobile?: boolean; is_vpn?: boolean; is_tor?: boolean; is_proxy?: boolean; is_datacenter?: boolean; risk_score?: number } }
    const r = json?.risk
    if (!r || typeof r !== 'object') return { risk: null, proxy: 'unknown' }
    const isProxy = !!(r.is_vpn || r.is_proxy || r.is_tor)
    const ipType = r.is_vpn ? 'VPN' : r.is_proxy || r.is_tor ? 'Proxy' : r.is_datacenter ? 'Hosting' : r.is_mobile ? 'Wireless' : 'Residential'
    return {
      ipType,
      risk: typeof r.risk_score === 'number' && Number.isFinite(r.risk_score) ? r.risk_score : null,
      proxy: isProxy ? 'yes' : 'no',
    }
  } catch {
    return { risk: null, proxy: 'unknown' }

}
}

const bjDate = (now = Date.now()) => new Date(now + 8 * 3600_000).toISOString().slice(0, 10)

export async function recordVisitorLog(storage: DurableObjectStorage, body: Omit<VisitorEntry, 'at'>) {
  const now = Date.now(), todayDate = bjDate(now)
  const stored = await storage.get<VisitorStore>(KEY)
  const store: VisitorStore = stored && Array.isArray(stored.entries) ? stored : { total: 0, todayDate, today: 0, entries: [] }
  if (store.todayDate !== todayDate) { store.todayDate = todayDate; store.today = 0 }
  const prev = store.entries[0]
  if (!(prev && prev.ip === body.ip && now - prev.at < 30_000)) {
    store.total += 1
    store.today += 1
    store.entries.unshift({ ...body, at: now })
    if (store.entries.length > 500) store.entries.length = 500
    await storage.put(KEY, store)
  }
  const recent = store.entries.filter((e, i) => !(i === 0 && e.ip === body.ip)).slice(0, 2).map((e) => ({ at: e.at, ip: maskVisitorIp(e.ip), country: e.country, region: e.region, city: e.city, isp: e.isp }))
  return { today: store.today, total: store.total, recent }
}

export async function readVisitorLogs(storage: DurableObjectStorage): Promise<VisitorStore> {
  return (await storage.get<VisitorStore>(KEY)) ?? { total: 0, todayDate: bjDate(), today: 0, entries: [] }
}
