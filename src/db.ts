import Dexie, { type Table } from 'dexie'
export const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36)
export type Status = 'spark' | 'exploring' | 'planned' | 'made'
export const STATUSES: Status[] = ['spark', 'exploring', 'planned', 'made']
export interface Img { id: string; blob: Blob }
export interface Idea { id: string; text: string; link?: string; imageIds: string[]; tags: string[]; star: boolean; status: Status; createdAt: number }
export type TileType = 'image' | 'note' | 'text' | 'swatch' | 'link'
export interface Tile { id: string; type: TileType; x: number; y: number; w: number; h: number; rot: number; z: number; imageId?: string; src?: string; text?: string; color?: string; url?: string }
export interface Board { id: string; name: string; tiles: Tile[]; coverId?: string; bg: string; createdAt: number; updatedAt: number }
export interface Sketch { id: string; name: string; imageId: string; createdAt: number }
export interface Palette { id: string; name: string; colors: string[]; createdAt: number }
export interface Concept { id: string; name: string; tagline: string; vibes: string[]; species: string; personality: string; backstory: string; paletteId?: string; boardId?: string; sketchIds: string[]; outfits: string; features: string[]; status: Status; ideaId?: string; createdAt: number }
export const REF_CATS = ['hair', 'outfits', 'poses', 'textures', 'accessories', 'faces', 'other']
export interface Ref { id: string; imageId: string; category: string; tags: string[]; note?: string; boardIds: string[]; createdAt: number }
export interface Asset { id: string; title: string; store: string; thumb?: string; url?: string; tags: string[] }
class StudioDB extends Dexie {
  images!: Table<Img, string>; ideas!: Table<Idea, string>; boards!: Table<Board, string>; sketches!: Table<Sketch, string>
  palettes!: Table<Palette, string>; concepts!: Table<Concept, string>; refs!: Table<Ref, string>; assets!: Table<Asset, string>
  constructor() {
    super('cove-studio')
    this.version(1).stores({ images: 'id', ideas: 'id, status, createdAt', boards: 'id, updatedAt', sketches: 'id, createdAt', palettes: 'id, createdAt', concepts: 'id, status, createdAt', refs: 'id, category, createdAt', assets: 'id' })
  }
}
export const db = new StudioDB()

export async function compress(file: Blob, max = 1600): Promise<Blob> {
  try {
    const bmp = await createImageBitmap(file)
    const s = Math.min(1, max / Math.max(bmp.width, bmp.height))
    const c = document.createElement('canvas'); c.width = Math.round(bmp.width * s); c.height = Math.round(bmp.height * s)
    c.getContext('2d')!.drawImage(bmp, 0, 0, c.width, c.height)
    return await new Promise(r => c.toBlob(b => r(b ?? file), 'image/webp', 0.85))
  } catch { return file }
}
export async function saveImage(file: Blob, max?: number) { const id = uid(); await db.images.put({ id, blob: await compress(file, max) }); return id }
export async function savePng(blob: Blob) { const id = uid(); await db.images.put({ id, blob }); return id }

const toData = (b: Blob) => new Promise<string>(r => { const f = new FileReader(); f.onload = () => r(f.result as string); f.readAsDataURL(b) })
const TABLES = ['ideas', 'boards', 'sketches', 'palettes', 'concepts', 'refs', 'assets'] as const
export async function exportAll() {
  const out: any = { app: 'cove-studio', version: 1, exportedAt: new Date().toISOString() }
  for (const t of TABLES) out[t] = await (db as any)[t].toArray()
  out.images = await Promise.all((await db.images.toArray()).map(async i => ({ id: i.id, data: await toData(i.blob) })))
  return out
}
export async function importStudio(d: any) {
  if (d?.app !== 'cove-studio') throw new Error('Not a Cove Studio backup')
  await db.transaction('rw', db.tables, async () => {
    for (const t of TABLES) if (Array.isArray(d[t])) await (db as any)[t].bulkPut(d[t])
    for (const i of d.images ?? []) await db.images.put({ id: i.id, blob: await (await fetch(i.data)).blob() })
  })
}
export async function importVault(d: any) {
  if (d?.app !== 'cove-vault' || !Array.isArray(d.items)) throw new Error('Not a Cove Vault export')
  const a: Asset[] = d.items.map((i: any) => ({ id: String(i.id ?? uid()), title: i.title ?? 'Untitled', store: i.store ?? 'Other', thumb: i.thumb, url: i.url, tags: i.tags ?? [] }))
  await db.assets.bulkPut(a); return a.length
}
