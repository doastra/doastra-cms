import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '.env') });

export const config = {
  port: Number(process.env.PORT || 4000),
  publicUrl: (process.env.PUBLIC_URL || `http://localhost:${process.env.PORT || 4000}`).replace(/\/$/, ''),
  jwtSecret: process.env.JWT_SECRET || 'dev-secret-change-me',
  corsOrigins: process.env.CORS_ORIGINS || '*',
  storageDriver: process.env.STORAGE_DRIVER || 'local',
  uploadsDir: path.join(__dirname, '..', 'uploads'),
  s3: {
    bucket: process.env.S3_BUCKET,
    region: process.env.S3_REGION || 'ap-south-1',
    publicUrl: (process.env.S3_PUBLIC_URL || '').replace(/\/$/, ''),
  },
  publicCacheTtl: Number(process.env.PUBLIC_CACHE_TTL ?? 60),
  adminDist: path.join(__dirname, '..', '..', 'admin', 'dist'),
};
