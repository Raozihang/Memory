const path = require('path')
const fs = require('fs')

const type = process.env.STORAGE || 'local'
let provider
try {
  if (type === 'oss') provider = require('./providers/oss')
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
    getSignedUrl(key) {
      return `/api/files/${encodeURIComponent(key)}`
    },
    filePath(key) {
      return path.join(base, key)
    }
  }
}

module.exports = {
  type,
  saveOriginal: provider.saveOriginal,
  read: provider.read,
  getSignedUrl(key) {
    if (provider.getSignedUrl) return provider.getSignedUrl(key)
    return `/api/files/${encodeURIComponent(key)}`
  },
  filePath(key) {
    if (provider.filePath) return provider.filePath(key)
    return path.join(__dirname, '..', 'storage', key)
  }
}
