const socket = require("socket.io");
const axios = require("axios");

// Room management
const rooms = {};
const joinedUsers = new Map();
const messages = [];

module.exports = function (server) {
  const io = socket(server, {
    cors: {
      origin: ["*"],
    },
  });

  const videoMeet = io.of("/meet");

  // Socket.IO Connection
  videoMeet.on("connection", (socket) => {
    console.log("A new user connected:", socket.id);

    socket.on("newUserJoining", async (data) => {
      try {
        const { username, roomId } = data;

        // Call join API to handle database operations
        const joinResponse = await axios.post(`http://${process.env.HOST}:3000/api/v1/meetings/join`, {
          meeting_id: roomId,
          username: username
        });

        if (joinResponse.data) {
          socket.join(roomId);
          rooms[socket.id] = roomId;

          // Store user data in joinedUsers map
          joinedUsers.set(socket.id, {
            name: username,
            socketId: socket.id,
            peerId: data.peerId,
            userId: joinResponse.data.user.id, // Store the database user ID
            audioEnabled: true,//initially users' video or audio will be enabled
            videoEnabled: true,
            prediction: null,//store prediction from user's model instance
            showTopFivePredictions: false,
            recentPredictions: [],//store the recent top predictions
          });

          // Get updated participant list from API
          const participantsResponse = await axios.get(`http://${process.env.HOST}:3000/api/v1/meetings/${roomId}/`);

          // Create a safe user list to emit
          const userList = participantsResponse.data.participants.map(participant => {
            // Find the corresponding peerId using the userId from the database
            const user = Array.from(joinedUsers.values()).find(user => user.userId === participant.id);

            return {
              name: participant.name,
              peerId: user?.peerId || null, // Ensure we get the correct peerId or null if not found
              audioEnabled: user.audioEnabled,
              videoEnabled: user.videoEnabled,
              prediction: user.prediction,
              showTopFivePredictions: false,
              recentPredictions: [],//store the recent top predictions
            };
          });
          console.log("users",userList);
          // Emit to the joining user
          socket.emit('getUsers', userList);
          socket.emit('getMessages', messages);

          // Notify others
          socket.to(roomId).emit("newUserJoined", {
            name: username,
            peerId: data.peerId,
            audioEnabled: true,
            videoEnabled: true,
            prediction: null,
            recentPredictions: [],//store the recent top predictions
          });

          console.log(`User ${username} joined room ${roomId}`);
        }
      } catch (error) {
        console.error('Error in newUserJoining:', error);
        socket.emit('joinError', {
          message: 'Failed to join meeting'
        });
      }
    });

    socket.on("sendParticipantMessage", (data, roomId) => {
      let sender = joinedUsers.get(socket.id);
      let newMessage = {
        message: data.message,
        sender: sender.name,
      };
      messages.push(newMessage);
      socket.to(roomId).emit("receiveNewMessage", newMessage);
    });

    socket.on("mediaStateChange", ({ roomId, peerId, type, enabled }) => {
      // Retrieve the user data by peerId
      const user = Array.from(joinedUsers.values()).find(user => user.peerId === peerId);

      if (user) {
        // Modify the appropriate media state
        if (type === 'video') {
          user.videoEnabled = enabled;
        } else if (type === 'audio') {
          user.audioEnabled = enabled;
        }

        // Update the Map with the modified user data
        joinedUsers.set(user.socketId, user);

        // Broadcast the media state change to all other users in the room
        socket.to(roomId).emit("mediaStateChanged", {
          peerId,
          type,
          enabled
        });
      }
    });

    socket.on("madePrediction", ({roomId, peerId, prediction})=>{
      socket.to(roomId).emit("receivedPrediction", {
          peerId,
          prediction
      });
    });

    socket.on("disconnect", async () => {
      try {
        const roomId = rooms[socket.id];
        const userData = joinedUsers.get(socket.id);

        if (roomId && userData) {
          // Call leave API
          console.log(roomId, userData.userId);
          await axios.post(`http://${process.env.HOST}:3000/api/v1/meetings/leave`, {
            meeting_id: roomId,
            user_id: userData.userId
          });

          socket.leave(roomId);
          socket.to(roomId).emit("userDisconnected", userData);

          delete rooms[socket.id];
          joinedUsers.delete(socket.id);

          console.log(`User ${userData.name} disconnected from room ${roomId}`);
        }
      } catch (error) {
        console.error('Error handling disconnect:', error);
      }
    });
  });
};