const { Server } = require("socket.io");

let io = null;

function initSocket(server) {
  io = new Server(server, {
    cors: {
      origin: (origin, callback) => {
        // Reflect origin so credentials: true works seamlessly without browser wildcard rejection
        callback(null, true);
      },
      methods: ["GET", "POST", "PATCH", "PUT", "DELETE"],
      credentials: true,
    },
    pingTimeout: 60000,
    pingInterval: 25000,
  });

  io.on("connection", (socket) => {
    console.log(`[Socket.io] Client connected: ${socket.id}`);

    // Join branch-specific room or all branches
    socket.on("join_branch", ({ branchId }) => {
      if (branchId && branchId !== "ALL" && branchId !== "all") {
        const room = `branch:${branchId}`;
        socket.join(room);
        console.log(`[Socket.io] Socket ${socket.id} joined room: ${room}`);
        socket.emit("branch_joined", { branchId, room });
      } else {
        socket.join("branch:all");
        console.log(`[Socket.io] Socket ${socket.id} joined room: branch:all`);
        socket.emit("branch_joined", { branchId: "ALL", room: "branch:all" });
      }
    });

    // Leave branch room
    socket.on("leave_branch", ({ branchId }) => {
      if (branchId && branchId !== "ALL" && branchId !== "all") {
        const room = `branch:${branchId}`;
        socket.leave(room);
        console.log(`[Socket.io] Socket ${socket.id} left room: ${room}`);
      } else {
        socket.leave("branch:all");
      }
    });

    socket.on("disconnect", (reason) => {
      console.log(`[Socket.io] Client disconnected: ${socket.id} (reason: ${reason})`);
    });
  });

  return io;
}

function getIO() {
  if (!io) {
    console.warn("[Socket.io] io instance not initialized yet!");
  }
  return io;
}

function emitToBranch(branchId, event, data) {
  if (!io) return;
  if (branchId) {
    const room = `branch:${branchId}`;
    io.to(room).emit(event, data);
    console.log(`[Socket.io] Emitted '${event}' to ${room}`);
  }
  // Also emit to branch:all and global listeners so multi-branch KDS and SuperAdmin see it!
  io.to("branch:all").emit(event, data);
  io.emit(event, data);
}

module.exports = {
  initSocket,
  getIO,
  emitToBranch,
};
