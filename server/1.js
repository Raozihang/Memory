#!/usr/bin/env node

require('dotenv').config({ quiet: true })

const albumId = process.argv[2] || 'mn3yc6b0'
const inputBase = process.argv[3] || process.env.ORIGIN_BASE || process.env.PUBLIC_BASE_URL
const port = process.env.PORT || '8080'
const base = String(inputBase || `http://127.0.0.1:${port}`).replace(/\/+$/, '')

console.log(`${base}/album/${albumId}`)
