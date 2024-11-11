const socket = require("socket.io")
module.exports = function (server){
    const io = socket(server, {
        cors:{
            origin: ['*'],
        }
    });

    //create a custom namespace
    const videoMeet = io.of("/meet");

    videoMeet.on("connection", socket =>{
        console.log("Client connected");

        socket.on("disconnect", ()=>{
            console.log("Client disconnected");
        });

        socket.on("newUserJoining", (id, roomId) =>{
            socket.join(roomId);
            socket.to(roomId).emit("newUserJoined", id);
        });
    });
}