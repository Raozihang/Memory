const http = require('http')
const fs = require('fs')
const path = require('path')
const { URL } = require('url')
const { spawnSync } = require('child_process')
const zlib = require('zlib')
require('dotenv').config({ path: path.join(__dirname, '.env') })
const dao = require('./dao')

// Optional dependencies
let sharp
try {
  sharp = require('sharp')
} catch (e) {
  console.warn('Sharp not found, image resizing will be disabled.')
}

// Configuration
const PORT = process.env.PORT || 8080
const ROOT_DIR = path.resolve(__dirname, '..')
const DATA_DIR = path.join(__dirname, 'data')
const STORAGE_DIR = path.join(__dirname, 'storage')

// Storage Module
let storage
try {
  storage = require('./storage')
} catch (e) {
  console.error('Failed to load storage module, falling back to local storage.', e)
  // Fallback implementation
  const ensureDir = (p) => { if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true }) }
  ensureDir(STORAGE_DIR)
  ensureDir(path.join(STORAGE_DIR, 'originals'))
  ensureDir(path.join(STORAGE_DIR, 'derivatives'))
  
  storage = {
    type: 'local-fallback',
    saveOriginal(name, buffer) {
      const key = path.join('originals', name)
      fs.writeFileSync(path.join(STORAGE_DIR, key), buffer)
      return key
    },
    read(key) {
      return fs.readFileSync(path.join(STORAGE_DIR, key))
    },
    getSignedUrl(key) {
      return `/api/files/${encodeURIComponent(key)}`
    },
    filePath(key) {
      return path.join(STORAGE_DIR, key)
    }
  }
}

// --- Initialization ---

function ensureDir(p) {
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true })
}

async function init() {
  ensureDir(DATA_DIR)
  ensureDir(STORAGE_DIR)
  ensureDir(path.join(STORAGE_DIR, 'originals'))
  ensureDir(path.join(STORAGE_DIR, 'derivatives'))

  // Initialize DAO (connects to DB if enabled)
  const connected = await dao.init()
  if (dao.USE_MYSQL && !connected) {
      console.error('Failed to connect to MySQL. Exiting.')
      process.exit(1)
  }
  
  if (!dao.USE_MYSQL) {
      // Seed files only if using JSON
      const seedFile = (p, v) => { if (!fs.existsSync(p)) fs.writeFileSync(p, JSON.stringify(v, null, 2)) }
      seedFile(dao.DB_PATHS.photos, [])
      seedFile(dao.DB_PATHS.albums, [{ id: 'demo', title: '高2024级研学活动', description: '示例相册', cover_photo_id: null }])
      seedFile(dao.DB_PATHS.shares, [])
      seedFile(dao.DB_PATHS.exif, [])
      seedFile(dao.DB_PATHS.derivatives, [])
      seedFile(dao.DB_PATHS.albumPhotos, [])
  }
  
  await processPendingUploads()
}

async function processPendingUploads() {
  try {
    const tmpUploadPath = path.join(ROOT_DIR, 'tmp', 'upload.json')
    if (fs.existsSync(tmpUploadPath)) {
      console.log('Processing pending upload:', tmpUploadPath)
      const sample = JSON.parse(fs.readFileSync(tmpUploadPath).toString())
      const photos = await dao.getPhotos()
      
      if ((photos || []).length === 0 && sample && sample.dataUrl && sample.filename) {
        const id = Date.now().toString(36)
        const b64 = sample.dataUrl.split(',').pop()
        const buf = Buffer.from(b64, 'base64')
        const originalKey = path.join('originals', `${id}-${sample.filename}`)
        
        storage.saveOriginal(`${id}-${sample.filename}`, buf)
        
        const photo = {
          id,
          album_id: sample.albumId || 'demo',
          filename: sample.filename,
          storage_key: originalKey,
          mime: 'image/png',
          bytes: buf.length,
          taken_at: sample.taken_at || new Date().toISOString(),
          created_at: new Date().toISOString()
        }
        
        await dao.addPhoto(photo)
        
        // Derivatives
        const extMap = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp' }
        const baseName = path.parse(sample.filename).name
        
        const saveVariant = async (dataUrl, type) => {
          if (!dataUrl) return null
          const mime = (dataUrl.split(';')[0].split(':')[1] || 'image/png')
          const ext = extMap[mime] || '.png'
          const key = path.join('derivatives', `${id}-${type}-${baseName}${ext}`)
          
          const b64Variant = dataUrl.split(',').pop()
          const bufVariant = Buffer.from(b64Variant, 'base64')
          fs.writeFileSync(path.join(STORAGE_DIR, key), bufVariant)
          
          await dao.addDerivative({ photo_id: id, type, storage_key: key })
          return key
        }
        
        await saveVariant(sample.displayDataUrl || sample.dataUrl, 'display')
        await saveVariant(sample.mediumDataUrl || sample.dataUrl, 'medium')
        await saveVariant(sample.thumbDataUrl || sample.dataUrl, 'thumb')
        
        await dao.saveExif(id, { taken_at: photo.taken_at })
      }
    }
  } catch (e) {
    console.error('Error processing pending uploads:', e)
  }
}

function sendJson(res, obj, statusCode = 200) {
  res.statusCode = statusCode
  res.setHeader('Content-Type', 'application/json')
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.end(JSON.stringify(obj))
}

function sendFile(p, mime, req, res) {
  if (!fs.existsSync(p)) {
    res.statusCode = 404
    return res.end('File not found')
  }
  
  const stat = fs.statSync(p)
  const etag = `"${stat.size}-${Math.floor(stat.mtimeMs).toString(16)}"`

  res.setHeader('Content-Type', mime)
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Accept-Ranges', 'bytes')
  res.setHeader('ETag', etag)
  
  const longCache = 'public, max-age=31536000, immutable'
  const noCache = 'no-cache'
  const useNoCache = mime.startsWith('text/html')
  
  res.setHeader('Cache-Control', useNoCache ? noCache : longCache)

  if (req.headers['if-none-match'] === etag) {
    res.statusCode = 304
    return res.end()
  }

  const rangeHeader = req.headers.range
  if (rangeHeader) {
    const m = /^bytes=(\d*)-(\d*)$/.exec(rangeHeader)
    if (!m) {
      res.statusCode = 416
      res.setHeader('Content-Range', `bytes */${stat.size}`)
      return res.end()
    }

    const startStr = m[1]
    const endStr = m[2]
    let start
    let end

    if (startStr === '' && endStr !== '') {
      const suffixLen = Number(endStr)
      if (!Number.isFinite(suffixLen) || suffixLen <= 0) {
        res.statusCode = 416
        res.setHeader('Content-Range', `bytes */${stat.size}`)
        return res.end()
      }
      start = Math.max(0, stat.size - suffixLen)
      end = stat.size - 1
    } else {
      start = Number(startStr || 0)
      end = endStr ? Number(endStr) : stat.size - 1
    }

    if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end < start || start >= stat.size) {
      res.statusCode = 416
      res.setHeader('Content-Range', `bytes */${stat.size}`)
      return res.end()
    }

    const chunkSize = end - start + 1
    res.statusCode = 206
    res.setHeader('Content-Range', `bytes ${start}-${end}/${stat.size}`)
    res.setHeader('Content-Length', chunkSize)

    if (req.method === 'HEAD') return res.end()
    return fs.createReadStream(p, { start, end }).pipe(res)
  }

  // 对于非图片文件（如 JS/CSS/HTML），尝试 gzip 压缩
  const acceptEncoding = req.headers['accept-encoding'] || ''
  const isCompressible = mime.startsWith('text/') || mime === 'application/javascript' || mime === 'application/json'
  
  if (isCompressible && acceptEncoding.includes('gzip')) {
    res.setHeader('Content-Encoding', 'gzip')
    res.setHeader('Vary', 'Accept-Encoding')
    // 不设置 Content-Length，因为压缩后大小未知
    if (req.method === 'HEAD') return res.end()
    return fs.createReadStream(p).pipe(zlib.createGzip()).pipe(res)
  }

  res.setHeader('Content-Length', stat.size)
  if (req.method === 'HEAD') return res.end()
  fs.createReadStream(p).pipe(res)
}

function parseBody(req) {
  return new Promise(resolve => {
    let data = ''
    req.on('data', chunk => { data += chunk })
    req.on('end', () => {
      try {
        resolve(JSON.parse(data || '{}'))
      } catch {
        resolve({})
      }
    })
  })
}

function buildDerivativeIndex(derivatives) {
  const index = new Map()
  for (const d of derivatives || []) {
    if (!index.has(d.photo_id)) index.set(d.photo_id, {})
    const m = index.get(d.photo_id)
    if (d.type === 'display') m.display = d.storage_key
    if (d.type === 'thumb') m.thumb = d.storage_key
    if (d.type === 'medium') m.medium = d.storage_key
  }
  return index
}

function withDerivativeKeys(photo, dIndex) {
  if (!photo) return null
  const d = dIndex?.get(photo.id) || {}
  const displayKey = d.display || photo.storage_key
  return {
    ...photo,
    display_key: displayKey,
    thumb_key: d.thumb || displayKey || photo.storage_key,
    medium_key: d.medium || displayKey || photo.storage_key
  }
}

async function generateDerivatives(id, filename, originalPath, dataUrl, displayDataUrl, mediumDataUrl, thumbDataUrl) {
  const extMap = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp' }
  const baseName = path.parse(filename).name
  
  const saveVariant = async (dUrl, type) => {
    if (!dUrl) return null
    const mime = (dUrl.split(';')[0].split(':')[1] || 'image/jpeg')
    const ext = extMap[mime] || '.jpg'
    const key = path.join('derivatives', `${id}-${type}-${baseName}${ext}`)
    
    const b64 = dUrl.split(',').pop()
    const buf = Buffer.from(b64, 'base64')
    fs.writeFileSync(path.join(STORAGE_DIR, key), buf)
    
    await dao.addDerivative({ photo_id: id, type, storage_key: key })
    return key
  }

  // 1. Try to save provided derivatives
  let keyDisplay = await saveVariant(displayDataUrl, 'display')
  let keyMedium = await saveVariant(mediumDataUrl, 'medium')
  let keyThumb = await saveVariant(thumbDataUrl, 'thumb')

  // 2. Fallback if missing
  if (!keyDisplay && !sharp) {
    keyDisplay = await saveVariant(dataUrl, 'display')
  }

  // 3. Generate with Sharp if available
  if (sharp) {
    const fullOriginalPath = path.join(STORAGE_DIR, originalPath)
    
    if (!keyDisplay) {
      const k = path.join('derivatives', `${id}-display-${baseName}.webp`)
      try {
        await sharp(fullOriginalPath).resize(1600, 1600, { fit: 'inside' }).webp({ quality: 80 }).toFile(path.join(STORAGE_DIR, k))
        await dao.addDerivative({ photo_id: id, type: 'display', storage_key: k })
        keyDisplay = k
      } catch (e) { console.error('Sharp error (display):', e) }
    }
    
    if (!keyMedium) {
      const k = path.join('derivatives', `${id}-medium-${baseName}.webp`)
      try {
        await sharp(fullOriginalPath).resize(800, 800, { fit: 'inside' }).webp({ quality: 70 }).toFile(path.join(STORAGE_DIR, k))
        await dao.addDerivative({ photo_id: id, type: 'medium', storage_key: k })
        keyMedium = k
      } catch (e) { console.error('Sharp error (medium):', e) }
    }
    
    if (!keyThumb) {
      const k = path.join('derivatives', `${id}-thumb-${baseName}.webp`)
      try {
        await sharp(fullOriginalPath).resize(320, 320, { fit: 'inside' }).webp({ quality: 60 }).toFile(path.join(STORAGE_DIR, k))
        await dao.addDerivative({ photo_id: id, type: 'thumb', storage_key: k })
        keyThumb = k
      } catch (e) { console.error('Sharp error (thumb):', e) }
    }
  }
}

// --- Request Handlers ---

async function handleApiRequest(req, res, url) {
  // 1. Health Check
  if (req.method === 'GET' && url.pathname === '/api/health') {
    return sendJson(res, { 
      ok: true, 
      storage_mode: dao.USE_MYSQL ? 'mysql' : 'json' 
    })
  }

  // 2. Serve Files (Originals/Derivatives)
  if (req.method === 'GET' && url.pathname.startsWith('/api/files/')) {
    const key = decodeURIComponent(url.pathname.replace('/api/files/', ''))
    const file = path.join(STORAGE_DIR, key)
    
    if (!fs.existsSync(file)) {
      return sendJson(res, { error: 'not found' }, 404)
    }
    
    const ext = path.extname(file).toLowerCase()
    const mime = ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg'
               : ext === '.png' ? 'image/png'
               : ext === '.webp' ? 'image/webp'
               : 'application/octet-stream'
    return sendFile(file, mime, req, res)
  }

  // 3. List Photos
  if (req.method === 'GET' && url.pathname === '/api/photos') {
    const albumId = url.searchParams.get('albumId') || null
    const limitRaw = url.searchParams.get('limit')
    const offsetRaw = url.searchParams.get('offset')
    const startTakenAt = url.searchParams.get('startTakenAt') || null
    const endTakenAt = url.searchParams.get('endTakenAt') || null

    const hasPaging = limitRaw !== null || offsetRaw !== null || startTakenAt || endTakenAt || albumId
    const limit = limitRaw !== null ? Math.max(1, Math.min(500, Number(limitRaw) || 200)) : (hasPaging ? 200 : null)
    const offset = offsetRaw !== null ? Math.max(0, Number(offsetRaw) || 0) : 0

    const photos = await dao.getPhotos({ albumId, startTakenAt, endTakenAt, limit, offset })
    const photoIds = photos.map(p => p.id)
    const derivatives = hasPaging ? await dao.getDerivativesByPhotoIds(photoIds) : await dao.getDerivatives()
    const dIndex = buildDerivativeIndex(derivatives)

    const items = photos.map(p => withDerivativeKeys(p, dIndex))

    if (!hasPaging) return sendJson(res, { items })

    const total = await dao.countPhotos({ albumId, startTakenAt, endTakenAt })
    const nextOffset = offset + items.length
    const hasMore = nextOffset < total
    return sendJson(res, { items, total, limit: limit || items.length, offset, nextOffset: hasMore ? nextOffset : null, hasMore })
  }

  // 4. Upload Photo
  if (req.method === 'POST' && url.pathname === '/api/photos') {
    const body = await parseBody(req)
    const { albumId, filename, dataUrl, displayDataUrl, mediumDataUrl, thumbDataUrl, taken_at, exif } = body
    
    if (!dataUrl || !filename) {
      return sendJson(res, { error: 'missing file' }, 400)
    }

    const id = Date.now().toString(36)
    
    // Save Original
    const b64 = dataUrl.split(',').pop()
    const buf = Buffer.from(b64, 'base64')
    const originalKey = path.join('originals', `${id}-${filename}`)
    storage.saveOriginal(`${id}-${filename}`, buf)

    // Update DB
    const photo = {
      id,
      album_id: albumId || 'demo',
      filename,
      storage_key: originalKey,
      mime: 'image/jpeg',
      bytes: buf.length,
      taken_at: taken_at || new Date().toISOString(),
      created_at: new Date().toISOString()
    }
    await dao.addPhoto(photo)
    
    // Save EXIF
    await dao.saveExif(id, exif || { taken_at: photo.taken_at })

    // Generate Derivatives
    await generateDerivatives(id, filename, originalKey, dataUrl, displayDataUrl, mediumDataUrl, thumbDataUrl)

    return sendJson(res, { id })
  }

  // 5. Timeline
  if (req.method === 'GET' && url.pathname === '/api/timeline') {
    const photos = await dao.getPhotos()
    const groups = {}
    for (const p of photos) {
      const d = new Date(p.taken_at)
      if (isNaN(d.getTime())) continue
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
      groups[key] = (groups[key] || 0) + 1
    }
    return sendJson(res, { days: groups })
  }

  // 6. Albums (List/Create/Update)
  if (req.method === 'GET' && url.pathname === '/api/albums') {
    const albums = await dao.getAlbums()
    const includeCover = url.searchParams.get('includeCover') === '1'
    if (!includeCover) return sendJson(res, { items: albums })

    const albumIds = albums.map(a => a.id)
    const latestByAlbum = await dao.getLatestPhotoPerAlbum(albumIds)
    const latestMap = new Map(latestByAlbum.map(p => [p.album_id, p]))

    const coverIds = albums.map(a => a.cover_photo_id).filter(Boolean)
    const coverById = coverIds.length > 0 ? await dao.getPhotosByIds(coverIds) : []
    const coverMap = new Map(coverById.map(p => [p.id, p]))

    const selectedCovers = albums.map(a => (a.cover_photo_id && coverMap.get(a.cover_photo_id)) || latestMap.get(a.id) || null)
    const coverPhotoIds = Array.from(new Set(selectedCovers.filter(Boolean).map(p => p.id)))
    const derivatives = coverPhotoIds.length > 0 ? await dao.getDerivativesByPhotoIds(coverPhotoIds) : []
    const dIndex = buildDerivativeIndex(derivatives)

    const items = albums.map((a, idx) => {
      const cover = selectedCovers[idx]
      return { ...a, cover_photo: cover ? withDerivativeKeys(cover, dIndex) : null }
    })

    return sendJson(res, { items })
  }

  if (req.method === 'POST' && url.pathname === '/api/albums') {
    const body = await parseBody(req)
    const { title, description } = body
    const id = Date.now().toString(36)
    await dao.addAlbum({ id, title: title || '未命名', description: description || '', cover_photo_id: null })
    return sendJson(res, { id })
  }

  if (req.method === 'PUT' && url.pathname.match(/^\/api\/albums\/([a-z0-9]+)$/)) {
    const id = url.pathname.split('/')[3]
    const body = await parseBody(req)
    const updated = await dao.updateAlbum(id, body)
    if (!updated) return sendJson(res, { error: 'not found' }, 404)
    return sendJson(res, updated)
  }

  // 7. Album Photos (Add to album) - this might be redundant if we just set album_id on photo
  // But original code maintained a separate list.
  if (req.method === 'POST' && url.pathname.match(/^\/api\/albums\/([a-z0-9]+)\/photos$/)) {
    const albumId = url.pathname.split('/')[3]
    const body = await parseBody(req)
    const { photo_id, ordering } = body
    await dao.addAlbumPhoto({ album_id: albumId, photo_id, ordering: ordering || 0 })
    return sendJson(res, { ok: true })
  }

  // 8. Exports
  if (req.method === 'GET' && url.pathname === '/api/photos/export') {
    const albumId = url.searchParams.get('albumId') || 'demo'
    const photos = await dao.getPhotos()
    const albumPhotos = photos.filter(p => p.album_id === albumId)
    return sendJson(res, { 
      albumId, 
      files: albumPhotos.map(p => ({ filename: p.filename, url: `/api/photos/${p.id}/download` })) 
    })
  }

  if ((req.method === 'POST' || req.method === 'GET') && url.pathname.match(/^\/api\/albums\/([a-z0-9]+)\/export$/)) {
    const albumId = url.pathname.split('/')[3]
    const photos = await dao.getPhotos()
    const albumPhotos = photos.filter(p => p.album_id === albumId)
    const exportDir = path.join(STORAGE_DIR, 'exports')
    ensureDir(exportDir)
    
    const zipName = `album-${albumId}-${Date.now()}.zip`
    const zipPath = path.join(exportDir, zipName)
    const tmpDir = path.join(STORAGE_DIR, 'tmp', `export-${albumId}-${Date.now()}`)
    ensureDir(tmpDir)
    
    for (const p of albumPhotos) {
      const src = path.join(STORAGE_DIR, p.storage_key)
      const dest = path.join(tmpDir, p.filename)
      if (fs.existsSync(src)) fs.copyFileSync(src, dest)
    }
    
    try {
      // Using PowerShell for zipping on Windows
      spawnSync('powershell', ['-NoProfile', '-Command', `Compress-Archive -Path '${tmpDir}/*' -DestinationPath '${zipPath}' -Force`])
    } catch (e) {
      console.error('Zip generation failed:', e)
    }
    
    return sendJson(res, { url: `/api/files/${encodeURIComponent(path.relative(STORAGE_DIR, zipPath))}` })
  }

  // 9. Downloads & Info
  if (req.method === 'GET' && url.pathname.match(/^\/api\/photos\/([a-z0-9]+)\/download$/)) {
    const id = url.pathname.split('/')[3]
    const p = await dao.getPhoto(id)
    if (!p) return sendJson(res, { error: 'not found' }, 404)
    return sendFile(path.join(STORAGE_DIR, p.storage_key), 'application/octet-stream', req, res)
  }

  if (req.method === 'GET' && url.pathname.match(/^\/api\/photos\/([a-z0-9]+)\/downloadUrl$/)) {
    const id = url.pathname.split('/')[3]
    const p = await dao.getPhoto(id)
    if (!p) return sendJson(res, { error: 'not found' }, 404)
    return sendJson(res, { url: storage.getSignedUrl(p.storage_key) })
  }

  if (req.method === 'GET' && url.pathname.match(/^\/api\/photos\/([a-z0-9]+)\/exif$/)) {
    const id = url.pathname.split('/')[3]
    const e = await dao.getExif(id)
    if (!e) return sendJson(res, { error: 'not found' }, 404)
    return sendJson(res, { photo_id: id, exif_json: e })
  }

  // 10. Sharing
  if (req.method === 'POST' && url.pathname === '/api/shares') {
    const body = await parseBody(req)
    const { subject_type, subject_id, expires_at } = body
    const code = Math.random().toString(36).slice(2, 8)
    await dao.addShare({ 
      id: Date.now().toString(36), 
      code, 
      subject_type, 
      subject_id, 
      expires_at: expires_at || null, 
      permissions: ['view'] 
    })
    return sendJson(res, { code, url: `/s/${code}` })
  }

  // Unknown API
  return sendJson(res, { error: 'unknown api' }, 404)
}

function serveStatic(req, res, url) {
  const dist = path.join(ROOT_DIR, 'frontend-react', 'dist')
  let staticPath = path.join(dist, url.pathname.replace(/^\//, ''))
  
  if (url.pathname === '/') staticPath = path.join(dist, 'index.html')

  if (fs.existsSync(staticPath) && fs.statSync(staticPath).isFile()) {
    const ext = path.extname(staticPath)
    const mime = ext === '.html' ? 'text/html'
      : ext === '.css' ? 'text/css'
      : ext === '.js' ? 'text/javascript'
      : ext === '.svg' ? 'image/svg+xml'
      : ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg'
      : ext === '.png' ? 'image/png'
      : ext === '.webp' ? 'image/webp'
      : 'application/octet-stream'
    return sendFile(staticPath, mime, req, res)
  }
  
  // SPA Fallback
  if (req.method === 'GET' && !url.pathname.startsWith('/api') && !url.pathname.includes('.')) {
     const indexHtml = path.join(dist, 'index.html')
     if (fs.existsSync(indexHtml)) return sendFile(indexHtml, 'text/html', req, res)
  }

  res.statusCode = 404
  res.end('Not Found')
}

async function handleSharePage(req, res, url) {
  const code = url.pathname.split('/')[2]
  const shares = await dao.getShares()
  const s = shares.find(x => x.code === code)
  
  res.setHeader('Content-Type', 'text/html; charset=utf-8')
  
  if (!s) {
    res.statusCode = 404
    return res.end('分享不存在')
  }
  
  if (s.subject_type === 'album') {
    const a = await dao.getAlbum(s.subject_id)
    return res.end(`<h1>分享相册：${a ? a.title : '未知'}</h1> <p>代码：${code}</p> <a href="/">返回</a>`)
  }
  
  return res.end(`<h1>分享：${s.subject_type}</h1> <p>代码：${code}</p> <a href="/">返回</a>`)
}

// --- Server Main Loop ---

init().then(() => {
    const server = http.createServer(async (req, res) => {
      try {
        const url = new URL(req.url, `http://${req.headers.host}`)
        
        // Handle API
        if (url.pathname.startsWith('/api/')) {
          return await handleApiRequest(req, res, url)
        }
        
        // Handle Shares
        if (url.pathname.startsWith('/s/')) {
          return await handleSharePage(req, res, url)
        }
        
        // Handle Static
        return serveStatic(req, res, url)
        
      } catch (err) {
        console.error('Server Error:', err)
        res.statusCode = 500
        res.end('Internal Server Error')
      }
    })
    
    server.listen(PORT, () => {
      console.log(`Album server running at http://localhost:${PORT}`)
      console.log(`Serving static files from: ${path.join(ROOT_DIR, 'frontend-react', 'dist')}`)
    })
})
