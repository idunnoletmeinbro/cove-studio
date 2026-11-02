import { useEffect, useState } from 'react'
import { db } from './db'
const cache = new Map<string, string>()
export function useImgUrl(id?: string) {
  const [u, setU] = useState<string | undefined>(id ? cache.get(id) : undefined)
  useEffect(() => {
    let live = true; if (!id) { setU(undefined); return }
    if (cache.has(id)) { setU(cache.get(id)); return }
    db.images.get(id).then(i => { if (i && live) { const url = URL.createObjectURL(i.blob); cache.set(id, url); setU(url) } })
    return () => { live = false }
  }, [id])
  return u
}
export function Pic({ id, src, alt = '', className, style }: { id?: string; src?: string; alt?: string; className?: string; style?: React.CSSProperties }) {
  const u = useImgUrl(id); const s = src ?? u
  return s ? <img src={s} alt={alt} className={className} style={style} draggable={false} crossOrigin={src ? 'anonymous' : undefined} /> : null
}
export async function loadImage(id?: string, src?: string): Promise<HTMLImageElement | null> {
  let url = src
  if (id) { const i = await db.images.get(id); if (!i) return null; url = URL.createObjectURL(i.blob) }
  if (!url) return null
  return new Promise(r => { const im = new Image(); if (src) im.crossOrigin = 'anonymous'; im.onload = () => r(im); im.onerror = () => r(null); im.src = url! })
}
export function download(name: string, blob: Blob) { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 4000) }
export const canvasBlob = (c: HTMLCanvasElement) => new Promise<Blob>((r, j) => { try { c.toBlob(b => b ? r(b) : j(new Error('export failed')), 'image/png') } catch (e) { j(e) } })
export function pickFiles(multiple = true, accept = 'image/*'): Promise<File[]> {
  return new Promise(r => { const i = document.createElement('input'); i.type = 'file'; i.accept = accept; i.multiple = multiple; i.onchange = () => r([...(i.files ?? [])]); i.click() })
}
export const splitTags = (s: string) => s.split(',').map(t => t.trim()).filter(Boolean)
export function Empty({ icon, title, sub }: { icon: string; title: string; sub: string }) {
  return <div className="empty"><div className="bob">{icon}</div><h3>{title}</h3><p>{sub}</p></div>
}
export function Sheet({ onClose, children }: { onClose: () => void; children: React.ReactNode }) {
  return <div className="modal" onClick={onClose}><div className="sheet" onClick={e => e.stopPropagation()}>{children}</div></div>
}
// color helpers
export function hexToHsl(h: string): [number, number, number] {
  const n = parseInt(h.slice(1), 16), r = (n >> 16 & 255) / 255, g = (n >> 8 & 255) / 255, b = (n & 255) / 255
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2; let hh = 0, s = 0
  if (mx !== mn) { const d = mx - mn; s = l > .5 ? d / (2 - mx - mn) : d / (mx + mn); hh = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; hh *= 60 }
  return [hh, s, l]
}
export function hslToHex(h: number, s: number, l: number) {
  h = ((h % 360) + 360) % 360; const a = s * Math.min(l, 1 - l)
  const f = (n: number) => { const k = (n + h / 30) % 12; return Math.round(255 * (l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)))).toString(16).padStart(2, '0') }
  return '#' + f(0) + f(8) + f(4)
}
export const textOn = (hex: string) => hexToHsl(hex)[2] > .6 ? '#2a1a40' : '#fff'
export async function extractPalette(blob: Blob, k = 6): Promise<string[]> {
  const bmp = await createImageBitmap(blob); const c = document.createElement('canvas'); c.width = 80; c.height = 80
  const x = c.getContext('2d')!; x.drawImage(bmp, 0, 0, 80, 80); const d = x.getImageData(0, 0, 80, 80).data
  const buckets = new Map<number, [number, number, number, number]>()
  for (let i = 0; i < d.length; i += 4) { if (d[i + 3] < 128) continue; const key = (d[i] >> 4) << 8 | (d[i + 1] >> 4) << 4 | d[i + 2] >> 4; const b = buckets.get(key) ?? [0, 0, 0, 0]; b[0] += d[i]; b[1] += d[i + 1]; b[2] += d[i + 2]; b[3]++; buckets.set(key, b) }
  const sorted = [...buckets.values()].sort((a, b) => b[3] - a[3]).map(b => [b[0] / b[3], b[1] / b[3], b[2] / b[3]])
  const out: number[][] = []
  for (const c of sorted) { if (out.every(o => Math.hypot(o[0] - c[0], o[1] - c[1], o[2] - c[2]) > 48)) out.push(c); if (out.length >= k) break }
  return out.map(c => '#' + c.map(v => Math.round(v).toString(16).padStart(2, '0')).join(''))
}
export function wrapText(x: CanvasRenderingContext2D, t: string, maxW: number) {
  const lines: string[] = []
  for (const para of t.split('\n')) { let cur = ''; for (const w of para.split(' ')) { const tr = cur ? cur + ' ' + w : w; if (x.measureText(tr).width > maxW && cur) { lines.push(cur); cur = w } else cur = tr } lines.push(cur) }
  return lines
}
