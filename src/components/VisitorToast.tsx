import { useEffect, useState } from 'react'

interface RecentVisitor { at: number; ip: string; country?: string; region?: string; city?: string; isp?: string }
interface VisitorPayload { ip: string; city?: string; region?: string; country?: string; isp?: string; asn?: number; colo?: string; ipType?: string; risk?: number | null; proxy?: string; today?: number; total?: number; recent?: RecentVisitor[] }

function flagOf(code?: string): string {
  if (!code || !/^[A-Za-z]{2}$/.test(code)) return '🌐'
  return String.fromCodePoint(...code.toUpperCase().split('').map((c) => 127397 + c.charCodeAt(0)))
}
function relTime(at: number): string {
  const diff = Math.max(0, Math.floor((Date.now() - at) / 1000))
  if (diff < 60) return '刚刚'
  if (diff < 3600) return `${Math.floor(diff / 60)} 分钟前`
  if (diff < 86400) return `${Math.floor(diff / 3600)} 小时前`
  return `${Math.floor(diff / 86400)} 天前`
}
function typeLabel(t?: string, proxy?: string): string | null {
  if (t) {
    const map: Record<string, string> = { Residential: '住宅 IP', Hosting: '机房 IP', Business: '商业 IP', Wireless: '移动网络', VPN: 'VPN 代理', Proxy: '代理 IP', 'Compromised Server': '风险节点' }
    return map[t] || t
  }
  return proxy === 'yes' ? '代理 IP' : null
}
function riskBadge(risk?: number | null, proxy?: string): { text: string; tone: 'low' | 'mid' | 'high' } | null {
  if (typeof risk === 'number') {
    if (risk <= 25) return { text: `低风险 · ${risk}`, tone: 'low' }
    if (risk <= 60) return { text: `中风险 · ${risk}`, tone: 'mid' }
    return { text: `高风险 · ${risk}`, tone: 'high' }
  }
  if (proxy === 'yes') return { text: '代理流量', tone: 'mid' }
  return null
}

export function VisitorToast() {
  const [data, setData] = useState<VisitorPayload | null>(null)
  const [visible, setVisible] = useState(false)
  const [paused, setPaused] = useState(false)

  useEffect(() => {
    let cancelled = false
    fetch('/api/visitor', { cache: 'no-store' })
      .then((res) => (res.ok ? (res.json() as Promise<VisitorPayload>) : null))
      .then((payload) => {
        if (cancelled || !payload || !payload.ip || payload.ip === 'UNKNOWN') return
        setData(payload)
        setVisible(true)
      })
      .catch(() => {})
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    if (!visible || paused) return
    const timer = window.setTimeout(() => setVisible(false), 8000)
    return () => window.clearTimeout(timer)
  }, [visible, paused])

  if (!data || !visible) return null
  const location = [data.city, data.region, data.country].filter(Boolean).slice(0, 2).join(' · ') || '未知地区'
  const recent = (data.recent || []).slice(0, 2)
  const ipKind = typeLabel(data.ipType, data.proxy)
  const risk = riskBadge(data.risk, data.proxy)

  return (
    <aside className="visitor-toast" role="status" aria-live="polite" onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)}>
      <div className="visitor-toast-head">
        <span className="visitor-toast-title"><i className="visitor-toast-dot" aria-hidden="true" /><span>欢迎来自 {flagOf(data.country)} {location}</span></span>
        <button type="button" className="visitor-toast-close" aria-label="关闭访客提示" onClick={() => setVisible(false)}>×</button>
      </div>
      <div className="visitor-toast-meta">
        <span className="visitor-toast-ip">{data.ip}</span>
        {data.isp && <span className="visitor-toast-isp" title={data.isp}>{data.isp}</span>}
        {typeof data.today === 'number' && <span className="visitor-toast-count">今日第 {data.today} 位</span>}
      </div>
      {(data.asn || ipKind || risk) && (
        <div className="visitor-toast-tags">
          {data.asn && <span className="visitor-tag">AS{data.asn}</span>}
          {ipKind && <span className="visitor-tag">{ipKind}</span>}
          {risk && <span className={`visitor-tag visitor-tag--${risk.tone}`}>{risk.text}</span>}
        </div>
      )}
      {recent.length > 0 && (
        <div className="visitor-toast-recent">
          {recent.map((item, idx) => (
            <div key={`${item.at}-${idx}`} className="visitor-toast-row">
              <span>{flagOf(item.country)} {item.city || item.country || '访客'}</span>
              <span className="visitor-toast-ip">{item.ip}</span>
              <span>{relTime(item.at)}</span>
            </div>
          ))}
        </div>
      )}
      <div className={`visitor-toast-bar${paused ? ' paused' : ''}`} aria-hidden="true" />
    </aside>
  )
}
