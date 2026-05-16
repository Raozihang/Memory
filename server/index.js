const http = require('http')
const fs = require('fs')
const path = require('path')
const { URL } = require('url')
const crypto = require('crypto')
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
const UPLOAD_PASSWORD = process.env.UPLOAD_PASSWORD || 'jx2024'
const SESSION_SECRET = process.env.UPLOAD_SESSION_SECRET || process.env.SESSION_SECRET || 'change-this-upload-session-secret'
const SESSION_COOKIE_NAME = 'album_upload_session'
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 7
const SITE_TITLE = '记忆回廊'
const SITE_DESCRIPTION = '嘉祥记忆回廊 JX Memory - 记录嘉祥高2024级的美好回忆'
const STATIC_ROUTE_SHARE_META = {
  '/contact': {
    title: `联系我们 | ${SITE_TITLE}`,
    description: '反馈问题或联系我们',
    imagePath: '/logo.png'
  },
  '/donate': {
    title: `捐赠 | ${SITE_TITLE}`,
    description: '支持我们的网站运维',
    imagePath: '/logo.png'
  },
  '/timeline': {
    title: `时间轴 | ${SITE_TITLE}`,
    description: '按时间顺序回顾所有美好的瞬间',
    imagePath: '/logo.png'
  }
}

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

function listFilesRecursively(absDir, keyPrefix) {
  const out = []
  if (!fs.existsSync(absDir)) return out
  const entries = fs.readdirSync(absDir, { withFileTypes: true })
  for (const e of entries) {
    const abs = path.join(absDir, e.name)
    if (e.isDirectory()) {
      out.push(...listFilesRecursively(abs, `${keyPrefix}/${e.name}`))
      continue
    }
    if (!e.isFile()) continue
    out.push({ key: `${keyPrefix}/${e.name}`, absPath: abs })
  }
  return out
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
        const safeFilename = path.basename(sample.filename)
        const originalKey = `originals/${id}-${safeFilename}`
        await storage.saveOriginal(`${id}-${safeFilename}`, buf)
        
        const photo = {
          id,
          album_id: sample.albumId || 'demo',
          filename: safeFilename,
          storage_key: originalKey,
          mime: 'image/png',
          bytes: buf.length,
          taken_at: sample.taken_at || new Date().toISOString(),
          created_at: new Date().toISOString()
        }
        
        await dao.addPhoto(photo)

        await generateDerivatives(
          id,
          safeFilename,
          originalKey,
          buf,
          sample.dataUrl,
          sample.displayDataUrl,
          sample.mediumDataUrl,
          sample.thumbDataUrl
        )

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

function toBase64Url(value) {
  return Buffer.from(value)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '')
}

function fromBase64Url(value) {
  const normalized = String(value || '')
    .replace(/-/g, '+')
    .replace(/_/g, '/')
  const padding = normalized.length % 4 === 0 ? '' : '='.repeat(4 - (normalized.length % 4))
  return Buffer.from(`${normalized}${padding}`, 'base64').toString('utf8')
}

function parseCookies(req) {
  const header = String(req.headers.cookie || '')
  const cookies = {}
  for (const item of header.split(';')) {
    const trimmed = item.trim()
    if (!trimmed) continue
    const idx = trimmed.indexOf('=')
    const key = idx >= 0 ? trimmed.slice(0, idx).trim() : trimmed
    const value = idx >= 0 ? trimmed.slice(idx + 1).trim() : ''
    cookies[key] = decodeURIComponent(value)
  }
  return cookies
}

function signSessionPayload(payload) {
  return crypto
    .createHmac('sha256', SESSION_SECRET)
    .update(payload)
    .digest('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '')
}

function createUploadSessionToken() {
  const payload = JSON.stringify({ exp: Date.now() + SESSION_TTL_MS })
  const encodedPayload = toBase64Url(payload)
  const signature = signSessionPayload(encodedPayload)
  return `${encodedPayload}.${signature}`
}

function readUploadSession(req) {
  const token = parseCookies(req)[SESSION_COOKIE_NAME]
  if (!token) return null

  const parts = token.split('.')
  if (parts.length !== 2) return null

  const [encodedPayload, signature] = parts
  const expectedSignature = signSessionPayload(encodedPayload)
  if (signature.length !== expectedSignature.length) return null
  if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature))) return null

  try {
    const payload = JSON.parse(fromBase64Url(encodedPayload))
    if (!payload || typeof payload.exp !== 'number' || payload.exp <= Date.now()) return null
    return payload
  } catch {
    return null
  }
}

function appendResponseHeader(res, name, value) {
  const current = res.getHeader(name)
  if (!current) {
    res.setHeader(name, value)
    return
  }
  if (Array.isArray(current)) {
    res.setHeader(name, current.concat(value))
    return
  }
  res.setHeader(name, [current, value])
}

function setCookie(res, name, value, options = {}) {
  const parts = [`${name}=${encodeURIComponent(value)}`]
  parts.push(`Path=${options.path || '/'}`)
  if (typeof options.maxAge === 'number') parts.push(`Max-Age=${Math.max(0, Math.floor(options.maxAge))}`)
  if (options.httpOnly !== false) parts.push('HttpOnly')
  parts.push(`SameSite=${options.sameSite || 'Lax'}`)
  if (options.secure) parts.push('Secure')
  appendResponseHeader(res, 'Set-Cookie', parts.join('; '))
}

function clearCookie(res, name) {
  setCookie(res, name, '', { maxAge: 0 })
}

function requireUploadAuth(req, res) {
  const session = readUploadSession(req)
  if (!session) {
    sendJson(res, { error: 'unauthorized' }, 401)
    return null
  }
  return session
}

function encodeStorageKeyForPath(key) {
  return String(key || '')
    .replace(/\\/g, '/')
    .split('/')
    .map(seg => encodeURIComponent(seg))
    .join('/')
}

function encodeRFC5987ValueChars(value) {
  return encodeURIComponent(value)
    .replace(/['()]/g, escape)
    .replace(/\*/g, '%2A')
}

function contentDisposition(filename, disposition = 'attachment') {
  const basename = path.basename(String(filename || 'download'))
  const fallback = basename
    .replace(/[^\x20-\x7E]/g, '_')
    .replace(/["\\]/g, '_') || 'download'
  return `${disposition}; filename="${fallback}"; filename*=UTF-8''${encodeRFC5987ValueChars(basename)}`
}

function sendBuffer(buffer, mime, req, res, options = {}) {
  res.setHeader('Content-Type', mime || 'application/octet-stream')
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Cache-Control', 'private, max-age=0')
  res.setHeader('Content-Length', buffer.length)
  if (options.downloadName) {
    res.setHeader('Content-Disposition', contentDisposition(options.downloadName))
  }
  if (req.method === 'HEAD') return res.end()
  return res.end(buffer)
}

const CRC32_TABLE = (() => {
  const table = new Uint32Array(256)
  for (let i = 0; i < 256; i += 1) {
    let c = i
    for (let j = 0; j < 8; j += 1) {
      c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1)
    }
    table[i] = c >>> 0
  }
  return table
})()

function crc32(buffer) {
  let c = 0xFFFFFFFF
  for (const byte of buffer) {
    c = CRC32_TABLE[(c ^ byte) & 0xFF] ^ (c >>> 8)
  }
  return (c ^ 0xFFFFFFFF) >>> 0
}

function getDosDateTime(date = new Date()) {
  const d = Number.isNaN(date.getTime()) ? new Date() : date
  const year = Math.max(1980, d.getFullYear())
  const dosTime = (d.getHours() << 11) | (d.getMinutes() << 5) | Math.floor(d.getSeconds() / 2)
  const dosDate = ((year - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate()
  return { dosTime, dosDate }
}

function sanitizeZipFilename(filename, fallback) {
  const cleaned = path.basename(String(filename || fallback || 'photo'))
    .replace(/[\x00-\x1F<>:"\\|?*]/g, '_')
    .trim()
  return cleaned || fallback || 'photo'
}

function uniqueZipFilename(filename, usedNames) {
  const parsed = path.parse(filename)
  let candidate = filename
  let i = 2
  while (usedNames.has(candidate.toLowerCase())) {
    candidate = `${parsed.name || 'photo'} (${i})${parsed.ext || ''}`
    i += 1
  }
  usedNames.add(candidate.toLowerCase())
  return candidate
}

function assertZipSize(value, label) {
  if (value > 0xFFFFFFFF) {
    throw new Error(`${label} is too large for standard ZIP`)
  }
}

function writeZipBuffer(fd, buffer, state) {
  fs.writeSync(fd, buffer, 0, buffer.length, state.offset)
  state.offset += buffer.length
}

function writeZipUInt16(value) {
  const buffer = Buffer.alloc(2)
  buffer.writeUInt16LE(value)
  return buffer
}

function writeZipUInt32(value) {
  const buffer = Buffer.alloc(4)
  buffer.writeUInt32LE(value >>> 0)
  return buffer
}

async function createAlbumZipFile(albumPhotos, zipPath) {
  const usedNames = new Set()
  const centralDirectory = []
  const state = { offset: 0 }
  const fd = fs.openSync(zipPath, 'w')
  let included = 0
  let skipped = 0

  try {
    if (albumPhotos.length > 0xFFFF) {
      throw new Error('Too many files for standard ZIP')
    }

    for (const photo of albumPhotos) {
      let body
      try {
        body = await storage.read(photo.storage_key)
      } catch (e) {
        skipped += 1
        console.error('Export read failed:', photo.storage_key, e)
        continue
      }

      if (!Buffer.isBuffer(body)) body = Buffer.from(body || [])
      if (!body.length) {
        skipped += 1
        continue
      }

      assertZipSize(body.length, photo.filename || photo.id)
      const entryName = uniqueZipFilename(
        sanitizeZipFilename(photo.filename, `${photo.id || included + 1}.jpg`),
        usedNames
      )
      const nameBuffer = Buffer.from(entryName, 'utf8')
      const checksum = crc32(body)
      const { dosTime, dosDate } = getDosDateTime(photo.taken_at ? new Date(photo.taken_at) : new Date())
      const localHeaderOffset = state.offset

      const localHeader = Buffer.concat([
        writeZipUInt32(0x04034B50),
        writeZipUInt16(20),
        writeZipUInt16(0x0800),
        writeZipUInt16(0),
        writeZipUInt16(dosTime),
        writeZipUInt16(dosDate),
        writeZipUInt32(checksum),
        writeZipUInt32(body.length),
        writeZipUInt32(body.length),
        writeZipUInt16(nameBuffer.length),
        writeZipUInt16(0),
        nameBuffer
      ])

      writeZipBuffer(fd, localHeader, state)
      writeZipBuffer(fd, body, state)

      centralDirectory.push({
        nameBuffer,
        checksum,
        size: body.length,
        dosTime,
        dosDate,
        localHeaderOffset
      })
      included += 1
    }

    const centralDirectoryOffset = state.offset
    for (const entry of centralDirectory) {
      assertZipSize(entry.localHeaderOffset, entry.nameBuffer.toString('utf8'))
      const header = Buffer.concat([
        writeZipUInt32(0x02014B50),
        writeZipUInt16(20),
        writeZipUInt16(20),
        writeZipUInt16(0x0800),
        writeZipUInt16(0),
        writeZipUInt16(entry.dosTime),
        writeZipUInt16(entry.dosDate),
        writeZipUInt32(entry.checksum),
        writeZipUInt32(entry.size),
        writeZipUInt32(entry.size),
        writeZipUInt16(entry.nameBuffer.length),
        writeZipUInt16(0),
        writeZipUInt16(0),
        writeZipUInt16(0),
        writeZipUInt16(0),
        writeZipUInt32(0),
        writeZipUInt32(entry.localHeaderOffset),
        entry.nameBuffer
      ])
      writeZipBuffer(fd, header, state)
    }

    const centralDirectorySize = state.offset - centralDirectoryOffset
    assertZipSize(centralDirectorySize, 'central directory')
    assertZipSize(centralDirectoryOffset, 'central directory offset')

    const endRecord = Buffer.concat([
      writeZipUInt32(0x06054B50),
      writeZipUInt16(0),
      writeZipUInt16(0),
      writeZipUInt16(included),
      writeZipUInt16(included),
      writeZipUInt32(centralDirectorySize),
      writeZipUInt32(centralDirectoryOffset),
      writeZipUInt16(0)
    ])
    writeZipBuffer(fd, endRecord, state)
  } finally {
    fs.closeSync(fd)
  }

  if (included === 0 && fs.existsSync(zipPath)) {
    fs.unlinkSync(zipPath)
  }

  return { included, skipped }
}

function sendFile(p, mime, req, res, options = {}) {
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
  if (options.downloadName) {
    res.setHeader('Content-Disposition', contentDisposition(options.downloadName))
  }
  
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

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function getRequestOrigin(req) {
  const forwardedProto = String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim()
  const host = String(req.headers.host || '')
  const isLocalHost = /^(localhost|127\.0\.0\.1)(:\d+)?$/i.test(host)
  let protocol = forwardedProto || (req.socket && req.socket.encrypted ? 'https' : 'http')
  if (!isLocalHost && protocol === 'http') protocol = 'https'
  return `${protocol}://${req.headers.host}`
}

function toAbsoluteUrl(origin, value) {
  if (!value) return ''
  if (/^https?:\/\//i.test(value)) return value
  if (value.startsWith('//')) return `https:${value}`
  return new URL(value, `${origin}/`).toString()
}

function encodeStorageKeyForPath(key) {
  return String(key || '')
    .replace(/\\/g, '/')
    .split('/')
    .map(seg => encodeURIComponent(seg))
    .join('/')
}

function injectShareMeta(html, meta) {
  const sanitized = [
    /<title>[\s\S]*?<\/title>\s*/i,
    /<meta\s+name=["']description["'][^>]*>\s*/ig,
    /<meta\s+property=["']og:title["'][^>]*>\s*/ig,
    /<meta\s+property=["']og:description["'][^>]*>\s*/ig,
    /<meta\s+property=["']og:image["'][^>]*>\s*/ig,
    /<meta\s+property=["']og:image:secure_url["'][^>]*>\s*/ig,
    /<meta\s+property=["']og:image:type["'][^>]*>\s*/ig,
    /<meta\s+property=["']og:image:width["'][^>]*>\s*/ig,
    /<meta\s+property=["']og:image:height["'][^>]*>\s*/ig,
    /<meta\s+property=["']og:url["'][^>]*>\s*/ig,
    /<meta\s+property=["']og:site_name["'][^>]*>\s*/ig,
    /<meta\s+property=["']og:type["'][^>]*>\s*/ig,
    /<meta\s+name=["']twitter:card["'][^>]*>\s*/ig,
    /<meta\s+name=["']twitter:title["'][^>]*>\s*/ig,
    /<meta\s+name=["']twitter:description["'][^>]*>\s*/ig,
    /<meta\s+name=["']twitter:image["'][^>]*>\s*/ig,
    /<link\s+rel=["']canonical["'][^>]*>\s*/ig
  ].reduce((acc, pattern) => acc.replace(pattern, ''), html)

  const shareBlock = [
    `    <meta name="description" content="${escapeHtml(meta.description)}" />`,
    `    <meta property="og:title" content="${escapeHtml(meta.title)}" />`,
    `    <meta property="og:description" content="${escapeHtml(meta.description)}" />`,
    `    <meta property="og:image" content="${escapeHtml(meta.imageUrl)}" />`,
    `    <meta property="og:image:secure_url" content="${escapeHtml(meta.imageUrl)}" />`,
    `    <meta property="og:image:type" content="${escapeHtml(meta.imageType || 'image/png')}" />`,
    `    <meta property="og:image:width" content="${escapeHtml(String(meta.imageWidth || 1200))}" />`,
    `    <meta property="og:image:height" content="${escapeHtml(String(meta.imageHeight || 630))}" />`,
    `    <meta property="og:url" content="${escapeHtml(meta.url)}" />`,
    `    <meta property="og:site_name" content="${escapeHtml(SITE_TITLE)}" />`,
    '    <meta property="og:type" content="website" />',
    '    <meta name="twitter:card" content="summary_large_image" />',
    `    <meta name="twitter:title" content="${escapeHtml(meta.title)}" />`,
    `    <meta name="twitter:description" content="${escapeHtml(meta.description)}" />`,
    `    <meta name="twitter:image" content="${escapeHtml(meta.imageUrl)}" />`,
    `    <link rel="canonical" href="${escapeHtml(meta.url)}" />`,
    `    <title>${escapeHtml(meta.title)}</title>`
  ].join('\n')

  const withHead = sanitized.replace(/<\/head>/i, `${shareBlock}\n  </head>`)
  const shareImageBlock = `\n    <div style="position:absolute;width:0;height:0;overflow:hidden;opacity:0;">\n      <img src="${escapeHtml(meta.imageUrl)}" alt="share-cover" width="1200" height="630" />\n    </div>`
  return withHead.replace(/<\/body>/i, `${shareImageBlock}\n  </body>`)
}

function normalizeRoutePath(pathname) {
  if (!pathname || pathname === '/') return '/'
  return pathname.replace(/\/+$/, '') || '/'
}

async function buildAlbumRouteShareMeta(origin, albumId, routePath = null) {
  const album = await dao.getAlbum(albumId)
  if (!album) return null

  return {
    title: `${album.title} | ${SITE_TITLE}`,
    description: album.description || `查看 ${album.title} 中的照片`,
    imageUrl: toAbsoluteUrl(origin, '/logo.png'),
    imageType: 'image/png',
    imageWidth: 1200,
    imageHeight: 630,
    url: toAbsoluteUrl(origin, routePath || `/album/${album.id}`)
  }
}

async function resolveRouteShareMeta(normalizedPathname, origin) {
  const staticMeta = STATIC_ROUTE_SHARE_META[normalizedPathname]
  if (staticMeta) {
    return {
      title: staticMeta.title,
      description: staticMeta.description,
      imageUrl: toAbsoluteUrl(origin, staticMeta.imagePath),
      imageType: /\.png$/i.test(staticMeta.imagePath) ? 'image/png' : 'image/jpeg',
      imageWidth: 1200,
      imageHeight: 630,
      url: toAbsoluteUrl(origin, normalizedPathname)
    }
  }

  const albumMatch = normalizedPathname.match(/^\/album\/([a-z0-9]+)$/)
  if (albumMatch) {
    return await buildAlbumRouteShareMeta(origin, albumMatch[1], normalizedPathname)
  }

  return null
}

async function getAlbumShareCoverPhotos() {
  const albums = await dao.getAlbums()
  if (!albums || albums.length === 0) return []

  const albumIds = albums.map(a => a.id)
  const latestByAlbum = await dao.getLatestPhotoPerAlbum(albumIds)
  const latestMap = new Map(latestByAlbum.map(p => [p.album_id, p]))

  const coverIds = albums.map(a => a.cover_photo_id).filter(Boolean)
  const configuredCoverPhotos = coverIds.length > 0 ? await dao.getPhotosByIds(coverIds) : []
  const configuredMap = new Map(configuredCoverPhotos.map(p => [p.id, p]))

  const selected = []
  const seenPhotoIds = new Set()
  for (const album of albums) {
    const photo = (album.cover_photo_id && configuredMap.get(album.cover_photo_id)) || latestMap.get(album.id) || null
    if (!photo) continue
    if (seenPhotoIds.has(photo.id)) continue
    seenPhotoIds.add(photo.id)
    selected.push(photo)
  }

  return selected
}

async function backfillAlbumShareCovers({ limit = null } = {}) {
  const photos = await getAlbumShareCoverPhotos()
  const targetPhotos = limit ? photos.slice(0, Math.max(0, Number(limit) || 0)) : photos
  if (targetPhotos.length === 0) {
    return { totalAlbums: 0, processed: 0, created: 0, skipped: 0, failed: 0 }
  }

  const derivatives = await dao.getDerivativesByPhotoIds(targetPhotos.map(p => p.id))
  const derivativeMap = new Map()
  for (const d of derivatives) {
    if (!derivativeMap.has(d.photo_id)) derivativeMap.set(d.photo_id, [])
    derivativeMap.get(d.photo_id).push(d)
  }

  let created = 0
  let skipped = 0
  let failed = 0

  for (const photo of targetPhotos) {
    const existing = derivativeMap.get(photo.id) || []
    const alreadyHasShare = Boolean(getDerivativeKeyByType(existing, 'share'))
    if (alreadyHasShare) {
      skipped += 1
      continue
    }

    const result = await ensureShareDerivative(photo, existing)
    if (result?.key) created += 1
    else failed += 1
  }

  return {
    totalAlbums: photos.length,
    processed: targetPhotos.length,
    created,
    skipped,
    failed
  }
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

function getDerivativeKeyByType(derivatives, type) {
  const item = (derivatives || []).find(d => d.type === type)
  return item ? item.storage_key : null
}

function getShareDerivativeKey(id, filename) {
  const baseName = path.parse(filename || `${id}`).name
  return `derivatives/${id}-share-${baseName}.jpg`
}

async function readStorageBuffer(key) {
  const localPath = storage.filePath(key)
  if (localPath && fs.existsSync(localPath)) {
    return fs.readFileSync(localPath)
  }
  return await storage.read(key)
}

async function ensureShareDerivative(photo, existingDerivatives = []) {
  if (!photo) return null

  const existingShare = getDerivativeKeyByType(existingDerivatives, 'share')
  if (existingShare) {
    return { key: existingShare, mime: 'image/jpeg' }
  }

  if (!sharp) return null

  try {
    const sourceBuffer = await readStorageBuffer(photo.storage_key)
    const shareKey = getShareDerivativeKey(photo.id, photo.filename)
    const output = await sharp(sourceBuffer)
      .rotate()
      .resize(1200, 1200, { fit: 'inside', withoutEnlargement: true })
      .flatten({ background: '#ffffff' })
      .jpeg({ quality: 76, progressive: true, mozjpeg: true })
      .toBuffer()

    await storage.save(shareKey, output, { contentType: 'image/jpeg' })
    await dao.addDerivative({ photo_id: photo.id, type: 'share', storage_key: shareKey })
    return { key: shareKey, mime: 'image/jpeg' }
  } catch (e) {
    console.error('Sharp error (share):', e)
    return null
  }
}

async function generateDerivatives(id, filename, originalPath, originalBuffer, dataUrl, displayDataUrl, mediumDataUrl, thumbDataUrl) {
  const extMap = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp' }
  const baseName = path.parse(filename).name
  
  const saveVariant = async (dUrl, type) => {
    if (!dUrl) return null
    const mime = (dUrl.split(';')[0].split(':')[1] || 'image/jpeg')
    const ext = extMap[mime] || '.jpg'
    const key = `derivatives/${id}-${type}-${baseName}${ext}`
    
    const b64 = dUrl.split(',').pop()
    const buf = Buffer.from(b64, 'base64')
    await storage.save(key, buf, { contentType: mime })
    
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
    const shareKey = getShareDerivativeKey(id, filename)
    try {
      const out = await sharp(originalBuffer)
        .rotate()
        .resize(1200, 1200, { fit: 'inside', withoutEnlargement: true })
        .flatten({ background: '#ffffff' })
        .jpeg({ quality: 76, progressive: true, mozjpeg: true })
        .toBuffer()
      await storage.save(shareKey, out, { contentType: 'image/jpeg' })
      await dao.addDerivative({ photo_id: id, type: 'share', storage_key: shareKey })
    } catch (e) { console.error('Sharp error (share):', e) }

    if (!keyDisplay) {
      const k = `derivatives/${id}-display-${baseName}.webp`
      try {
        const out = await sharp(originalBuffer).resize(1600, 1600, { fit: 'inside' }).webp({ quality: 80 }).toBuffer()
        await storage.save(k, out, { contentType: 'image/webp' })
        await dao.addDerivative({ photo_id: id, type: 'display', storage_key: k })
        keyDisplay = k
      } catch (e) { console.error('Sharp error (display):', e) }
    }
    
    if (!keyMedium) {
      const k = `derivatives/${id}-medium-${baseName}.webp`
      try {
        const out = await sharp(originalBuffer).resize(800, 800, { fit: 'inside' }).webp({ quality: 70 }).toBuffer()
        await storage.save(k, out, { contentType: 'image/webp' })
        await dao.addDerivative({ photo_id: id, type: 'medium', storage_key: k })
        keyMedium = k
      } catch (e) { console.error('Sharp error (medium):', e) }
    }
    
    if (!keyThumb) {
      const k = `derivatives/${id}-thumb-${baseName}.webp`
      try {
        const out = await sharp(originalBuffer).resize(320, 320, { fit: 'inside' }).webp({ quality: 60 }).toBuffer()
        await storage.save(k, out, { contentType: 'image/webp' })
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

  if (req.method === 'GET' && url.pathname === '/api/upload-auth/session') {
    const session = readUploadSession(req)
    if (!session) return sendJson(res, { authenticated: false })
    return sendJson(res, { authenticated: true, expiresAt: new Date(session.exp).toISOString() })
  }

  if (req.method === 'POST' && url.pathname === '/api/upload-auth/login') {
    const body = await parseBody(req)
    const password = String(body.password || '')

    if (password !== UPLOAD_PASSWORD) {
      clearCookie(res, SESSION_COOKIE_NAME)
      return sendJson(res, { error: 'invalid password' }, 401)
    }

    const forwardedProto = String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim()
    setCookie(res, SESSION_COOKIE_NAME, createUploadSessionToken(), {
      maxAge: SESSION_TTL_MS / 1000,
      secure: forwardedProto === 'https'
    })
    return sendJson(res, { authenticated: true })
  }

  if (req.method === 'POST' && url.pathname === '/api/upload-auth/logout') {
    clearCookie(res, SESSION_COOKIE_NAME)
    return sendJson(res, { authenticated: false })
  }

  if (req.method === 'POST' && url.pathname === '/api/share-covers/backfill') {
    if (!requireUploadAuth(req, res)) return
    const body = await parseBody(req)
    const limit = body.limit ?? url.searchParams.get('limit') ?? null
    const summary = await backfillAlbumShareCovers({ limit })
    return sendJson(res, { ok: summary.failed === 0, ...summary })
  }

  if ((req.method === 'POST' || req.method === 'GET') && url.pathname === '/api/storage/migrateToCos') {
    if (!requireUploadAuth(req, res)) return
    if (req.method === 'GET' && url.searchParams.get('run') !== '1') {
      return sendJson(res, { ok: false, error: 'use POST or add ?run=1 for GET' }, 400)
    }

    let cosProvider
    try {
      cosProvider = require('./storage/providers/cos')
    } catch (e) {
      const details = e && (e.stack || e.message || String(e))
      return sendJson(
        res,
        {
          error: 'cos sdk not installed',
          details,
          hint: '请确认在 server 目录执行过 npm install，并且运行的 Node 版本与依赖兼容（建议 Node 18/20 LTS）'
        },
        500
      )
    }

    const dryRun = url.searchParams.get('dryRun') === '1'
    const limitRaw = url.searchParams.get('limit')
    const limit = limitRaw ? Math.max(1, Math.min(200000, Number(limitRaw) || 0)) : null

    const originals = listFilesRecursively(path.join(STORAGE_DIR, 'originals'), 'originals')
    const derivatives = listFilesRecursively(path.join(STORAGE_DIR, 'derivatives'), 'derivatives')
    const all = originals.concat(derivatives)
    const items = limit ? all.slice(0, limit) : all

    let uploaded = 0
    let skipped = 0
    let failed = 0
    const errors = []

    const concurrency = Math.max(1, Math.min(10, Number(url.searchParams.get('concurrency') || 5)))
    let cursor = 0

    const worker = async () => {
      while (true) {
        const idx = cursor
        cursor += 1
        if (idx >= items.length) return

        const it = items[idx]
        try {
          const exists = await cosProvider.exists(it.key)
          if (exists) {
            skipped += 1
            continue
          }

          if (!dryRun) {
            await cosProvider.save(it.key, fs.createReadStream(it.absPath))
          }
          uploaded += 1
        } catch (e) {
          failed += 1
          if (errors.length < 50) {
            errors.push({ key: it.key, message: String(e && (e.message || e)) })
          }
        }
      }
    }

    const workers = Array.from({ length: concurrency }, () => worker())
    await Promise.all(workers)

    return sendJson(res, { ok: failed === 0, dryRun, total: items.length, uploaded, skipped, failed, errors })
  }

  // 2. Serve Files (Originals/Derivatives)
  if (req.method === 'GET' && url.pathname.startsWith('/api/files/')) {
    const key = decodeURIComponent(url.pathname.replace('/api/files/', ''))
    const localPath = path.join(STORAGE_DIR, key)
    const shouldDownload = url.searchParams.get('download') === '1'
    
    if (fs.existsSync(localPath)) {
      const ext = path.extname(localPath).toLowerCase()
      const mime = ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg'
                 : ext === '.png' ? 'image/png'
                 : ext === '.webp' ? 'image/webp'
                 : ext === '.zip' ? 'application/zip'
                 : 'application/octet-stream'
      return sendFile(
        localPath,
        mime,
        req,
        res,
        shouldDownload ? { downloadName: path.basename(localPath) } : {}
      )
    }

    const signedUrl = storage.getSignedUrl(key)
    if (typeof signedUrl === 'string' && /^https?:\/\//i.test(signedUrl)) {
      res.statusCode = 302
      res.setHeader('Location', signedUrl)
      res.setHeader('Cache-Control', 'public, max-age=60')
      return res.end()
    }

    return sendJson(res, { error: 'not found' }, 404)
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
    if (!requireUploadAuth(req, res)) return
    const body = await parseBody(req)
    const { albumId, filename, dataUrl, displayDataUrl, mediumDataUrl, thumbDataUrl, taken_at, exif } = body
    
    if (!dataUrl || !filename) {
      return sendJson(res, { error: 'missing file' }, 400)
    }

    const id = Date.now().toString(36)
    
    // Save Original
    const b64 = dataUrl.split(',').pop()
    const buf = Buffer.from(b64, 'base64')
    const safeFilename = path.basename(filename)
    const originalKey = `originals/${id}-${safeFilename}`
    await storage.saveOriginal(`${id}-${safeFilename}`, buf)

    // Update DB
    const photo = {
      id,
      album_id: albumId || 'demo',
      filename: safeFilename,
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
    await generateDerivatives(id, safeFilename, originalKey, buf, dataUrl, displayDataUrl, mediumDataUrl, thumbDataUrl)

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
    if (!requireUploadAuth(req, res)) return
    const body = await parseBody(req)
    const { title, description } = body
    const id = Date.now().toString(36)
    await dao.addAlbum({ id, title: title || '未命名', description: description || '', cover_photo_id: null })
    return sendJson(res, { id })
  }

  if (req.method === 'PUT' && url.pathname.match(/^\/api\/albums\/([a-z0-9]+)$/)) {
    if (!requireUploadAuth(req, res)) return
    const id = url.pathname.split('/')[3]
    const body = await parseBody(req)
    const updated = await dao.updateAlbum(id, body)
    if (!updated) return sendJson(res, { error: 'not found' }, 404)
    return sendJson(res, updated)
  }

  // 7. Album Photos (Add to album) - this might be redundant if we just set album_id on photo
  // But original code maintained a separate list.
  if (req.method === 'POST' && url.pathname.match(/^\/api\/albums\/([a-z0-9]+)\/photos$/)) {
    if (!requireUploadAuth(req, res)) return
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
    if (albumPhotos.length === 0) {
      return sendJson(res, { error: 'no photos to export' }, 404)
    }

    const exportDir = path.join(STORAGE_DIR, 'exports')
    ensureDir(exportDir)
    
    const zipName = `album-${albumId}-${Date.now()}.zip`
    const zipPath = path.join(exportDir, zipName)

    let summary
    try {
      summary = await createAlbumZipFile(albumPhotos, zipPath)
    } catch (e) {
      console.error('Zip generation failed:', e)
      if (fs.existsSync(zipPath)) fs.unlinkSync(zipPath)
      return sendJson(res, { error: 'export failed' }, 500)
    }

    if (!fs.existsSync(zipPath) || !summary || summary.included === 0) {
      return sendJson(res, { error: 'export failed' }, 500)
    }

    const exportKey = path.relative(STORAGE_DIR, zipPath).replace(/\\/g, '/')
    return sendJson(res, {
      filename: zipName,
      url: `/api/files/${encodeStorageKeyForPath(exportKey)}?download=1`,
      included: summary.included,
      skipped: summary.skipped
    })
  }

  // 9. Downloads & Info
  if (req.method === 'GET' && url.pathname.match(/^\/api\/photos\/([a-z0-9]+)\/download$/)) {
    const id = url.pathname.split('/')[3]
    const p = await dao.getPhoto(id)
    if (!p) return sendJson(res, { error: 'not found' }, 404)
    const downloadName = p.filename || path.basename(p.storage_key)
    const localPath = path.join(STORAGE_DIR, p.storage_key)
    if (fs.existsSync(localPath)) {
      return sendFile(localPath, p.mime || 'application/octet-stream', req, res, { downloadName })
    }
    try {
      const buffer = await storage.read(p.storage_key)
      if (buffer && buffer.length) {
        return sendBuffer(buffer, p.mime || 'application/octet-stream', req, res, { downloadName })
      }
    } catch (e) {
      console.error('Download read failed:', e)
    }
    const signedUrl = storage.getSignedUrl(p.storage_key)
    if (typeof signedUrl === 'string' && /^https?:\/\//i.test(signedUrl)) {
      res.statusCode = 302
      res.setHeader('Location', signedUrl)
      res.setHeader('Cache-Control', 'public, max-age=60')
      return res.end()
    }
    return sendJson(res, { error: 'not found' }, 404)
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
    if (!requireUploadAuth(req, res)) return
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

async function serveStatic(req, res, url) {
  const dist = path.join(ROOT_DIR, 'frontend-react', 'dist')
  let staticPath = path.join(dist, url.pathname.replace(/^\//, ''))
  const normalizedPathname = normalizeRoutePath(url.pathname)
  
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
     if (fs.existsSync(indexHtml)) {
       const origin = getRequestOrigin(req)
       const routeShareMeta = await resolveRouteShareMeta(normalizedPathname, origin)
       if (routeShareMeta) {
         const html = fs.readFileSync(indexHtml, 'utf8')
         const rendered = injectShareMeta(html, routeShareMeta)
         res.statusCode = 200
         res.setHeader('Content-Type', 'text/html; charset=utf-8')
         res.setHeader('Cache-Control', 'no-cache')
         return res.end(rendered)
       }
       return sendFile(indexHtml, 'text/html', req, res)
     }
  }

  res.statusCode = 404
  res.end('Not Found')
}

async function handleSharePage(req, res, url) {
  const code = url.pathname.split('/')[2]
  const shares = await dao.getShares()
  const s = shares.find(x => x.code === code)

  res.setHeader('Cache-Control', 'no-store')
  res.setHeader('Content-Type', 'text/html; charset=utf-8')

  if (!s) {
    res.statusCode = 404
    return res.end('分享不存在')
  }

  const origin = getRequestOrigin(req)
  const shareUrl = toAbsoluteUrl(origin, `/s/${code}`)
  const defaultImageUrl = toAbsoluteUrl(origin, '/logo.png')
  let targetUrl = toAbsoluteUrl(origin, '/')
  let title = SITE_TITLE
  let description = SITE_DESCRIPTION
  let imageUrl = defaultImageUrl
  let imageType = 'image/png'

  if (s.subject_type === 'album') {
    const albumMeta = await buildAlbumRouteShareMeta(origin, s.subject_id)
    if (albumMeta) {
      title = albumMeta.title
      description = albumMeta.description
      imageUrl = albumMeta.imageUrl
      imageType = albumMeta.imageType || imageType
      targetUrl = toAbsoluteUrl(origin, `/album/${s.subject_id}`)
    } else {
      title = `${s.subject_type || '分享'} | ${SITE_TITLE}`
    }
  } else {
    title = `${s.subject_type || '分享'} | ${SITE_TITLE}`
  }

  const escapedTitle = escapeHtml(title)
  const escapedDescription = escapeHtml(description)
  const escapedShareUrl = escapeHtml(shareUrl)
  const escapedImageUrl = escapeHtml(imageUrl)
  const escapedTargetUrl = escapeHtml(targetUrl)

  return res.end(`<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapedTitle}</title>
    <meta name="description" content="${escapedDescription}" />
    <meta property="og:type" content="website" />
    <meta property="og:title" content="${escapedTitle}" />
    <meta property="og:description" content="${escapedDescription}" />
    <meta property="og:url" content="${escapedShareUrl}" />
    <meta property="og:site_name" content="${SITE_TITLE}" />
    <meta property="og:image" content="${escapedImageUrl}" />
    <meta property="og:image:secure_url" content="${escapedImageUrl}" />
    <meta property="og:image:type" content="${escapeHtml(imageType)}" />
    <meta property="og:image:width" content="1200" />
    <meta property="og:image:height" content="630" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${escapedTitle}" />
    <meta name="twitter:description" content="${escapedDescription}" />
    <meta name="twitter:image" content="${escapedImageUrl}" />
    <link rel="icon" type="image/png" href="${escapeHtml(toAbsoluteUrl(origin, '/logo.png'))}" />
  </head>
  <body style="margin:0;min-height:100vh;display:grid;place-items:center;background:#0f172a;color:#e2e8f0;font-family:'Segoe UI','PingFang SC',sans-serif;">
    <div style="position:absolute;width:0;height:0;overflow:hidden;opacity:0;">
      <img src="${escapedImageUrl}" alt="share-cover" width="1200" height="630" />
    </div>
    <main style="max-width:680px;padding:32px 24px;text-align:center;">
      <h1 style="margin:0 0 12px;font-size:32px;">${escapedTitle}</h1>
      <p style="margin:0 0 20px;color:#cbd5e1;line-height:1.7;">${escapedDescription}</p>
      <p style="margin:0;color:#94a3b8;">正在跳转到页面，如果没有自动跳转，请点击下方链接。</p>
      <p style="margin:20px 0 0;">
        <a href="${escapedTargetUrl}" style="display:inline-block;padding:12px 18px;border-radius:999px;background:#f59e0b;color:#111827;text-decoration:none;font-weight:700;">打开页面</a>
      </p>
    </main>
    <script>
      window.setTimeout(function () {
        window.location.replace(${JSON.stringify(targetUrl)});
      }, 120);
    </script>
  </body>
</html>`)
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
