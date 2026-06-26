import { useState } from 'react'
import Markdown from 'react-markdown'
import { TIP } from '../lib/stateMachine.js'

// Paylaşılan kart primitive'i. tip + durum'a göre render eder.
// Görsel stiller bootstrap-dashboard'dan TAŞINDI (promote, yeniden-yazım değil).

const SISTEM = { borderLeft: '3px solid #d4d4d8', background: '#fafafa', marginRight: 'auto', maxWidth: '88%' }
const BARIS  = { borderLeft: '3px solid #f97316', background: '#fff7ed', marginLeft: 'auto', maxWidth: '88%' }
const GIRDI  = { borderLeft: '3px solid #6366f1', background: '#eef2ff', maxWidth: '100%' }
const TASK   = { borderLeft: '3px solid #0ea5e9', background: '#f0f9ff', maxWidth: '100%' }
const FB     = { borderLeft: '3px solid #a855f7', background: '#faf5ff', maxWidth: '100%' }

const DURUM_ROZET = {
  'bitti':          { bg: '#dcfce7', fg: '#166534', text: 'bitti' },
  'cevap-bekliyor': { bg: '#6366f1', fg: '#ffffff', text: 'cevap bekliyor' },
  'cevaplandi':     { bg: '#dcfce7', fg: '#166534', text: '✓ cevaplandı' },
  'yapilacak':      { bg: '#e4e4e7', fg: '#52525b', text: 'yapılacak' },
  'yapiliyor':      { bg: '#fef9c3', fg: '#854d0e', text: 'yapılıyor' },
  'acik':           { bg: '#f3e8ff', fg: '#7e22ce', text: 'açık' },
  'ele-alindi':     { bg: '#dcfce7', fg: '#166534', text: 'ele alındı' },
}

function Rozet({ durum }) {
  const r = DURUM_ROZET[durum] ?? { bg: '#e4e4e7', fg: '#52525b', text: durum }
  return (
    <span style={{
      fontSize: 10, fontWeight: 700, color: r.fg, background: r.bg,
      padding: '3px 9px', borderRadius: 999, whiteSpace: 'nowrap',
      textTransform: 'uppercase', letterSpacing: 0.4,
    }}>{r.text}</span>
  )
}

function CevapKutusu({ onCevap }) {
  const [val, setVal] = useState('')
  const [gonderiliyor, setG] = useState(false)
  const gonder = async (e) => {
    e.stopPropagation()
    if (!val.trim() || gonderiliyor) return
    setG(true)
    await onCevap(val.trim())
    setG(false)
    setVal('')
  }
  return (
    <div onClick={e => e.stopPropagation()} style={{ marginTop: 12 }}>
      <textarea
        value={val}
        onChange={e => setVal(e.target.value)}
        placeholder="Cevabını buraya yaz…"
        rows={3}
        style={{
          width: '100%', boxSizing: 'border-box', fontSize: 13,
          padding: '8px 10px', border: '1px solid #c7d2fe', borderRadius: 8,
          resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.5,
        }}
      />
      <button onClick={gonder} disabled={!val.trim() || gonderiliyor} style={{
        marginTop: 8, fontSize: 13, fontWeight: 600, color: '#fff',
        background: val.trim() ? '#6366f1' : '#c7d2fe', border: 'none',
        borderRadius: 8, padding: '8px 16px', cursor: val.trim() ? 'pointer' : 'default',
      }}>
        {gonderiliyor ? 'Gönderiliyor…' : 'Gönder'}
      </button>
    </div>
  )
}

export default function Card({ kart, onCevap }) {
  const isGirdi    = kart.tip === TIP.GIRDI_TALEBI
  const isIlerleme = kart.tip === TIP.ILERLEME
  const isTask     = kart.tip === TIP.BUILD_TASK
  const isFb       = kart.tip === TIP.FEEDBACK
  const cevapBekliyor = kart.durum === 'cevap-bekliyor'
  const cevaplandi    = kart.durum === 'cevaplandi'
  // ilerleme: partner_cevap varsa Barış-tarafı (sağ/turuncu), yoksa sistem (sol/gri)
  const barisTarafi = isIlerleme && !!kart.partner_cevap

  const base = isGirdi ? GIRDI : isTask ? TASK : isFb ? FB : barisTarafi ? BARIS : SISTEM

  const [open, setOpen] = useState(false)
  const acilabilir = !!(kart.detay || (isIlerleme && kart.partner_cevap) || (isGirdi && cevapBekliyor))

  const etiket = isGirdi ? '✍️ Senden isteniyor'
    : isTask ? '🔧 Build görevi'
    : isFb ? '💬 Geri bildirim'
    : barisTarafi ? 'Barış' : 'Sistem'
  const etiketRenk = isGirdi ? '#4338ca' : isTask ? '#0369a1' : isFb ? '#7e22ce' : barisTarafi ? '#9a3412' : '#71717a'

  const style = {
    ...base,
    ...(cevapBekliyor ? { boxShadow: '0 0 0 2px #c7d2fe' } : {}),
    borderRadius: 10, padding: '14px 16px', width: '100%',
    cursor: acilabilir ? 'pointer' : 'default',
  }

  return (
    <div style={style} onClick={() => acilabilir && setOpen(o => !o)} role={acilabilir ? 'button' : undefined} aria-expanded={open}>
      {/* Başlık */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
        <div style={{ flex: 1 }}>
          <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: 0.5, color: etiketRenk, textTransform: 'uppercase' }}>
            {etiket}
          </span>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#18181b', marginTop: 2 }}>
            {cevapBekliyor && '📩 '}{kart.ozet}
          </div>
        </div>
        {(isGirdi || isTask || isFb) && <Rozet durum={kart.durum} />}
      </div>

      {/* cevaplandı: cevap her zaman görünür (soru+cevap salt-okunur) */}
      {cevaplandi && kart.partner_cevap && (
        <div style={{
          marginTop: 8, padding: '8px 12px', background: '#f0fdf4',
          border: '1px solid #bbf7d0', borderRadius: 8, fontSize: 13, color: '#166534', lineHeight: 1.5,
        }}>
          <strong>Cevabın:</strong> {kart.partner_cevap}
        </div>
      )}

      {/* Açılabilirlik ipucu */}
      {acilabilir && !open && (
        <div style={{ marginTop: 6, fontSize: 11, color: isGirdi ? '#4f46e5' : '#a1a1aa' }}>
          {isGirdi && cevapBekliyor ? '▸ aç: neden + cevapla' : '▸ detay'}
        </div>
      )}

      {/* Genişletilmiş */}
      {open && (
        <div style={{ marginTop: 12, borderTop: '1px solid', borderColor: isGirdi ? '#c7d2fe' : barisTarafi ? '#fed7aa' : '#e4e4e7', paddingTop: 12 }}>
          {isIlerleme && kart.partner_cevap && (
            <blockquote style={{
              margin: '0 0 12px', padding: '10px 14px', background: '#fff',
              borderLeft: '3px solid #f97316', borderRadius: '0 6px 6px 0',
              fontSize: 13, color: '#27272a', lineHeight: 1.65, fontStyle: 'italic',
            }}>
              "{kart.partner_cevap}"
            </blockquote>
          )}
          {kart.detay && (
            <div style={{ fontSize: 13, color: '#3f3f46', lineHeight: 1.65 }}>
              <Markdown>{kart.detay}</Markdown>
            </div>
          )}
          {isGirdi && cevapBekliyor && onCevap && <CevapKutusu onCevap={onCevap} />}
          <div style={{ marginTop: 8, fontSize: 11, color: '#a1a1aa', textAlign: 'right' }}>▴ kapat</div>
        </div>
      )}
    </div>
  )
}
