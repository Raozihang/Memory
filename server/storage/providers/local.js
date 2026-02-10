const fs = require('fs')
const path = require('path')

const base = path.join(__dirname, '..', '..', 'storage')
function ensure(p) { if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true }) }
ensure(base)
ensure(path.join(base, 'originals'))
ensure(path.join(base, 'derivatives'))

module.exports = {
  save(key, buffer) {
    const full = path.join(base, key)
    ensure(path.dirname(full))
    fs.writeFileSync(full, buffer)
    return key
  },
  saveOriginal(name, buffer) {
    const key = `originals/${name}`
    return this.save(key, buffer)
  },
  read(key) {
    return fs.readFileSync(path.join(base, key))
  },
  filePath(key) {
    return path.join(base, key)
  }
}
