const path = require('path')
const fs = require('fs')

const type = process.env.STORAGE || 'local'
let provider
try {
  if (type === 'cos') provider = require('./providers/cos')
  else if (type === 'oss') provider = require('./providers/oss')
  else provider = require('./providers/local')
} catch (e) {
  const base = path.join(__dirname, '..', 'storage')
  if (!fs.existsSync(base)) fs.mkdirSync(base, { recursive: true })
  const originals = path.join(base, 'originals')
  const derivatives = path.join(base, 'derivatives')
  if (!fs.existsSync(originals)) fs.mkdirSync(originals, { recursive: true })
  if (!fs.existsSync(derivatives)) fs.mkdirSync(derivatives, { recursive: true })
  provider = {
    saveOriginal(name, buffer) {
      const key = path.join('originals', name)
      fs.writeFileSync(path.join(base, key), buffer)
      return key
    },
    read(key) {
      return fs.readFileSync(path.join(base, key))
    },
    getSignedUrl(key, options = {}) {
      const suffix = options.downloadName ? '?download=1' : ''
      return `/api/files/${encodeURIComponent(key)}${suffix}`
    },
    filePath(key) {
      return path.join(base, key)
    }
  }
}

function normalizeKey(key) {
  return String(key || '').replace(/\\/g, '/')
}

module.exports = {
  type,
  save(key, body, options) {
    const normalizedKey = normalizeKey(key)
    if (provider.save) return provider.save(normalizedKey, body, options)
    const full = this.filePath(normalizedKey)
    const dir = path.dirname(full)
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(full, body)
    return normalizedKey
  },
  saveOriginal(name, buffer) {
    return provider.saveOriginal(name, buffer)
  },
  read(key) {
    return provider.read(normalizeKey(key))
  },
  exists(key) {
    const normalizedKey = normalizeKey(key)
    if (provider.exists) return provider.exists(normalizedKey)
    return Promise.resolve(fs.existsSync(this.filePath(normalizedKey)))
  },
  getSignedUrl(key, options = {}) {
    const normalizedKey = normalizeKey(key)
    if (provider.getSignedUrl) return provider.getSignedUrl(normalizedKey, options)
    const suffix = options.downloadName ? '?download=1' : ''
    return `/api/files/${encodeURIComponent(normalizedKey)}${suffix}`
  },
  filePath(key) {
    const normalizedKey = normalizeKey(key)
    if (provider.filePath) return provider.filePath(normalizedKey)
    return path.join(__dirname, '..', 'storage', normalizedKey)
  }
}
