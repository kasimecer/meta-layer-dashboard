import { useState } from 'react'
import Markdown from 'react-markdown'
import { TIP } from '../lib/stateMachine.js'

// Paylaşılan kart primitive'i. tip + durum'a göre render eder.

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
  const [hata, setHata] = useState('')

  const gonder = async (e) => {
    e.stopPropagation()
    if (!val.trim() || gonderiliyor) return
    setG(true); setHata('')
    const r = await onCevap(val.trim())
    setG(false)
    if (r && r.ok === false) { setHata(r.hata || 'Gönderilemedi'); return }
    setVal('')
  }

  return (
    <div onClick={e => e.stopPropagation()} style={{ marginTop: 14 }}>
      <textarea
        value={val}
        onChange={e => { setVal(e.target.value); if (hata) setHata('') }}
        placeholder="Cevabını buraya yaz…"
        rows={3}
        style={{
          width: '100%', boxSizing: 'border-box', fontSize: 14,
          padding: '10px 12px', border: '1.5px solid #c7d2fe', borderRadius: 8,
          resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.55,
          background: '#fff', outline: 'none', color: '#18181b',
        }}
      />
      <button
        onClick={gonder}
        disabled={!val.trim() || gonderiliyor}
        style={{
          marginTop: 8, fontSize: 13, fontWeight: 700, color: '#fff',
          background: val.trim() && !gonderiliyor ? '#6366f1' : '#c7d2fe',
          border: 'none', borderRadius: 8, padding: '9px 20px',
          cursor: val.trim() && !gonderiliyor ? 'pointer' : 'default',
          letterSpacing: 0.1,
        }}
      >
        {gonderiliyor ? 'Gönderiliyor…' : 'Gönder'}
      </button>
      {hata && (
        <div style={{
          marginTop: 8, padding: '7px 11px', background: '#fef2f2',
          border: '1px solid #fecaca', borderRadius: 8, fontSize: 12.5, color: '#b91c1c', lineHeight: 1.45,
        }}>
          ⚠ {hata} — tekrar dene; cevabın korundu.
        </div>
      )}
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
  const barisTarafi   = isIlerleme && !!kart.partner_cevap

  const base = isGirdi ? GIRDI : isTask ? TASK : isFb ? FB : barisTarafi ? BARIS : SISTEM

  const [open, setOpen] = useState(false)
  const acilabilir = !!(kart.detay || (isIlerleme && kart.partner_cevap) || (isGirdi && cevapBekliyor))
  // Gerçekten cevaplanabilir mi: tip+durum yetmez, onCevap GERÇEKTEN verilmiş olmalı —
  // aksi halde ipucu "cevapla" der ama açılınca input çıkmaz (sahte vaat).
  const cevaplanabilir = isGirdi && cevapBekliyor && !!onCevap

  const etiket = isGirdi ? '✍ Senden isteniyor'
    : isTask ? '🔧 Build görevi'
    : isFb ? '💬 Geri bildirim'
    : barisTarafi ? 'Barış' : 'Sistem'
  const etiketRenk = isGirdi ? '#4338ca' : isTask ? '#0369a1' : isFb ? '#7e22ce' : barisTarafi ? '#9a3412' : '#71717a'

  const style = {
    ...base,
    ...(cevapBekliyor ? { boxShadow: '0 0 0 2px #c7d2fe' } : {}),
    borderRadius: 10, padding: '16px 18px', width: '100%',
    cursor: acilabilir ? 'pointer' : 'default',
  }

  return (
    <div style={style} onClick={() => acilabilir && setOpen(o => !o)} role={acilabilir ? 'button' : undefined} aria-expanded={open}>
      {kart.escalation_flag && (
        <div style={{
          marginBottom: 8, padding: '5px 10px',
          background: '#fff7ed', border: '1px solid #fed7aa',
          borderRadius: 6, fontSize: 12, color: '#9a3412', fontWeight: 600,
        }}>
          ⚠ Taraflar uzlaşmadı — karar sizde
        </div>
      )}

      {/* Başlık */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
        <div style={{ flex: 1 }}>
          <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: 0.5, color: etiketRenk, textTransform: 'uppercase' }}>
            {etiket}
          </span>
          <div style={{ fontSize: 14, fontWeight: 600, color: '#18181b', marginTop: 3, lineHeight: 1.45 }}>
            {cevapBekliyor && '📩 '}{kart.ozet}
          </div>
        </div>
        {(isGirdi || isTask || isFb) && <Rozet durum={kart.durum} />}
      </div>

      {/* cevaplandı: kısa teyit + partner_cevap */}
      {cevaplandi && (
        <div style={{
          marginTop: 10, padding: '9px 13px', background: '#f0fdf4',
          border: '1px solid #bbf7d0', borderRadius: 8, fontSize: 13, color: '#166534', lineHeight: 1.5,
        }}>
          {kart.partner_cevap
            ? <><strong>Aldık ✓</strong> — {kart.partner_cevap}</>
            : <strong>✓ Tamamlandı</strong>}
        </div>
      )}

      {/* Açılabilirlik ipucu */}
      {acilabilir && !open && !cevaplandi && (
        <div style={{ marginTop: 6, fontSize: 11, color: cevaplanabilir ? '#4f46e5' : '#a1a1aa' }}>
          {cevaplanabilir ? '▸ aç: detay + cevapla' : '▸ detay'}
        </div>
      )}
      {acilabilir && !open && cevaplandi && kart.detay && (
        <div style={{ marginTop: 6, fontSize: 11, color: '#a1a1aa' }}>▸ detay</div>
      )}

      {/* Genişletilmiş içerik */}
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
            <div style={{ fontSize: 13.5, color: '#3f3f46', lineHeight: 1.7 }}>
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
