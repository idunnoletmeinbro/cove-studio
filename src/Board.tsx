import { useEffect, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, uid, saveImage, savePng, type Board, type Tile, type TileType } from './db'
import { Pic, pickFiles, loadImage, canvasBlob, download, Empty, Sheet, wrapText, textOn } from './util'

const NOTE_COLORS = ['#fff3b0', '#e7d9ff', '#ffd6e0', '#d6f5ef', '#ffe2c6']
export const newBoard = (name = 'New board'): Board => ({ id: uid(), name, tiles: [], bg: '#fbf7ff', createdAt: Date.now(), updatedAt: Date.now() })

export function Boards({ openId, setOpenId }: { openId: string | null; setOpenId: (s: string | null) => void }) {
  const boards = useLiveQuery(() => db.boards.orderBy('updatedAt').reverse().toArray()) ?? []
  if (openId) return <BoardEditor id={openId} onBack={() => setOpenId(null)} />
  return <section>
    <div className="row head"><h2>Mood Boards</h2><button className="primary" onClick={async () => { const b = newBoard(); await db.boards.put(b); setOpenId(b.id) }}>+ Board</button></div>
    {!boards.length ? <Empty icon="🌺" title="No boards yet" sub="Make a board and pile on images, notes and swatches." /> :
      <div className="grid">{boards.map(b => <div className="card" key={b.id} onClick={() => setOpenId(b.id)}>
        <div className="thumb" style={{ background: b.bg }}>{b.coverId ? <Pic id={b.coverId} /> : <BoardMini b={b} />}</div>
        <div className="body"><h4>{b.name}</h4><small>{b.tiles.length} tiles</small></div></div>)}</div>}
  </section>
}
function BoardMini({ b }: { b: Board }) {
  const imgs = b.tiles.filter(t => t.type === 'image').slice(0, 4)
  if (!imgs.length) return <span>🌺</span>
  return <div className="thumb collage" style={{ display: 'grid', width: '100%', height: '100%' }}>{imgs.map(t => <Pic key={t.id} id={t.imageId} src={t.src} />)}</div>
}

type Drag = { mode: 'move' | 'resize' | 'rotate' | 'pan' | 'pinch'; id?: string; sx: number; sy: number; t0?: Tile; v0: View; cx?: number; cy?: number; d0?: number; mid?: [number, number] }
type View = { x: number; y: number; s: number }

function BoardEditor({ id, onBack }: { id: string; onBack: () => void }) {
  const [b, setB] = useState<Board | null>(null)
  const [sel, setSel] = useState<string | null>(null)
  const [view, setView] = useState<View>({ x: 20, y: 20, s: 0.6 })
  const [editTile, setEditTile] = useState<Tile | null>(null)
  const [assetPick, setAssetPick] = useState(false)
  const wrap = useRef<HTMLDivElement>(null)
  const ptrs = useRef(new Map<number, [number, number]>()); const drag = useRef<Drag | null>(null)
  useEffect(() => { db.boards.get(id).then(x => x && setB(x)) }, [id])
  useEffect(() => { if (!b) return; const t = setTimeout(() => db.boards.put({ ...b, updatedAt: Date.now() }), 300); return () => clearTimeout(t) }, [b])
  const addRef = useRef<((p: any) => any) | null>(null)
  useEffect(() => {
    const paste = async (ev: ClipboardEvent) => { for (const it of ev.clipboardData?.items ?? []) if (it.type.startsWith('image/')) { const f = it.getAsFile(); if (f) addRef.current?.({ type: 'image', imageId: await saveImage(f) }) } }
    window.addEventListener('paste', paste); return () => window.removeEventListener('paste', paste)
  })
  if (!b) return null
  const upd = (tid: string, p: Partial<Tile>) => setB(x => x && ({ ...x, tiles: x.tiles.map(t => t.id === tid ? { ...t, ...p } : t) }))
  const center = () => { const r = wrap.current!.getBoundingClientRect(); return [(r.width / 2 - view.x) / view.s, (r.height / 2 - view.y) / view.s] }
  const add = (p: Partial<Tile> & { type: TileType }) => {
    const [cx, cy] = center(); const z = Math.max(0, ...b.tiles.map(t => t.z)) + 1
    const t: Tile = { id: uid(), x: cx - 120 + Math.random() * 60, y: cy - 120 + Math.random() * 60, w: 240, h: 240, rot: (Math.random() - .5) * 6, z, ...p }
    setB({ ...b, tiles: [...b.tiles, t] }); setSel(t.id); return t
  }
  addRef.current = add
  const addImages = async () => {
    for (const f of await pickFiles()) { const imageId = await saveImage(f); const im = await loadImage(imageId); const r = im ? im.height / im.width : 1; add({ type: 'image', imageId, w: 260, h: 260 * r }) }
  }
  const toStage = (cx: number, cy: number) => { const r = wrap.current!.getBoundingClientRect(); return [(cx - r.left - view.x) / view.s, (cy - r.top - view.y) / view.s] }

  const down = (e: React.PointerEvent, mode: Drag['mode'], tile?: Tile) => {
    e.stopPropagation(); (e.target as Element).setPointerCapture?.(e.pointerId)
    ptrs.current.set(e.pointerId, [e.clientX, e.clientY])
    if (ptrs.current.size === 2 && !tile) {
      const [a, c] = [...ptrs.current.values()]; drag.current = { mode: 'pinch', sx: 0, sy: 0, v0: view, d0: Math.hypot(a[0] - c[0], a[1] - c[1]), mid: [(a[0] + c[0]) / 2, (a[1] + c[1]) / 2] }; return
    }
    if (tile) { setSel(tile.id); if (mode === 'move') { const z = Math.max(...b.tiles.map(t => t.z)) + 1; if (tile.z < z - 1) upd(tile.id, { z }) } }
    else setSel(null)
    const [sx, sy] = toStage(e.clientX, e.clientY)
    drag.current = { mode, id: tile?.id, sx, sy, t0: tile, v0: view, cx: e.clientX, cy: e.clientY }
  }
  const move = (e: React.PointerEvent) => {
    if (!ptrs.current.has(e.pointerId)) return
    ptrs.current.set(e.pointerId, [e.clientX, e.clientY]); const d = drag.current; if (!d) return
    if (d.mode === 'pinch' && ptrs.current.size >= 2) {
      const [a, c] = [...ptrs.current.values()]; const dist = Math.hypot(a[0] - c[0], a[1] - c[1]); const s = Math.min(3, Math.max(.15, d.v0.s * dist / d.d0!))
      const r = wrap.current!.getBoundingClientRect(); const mx = d.mid![0] - r.left, my = d.mid![1] - r.top
      setView({ s, x: mx - (mx - d.v0.x) * s / d.v0.s, y: my - (my - d.v0.y) * s / d.v0.s }); return
    }
    if (d.mode === 'pan') { setView({ ...d.v0, x: d.v0.x + e.clientX - d.cx!, y: d.v0.y + e.clientY - d.cy! }); return }
    const [px, py] = toStage(e.clientX, e.clientY); const t = d.t0!
    if (d.mode === 'move') upd(t.id, { x: t.x + px - d.sx, y: t.y + py - d.sy })
    else if (d.mode === 'resize') { const k = t.type === 'image' ? Math.max(.1, ((px - t.x) / t.w + (py - t.y) / t.h) / 2) : 0; upd(t.id, k ? { w: t.w * k, h: t.h * k } : { w: Math.max(40, px - t.x), h: Math.max(30, py - t.y) }) }
    else if (d.mode === 'rotate') { const cx = t.x + t.w / 2, cy = t.y + t.h / 2; upd(t.id, { rot: Math.atan2(py - cy, px - cx) * 180 / Math.PI + 90 }) }
  }
  const up = (e: React.PointerEvent) => { ptrs.current.delete(e.pointerId); if (ptrs.current.size === 0) drag.current = null }
  const wheel = (e: React.WheelEvent) => { const r = wrap.current!.getBoundingClientRect(); const mx = e.clientX - r.left, my = e.clientY - r.top; const s = Math.min(3, Math.max(.15, view.s * (e.deltaY < 0 ? 1.1 : .9))); setView({ s, x: mx - (mx - view.x) * s / view.s, y: my - (my - view.y) * s / view.s }) }
  const st = b.tiles.find(t => t.id === sel)

  const onDrop = async (e: React.DragEvent) => { e.preventDefault(); for (const f of [...e.dataTransfer.files].filter(f => f.type.startsWith('image/'))) { const imageId = await saveImage(f); add({ type: 'image', imageId }) } }

  return <section className="board-ed">
    <div className="row head"><button className="ghost" onClick={onBack}>←</button>
      <input className="title-in" value={b.name} onChange={e => setB({ ...b, name: e.target.value })} />
      <button onClick={() => exportBoard(b)}>⬇ PNG</button></div>
    <div className="toolbar">
      <button onClick={addImages}>🖼 Image</button>
      <button onClick={() => add({ type: 'note', text: 'Note ✿', color: NOTE_COLORS[b.tiles.length % NOTE_COLORS.length], w: 200, h: 160 })}>🗒 Note</button>
      <button onClick={() => add({ type: 'text', text: 'Label', color: '#5b3592', w: 260, h: 70, rot: 0 })}>🔤 Text</button>
      <button onClick={() => add({ type: 'swatch', color: '#ffd23f', w: 120, h: 150, rot: 0 })}>🎨 Swatch</button>
      <button onClick={() => { const url = prompt('Link URL'); if (url) add({ type: 'link', url, text: url.replace(/^https?:\/\//, '').slice(0, 40), w: 240, h: 80, rot: 0 }) }}>🔗 Link</button>
      <button onClick={() => setAssetPick(true)}>🥥 Owned asset</button>
      <label className="bgpick">bg <input type="color" value={b.bg} onChange={e => setB({ ...b, bg: e.target.value })} /></label>
      <button className="ghost" onClick={() => setView(v => ({ ...v, s: Math.min(3, v.s * 1.2) }))}>＋</button><button className="ghost" onClick={() => setView(v => ({ ...v, s: Math.max(.15, v.s / 1.2) }))}>－</button>
    </div>
    {st && <div className="toolbar sel">
      <small>Selected {st.type}</small>
      {(st.type === 'note' || st.type === 'text' || st.type === 'link' || st.type === 'swatch') && <button onClick={() => setEditTile(st)}>✏️ Edit</button>}
      {st.type === 'image' && st.imageId && <button onClick={() => setB({ ...b, coverId: st.imageId })}>⭐ Set cover</button>}
      <button onClick={() => upd(st.id, { rot: 0 })}>↺ Straighten</button>
      <button onClick={() => upd(st.id, { z: Math.min(...b.tiles.map(t => t.z)) - 1 })}>⬇ Back</button>
      <button onClick={() => { const c = { ...st, id: uid(), x: st.x + 30, y: st.y + 30, z: st.z + 1 }; setB({ ...b, tiles: [...b.tiles, c] }); setSel(c.id) }}>⧉ Copy</button>
      <button className="danger" onClick={() => { setB({ ...b, tiles: b.tiles.filter(t => t.id !== st.id) }); setSel(null) }}>🗑</button>
    </div>}
    <div ref={wrap} className="stage-wrap" style={{ background: b.bg }} onPointerDown={e => down(e, 'pan')} onPointerMove={move} onPointerUp={up} onPointerCancel={up} onWheel={wheel} onDragOver={e => e.preventDefault()} onDrop={onDrop}>
      <div className="stage" style={{ transform: `translate(${view.x}px,${view.y}px) scale(${view.s})` }}>
        {[...b.tiles].sort((a, c) => a.z - c.z).map(t => <div key={t.id} className={`tile t-${t.type} ${sel === t.id ? 'sel' : ''}`}
          style={{ left: t.x, top: t.y, width: t.w, height: t.h, transform: `rotate(${t.rot}deg)`, zIndex: t.z, background: t.type === 'note' || t.type === 'swatch' ? t.color : undefined, color: t.type === 'text' ? t.color : undefined }}
          onPointerDown={e => down(e, 'move', t)} onPointerMove={move} onPointerUp={up} onPointerCancel={up} onDoubleClick={() => t.type !== 'image' && setEditTile(t)}>
          <TileBody t={t} />
          {sel === t.id && <><i className="h-resize" onPointerDown={e => down(e, 'resize', t)} onPointerMove={move} onPointerUp={up} /><i className="h-rotate" onPointerDown={e => down(e, 'rotate', t)} onPointerMove={move} onPointerUp={up} /></>}
        </div>)}
      </div>
      {!b.tiles.length && <div className="stage-hint">Add images, notes & swatches ✿<br /><small>drag to pan · pinch or scroll to zoom · drop or paste images</small></div>}
    </div>
    {editTile && <Sheet onClose={() => setEditTile(null)}>
      <h3>Edit {editTile.type}</h3>
      {editTile.type !== 'swatch' && <label>Text<textarea value={editTile.text ?? ''} onChange={e => setEditTile({ ...editTile, text: e.target.value })} /></label>}
      {editTile.type === 'link' && <label>URL<input value={editTile.url ?? ''} onChange={e => setEditTile({ ...editTile, url: e.target.value })} /></label>}
      {editTile.type === 'swatch' && <label>Name<input value={editTile.text ?? ''} onChange={e => setEditTile({ ...editTile, text: e.target.value })} /></label>}
      {editTile.type !== 'link' && <label>Color<input type="color" value={editTile.color ?? '#ffffff'} onChange={e => setEditTile({ ...editTile, color: e.target.value })} /></label>}
      <div className="row actions">{editTile.type === 'link' && editTile.url && <a className="btn" href={editTile.url} target="_blank" rel="noreferrer">Open ↗</a>}
        <button className="primary" onClick={() => { upd(editTile.id, editTile); setEditTile(null) }}>Save</button></div>
    </Sheet>}
    {assetPick && <AssetPicker onClose={() => setAssetPick(false)} onPick={a => { add({ type: 'image', src: a.thumb, text: a.title, url: a.url }); setAssetPick(false) }} />}
  </section>
}

function TileBody({ t }: { t: Tile }) {
  if (t.type === 'image') return <><Pic id={t.imageId} src={t.src} />{t.src && t.text && <span className="cap">{t.text}</span>}</>
  if (t.type === 'note') return <p>{t.text}</p>
  if (t.type === 'text') return <h3 style={{ fontSize: Math.max(14, t.h * .5) }}>{t.text}</h3>
  if (t.type === 'swatch') return <span className="sw-lab">{t.text || t.color}</span>
  return <span className="ln">🔗 {t.text}</span>
}

function AssetPicker({ onClose, onPick }: { onClose: () => void; onPick: (a: any) => void }) {
  const assets = useLiveQuery(() => db.assets.toArray()) ?? []; const [q, setQ] = useState('')
  const list = assets.filter(a => a.thumb && (!q || (a.title + ' ' + a.tags.join(' ')).toLowerCase().includes(q.toLowerCase()))).slice(0, 120)
  return <Sheet onClose={onClose}><h3>Owned assets from Cove Vault</h3>
    {!assets.length ? <p className="muted">Import a Cove Vault export first (Settings → Import Cove Vault export).</p> : <>
      <input placeholder="Search…" value={q} onChange={e => setQ(e.target.value)} />
      <div className="grid small-grid">{list.map(a => <div className="card" key={a.id} onClick={() => onPick(a)}><div className="thumb"><img src={a.thumb} alt="" /></div><div className="body"><small>{a.title}</small></div></div>)}</div></>}
  </Sheet>
}

export async function exportBoard(b: Board) {
  if (!b.tiles.length) return alert('Board is empty')
  const pad = 40; const xs = b.tiles.flatMap(t => [t.x, t.x + t.w]), ys = b.tiles.flatMap(t => [t.y, t.y + t.h])
  const minX = Math.min(...xs) - pad, minY = Math.min(...ys) - pad, W = Math.max(...xs) + pad - minX, H = Math.max(...ys) + pad - minY
  const sc = Math.min(2, 4000 / Math.max(W, H))
  const c = document.createElement('canvas'); c.width = W * sc; c.height = H * sc; const x = c.getContext('2d')!
  x.scale(sc, sc); x.fillStyle = b.bg; x.fillRect(0, 0, W, H); x.translate(-minX, -minY)
  for (const t of [...b.tiles].sort((a, c) => a.z - c.z)) {
    x.save(); x.translate(t.x + t.w / 2, t.y + t.h / 2); x.rotate(t.rot * Math.PI / 180); x.translate(-t.w / 2, -t.h / 2)
    x.shadowColor = 'rgba(60,30,100,.18)'; x.shadowBlur = 12; x.shadowOffsetY = 4
    if (t.type === 'image') { const im = await loadImage(t.imageId, t.src); x.fillStyle = '#fff'; x.fillRect(-6, -6, t.w + 12, t.h + 12); x.shadowColor = 'transparent'; if (im) { const r = Math.max(t.w / im.width, t.h / im.height); const iw = im.width * r, ih = im.height * r; x.save(); x.beginPath(); x.rect(0, 0, t.w, t.h); x.clip(); x.drawImage(im, (t.w - iw) / 2, (t.h - ih) / 2, iw, ih); x.restore() } }
    else if (t.type === 'note' || t.type === 'swatch' || t.type === 'link') {
      x.fillStyle = t.type === 'link' ? '#ffffff' : t.color!; x.beginPath(); x.roundRect(0, 0, t.w, t.h, 14); x.fill(); x.shadowColor = 'transparent'
      x.fillStyle = t.type === 'swatch' ? textOn(t.color!) : '#3b2560'; x.font = `600 ${t.type === 'note' ? 20 : 16}px Nunito, sans-serif`
      if (t.type === 'swatch') x.fillText(t.text || t.color!, 10, t.h - 14)
      else wrapText(x, (t.type === 'link' ? '🔗 ' : '') + (t.text ?? ''), t.w - 28).forEach((l, i) => x.fillText(l, 14, 32 + i * 26))
    } else { x.shadowColor = 'transparent'; x.fillStyle = t.color!; x.font = `700 ${Math.max(14, t.h * .5)}px Fredoka, sans-serif`; x.textBaseline = 'middle'; x.fillText(t.text ?? '', 4, t.h / 2) }
    x.restore()
  }
  try { const blob = await canvasBlob(c); download(`${b.name || 'board'}.png`, blob); return blob }
  catch { alert('Could not export: an owned-asset image blocks export (store did not allow it). Remove that tile and try again.') }
}
export { savePng }
