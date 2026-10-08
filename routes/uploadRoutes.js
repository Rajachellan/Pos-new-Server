const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/authMiddleware');
const {
  upload,
  uploadImageHandler,
  streamR2MediaHandler,
  getStorageStatusHandler,
} = require('../controller/uploadController');

// Multer middleware supporting either 'file' or 'image' field name
const uploadMiddleware = (req, res, next) => {
  upload.single('file')(req, res, (err) => {
    if (!err && req.file) {
      return next();
    }
    // If 'file' wasn't present or errored, try 'image'
    upload.single('image')(req, res, (err2) => {
      if (err2) {
        return res.status(400).json({ success: false, message: err2.message });
      }
      next();
    });
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
