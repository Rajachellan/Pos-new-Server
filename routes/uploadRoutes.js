const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/authMiddleware');
const {
  upload,
  uploadImageHandler,
  streamR2MediaHandler,
  getStorageStatusHandler,
} = require('../controller/uploadController');

// Multer middleware supporting any field name ('file', 'image', 'logo', etc.)
const uploadMiddleware = (req, res, next) => {
  upload.any()(req, res, (err) => {
    if (err) {
      return res.status(400).json({ success: false, message: err.message });
    }
    if (req.files && req.files.length > 0) {
      req.file =
        req.files.find((f) => ['file', 'image', 'logo'].includes(f.fieldname)) ||
        req.files[0];
    }
    next();
  });
};

// Public media route for displaying images uploaded to Cloudflare R2
// GET /api/media/logos/... or /api/media/menus/...
router.get('/media/{*key}', streamR2MediaHandler);

// POST /api/upload/image - Upload image to Cloudflare R2 (Authenticated)
router.post('/upload/image', authMiddleware, uploadMiddleware, uploadImageHandler);

// GET /api/upload/status - Check if R2 is configured
router.get('/upload/status', authMiddleware, getStorageStatusHandler);

module.exports = router;
