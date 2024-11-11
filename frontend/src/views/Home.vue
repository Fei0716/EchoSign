<script setup>
import { io } from "socket.io-client";
import { ref, onMounted } from "vue";

const userId = ref(null);
const roomId = ref(1);
const userVideoStream = ref(null);
const Section_Videos = ref(null);
const connectedStreams = ref([]);  // Reactive array to hold video streams for reactive updates

// User's own video setup
const userVideo = document.createElement("video");
userVideo.muted = true;

// Initialize user media (camera and microphone)
navigator.mediaDevices.getUserMedia({
  video: true,
  audio: true,
}).then((stream) => {
  userVideoStream.value = stream;
  addVideoToSection(userVideo, stream);

  peer.on("call", (call) => {
    // Answer call and send own stream
    call.answer(stream);
    const vid = document.createElement("video");

    call.on("stream", (userStream) => {
      addVideoToSection(vid, userStream);
    });

    call.on("error", (err) => {
      alert(err);
    });

    call.on("close", () => {
      vid.remove();
    });
  });
}).catch(err => {
  alert(err.message);
});

// Socket connection to the "/meet" namespace
const socket = io("http://192.168.1.20:3000/meet", {
  transports: ["websocket"],
  withCredentials: true
});

socket.on('connect', () => {
  console.log('Connected to socket.io:', socket);
});

// Set up peer for WebRTC connections
const peer = new Peer();
peer.on("open", (id) => {
  userId.value = id;
  console.log("Current user's id:", id);
  socket.emit("newUserJoining", id, roomId.value);
});

// When another user joins
socket.on("newUserJoined", (id) => {
  console.log("User (" + id + ") has joined the video meeting");

  // Calling other client and sending our video stream
  const call = peer.call(id, userVideoStream.value);
  const vid = document.createElement("video");

  call.on("error", (err) => {
    alert(err);
  });

  call.on("stream", (userStream) => {
    addVideoToSection(vid, userStream);
  });

  call.on("close", () => {
    vid.remove();
  });
});

// Reactive function to append videos to Section_Videos
function addVideoToSection(video, stream) {
  video.srcObject = stream;
  video.addEventListener("loadedmetadata", () => {
    video.play();
  });
  connectedStreams.value.push(video);  // Update reactive array
}

onMounted(() => {
  Section_Videos.value = document.getElementById("section-videos");
});

</script>

<template>
  <h1>Online Video Meeting</h1>
  <section aria-label="Videos Output Section" id="section-videos" ref="Section_Videos">
    <div v-for="(video, index) in connectedStreams" :key="index" class="video-container">
      <video :srcObject="video.srcObject" autoplay playsinline muted></video>
    </div>
  </section>
</template>

<style scoped>
.video-container {
  margin: 10px;
}
</style>
