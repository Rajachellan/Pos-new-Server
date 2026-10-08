const { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

// Check if Cloudflare R2 credentials are configured
function isR2Configured() {
  return Boolean(
    process.env.R2_ACCOUNT_ID &&
    process.env.R2_ACCESS_KEY_ID &&
    process.env.R2_SECRET_ACCESS_KEY &&
    process.env.R2_BUCKET_NAME
  );
}

// Get initialized S3 / R2 Client
function getR2Client() {
  if (!isR2Configured()) return null;

  return new S3Client({
    region: 'auto',
    endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
    },
  });
}

/**
 * Upload a file buffer to Cloudflare R2 (or fallback to local disk if R2 is not configured)
 * @param {Object} params
 * @param {Buffer} params.buffer
 * @param {string} params.originalname
 * @param {string} params.mimetype
 * @param {string} [params.folder='general']
 * @param {string} [params.hostBaseUrl=''] - Optional base URL for local fallback or proxy
 */
async function uploadToR2({ buffer, originalname, mimetype, folder = 'general', hostBaseUrl = '' }) {
  if (!buffer) {
    throw new Error('No file buffer provided for upload');
  }

  // Clean filename and generate unique key
  const ext = path.extname(originalname) || '.png';
  const baseName = path.basename(originalname, ext).replace(/[^a-zA-Z0-9_-]/g, '_').substring(0, 30);
  const randomSuffix = crypto.randomBytes(4).toString('hex');
  const cleanFolder = folder.replace(/[^a-zA-Z0-9_-]/g, '');
  const objectKey = `${cleanFolder}/${Date.now()}-${randomSuffix}-${baseName}${ext}`;

  // If R2 is fully configured, upload directly to Cloudflare R2
  if (isR2Configured()) {
    const s3 = getR2Client();
    const bucket = process.env.R2_BUCKET_NAME;

    const command = new PutObjectCommand({
      Bucket: bucket,
      Key: objectKey,
      Body: buffer,
      ContentType: mimetype || 'application/octet-stream',
    });

    await s3.send(command);

    // Build public URL
    let publicUrl = '';
    if (process.env.R2_PUBLIC_URL && process.env.R2_PUBLIC_URL.trim()) {
      const publicBase = process.env.R2_PUBLIC_URL.trim().replace(/\/+$/, '');
      publicUrl = `${publicBase}/${objectKey}`;
    } else {
      // Use media streaming endpoint on POS server
      const cleanHost = (hostBaseUrl || '').replace(/\/+$/, '');
      publicUrl = cleanHost ? `${cleanHost}/api/media/${objectKey}` : `/api/media/${objectKey}`;
    }

    return {
      success: true,
      storage: 'r2',
      key: objectKey,
      url: publicUrl,
    };
  }

  // Graceful local fallback if R2 credentials are not set yet in .env
  console.warn('⚠️ Cloudflare R2 credentials are not set in .env. Falling back to local disk storage in /public/uploads.');
  const uploadsDir = path.join(__dirname, '..', 'public', 'uploads', cleanFolder);
  if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
  }

  const filePath = path.join(uploadsDir, `${Date.now()}-${randomSuffix}-${baseName}${ext}`);
  fs.writeFileSync(filePath, buffer);

  const localRelativePath = `/uploads/${cleanFolder}/${path.basename(filePath)}`;
  const fullUrl = hostBaseUrl ? `${hostBaseUrl.replace(/\/+$/, '')}${localRelativePath}` : localRelativePath;

  return {
    success: true,
    storage: 'local_fallback',
    key: objectKey,
    url: fullUrl,
    message: 'Uploaded to local storage. Configure R2 credentials in .env for direct Cloudflare R2 hosting.',
  };
}

/**
 * Retrieve an object from Cloudflare R2
 * @param {string} key
 */
async function getObjectFromR2(key) {
  const s3 = getR2Client();
  if (!s3) return null;

  const command = new GetObjectCommand({
    Bucket: process.env.R2_BUCKET_NAME,
    Key: key,
  });

  return await s3.send(command);
}

module.exports = {
  isR2Configured,
  getR2Client,
  uploadToR2,
  getObjectFromR2,
};
