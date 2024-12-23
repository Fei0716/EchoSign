const socket = require("socket.io");
const axios = require("axios");
const FormData = require("form-data");
const multer = require("multer");

// Room management
const rooms = {}; // Changed to object for better key-value mapping
const users = ["Fei", "Nik Faruq", "Thavaness", "Fazreen"];
const joinedUsers = new Map(); // Using Map instead of array for better user management
let userIndex = 0;


module.exports = function (server) {
  const io = socket(server, {
    cors: {
      origin: ["*"],
    },
  });

  const videoMeet = io.of("/meet");

  // Socket.IO Connection
  videoMeet.on("connection", (socket) => {
    const currentUser = users[userIndex];
    console.log(`A new user connected: ${currentUser}`, socket.id);

    // Store user data in a way that avoids circular references
    joinedUsers.set(socket.id, {
      name: currentUser,
      socketId: socket.id,
      peerId: null
    });

    socket.on("newUserJoining", (userId, roomId) => {
      socket.join(roomId);
      rooms[socket.id] = roomId;
      console.log(`User ${currentUser} joined room ${roomId}.`);

      // Update peer ID
      const userData = joinedUsers.get(socket.id);
      userData.peerId = userId;
      joinedUsers.set(socket.id, userData);

      // Create a safe user list to emit
      const userList = Array.from(joinedUsers.values()).map(user => ({
        name: user.name,
        peerId: user.peerId
      }));

      // Emit the safe user list
      console.log("User List: " , userList);
      socket.emit('getUsers', userList);
      socket.to(roomId).emit("newUserJoined", userData);

      userIndex = (userIndex + 1) % users.length; // Circular increment
    });

    socket.on("disconnect", () => {
      const roomId = rooms[socket.id];
      if (roomId) {
        socket.leave(roomId);
        delete rooms[socket.id];
      }
      console.log("A user disconnected:", socket.id);

      socket.to(roomId).emit("userDisconnected", joinedUsers.get(socket.id));//notify the users
      joinedUsers.delete(socket.id);
    });
  });
};

