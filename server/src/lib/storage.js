import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import sharp from 'sharp';
import { config } from '../config.js';
import { slugify } from './util.js';

// Image sizes generated on upload (like WordPress thumbnails). Saved as WebP.
export const IMAGE_SIZES = { thumb: 320, medium: 960, large: 1920 };
const RESIZABLE = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/avif', 'image/tiff']);

let s3Client;
async function s3() {
  if (!s3Client) {
    const { S3Client } = await import('@aws-sdk/client-s3');
    s3Client = new S3Client({ region: config.s3.region });
  }
  return s3Client;
}

function publicUrlFor(key) {
  if (config.storageDriver === 's3') {
    return config.s3.publicUrl
      ? `${config.s3.publicUrl}/${key}`
      : `https://${config.s3.bucket}.s3.${config.s3.region}.amazonaws.com/${key}`;
  }
  return `${config.publicUrl}/uploads/${key}`;
}

async function putObject(key, buffer, mime) {
  if (config.storageDriver === 's3') {
    const { PutObjectCommand } = await import('@aws-sdk/client-s3');
    await (await s3()).send(
      new PutObjectCommand({
        Bucket: config.s3.bucket, Key: key, Body: buffer, ContentType: mime,
        CacheControl: 'public, max-age=31536000, immutable',
      })
    );
  } else {
    const full = path.join(config.uploadsDir, key);
    await fs.mkdir(path.dirname(full), { recursive: true });
    await fs.writeFile(full, buffer);
  }
  return publicUrlFor(key);
}

async function deleteObject(key) {
  if (config.storageDriver === 's3') {
    const { DeleteObjectCommand } = await import('@aws-sdk/client-s3');
    await (await s3()).send(new DeleteObjectCommand({ Bucket: config.s3.bucket, Key: key }));
  } else {
    await fs.rm(path.join(config.uploadsDir, key), { force: true });
  }
}

/**
 * Stores an uploaded file and (for images) generates resized WebP variants.
 * Returns the columns to save in the media table.
 */
const EXT_MIME = {
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.gif': 'image/gif',
  '.svg': 'image/svg+xml', '.avif': 'image/avif', '.mp4': 'video/mp4', '.webm': 'video/webm', '.mov': 'video/quicktime',
  '.pdf': 'application/pdf', '.json': 'application/json', '.glb': 'model/gltf-binary', '.gltf': 'model/gltf+json',
};

export async function storeUpload(site, file) {
  const now = new Date();
  const ext = path.extname(file.originalname).toLowerCase();
  if (!file.mimetype || file.mimetype === 'application/octet-stream') file.mimetype = EXT_MIME[ext] || 'application/octet-stream';
  const base = slugify(path.basename(file.originalname, ext)) || 'file';
  const id = crypto.randomBytes(4).toString('hex');
  const dir = `sites/${site.slug}/${now.getFullYear()}/${String(now.getMonth() + 1).padStart(2, '0')}`;
  const key = `${dir}/${base}-${id}${ext}`;

  const url = await putObject(key, file.buffer, file.mimetype);
  const result = { storage_key: key, url, width: null, height: null, sizes: {} };

  if (file.mimetype.startsWith('image/')) {
    try {
      const meta = await sharp(file.buffer).metadata();
      result.width = meta.width || null;
      result.height = meta.height || null;
      if (RESIZABLE.has(file.mimetype)) {
        for (const [name, w] of Object.entries(IMAGE_SIZES)) {
          if (meta.width && meta.width <= w && name !== 'thumb') {
            continue; // don't upscale; the original is used instead
          }
          const buf = await sharp(file.buffer).rotate().resize({ width: w, withoutEnlargement: true }).webp({ quality: 82 }).toBuffer();
          result.sizes[name] = await putObject(`${dir}/${base}-${id}-${name}.webp`, buf, 'image/webp');
        }
      }
    } catch (err) {
      console.warn('Image processing failed:', err.message);
    }
  }
  // Fill missing sizes with the closest available so the frontend can always rely on them.
  for (const name of Object.keys(IMAGE_SIZES)) {
    if (file.mimetype.startsWith('image/') && !result.sizes[name]) result.sizes[name] = url;
  }
  return result;
}

export async function removeStored(media) {
  const keys = [media.storage_key];
  for (const u of Object.values(media.sizes || {})) {
    const marker = config.storageDriver === 's3' ? (config.s3.publicUrl || `.amazonaws.com`) : '/uploads/';
    const idx = u.indexOf(marker);
    if (idx >= 0 && u !== media.url) keys.push(u.slice(idx + marker.length).replace(/^\//, ''));
  }
  for (const k of keys) await deleteObject(k).catch(() => {});
}
