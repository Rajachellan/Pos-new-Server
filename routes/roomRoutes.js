const express = require('express');
const router = express.Router();

const { optionalAuth } = require('../middleware/authMiddleware');
const organizationMiddleware = require('../middleware/organizationMiddleware');
const {
  getRooms,
  createRoom,
  checkInGuest,
  checkOutGuest,
  getRoomHistory,
} = require('../controller/roomController');

router.get('/rooms', optionalAuth, organizationMiddleware, getRooms);
router.post('/rooms', optionalAuth, organizationMiddleware, createRoom);
router.post('/rooms/:roomId/check-in', optionalAuth, organizationMiddleware, checkInGuest);
router.post('/rooms/bookings/:bookingId/check-out', optionalAuth, organizationMiddleware, checkOutGuest);
router.get('/rooms/history', optionalAuth, organizationMiddleware, getRoomHistory);

module.exports = router;
