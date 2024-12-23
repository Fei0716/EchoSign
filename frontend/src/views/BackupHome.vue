<script setup>
import { io } from "socket.io-client";
import { ref, onMounted } from "vue";
import Peer from "peerjs"; // Ensure to install peerjs via npm

// Set up Socket.IO connection
const socket = io("http://localhost:3000/meet", {
  transports: ["websocket"],
  withCredentials: true,
});

// PeerJS for managing WebRTC connections
const peer = new Peer();
const userId = ref(null);
const roomId = ref(1);
const userVideoStream = ref(null);
const connectedStreams = ref([]); // Stores connected video streams
const prediction = ref(null); // Stores the current prediction
const isMuted = ref(true)

let holistic; // MediaPipe Holistic instance

// Initialize user media
navigator.mediaDevices
    .getUserMedia({ video: true, audio: true })
    .then((stream) => {
      userVideoStream.value = stream;
      addVideoStream(stream); // Add local video stream

      setupSocketAndPeer(); // Set up socket and peer after getting user media
    })
    .catch((err) => {
      alert(err.message);
    });

// Socket and Peer setup
function setupSocketAndPeer() {
  socket.on("connect", () => {
    console.log("Connected to socket.io:", socket);

    // Start sending video frames for prediction
    startSendingFrames();

    // Join a meeting room

    socket.on("newUserJoined", (id) => {
      console.log(`User (${id}) has joined the video meeting`);

      // Call the new user and send our stream
      const call = peer.call(id, userVideoStream.value);

      call.on("stream", (userStream) => {
        addVideoStream(userStream); // Add received stream
      });

      call.on("close", () => {
        removeVideoStream(userStream);
      });
    });

    // Listen for prediction from the model
    socket.on("prediction", (data) => {
      console.log(`Predicted: ${data}`)
      prediction.value = data; // Update the prediction
    });
  });

  peer.on("open", (id) => {
    userId.value = id;
    socket.emit("newUserJoining", id, roomId.value);
  });

  peer.on("call", (call) => {
    // Answer incoming calls with our stream
    call.answer(userVideoStream.value);

    call.on("stream", (userStream) => {
      addVideoStream(userStream); // Add the new user's stream
    });

    call.on("close", () => {
      removeVideoStream(userStream);
    });
  });
}

// Manage connected streams reactively
function addVideoStream(stream) {
  if (!connectedStreams.value.includes(stream)) {
    connectedStreams.value.push(stream);
  }
}

function removeVideoStream(stream) {
  connectedStreams.value = connectedStreams.value.filter(
      (s) => s.id !== stream.id
  );
}

let keypointsCounter = 0;
// Start capturing video frames and sending for prediction
function startSendingFrames() {
  const video = document.createElement("video");
  video.srcObject = userVideoStream.value;
  video.play();

  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");

  setInterval(async () => {
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    context.drawImage(video, 0, 0, canvas.width, canvas.height);

    const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
    const keypoints = await extractKeypoints(imageData);

    if (keypoints) {
      console.log("Sending Keypoints", ++keypointsCounter, {
        poseLength: keypoints.pose.length,
        leftHandLength: keypoints.leftHand.length,
        rightHandLength: keypoints.rightHand.length
      });
      socket.emit("video-keypoints", keypoints);
    }
  }, 500); // Reduced interval for more frequent updates
}

// Extract keypoints using MediaPipe Holistic
async function extractKeypoints(imageData) {
  if (!holistic) {
    const mpHolistic = await import("@mediapipe/holistic");
    holistic = new mpHolistic.Holistic({
      locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/holistic/${file}`,
    });

    holistic.setOptions({
      modelComplexity: 1,
      smoothLandmarks: true,
      minDetectionConfidence: 0.5,
      minTrackingConfidence: 0.5,
    });
  }

  return new Promise((resolve) => {
    holistic.onResults((results) => {
      const pose = results.poseLandmarks
          ? results.poseLandmarks.map(landmark => [
            landmark.x,
            landmark.y,
            landmark.z,
            landmark.visibility
          ])
          : new Array(33 * 4).fill(0);

      const leftHand = results.leftHandLandmarks
          ? results.leftHandLandmarks.map(landmark => [
            landmark.x,
            landmark.y,
            landmark.z
          ])
          : new Array(21 * 3).fill(0);

      const rightHand = results.rightHandLandmarks
          ? results.rightHandLandmarks.map(landmark => [
            landmark.x,
            landmark.y,
            landmark.z
          ])
          : new Array(21 * 3).fill(0);

      const keypoints = {
        pose: pose,
        leftHand: leftHand,
        rightHand: rightHand
      };

      resolve(keypoints);
    });

    holistic.send({ image: imageData });
  });
}

function muteVideo(event) {
  const videoElement = event.target;
  videoElement.muted = true;
  videoElement.volume = 0;
  videoElement.play().catch(error => {
    console.error('Error attempting to play video:', error);
  });
}
</script>


<template>
  <h1>Online Video Meeting</h1>

  <section aria-label="Videos Output Section" id="section-videos">
    <div v-for="(stream, index) in connectedStreams" :key="index" class="video-container">
      <video :srcObject="stream" :muted="isMuted" @loadedmetadata="muteVideo" autoplay playsinline></video>
    </div>
  </section>

  <div v-if="prediction">
    <h3>Prediction: {{ prediction.action }}</h3>
    <p>Confidence: {{ prediction.confidence }}</p>
  </div>
</template>

<style scoped>
.video-container {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 10px;
  position: relative;
  width: 100%;
  height: auto;
  background-color: black;
}

video {
  width: 100%;
  height: auto;
  border-radius: 8px;
}
</style>
