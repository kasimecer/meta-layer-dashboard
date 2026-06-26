import { DURUM_RENK, ETIKET_RENK } from '../lib/registry.js'

// Portföy + proje görünümlerinde paylaşılan küçük rozetler.

function Pill({ bg, fg, children }) {
  return (
    <span style={{
      display: 'inline-block', padding: '2px 9px', borderRadius: 999,
      fontSize: 11, fontWeight: 700, background: bg, color: fg,
      whiteSpace: 'nowrap', letterSpacing: 0.2,
    }}>{children}</span>
  )
}

export function DurumBadge({ durum }) {
  const c = DURUM_RENK[durum] ?? { bg: '#e4e4e7', fg: '#52525b' }
  return <Pill bg={c.bg} fg={c.fg}>{durum}</Pill>
}

export function StatusBadge({ status }) {
  const aktif = status === 'aktif'
  return <Pill bg={aktif ? '#dcfce7' : '#f4f4f5'} fg={aktif ? '#166534' : '#a1a1aa'}>{aktif ? '● aktif' : '○ duraklı'}</Pill>
}

export function EtiketBadge({ label, value }) {
  const c = ETIKET_RENK[value] ?? { bg: '#f1f5f9', fg: '#94a3b8' }
  return (
    <span style={{ fontSize: 11, color: '#a1a1aa', display: 'inline-flex', alignItems: 'center', gap: 5 }}>
      {label}<Pill bg={c.bg} fg={c.fg}>{value}</Pill>
    </span>
  )
}
