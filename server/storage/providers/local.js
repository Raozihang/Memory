const fs = require('fs')
const path = require('path')

const base = path.join(__dirname, '..', '..', 'storage')
function ensure(p) { if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true }) }
ensure(base)
ensure(path.join(base, 'originals'))
ensure(path.join(base, 'derivatives'))

module.exports = {
  saveOriginal(name, buffer) {
    const key = path.join('originals', name)
    fs.writeFileSync(path.join(base, key), buffer)
    return key
  },
  read(key) {
    return fs.readFileSync(path.join(base, key))
  }
}

