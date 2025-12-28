const mysql = require('mysql2/promise');
require('dotenv').config();

const DB_CONFIG = {
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    port: process.env.DB_PORT || 3306,
    database: process.env.DB_NAME || 'album_db'
};

let pool;

async function init() {
    try {
        // Create pool
        pool = mysql.createPool({
            ...DB_CONFIG,
            waitForConnections: true,
            connectionLimit: 10,
            queueLimit: 0
        });
        
        // Test connection
        const connection = await pool.getConnection();
        console.log('Database connected successfully');
        connection.release();
        return true;
    } catch (e) {
        console.error('Database connection failed:', e.message);
        return false;
    }
}

async function getAlbums() {
    if (!pool) return [];
    const [rows] = await pool.query('SELECT * FROM albums ORDER BY created_at DESC');
    return rows;
}

async function getAlbum(id) {
    if (!pool) return null;
    const [rows] = await pool.query('SELECT * FROM albums WHERE id = ?', [id]);
    return rows[0] || null;
}

async function getPhotos(albumId = null) {
    if (!pool) return [];
    let query = 'SELECT * FROM photos';
    const params = [];
    if (albumId) {
        query += ' WHERE album_id = ?';
        params.push(albumId);
    }
    query += ' ORDER BY taken_at DESC, created_at DESC';
    const [rows] = await pool.query(query, params);
    return rows;
}

async function getPhotosPaged({ albumId = null, startTakenAt = null, endTakenAt = null, limit = 200, offset = 0 } = {}) {
    if (!pool) return [];
    let query = 'SELECT * FROM photos';
    const where = [];
    const params = [];

    if (albumId) {
        where.push('album_id = ?');
        params.push(albumId);
    }

    if (startTakenAt) {
        where.push('taken_at >= ?');
        params.push(startTakenAt);
    }

    if (endTakenAt) {
        where.push('taken_at < ?');
        params.push(endTakenAt);
    }

    if (where.length > 0) {
        query += ` WHERE ${where.join(' AND ')}`;
    }

    query += ' ORDER BY taken_at DESC, created_at DESC, id DESC';
    query += ' LIMIT ? OFFSET ?';
    params.push(Number(limit));
    params.push(Number(offset));

    const [rows] = await pool.query(query, params);
    return rows;
}

async function getPhotosCount({ albumId = null, startTakenAt = null, endTakenAt = null } = {}) {
    if (!pool) return 0;
    let query = 'SELECT COUNT(*) AS cnt FROM photos';
    const where = [];
    const params = [];

    if (albumId) {
        where.push('album_id = ?');
        params.push(albumId);
    }

    if (startTakenAt) {
        where.push('taken_at >= ?');
        params.push(startTakenAt);
    }

    if (endTakenAt) {
        where.push('taken_at < ?');
        params.push(endTakenAt);
    }

    if (where.length > 0) {
        query += ` WHERE ${where.join(' AND ')}`;
    }

    const [rows] = await pool.query(query, params);
    return rows[0]?.cnt || 0;
}

async function getPhoto(id) {
    if (!pool) return null;
    const [rows] = await pool.query('SELECT * FROM photos WHERE id = ?', [id]);
    return rows[0] || null;
}

async function createPhoto(photo) {
    if (!pool) return;
    const takenAt = photo.taken_at ? new Date(photo.taken_at) : null;
    const createdAt = photo.created_at ? new Date(photo.created_at) : new Date();
    
    await pool.query(
        'INSERT INTO photos (id, album_id, filename, storage_key, mime, bytes, taken_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [photo.id, photo.album_id, photo.filename, photo.storage_key, photo.mime, photo.bytes, takenAt, createdAt]
    );
}

async function getDerivatives() {
    if (!pool) return [];
    const [rows] = await pool.query('SELECT * FROM derivatives');
    return rows;
}

async function getDerivativesByPhotoIds(photoIds = []) {
    if (!pool) return [];
    if (!photoIds || photoIds.length === 0) return [];
    const [rows] = await pool.query('SELECT * FROM derivatives WHERE photo_id IN (?)', [photoIds]);
    return rows;
}

async function addDerivative(derivative) {
    if (!pool) return;
    await pool.query(
        'INSERT INTO derivatives (photo_id, type, storage_key) VALUES (?, ?, ?)',
        [derivative.photo_id, derivative.type, derivative.storage_key]
    );
}

async function getExif(photoId) {
    if (!pool) return null;
    const [rows] = await pool.query('SELECT exif_json FROM exif WHERE photo_id = ?', [photoId]);
    return rows[0] ? rows[0].exif_json : null;
}

async function saveExif(photoId, exifJson) {
    if (!pool) return;
    await pool.query(
        'INSERT INTO exif (photo_id, exif_json) VALUES (?, ?) ON DUPLICATE KEY UPDATE exif_json = ?',
        [photoId, JSON.stringify(exifJson), JSON.stringify(exifJson)]
    );
}

async function getPhotosByIds(photoIds = []) {
    if (!pool) return [];
    if (!photoIds || photoIds.length === 0) return [];
    const [rows] = await pool.query('SELECT * FROM photos WHERE id IN (?)', [photoIds]);
    return rows;
}

async function getLatestPhotoPerAlbum(albumIds = []) {
    if (!pool) return [];
    if (!albumIds || albumIds.length === 0) return [];

    try {
        const [rows] = await pool.query(
            `SELECT * FROM (
                SELECT p.*, ROW_NUMBER() OVER (PARTITION BY album_id ORDER BY taken_at DESC, created_at DESC, id DESC) AS rn
                FROM photos p
                WHERE album_id IN (?)
            ) t
            WHERE rn = 1`,
            [albumIds]
        );
        return rows;
    } catch {
        const covers = [];
        for (const albumId of albumIds) {
            const [rows] = await pool.query(
                'SELECT * FROM photos WHERE album_id = ? ORDER BY taken_at DESC, created_at DESC, id DESC LIMIT 1',
                [albumId]
            );
            if (rows[0]) covers.push(rows[0]);
        }
        return covers;
    }
}

async function createAlbum(album) {
    if (!pool) return;
    await pool.query(
        'INSERT INTO albums (id, title, description, cover_photo_id) VALUES (?, ?, ?, ?)',
        [album.id, album.title, album.description, album.cover_photo_id]
    );
}

async function updateAlbum(id, data) {
    if (!pool) return;
    const fields = [];
    const values = [];
    if (data.title !== undefined) { fields.push('title = ?'); values.push(data.title); }
    if (data.description !== undefined) { fields.push('description = ?'); values.push(data.description); }
    if (data.cover_photo_id !== undefined) { fields.push('cover_photo_id = ?'); values.push(data.cover_photo_id); }
    
    if (fields.length === 0) return;
    
    values.push(id);
    await pool.query(`UPDATE albums SET ${fields.join(', ')} WHERE id = ?`, values);
}

module.exports = {
    init,
    getAlbums,
    getAlbum,
    createAlbum,
    updateAlbum,
    getPhotos,
    getPhotosPaged,
    getPhotosCount,
    getPhoto,
    getPhotosByIds,
    createPhoto,
    getDerivatives,
    getDerivativesByPhotoIds,
    addDerivative,
    getExif,
    saveExif,
    getLatestPhotoPerAlbum
};
