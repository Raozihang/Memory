const fs = require('fs')
const path = require('path')
const db = require('./db')

const DATA_DIR = path.join(__dirname, 'data')
const DB_PATHS = {
  photos: path.join(DATA_DIR, 'photos.json'),
  albums: path.join(DATA_DIR, 'albums.json'),
  shares: path.join(DATA_DIR, 'shares.json'),
  exif: path.join(DATA_DIR, 'exif.json'),
  derivatives: path.join(DATA_DIR, 'derivatives.json'),
  albumPhotos: path.join(DATA_DIR, 'album_photos.json')
}

function readJson(p) {
  try { return JSON.parse(fs.readFileSync(p).toString()) } catch { return [] }
}
function writeJson(p, v) {
  fs.writeFileSync(p, JSON.stringify(v, null, 2))
}

module.exports = {
    // Getter to ensure we read the env var at runtime
    get USE_MYSQL() {
        return process.env.USE_MYSQL === 'true';
    },
    DB_PATHS,
    readJson,
    writeJson,

    async init() {
        if (this.USE_MYSQL) return await db.init()
        return true
    },

    // Photos
    async getPhotos(options = {}) {
        const { albumId = null, startTakenAt = null, endTakenAt = null, limit = null, offset = 0 } = options || {}
        if (this.USE_MYSQL) {
            if (limit !== null && limit !== undefined) {
                return await db.getPhotosPaged({ albumId, startTakenAt, endTakenAt, limit, offset })
            }
            if (albumId || startTakenAt || endTakenAt) {
                return await db.getPhotosPaged({ albumId, startTakenAt, endTakenAt, limit: 1000000, offset: 0 })
            }
            return await db.getPhotos()
        }

        let photos = readJson(DB_PATHS.photos)
        if (albumId) photos = photos.filter(p => p.album_id === albumId)
        if (startTakenAt) photos = photos.filter(p => p.taken_at >= startTakenAt)
        if (endTakenAt) photos = photos.filter(p => p.taken_at < endTakenAt)

        photos.sort((a, b) => {
            const ta = new Date(a.taken_at).getTime()
            const tb = new Date(b.taken_at).getTime()
            if (tb !== ta) return tb - ta
            const ca = new Date(a.created_at).getTime()
            const cb = new Date(b.created_at).getTime()
            if (cb !== ca) return cb - ca
            return String(b.id).localeCompare(String(a.id))
        })

        if (limit !== null && limit !== undefined) {
            const start = Math.max(0, Number(offset) || 0)
            const end = start + Math.max(0, Number(limit) || 0)
            return photos.slice(start, end)
        }

        return photos
    },
    async countPhotos(options = {}) {
        const { albumId = null, startTakenAt = null, endTakenAt = null } = options || {}
        if (this.USE_MYSQL) return await db.getPhotosCount({ albumId, startTakenAt, endTakenAt })
        let photos = readJson(DB_PATHS.photos)
        if (albumId) photos = photos.filter(p => p.album_id === albumId)
        if (startTakenAt) photos = photos.filter(p => p.taken_at >= startTakenAt)
        if (endTakenAt) photos = photos.filter(p => p.taken_at < endTakenAt)
        return photos.length
    },
    async getPhotosByIds(photoIds = []) {
        if (this.USE_MYSQL) return await db.getPhotosByIds(photoIds)
        const photos = readJson(DB_PATHS.photos)
        const set = new Set(photoIds || [])
        return photos.filter(p => set.has(p.id))
    },
    async getLatestPhotoPerAlbum(albumIds = []) {
        if (this.USE_MYSQL) return await db.getLatestPhotoPerAlbum(albumIds)
        const photos = readJson(DB_PATHS.photos)
        const albumSet = new Set(albumIds || [])
        const byAlbum = new Map()
        for (const p of photos) {
            if (!albumSet.has(p.album_id)) continue
            const prev = byAlbum.get(p.album_id)
            if (!prev) {
                byAlbum.set(p.album_id, p)
                continue
            }
            const prevTaken = new Date(prev.taken_at).getTime()
            const curTaken = new Date(p.taken_at).getTime()
            if (curTaken > prevTaken) {
                byAlbum.set(p.album_id, p)
                continue
            }
            if (curTaken === prevTaken) {
                const prevCreated = new Date(prev.created_at).getTime()
                const curCreated = new Date(p.created_at).getTime()
                if (curCreated > prevCreated) byAlbum.set(p.album_id, p)
            }
        }
        return Array.from(byAlbum.values())
    },
    async getPhoto(id) {
        if (this.USE_MYSQL) return await db.getPhoto(id)
        const photos = readJson(DB_PATHS.photos)
        return photos.find(p => p.id === id) || null
    },
    async addPhoto(photo) {
        if (this.USE_MYSQL) return await db.createPhoto(photo)
        const list = readJson(DB_PATHS.photos)
        list.push(photo)
        writeJson(DB_PATHS.photos, list)
    },

    // Derivatives
    async getDerivatives() {
        if (this.USE_MYSQL) return await db.getDerivatives()
        return readJson(DB_PATHS.derivatives)
    },
    async getDerivativesByPhotoIds(photoIds = []) {
        if (this.USE_MYSQL) return await db.getDerivativesByPhotoIds(photoIds)
        const list = readJson(DB_PATHS.derivatives)
        const set = new Set(photoIds || [])
        return list.filter(d => set.has(d.photo_id))
    },
    async addDerivative(derivative) {
        if (this.USE_MYSQL) return await db.addDerivative(derivative)
        const list = readJson(DB_PATHS.derivatives)
        list.push(derivative)
        writeJson(DB_PATHS.derivatives, list)
    },

    // Exif
    async getExif(photoId) {
        if (this.USE_MYSQL) return await db.getExif(photoId)
        const list = readJson(DB_PATHS.exif)
        const item = list.find(x => x.photo_id === photoId)
        return item ? item.exif_json : null
    },
    async saveExif(photoId, exifJson) {
        if (this.USE_MYSQL) return await db.saveExif(photoId, exifJson)
        const list = readJson(DB_PATHS.exif)
        list.push({ photo_id: photoId, exif_json: exifJson })
        writeJson(DB_PATHS.exif, list)
    },

    // Albums
    async getAlbums() {
        if (this.USE_MYSQL) return await db.getAlbums()
        return readJson(DB_PATHS.albums)
    },
    async getAlbum(id) {
        if (this.USE_MYSQL) return await db.getAlbum(id)
        const list = readJson(DB_PATHS.albums)
        return list.find(x => x.id === id) || null
    },
    async addAlbum(album) {
        if (this.USE_MYSQL) {
             await db.createAlbum(album)
        } else {
            const list = readJson(DB_PATHS.albums)
            list.push(album)
            writeJson(DB_PATHS.albums, list)
        }
    },
    async updateAlbum(id, data) {
        if (this.USE_MYSQL) {
            await db.updateAlbum(id, data)
            return await db.getAlbum(id)
        } else {
            const list = readJson(DB_PATHS.albums)
            const idx = list.findIndex(x => x.id === id)
            if (idx >= 0) {
                list[idx] = { ...list[idx], ...data }
                writeJson(DB_PATHS.albums, list)
                return list[idx]
            }
            return null
        }
    },

    // Shares
    async getShares() {
        return readJson(DB_PATHS.shares)
    },
    async addShare(share) {
        const list = readJson(DB_PATHS.shares)
        list.push(share)
        writeJson(DB_PATHS.shares, list)
    },
    
    // Album Photos
    async getAlbumPhotos() {
        return readJson(DB_PATHS.albumPhotos)
    },
    async addAlbumPhoto(ap) {
        const list = readJson(DB_PATHS.albumPhotos)
        list.push(ap)
        writeJson(DB_PATHS.albumPhotos, list)
    }
}
