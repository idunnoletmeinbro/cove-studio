import { useEffect, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, uid, savePng, saveImage, type Sketch } from './db'
import { Pic, pickFiles, loadImage, canvasBlob, download, Empty } from './util'

export const BRAND = ['#5b3592', '#8e5fd0', '#a98bd6', '#ffd23f', '#f6a5b8', '#f0845c', '#1c879f', '#90cdcf', '#7a4e30', '#f6ead2', '#17384a', '#ffffff']
const W = 1080, H = 1350

export function Sketches() {
  const list = useLiveQuery(() => db.sketches.orderBy('createdAt').reverse().toArray()) ?? []
  const [open, setOpen] = useState<Sketch | 'new' | null>(null)
  if (open) return <Pad sketch={open === 'new' ? null : open} onDone={() => setOpen(null)} />
  return <section>
    <div className="row head"><h2>Sketch Pad</h2><button className="primary" onClick={() => setOpen('new')}>+ Sketch</button></div>
    {!list.length ? <Empty icon="✏️" title="No sketches yet" sub="Doodle over a base avatar or reference, then save it to your gallery." /> :
      <div className="grid">{list.map(s => <div className="card" key={s.id} onClick={() => setOpen(s)}><div className="thumb" style={{ background: '#fff' }}><Pic id={s.imageId} /></div><div className="body"><h4>{s.name}</h4></div></div>)}</div>}
  </section>
}

function Pad({ sketch, onDone }: { sketch: Sketch | null; onDone: () => void }) {
  const bgRef = useRef<HTMLCanvasElement>(null); const inkRef = useRef<HTMLCanvasElement>(null)
  const [color, setColor] = useState('#5b3592'); const [size, setSize] = useState(8); const [tool, setTool] = useState<'pen' | 'brush' | 'eraser'>('pen')
  const [name, setName] = useState(sketch?.name ?? 'Sketch ' + new Date().toLocaleDateString())
  const [bgOpacity, setBgOpacity] = useState(.6)
  const undo = useRef<ImageData[]>([]); const redo = useRef<ImageData[]>([]); const [, force] = useState(0)
  const bgImg = useRef<HTMLImageElement | null>(null); const last = useRef<[number, number, number] | null>(null)
  const ink = () => inkRef.current!.getContext('2d')!
  const drawBg = () => { const x = bgRef.current!.getContext('2d')!; x.fillStyle = '#fff'; x.fillRect(0, 0, W, H); const im = bgImg.current; if (im) { const r = Math.min(W / im.width, H / im.height); x.globalAlpha = bgOpacity; x.drawImage(im, (W - im.width * r) / 2, (H - im.height * r) / 2, im.width * r, im.height * r); x.globalAlpha = 1 } }
  useEffect(() => { drawBg() }, [bgOpacity])
  useEffect(() => { drawBg(); if (sketch) loadImage(sketch.imageId).then(im => im && ink().drawImage(im, 0, 0, W, H)) }, [])
  const snap = () => { undo.current.push(ink().getImageData(0, 0, W, H)); if (undo.current.length > 30) undo.current.shift(); redo.current = []; force(n => n + 1) }
  const pos = (e: React.PointerEvent): [number, number, number] => { const r = inkRef.current!.getBoundingClientRect(); return [(e.clientX - r.left) * W / r.width, (e.clientY - r.top) * H / r.height, e.pressure || .5] }
  const down = (e: React.PointerEvent) => { if (e.pointerType === 'touch' && !e.isPrimary) return; inkRef.current!.setPointerCapture(e.pointerId); snap(); last.current = pos(e); stroke(last.current, last.current) }
  const stroke = (a: number[], b: number[]) => {
    const x = ink(); x.globalCompositeOperation = tool === 'eraser' ? 'destination-out' : 'source-over'
    x.strokeStyle = color; x.lineCap = x.lineJoin = 'round'; x.globalAlpha = tool === 'brush' ? .35 : 1
    x.lineWidth = tool === 'brush' ? size * 2.5 : size * (tool === 'pen' && e2p ? .5 + b[2] : 1)
    x.beginPath(); x.moveTo(a[0], a[1]); x.lineTo(b[0], b[1]); x.stroke(); x.globalAlpha = 1
  }
  const e2p = true
  const move = (e: React.PointerEvent) => { if (!last.current) return; const p = pos(e); stroke(last.current, p); last.current = p }
  const up = () => { last.current = null }
  const doUndo = () => { const d = undo.current.pop(); if (!d) return; redo.current.push(ink().getImageData(0, 0, W, H)); ink().putImageData(d, 0, 0); force(n => n + 1) }
  const doRedo = () => { const d = redo.current.pop(); if (!d) return; undo.current.push(ink().getImageData(0, 0, W, H)); ink().putImageData(d, 0, 0); force(n => n + 1) }
  const merged = async (withBg = true) => { const c = document.createElement('canvas'); c.width = W; c.height = H; const x = c.getContext('2d')!; if (withBg) x.drawImage(bgRef.current!, 0, 0); x.drawImage(inkRef.current!, 0, 0); return canvasBlob(c) }
  const save = async () => {
    const imageId = await savePng(await merged())
    if (sketch) { await db.images.delete(sketch.imageId); await db.sketches.put({ ...sketch, name, imageId }) } else await db.sketches.put({ id: uid(), name, imageId, createdAt: Date.now() })
    onDone()
  }
  // note: saved sketch flattens the background; re-opening draws it as ink
  return <section className="pad">
    <div className="row head"><button className="ghost" onClick={onDone}>←</button><input className="title-in" value={name} onChange={e => setName(e.target.value)} /><button className="primary" onClick={save}>💾 Save</button></div>
    <div className="toolbar">
      {(['pen', 'brush', 'eraser'] as const).map(t => <button key={t} className={tool === t ? 'on' : ''} onClick={() => setTool(t)}>{t === 'pen' ? '🖊 Pen' : t === 'brush' ? '🖌 Brush' : '🧽 Eraser'}</button>)}
      <label className="bgpick">size <input type="range" min={1} max={60} value={size} onChange={e => setSize(+e.target.value)} /></label>
      <button disabled={!undo.current.length} onClick={doUndo}>↶</button><button disabled={!redo.current.length} onClick={doRedo}>↷</button>
      <button onClick={async () => { const [f] = await pickFiles(false); if (f) { bgImg.current = await loadImage(await saveImage(f)); drawBg() } }}>🧍 Reference</button>
      {bgImg.current && <label className="bgpick">ref <input type="range" min={.1} max={1} step={.05} value={bgOpacity} onChange={e => setBgOpacity(+e.target.value)} /></label>}
      <button onClick={async () => download(name + '.png', await merged())}>⬇ PNG</button>
      <button onClick={() => { snap(); ink().clearRect(0, 0, W, H) }}>🧹 Clear</button>
    </div>
    <div className="swatches">{BRAND.map(c => <button key={c} className={'sw' + (c === color ? ' on' : '')} style={{ background: c }} onClick={() => { setColor(c); if (tool === 'eraser') setTool('pen') }} aria-label={c} />)}<input type="color" value={color} onChange={e => setColor(e.target.value)} /></div>
    <div className="canvas-box"><canvas ref={bgRef} width={W} height={H} /><canvas ref={inkRef} width={W} height={H} className="ink" onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} /></div>
  </section>
}
