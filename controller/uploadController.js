const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { uploadToR2, getObjectFromR2, isR2Configured } = require('../utils/r2Storage');

// Setup multer memory storage for in-memory buffer handling
const storage = multer.memoryStorage();

const fileFilter = (req, file, cb) => {
  const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml', 'image/gif'];
  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Only image files (JPEG, PNG, WEBP, SVG, GIF) are allowed'), false);
  }
};

const upload = multer({
  storage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB max
  },
  fileFilter,
});

// Handler for single image upload
async function uploadImageHandler(req, res) {
  try {
    const file = req.file;
    if (!file) {
      return res.status(400).json({
        success: false,
        message: 'No image file uploaded. Please upload a file with field name "file" or "image".',
      });
    }

    const folder = req.body.folder || req.query.folder || 'general';

    // Construct server base URL for public/proxy links
    const protocol = req.protocol;
    const host = req.get('host');
    const hostBaseUrl = `${protocol}://${host}`;

    const result = await uploadToR2({
      buffer: file.buffer,
      originalname: file.originalname,
      mimetype: file.mimetype,
      folder,
      hostBaseUrl,
    });

    return res.status(200).json({
      success: true,
      message: 'Image uploaded successfully to Cloudflare R2',
      url: result.url,
      key: result.key,
      storage: result.storage,
    });
  } catch (err) {
    console.error('Error during image upload:', err);
    return res.status(500).json({
      success: false,
      message: err.message || 'Image upload failed',
    });
  }
}

// Handler for publicly streaming R2 media (handles keys like 'logos/123-abc.png')
async function streamR2MediaHandler(req, res) {
  try {
    let rawKey = '';
    if (Array.isArray(req.params.key)) {
      rawKey = req.params.key.join('/');
    } else if (req.params.key) {
      rawKey = req.params.key;
    } else if (req.params[0]) {
      rawKey = req.params[0];
    }

    if (!rawKey) {
      return res.status(400).send('Object key required');
    }

    if (isR2Configured()) {
      try {
        const s3Response = await getObjectFromR2(rawKey);
        if (!s3Response || !s3Response.Body) {
          return res.status(404).send('Image not found in R2');
        }

        if (s3Response.ContentType) {
          res.setHeader('Content-Type', s3Response.ContentType);
        }
        if (s3Response.ContentLength) {
          res.setHeader('Content-Length', s3Response.ContentLength);
        }
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');

        return s3Response.Body.pipe(res);
      } catch (r2Err) {
        if (r2Err.name === 'NoSuchKey' || r2Err.$metadata?.httpStatusCode === 404) {
          return res.status(404).send('Image not found in R2');
        }
        throw r2Err;
      }
    }

    // Fallback: check local disk
    const localPath = path.join(__dirname, '..', 'public', 'uploads', rawKey);
    if (fs.existsSync(localPath)) {
      return res.sendFile(localPath);
    }

    return res.status(404).send('Media not found');
  } catch (err) {
    console.error('Error streaming R2 media:', err);
    return res.status(500).send('Error loading media');
  }
}

// Handler for checking R2 storage configuration status
async function getStorageStatusHandler(req, res) {
  return res.status(200).json({
    success: true,
    r2Configured: isR2Configured(),
    bucket: process.env.R2_BUCKET_NAME || null,
    publicUrl: process.env.R2_PUBLIC_URL || null,
  });
}

module.exports = {
  upload,
  uploadImageHandler,
  streamR2MediaHandler,
  getStorageStatusHandler,
};
