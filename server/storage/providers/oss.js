module.exports = {
  saveOriginal(name, buffer) {
    throw new Error('OSS provider not configured')
  },
  read(key) {
    throw new Error('OSS provider not configured')
  },
  getSignedUrl(key) {
    return `/download/signed/${encodeURIComponent(key)}`
  }
}
