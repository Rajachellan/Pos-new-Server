const Room = require('../model/roomSchema');
const RoomBooking = require('../model/roomBookingSchema');
const Cart = require('../model/cartSchema');
const Branch = require('../model/branchSchema');
const { logAudit } = require('../utils/auditLogger');
const { emitToBranch } = require('../utils/socket');

// 1. Get All Rooms for Branch / Organization
async function getRooms(req, res) {
  try {
    const orgId = req.organizationId || req.user?.organizationId;
    let targetBranch = req.query.branchId || req.user?.branch || req.user?.branchId;

    if (!targetBranch && orgId) {
      const defaultBranch = await Branch.findOne({ organization: orgId }).sort({ createdAt: 1 });
      if (defaultBranch) targetBranch = defaultBranch._id;
    }

    const filter = {
      ...(orgId ? { organization: orgId } : {}),
      ...(targetBranch ? { branch: targetBranch } : {}),
    };

    const rooms = await Room.find(filter)
      .populate('currentBooking')
      .populate('branch', 'branchName branchCode')
      .sort({ number: 1 });

    return res.status(200).json({
      success: true,
      data: rooms,
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
}

// 2. Create Hotel Room
async function createRoom(req, res) {
  const { number, roomType = 'Deluxe', pricePerNight, branchId } = req.body;
  const orgId = req.organizationId || req.user?.organizationId;

  try {
    if (!number || pricePerNight === undefined) {
      return res.status(400).json({
        success: false,
        message: 'Room number and price per night are required',
      });
    }

    let targetBranchId = branchId || req.user?.branch || req.user?.branchId;
    if (!targetBranchId && orgId) {
      const defaultBranch = await Branch.findOne({ organization: orgId }).sort({ createdAt: 1 });
      if (defaultBranch) targetBranchId = defaultBranch._id;
    }

    if (!targetBranchId) {
      return res.status(400).json({
        success: false,
        message: 'Branch is required to create a room',
      });
    }

    const existingRoom = await Room.findOne({
      branch: targetBranchId,
      number: number.trim(),
    });

    if (existingRoom) {
      return res.status(409).json({
        success: false,
        message: `Room ${number} already exists in this branch`,
      });
    }

    const newRoom = new Room({
      organization: orgId,
      branch: targetBranchId,
      number: number.trim(),
      roomType,
      pricePerNight: Number(pricePerNight),
      status: 'AVAILABLE',
      createdBy: req.user?.userId,
    });

    await newRoom.save();

    await logAudit({
      req,
      action: 'ROOM_CREATED',
      module: 'room',
      targetId: newRoom._id,
      description: `Room ${newRoom.number} (${newRoom.roomType}) created`,
    });

    return res.status(201).json({
      success: true,
      message: 'Room created successfully',
      data: newRoom,
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
}

// 3. Guest Check-In
async function checkInGuest(req, res) {
  const { roomId } = req.params;
  const { guestName, guestPhone } = req.body;

  try {
    if (!guestName) {
      return res.status(400).json({
        success: false,
        message: 'Guest name is required for check-in',
      });
    }

    const room = await Room.findById(roomId);
    if (!room) {
      return res.status(404).json({ success: false, message: 'Room not found' });
    }

    if (room.status === 'OCCUPIED') {
      return res.status(409).json({ success: false, message: 'Room is already occupied' });
    }

    const booking = new RoomBooking({
      organization: room.organization,
      branch: room.branch,
      room: room._id,
      guestName: guestName.trim(),
      guestPhone: guestPhone ? guestPhone.trim() : '',
      checkInAt: new Date(),
      status: 'ACTIVE',
      createdBy: req.user?.userId,
    });

    await booking.save();

    room.status = 'OCCUPIED';
    room.currentBooking = booking._id;
    await room.save();

    emitToBranch(room.branch.toString(), 'room_updated', {
      roomId: room._id,
      status: 'OCCUPIED',
      bookingId: booking._id,
    });

    return res.status(200).json({
      success: true,
      message: `Room ${room.number} checked in for ${guestName}`,
      data: { room, booking },
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
}

// 4. Guest Check-Out & Final Settle
async function checkOutGuest(req, res) {
  const { bookingId } = req.params;
  const { paymentMethod = 'CASH' } = req.body;

  try {
    const booking = await RoomBooking.findById(bookingId).populate('room');
    if (!booking) {
      return res.status(404).json({ success: false, message: 'Booking not found' });
    }

    if (booking.status === 'COMPLETED') {
      return res.status(400).json({ success: false, message: 'Booking is already checked out' });
    }

    const room = booking.room;
    const now = new Date();

    // Calculate stay duration
    const diffTime = Math.abs(now.getTime() - new Date(booking.checkInAt).getTime());
    const durationDays = Math.max(1, Math.ceil(diffTime / (1000 * 60 * 60 * 24)));
    const roomCost = (room.pricePerNight || 0) * durationDays;

    // Calculate all Room Service food orders for this booking
    const foodOrders = await Cart.find({
      bookingId: booking._id,
      status: { $in: ['PENDING', 'ORDERED', 'PREPARING', 'READY', 'COMPLETED'] },
    });

    const serviceTotal = foodOrders.reduce((acc, curr) => acc + (curr.totalAmount || 0), 0);
    const grandTotal = roomCost + serviceTotal;

    // Complete booking
    booking.checkOutAt = now;
    booking.roomCost = roomCost;
    booking.serviceChargeTotal = serviceTotal;
    booking.totalAmount = grandTotal;
    booking.status = 'COMPLETED';
    booking.paymentMethod = paymentMethod.toUpperCase();
    await booking.save();

    // Reset room status to AVAILABLE
    if (room) {
      room.status = 'AVAILABLE';
      room.currentBooking = null;
      await room.save();
    }

    // Mark active food orders completed
    await Cart.updateMany(
      { bookingId: booking._id, status: { $ne: 'COMPLETED' } },
      { $set: { status: 'COMPLETED', kitchenStatus: 'SERVED', paidAt: now } }
    );

    emitToBranch(booking.branch.toString(), 'room_updated', {
      roomId: room?._id,
      status: 'AVAILABLE',
      bookingId: null,
    });

    return res.status(200).json({
      success: true,
      message: `Room ${room?.number || ''} checked out. Total Settled: ₹${grandTotal.toFixed(2)}`,
      data: booking,
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
}

// 5. Room Stay History
async function getRoomHistory(req, res) {
  try {
    const orgId = req.organizationId || req.user?.organizationId;
    const targetBranch = req.query.branchId || req.user?.branch || req.user?.branchId;

    const filter = {
      status: 'COMPLETED',
      ...(orgId ? { organization: orgId } : {}),
      ...(targetBranch ? { branch: targetBranch } : {}),
    };

    const bookings = await RoomBooking.find(filter)
      .populate('room', 'number roomType pricePerNight')
      .populate('branch', 'branchName')
      .sort({ checkOutAt: -1 });

    return res.status(200).json({
      success: true,
      data: bookings,
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
}

module.exports = {
  getRooms,
  createRoom,
  checkInGuest,
  checkOutGuest,
  getRoomHistory,
};
