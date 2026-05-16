const COS = require('cos-nodejs-sdk-v5')

function required(name, value) {
  if (!value) throw new Error(`Missing env ${name}`)
  return value
}

function guessContentTypeByKey(key) {
  const lower = String(key || '').toLowerCase()
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg'
  if (lower.endsWith('.png')) return 'image/png'
  if (lower.endsWith('.webp')) return 'image/webp'
  if (lower.endsWith('.zip')) return 'application/zip'
  if (lower.endsWith('.json')) return 'application/json'
  return 'application/octet-stream'
}

function joinPublicUrl(base, key) {
  const trimmed = String(base).replace(/\/+$/, '')
  const encodedKey = String(key)
    .split('/')
    .map(seg => encodeURIComponent(seg))
    .join('/')
  return `${trimmed}/${encodedKey}`
}

function contentDisposition(filename) {
  if (!filename) return ''
  const fallback = String(filename)
    .replace(/[^\x20-\x7E]/g, '_')
    .replace(/["\\]/g, '_') || 'download'
  const encoded = encodeURIComponent(String(filename))
  return `attachment; filename="${fallback}"; filename*=UTF-8''${encoded}`
}

function getDomainOptions(base) {
  if (!base) return {}
  const normalized = String(base).startsWith('//') ? `https:${base}` : String(base)
  try {
    const u = new URL(/^https?:\/\//i.test(normalized) ? normalized : `https://${normalized}`)
    return {
      Protocol: u.protocol.replace(':', ''),
      Domain: u.host
    }
  } catch {
    return { Domain: String(base).replace(/^https?:\/\//i, '').replace(/\/+$/, '') }
  }
}

function streamToBuffer(stream) {
  return new Promise((resolve, reject) => {
    const chunks = []
    stream.on('data', (c) => chunks.push(c))
    stream.on('end', () => resolve(Buffer.concat(chunks)))
    stream.on('error', reject)
  })
}

const secretId = process.env.COS_SECRET_ID
const secretKey = process.env.COS_SECRET_KEY
const bucket = process.env.COS_BUCKET
const region = process.env.COS_REGION

const cos = new COS({
  SecretId: secretId,
  SecretKey: secretKey
})

function canSignUrl() {
  return Boolean(secretId && secretKey && bucket && region)
}

async function headObject(key) {
  return new Promise((resolve, reject) => {
    cos.headObject(
      { Bucket: required('COS_BUCKET', bucket), Region: required('COS_REGION', region), Key: key },
      (err, data) => (err ? reject(err) : resolve(data))
    )
  })
}

async function putObject(key, body, contentType) {
  return new Promise((resolve, reject) => {
    cos.putObject(
      {
        Bucket: required('COS_BUCKET', bucket),
        Region: required('COS_REGION', region),
        Key: key,
        Body: body,
        ContentType: contentType || guessContentTypeByKey(key)
      },
      (err, data) => (err ? reject(err) : resolve(data))
    )
  })
}

async function getObject(key) {
  return new Promise((resolve, reject) => {
    cos.getObject(
      { Bucket: required('COS_BUCKET', bucket), Region: required('COS_REGION', region), Key: key },
      (err, data) => (err ? reject(err) : resolve(data))
    )
  })
}

module.exports = {
  async exists(key) {
    try {
      await headObject(key)
      return true
    } catch (e) {
      const statusCode = e?.statusCode || e?.error?.statusCode
      if (statusCode === 404) return false
      if (e?.code === 'NoSuchKey') return false
      throw e
    }
  },
  async save(key, body, options = {}) {
    await putObject(key, body, options.contentType)
    return key
  },
  async saveOriginal(name, buffer) {
    const key = `originals/${name}`
    return this.save(key, buffer)
  },
  async read(key) {
    const data = await getObject(key)
    if (!data) return Buffer.from([])
    if (Buffer.isBuffer(data.Body)) return data.Body
    if (typeof data.Body === 'string') return Buffer.from(data.Body)
    if (data.Body && typeof data.Body.pipe === 'function') return await streamToBuffer(data.Body)
    return Buffer.from([])
  },
  getSignedUrl(key, options = {}) {
    const cdnBase = process.env.COS_CDN_BASE
    const disposition = contentDisposition(options.downloadName)
    if (cdnBase && !disposition) {
      return joinPublicUrl(cdnBase, key)
    }

    if (disposition && !canSignUrl()) {
      throw new Error('COS download URL signing is not configured')
    }

    const expires = Number(options.expires || process.env.COS_SIGN_EXPIRES || 600)
    const domainOptions = cdnBase ? getDomainOptions(cdnBase) : {}
    const forceSignHost = process.env.COS_DOWNLOAD_FORCE_SIGN_HOST === 'true'
    return cos.getObjectUrl({
      Bucket: required('COS_BUCKET', bucket),
      Region: required('COS_REGION', region),
      Key: key,
      Sign: true,
      ForceSignHost: disposition ? forceSignHost : undefined,
      Expires: Number.isFinite(expires) && expires > 0 ? expires : 600,
      ...domainOptions,
      ...(disposition ? { Query: { 'response-content-disposition': disposition } } : {})
    })
  }
}
