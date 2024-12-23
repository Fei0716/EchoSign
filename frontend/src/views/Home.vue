<script setup>
import { io } from "socket.io-client";
import { ref, onMounted, onBeforeUnmount, watchEffect} from "vue";
import Peer from "peerjs";
import * as tf from "@tensorflow/tfjs"; // Import TensorFlow.js
import useMeetingFunctionStore from "../stores/meeting_function.js";

//states
const meetingFunctionStore = useMeetingFunctionStore();
// Socket.IO connection
const socket = io("http://localhost:3000/meet", {
  transports: ["websocket"],
  withCredentials: true,
});

// PeerJS for managing WebRTC connections
const peer = ref(null);
const userVideoStream = ref(null);
const userId = ref(null);
const isPeerReady = ref(false);
const isStreamReady = ref(false);
const peerConnections = ref(new Map()); // Track peer connections
const videoStreams = ref(new Map());    // Track video streams
const roomId = ref(1);
const users  = ref([]);//list of users inside the meeting
const currentUser = ref('Fei');//current user detail
const connectedStreams = ref([]); // Reactive array for connected video streams
const prediction = ref(null); // Stores predictions
const isMuted = ref(true);
const topFivePredictions = ref([]);//store top 3 predictions with the highest confidence

// flags
const modelIsLoading = ref(false);//flag for loading sign languange recognition
let isRunning = false;
// model
const showTopFivePredictions = ref(false);

let holistic; // MediaPipe Holistic instance
// TensorFlow Model
let model = null;
const ACTIONS = [
  "Hi", "Saya Sayang Awak", "Makan", "Selamat Malam", "Terima Kasih",
  "Apa Khabar", "Awak", "Saya", "Minum", "Salah", "Betul", "Minta Maaf",
  "Tolong", "Hijau", "Kita", "Mereka", "Ini", "Itu", "Apa", "Siapa",
  'Ini Di Luar Pengetahuan Saya'
];
const SEQUENCE_LENGTH = 30; // Predetermined sequence length for the model
const sequences = []; // To store keypoints for each sequences
// Preprocessing constants
const POSE_LANDMARKS = 33;
const POSE_VALUES_PER_LANDMARK = 4; // x, y, z, visibility
const HAND_LANDMARKS = 21;
const HAND_VALUES_PER_LANDMARK = 3; // x, y, z
const TOTAL_POSE_VALUES = POSE_LANDMARKS * POSE_VALUES_PER_LANDMARK;
const TOTAL_HAND_VALUES = HAND_LANDMARKS * HAND_VALUES_PER_LANDMARK;
const TOTAL_FEATURE_VALUES = TOTAL_POSE_VALUES + 2 * TOTAL_HAND_VALUES;

async function initializeBackend() {
  await tf.setBackend("webgl");
  tf.env().set("WEBGL_RENDER_FLOAT32_ENABLED", true); // Enable float32 support
  await tf.ready();

  console.log("Backend set to:", tf.getBackend());


}
initializeBackend();

const gl = document.createElement("canvas").getContext("webgl");
const debugInfo = gl.getExtension("WEBGL_debug_renderer_info");
const vendor = gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL);
const renderer = gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL);

console.log("Vendor:", vendor);
console.log("Renderer:", renderer);


// Load TensorFlow.js model
async function loadModel() {
  try {
    model = await tf.loadGraphModel("/model/model.json");
    console.log("TensorFlow.js model loaded successfully.");

    // console.log(model.inputs);
  } catch (err) {
    console.error("Failed to load TensorFlow.js model:", err);
  }
}
function checkAndEmitJoining() {
  // Only emit if we have both peer connection and stream
  if (isPeerReady.value && isStreamReady.value && userId.value) {
    console.log("All requirements met, emitting newUserJoining");
    socket.emit("newUserJoining", userId.value, roomId.value);
  }
}
// Initialize everything in a single async function
async function initializeConnection() {
  try {
    // 1. Initialize peer
    peer.value = new Peer();

    peer.value.on("open", (id) => {
      console.log("PeerJS Opened with ID:", id);
      userId.value = id;
      isPeerReady.value = true;
      checkAndEmitJoining();
    });

    // 2. Get media stream
    const stream = await navigator.mediaDevices.getUserMedia({
      video: true,
      audio: true
    });

    userVideoStream.value = stream;
    addLocalStream(stream);
    isStreamReady.value = true;
    checkAndEmitJoining();  // Check again after stream is ready

    // Rest of your peer and socket setup...
    setupPeerEvents();
    setupSocketEvents();

  } catch (err) {
    console.error("Error during initialization:", err);
    alert("Error accessing media devices: " + err.message);
  }
}

function setupPeerEvents(){
  peer.value.on("call", (call) => {
    call.answer(userVideoStream.value);

    call.on("stream", (userStream) => {
      // Store the stream with peer ID
      videoStreams.value.set(call.peer, userStream);
      addVideoStream(userStream);
    });

    call.on("close", () => {
      const stream = videoStreams.value.get(call.peer);
      if (stream) {
        removeVideoStream(stream);
        videoStreams.value.delete(call.peer);
      }
    });
  });
}
// Separate socket events setup for clarity
function setupSocketEvents() {
  socket.on("connect", () => {
    console.log("Connected to socket.io:", socket.id);

    // If we already have a peer ID, emit joining
    if (userId.value) {
      socket.emit("newUserJoining", userId.value, roomId.value);
    }
  });

  socket.on("newUserJoined",    (user) => {
    console.log(`${user.name} has joined the video meeting`);

    users.value.push(user);

    if (userVideoStream.value) {
      const call = peer.value.call(user.peerId, userVideoStream.value);

      // Store the connection
      peerConnections.value.set(user.peerId, call);

      call.on("stream", (userStream) => {
        videoStreams.value.set(user.peerId, userStream);
        addVideoStream(userStream , user.name);
      });

      call.on("close", () => {
        const stream = videoStreams.value.get(user.peerId);
        if (stream) {
          removeVideoStream(stream);
          videoStreams.value.delete(user.peerId);
        }
      });
    }
  });
  socket.on("userDisconnected", (user) => {
    console.log(user.name + " has left the meeting");
    //remove the users
    users.value.splice(users.value.findIndex((u)=> u.name === user.name), 1);
    // Clean up peer connection
    const connection = peerConnections.value.get(user.peerId);
    if (connection) {
      connection.close();
      peerConnections.value.delete(user.peerId);
    }

    // Clean up video stream
    const stream = videoStreams.value.get(user.peerId);
    if (stream) {
      removeVideoStream(stream);
      videoStreams.value.delete(user.peerId);
    }
  });
  socket.on("getUsers", (data) => {
    users.value = data;
  });

  socket.on("prediction", (data) => {
    console.log("Predicted:", data);
    prediction.value = data;
  });
}

//Add user information
function addUserMeta(){

}
// Add local video stream to the UI
function addLocalStream(stream) {
  connectedStreams.value.push({
    stream,
    isLocal: true,
    name: currentUser,
  });
}

// Add a new user's video stream
function addVideoStream(stream, name=currentUser) {
  const alreadyAdded = connectedStreams.value.some(
      (s) => s.stream.id === stream.id
  );
  if (!alreadyAdded) {
    connectedStreams.value.push({
      stream,
      isLocal: false,
      name: name,
    });
  }
}

// Remove a user's video stream
function removeVideoStream(stream) {
  connectedStreams.value = connectedStreams.value.filter(
      (s) => s.stream.id !== stream.id
  );
}

// Start capturing video frames and sending them for prediction]
async function extractKeypoints(imageData) {
  if (!holistic) {
    const mpHolistic = await import("@mediapipe/holistic");
    holistic = new mpHolistic.Holistic({
      locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/holistic/${file}`,
    });

    holistic.setOptions({
      modelComplexity: 1,
      // smoothLandmarks: false,
      minDetectionConfidence: 0.5,
      minTrackingConfidence: 0.5,
      // Add these configuration options
      // enableSegmentation: false,
      // refineFaceLandmarks: false
    });
  }
  return new Promise((resolve) => {
    holistic.onResults((results) => {
      const pose = results.poseLandmarks
          ? results.poseLandmarks.map(landmark => [
            landmark.x || 0,
            landmark.y || 0,
            landmark.z || 0,
            landmark.visibility || 0
          ])
          : new Array(33 * 4).fill(0);

      const leftHand = results.leftHandLandmarks
          ? results.leftHandLandmarks.map(landmark => [
            landmark.x || 0,
            landmark.y || 0,
            landmark.z || 0
          ])
          : new Array(21 * 3).fill(0);

      const rightHand = results.rightHandLandmarks
          ? results.rightHandLandmarks.map(landmark => [
            landmark.x || 0,
            landmark.y || 0,
            landmark.z || 0
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

async function startSendingFrames() {
  isRunning = true;//Set to true when starting the loop

  const video = document.createElement("video");
  video.srcObject = userVideoStream.value;
  video.play();

  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d", { willReadFrequently: true });

  // Ensure model and holistic are loaded
  await Promise.all([
    model || loadModel(),
    // Optional: holistic initialization if needed
  ]);

  let processingFrame = false;

  const processFrame = async () => {
    if (processingFrame) return;
    processingFrame = true;

    try {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      context.drawImage(video, 0, 0, canvas.width, canvas.height);

      const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
      const keypoints = await extractKeypoints(imageData);

      if (keypoints) {
        sequences.push(keypoints);

        // Limit sequence length
        if (sequences.length > SEQUENCE_LENGTH) {
          sequences.shift();
        }

        prediction.value = await predictAction(keypoints);
      }
    } catch (error) {
      console.error("Frame processing error:", error);
    } finally {
      processingFrame = false;
    }
  };

  // Use requestAnimationFrame for smoother 30fps-like performance
  function frameLoop() {
    if (!isRunning){
      topFivePredictions.value = [];
      return; // Stop the loop if isRunning is false
    }
    processFrame();
    setTimeout(frameLoop,  16.667); // ~30 fps
  }

  frameLoop();
}
// TensorFlow.js Prediction Logic
function preprocessSequence(sequences) {
  // Ensure exactly 90 sequences
  const paddedFrames = sequences.slice(-SEQUENCE_LENGTH);
  while (paddedFrames.length < SEQUENCE_LENGTH) {
    paddedFrames.unshift({
      pose: Array(33).fill([0, 0, 0, 0]),
      leftHand: Array(21).fill([0, 0, 0]),
      rightHand: Array(21).fill([0, 0, 0]),
    });
  }

  const processedFrames = paddedFrames.map((frame) => {
    const pose = frame.pose.slice(0, 33).flatMap((landmark) => [
      landmark[0] || 0, landmark[1] || 0, landmark[2] || 0, landmark[3] || 0,
    ]);

    const leftHand = frame.leftHand.slice(0, 21).flatMap((landmark) => [
      landmark[0] || 0, landmark[1] || 0, landmark[2] || 0,
    ]);

    const rightHand = frame.rightHand.slice(0, 21).flatMap((landmark) => [
      landmark[0] || 0, landmark[1] || 0, landmark[2] || 0,
    ]);

    return [...pose, ...leftHand, ...rightHand];
  });

  // console.log("Processed Frames Shape:", processedFrames.length, processedFrames[0]?.length);
  return tf.tensor2d(processedFrames, [SEQUENCE_LENGTH, TOTAL_FEATURE_VALUES], "float32");
}
async function predictAction(){
  if(sequences.length > SEQUENCE_LENGTH){
    sequences.shift();
  }
  // console.log(`Current Sequence Length: ${sequences.length}`);
  // Prediction logic only when sequence is complete
  if (sequences.length === SEQUENCE_LENGTH) {
    try {
      // Preprocess and scale the input sequence
      const reshapedSequence = preprocessSequence(sequences).reshape([-1, 30, 258]);

      // console.log("Input Tensor Shape:", reshapedSequence.shape);
      // console.log("Input Tensor Dtype:", reshapedSequence.dtype);

      const inputTensor = { [model.inputs[0].name]: reshapedSequence };
      const outputTensor = await model.execute(inputTensor);
      // console.log("Output Tensor Shape:", outputTensor.shape);

      if(modelIsLoading.value){
        modelIsLoading.value = false;//hide the loading animation
      }
      // Output tensor contains probabilities for each class directly
      const probabilities = await outputTensor.array(); // Shape: [1, 20]
      const classProbabilities = probabilities[0]; // First batch output

      // console.log("Class Probabilities:", classProbabilities);

      // Find the class with the highest probability
      const actionIndex = classProbabilities.reduce(
          (maxIndex, value, index, array) => (value > array[maxIndex] ? index : maxIndex),
          0
      );

      //  const currentTopThreePredictions = classProbabilities.reduce((acc, value, index, array) => {
      //   const currentPrediction = {
      //     index: index,
      //     confidence: parseFloat(value * 100).toFixed(2)
      //   };
      //
      //   // Find insert position based on confidence value
      //   const insertIndex = acc.findIndex(item => value > array[item.index]);
      //
      //   if (insertIndex >= 0) {
      //     acc.splice(insertIndex, 0, currentPrediction);
      //     if (acc.length > 3) acc.pop();
      //   } else if (acc.length < 3) {
      //     acc.push(currentPrediction);
      //   }
      //
      //   return acc;
      // }, []);

      // FIFO
      if(!topFivePredictions.value.some(value => value === actionIndex)){
        if(topFivePredictions.value.length >= 5){
          topFivePredictions.value.shift();
        }
          topFivePredictions.value.push( actionIndex);
      }else{
        //move the value to the top
        let index = topFivePredictions.value.findIndex(value => value === actionIndex);
        topFivePredictions.value.splice(index, 1);
        topFivePredictions.value.push(actionIndex);

      }
      // socket.to(roomId).emit("prediction", {
      //   action: ACTIONS[actionIndex],
      //   confidence: confidence,
      // })
    } catch (error) {
      console.error('Comprehensive Prediction Error:', error);
    }
  }
}

function getDates() {
  const date = new Date();

  // Array of day names
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

  // Array of month names
  const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

  // Get day, month and year components
  const dayName = days[date.getDay()];
  const monthName = months[date.getMonth()];
  const day = date.getDate();
  const year = date.getFullYear();

  // Combine into final format
  return `${dayName}, ${monthName} ${day}, ${year}`;
}

//watchers
watchEffect(()=>{
  if(meetingFunctionStore.isSignLanguageRecognitionActivated){
    //turn on the sign language recognition model
    modelIsLoading.value = true;
    startSendingFrames();
  }else{
    isRunning = false; // Stop the loop when deactivated
    //clear the recent predictions
    topFivePredictions.value = [];
  }
});

// lifecycle hooks
// Call this in onMounted
onMounted(() => {
  initializeConnection();

  // Cleanup on unmount
  return () => {
    if (userVideoStream.value) {
      userVideoStream.value.getTracks().forEach(track => track.stop());
    }
    if (peer.value) {
      peer.value.destroy();
    }
  };
});

// Add cleanup on component unmount
onBeforeUnmount(() => {
  // Close all peer connections
  peerConnections.value.forEach((connection) => {
    connection.close();
  });

  // Stop all remote streams
  videoStreams.value.forEach((stream) => {
    stream.getTracks().forEach(track => track.stop());
  });

  // Clear maps
  peerConnections.value.clear();
  videoStreams.value.clear();

  // Stop local stream
  if (userVideoStream.value) {
    userVideoStream.value.getTracks().forEach(track => track.stop());
  }

  // Destroy peer connection
  if (peer.value) {
    peer.value.destroy();
  }
});
</script>

<template>
  <section aria-label="Online Meeting Section" id="section-meeting">
    <section>
      <header class="my-4">
        <small class="d-block  mb-2 text-white-50">{{getDates()}}</small>
        <div class="d-flex justify-content-between">
          <h1 class="mb-2">Meeting 01</h1>
          <button class="btn-custom-primary">Share <i class="bi bi-share-fill"></i></button>
        </div>
      </header>
      <section aria-label="Videos Output Section" id="section-videos">
        <div v-for="(streamObj, index) in connectedStreams" :key="index" class="videos-container">
          <article class="video-container">
            <video class="video video-pinned"
                   autoplay
                   playsinline
                   :muted="streamObj.isLocal || isMuted"
                   :srcObject="streamObj.stream"
            >
            </video>

            <!--        button to toggle top predictions table-->
            <button v-if="topFivePredictions.length > 0 && isRunning" :toggled="showTopFivePredictions"@click="showTopFivePredictions= !showTopFivePredictions" id="btn-toggle-predictions">
              <i class="bi bi-caret-down-fill"></i>
            </button>

            <Transition name="fade" mode="out-in" >
              <table class="table-prediction" v-if="topFivePredictions.length > 0 && showTopFivePredictions && isRunning">
                <thead>
                  <tr>
                    <th colspan="3">Recent Predictions</th>
                  </tr>
                </thead>
                <tbody>
                  <template v-for="(prediction, index) in topFivePredictions" :key="prediction.index">
                    <tr :class="{'prediction-current': index === topFivePredictions.length - 1}">
                      <td>{{++index}}. {{ACTIONS[prediction]}}</td>
                    </tr>
                  </template>
                </tbody>
              </table>


            </Transition>


            <div class="prediction-subtitle" v-if="topFivePredictions.length > 0 && isRunning">
              {{ACTIONS[topFivePredictions[topFivePredictions.length - 1]]}}
            </div>

            <!-- user name              -->
            <div :class="{'participant-name-current': currentUser === streamObj.name }" class="participant-name">
              {{streamObj.name}}
            </div>

            <!--        loading animation while waiting for the model to load up-->
            <div class="loader" v-if="modelIsLoading">
              <li class="ball"></li>
              <li class="ball"></li>
              <li class="ball"></li>
            </div>
          </article>
        </div>
      </section>
    </section>
    <section aria-label="Meta Data About Current Meeting" id="section-meeting-meta" class="mt-4">
      <div id="participant-list" class="mb-3">
          <h2 class="mb-3 pb-1 border-bottom border-dark">Participants <span class="badge text-bg-primary">{{users.length}}</span></h2>
  <!--        list of participants-->
          <div id="participants-wrapper">
<!--            <article class="participant mb-2">-->
<!--              <div class="participant-profile-data">-->
<!--                <i class="bi bi-person-fill"></i>-->
<!--                <div>Fei</div>-->
<!--              </div>-->
<!--              <div class="participant-input">-->
<!--                <i class="bi bi-mic-fill"></i>-->
<!--                <i class="bi bi-camera-video-fill"></i>-->
<!--              </div>-->
<!--            </article>-->
            <article v-for="user of users" :key="user.peerId" class="participant mb-2">
              <div class="participant-profile-data">
                <i class="bi bi-person-fill"></i>
                <div>{{user.name}}
                    <span v-if="user.name === currentUser">(You)</span>
                </div>
              </div>
              <div class="participant-input">
                <i class="bi bi-mic-mute-fill"></i>
                <i class="bi bi-camera-video-fill"></i>
              </div>
            </article>
          </div>
      </div>

      <div id="discussion-list">
        <h2 class="mb-3 pb-1 border-bottom border-dark">Discussion</h2>
        <div id="discussion-wrapper" class="mb-2">
            <article class="discussion-message discussion-message-current-user mb-2">
                <div>You</div>
                <div class="discussion-message-content">
                    Hi, how are you guys?
                </div>
            </article>

            <article class="discussion-message discussion-message-other-user mb-2">
              <div>Nik Faruq</div>
              <div class="discussion-message-content">
                I'm good!
              </div>
            </article>

            <article class="discussion-message discussion-message-current-user mb-2">
              <div>You</div>
              <div class="discussion-message-content">
                Good to hear!
              </div>
            </article>

          <article class="discussion-message discussion-message-current-user mb-2">
            <div>You</div>
            <div class="discussion-message-content">
              Good to hear!
            </div>
          </article>


        </div>
        <div id="discussion-input" class="d-flex gap-2">
          <input type="text" name="message" id="message" placeholder="Enter your message..." class="form-control">
          <button id="btn-send"></button>
        </div>
      </div>
    </section>
  </section>



</template>

<style scoped>
#section-meeting{
  display: flex;
  gap: 1.5rem;
  flex-wrap: wrap;

  section:first-child{
    flex: 1 1 65%;
  }
  #section-meeting-meta{
    flex: 1 1 30%;


    #participant-list{
      height: 300px;
      overflow-y: auto;
      background-color: var(--secondary-color);
      border-radius: 0.5rem;
      padding: 12px;

      h2{
        display: flex;
        align-items: center;
        gap: .5rem;
      }
      span{
        font-size: 16px;
      }
      .participant{
        display: flex;
        justify-content: space-between;
        align-items: center;
        font-size: 18px;

        .participant-profile-data{
          display: flex;
          gap: .5rem;
          align-items: center;
          /*profile icon*/
          i{
            background-color: var(--forth-color);
            padding: 6px;
            border-radius: 100%;
            width: 40px;
            height: 40px;
            display: flex;
            justify-content: center;
            align-items: center;
            font-size: 20px;
          }
        }
        .participant-input{
          display: flex;
          gap: .5rem;
        }
      }
    }

    #discussion-list{
      background-color: var(--secondary-color);
      border-radius: 0.5rem;
      padding: 12px;

      #discussion-wrapper{
        height: 200px;
        position: relative;
        overflow-y: auto;
        padding-right: 12px;
        .discussion-message-current-user{
          display: flex;
          align-items: flex-end;
          flex-direction: column;

          .discussion-message-content{
            background-color: var(--bs-primary);
            color: var(--third-color);
            padding: 12px;
            border-radius: .5rem 0 .5rem .5rem;
          }
        }
        .discussion-message-other-user{
          display: flex;
          align-items: flex-start;

          flex-direction: column;
          .discussion-message-content{
            background-color: var(--third-color);
            color: var(--primary-color);
            padding: 12px;
            border-radius: 0 0.5rem .5rem .5rem;
          }
        }
      }
    }
  }
}
.videos-container{
  display: flex;
  justify-content: center;
}
.video-container{
  position: relative;
  width: fit-content;
  height: fit-content;
}

.video{
  border-radius: 0.5rem;
  border: 5px solid var(--secondary-color);
  width: 300px;
  object-fit: cover;

}
.video-pinned{
  //width: 100%;
  width: max-content;
  object-fit: contain;
  //height: 500px;
}
.table-prediction{
  position: absolute;
  top: calc(3% + 34px + 1%);
  right: 2%;
  border-radius: 0.5rem;
  background-color: rgba(28, 36, 47, 0.90);
  font-size: 12px;
  td,th{
    padding: 8px;
  }
  th{
    border-bottom: 1px solid var(--third-color);
  }

}
.prediction-subtitle{
  position: absolute;
  bottom: 16px;
  left: 50%;
  transform: translateX(-50%);
  background-color: rgba(28, 36, 47, 0.90);
  border-radius: 0.5rem;
  padding: 12px 20px;
  overflow: hidden;

}
.participant-name{
  position: absolute;
  left: 12px;
  top: 12px;
  background-color: rgba(28, 36, 47, 0.90);
  padding: 6px 10px;
  border-radius: 0.5rem;
}
.prediction-current{
  display: block;
  background-color: rgba(28, 36, 47)!important;
  border-bottom-left-radius: 0.5rem;
  border-bottom-right-radius: 0.5rem;
}
.loader{
  position: absolute;
  bottom: 10%;
  left: 50%;
  transform: translateX(-50%);
}
#btn-toggle-predictions{
  all: unset;
  position: absolute;
  top: 3%;
  right: 2%;
  border-radius: 0.5rem;
  background-color: rgba(28, 36, 47, 0.90);
  font-size: 12px;
  z-index: 2;
  padding: 8px 12px;
  color: var(--third-color);
  cursor: pointer;
  transition: all .4s ease;

  i{
    display: block;
    transition: all .4s ease;
  }
}
#btn-toggle-predictions:hover{
  background-color: var(--bs-primary);
}
#btn-toggle-predictions[toggled=true]{
  i{
    transform: rotate(180deg);
  }
}
</style>
