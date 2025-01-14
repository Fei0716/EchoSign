  <script setup>
  import { io } from "socket.io-client";
  import {ref, onMounted, onBeforeUnmount, watchEffect, watch, nextTick} from "vue";
  import Peer from "peerjs";
  import * as tf from "@tensorflow/tfjs"; // Import TensorFlow.js
  import useMeetingFunctionStore from "../stores/meeting_function.js";
  import Notification from "../components/Notification.vue";
  import {useRoute} from "vue-router";
  import api from "../api.js";
  import axios from "axios";

  //states
  const meetingFunctionStore = useMeetingFunctionStore();
  const host = "10.131.73.75";
  // Socket.IO connection
  const socket = io(`http://${host}:3000/meet`, {
    transports: ["websocket"],
    withCredentials: true,
  });
  const route = useRoute();
  const roomId = ref(route.params.id);//current meeting room's id
  const username = ref(null);
  // PeerJS for managing WebRTC connections
  const peer = ref(null);
  const userVideoStream = ref(null);
  const peerId = ref(null);
  const isPeerReady = ref(false);
  const isStreamReady = ref(false);
  const peerConnections = ref(new Map()); // Track peer connections
  const videoStreams = ref(new Map());    // Track video streams
  const users  = ref([]);//list of users inside the meeting
  const userMessages = ref([]);//list of participants/users messages
  const message = ref("");//input message from the current user
  const connectedStreams = ref([]); // Reactive array for connected video streams
  const prediction = ref(null); // Stores predictions
  const topFivePredictions = ref([]);//store top 3 predictions with the highest confidence
  const currentPrediction = ref(null)//store the current most latest prediction
  const notification = ref(null);
  const meeting = ref(null);//store meeting details
  const currentActiveChat = ref("discussion");//by default the current active chat is discussion room
  const chatbotMessages = ref([]);//list of chatbot/user messages
  //For device management
  const audioInputs = ref([]);
  const videoInputs = ref([]);
  const selectedAudioInput = ref('');
  const selectedVideoInput = ref('');
  const currentStream = ref(null);

  // flags
  const modelIsLoading = ref(false);//flag for loading sign languange recognition
  const waitingResponse = ref(false);//flag for response from LLM
  const pageLoading = ref(true);//flag for waiting for the socket and media devices connection
  let isRunning = false;
  let hasNewPrediction = ref(false);
  let predictionTimeout = null; // Store the timeout ID

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
    if (isPeerReady.value && isStreamReady.value && peerId.value) {
      // console.log("All requirements met, emitting newUserJoining");
      socket.emit("newUserJoining", {
        peerId: peerId.value,
        roomId: roomId.value,
        username: username.value,
      });
      pageLoading.value = false;//remove the page loading animation

    }
  }
  // Initialize everything in a single async function
  async function initializeConnection() {
    try {
      // 1. Initialize peer
      peer.value = new Peer();

      peer.value.on("open", (id) => {
        // console.log("peer id", id);
        peerId.value = id;
        isPeerReady.value = true;
        checkAndEmitJoining();

      });

      // Get available devices first
      await getAvailableDevices();

      // 2. Get media stream
      const stream = await getMediaStream(selectedAudioInput.value, selectedVideoInput.value);

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
  //to use selected devices
  async function getMediaStream(audioDeviceId = null, videoDeviceId = null) {
    const constraints = {
      audio: audioDeviceId ? {
        deviceId: { exact: audioDeviceId },
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true
      } : true,
      video: videoDeviceId ? {
        deviceId: { exact: videoDeviceId }
      } : true
    };

    try {
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      return stream;
    } catch (error) {
      console.error('Error getting media stream:', error);
      throw error;
    }
  }

  // Add function to handle input device changes
  async function handleInputsUpdate() {
    try {
      // Stop all tracks in the current stream
      if (userVideoStream.value) {
        userVideoStream.value.getTracks().forEach(track => track.stop());
      }

      // Get new stream with selected devices
      const newStream = await getMediaStream(selectedAudioInput.value, selectedVideoInput.value);
      userVideoStream.value = newStream;
      // console.log("peerConnections", peerConnections.value);



      //force switch enabled all the input devices
      // Directly update media state
      if (!meetingFunctionStore.isVideoActivated) {
        await toggleVideo();
      }
      if (!meetingFunctionStore.isAudioActivated) {
        await toggleAudio();
      }

      //modify the user's media setting
      let userIndex = users.value.findIndex((u) => u.peerId === peerId.value);
      users.value[userIndex].audioEnabled = meetingFunctionStore.isAudioActivated;
      users.value[userIndex].videoEnabled = meetingFunctionStore.isVideoActivated;

      // console.log(meetingFunctionStore.isVideoActivated, meetingFunctionStore.isVideoActivated);


      // Update all peer connections with the new stream
      peerConnections.value.forEach((connection, peerId) => {
        const senders = connection.peerConnection.getSenders();
        // console.log("senders", senders);

        senders.forEach(sender => {
          if (sender.track.kind === 'audio') {
            const audioTrack = newStream.getAudioTracks()[0];
            if (audioTrack) sender.replaceTrack(audioTrack);
          }
          if (sender.track.kind === 'video') {
            const videoTrack = newStream.getVideoTracks()[0];
            if (videoTrack) sender.replaceTrack(videoTrack);
          }
        });
      });

      // Update local video element
      const localVideoIndex = connectedStreams.value.findIndex(s => s.isLocal);
      if (localVideoIndex !== -1) {
        connectedStreams.value[localVideoIndex].stream = newStream;
      }

      // Close the modal
      const modalElement = document.querySelector('#modal-settings');
      const modalInstance = bootstrap.Modal.getInstance(modalElement);
      modalInstance?.hide();

    } catch (error) {
      console.error('Error updating input devices:', error);
      notification.value = "Failed to update input devices. Please try again.";
    }
  }

  function setupPeerEvents(){
    peer.value.on("call", (call) => {
      peerConnections.value.set(peerId.value, call);

      call.answer(userVideoStream.value);

      call.on("stream", (userStream) => {
        // Store the stream with peer ID
        // console.log("Someone call me")
        // console.log(call.peer, users.value);
        let user = users.value.findIndex((u) => u.peerId === call.peer);
        videoStreams.value.set(call.peer, userStream);
        addVideoStream(userStream, users.value[user].name);
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
      //get the meeting details
      // If we already have a peer ID, emit joining
      if (peerId.value) {
        socket.emit("newUserJoining", {
          peerId: peerId.value,
          roomId: roomId.value,
          username: username.value,
        });
        pageLoading.value = false;//remove the page loading animation
      }
    });

    socket.on("newUserJoined",    (user) => {
      console.log(`${user.name} has joined the video meeting`);
      pageLoading.value = false;//remove the page loading animation
      users.value.push({
        ...user,
        videoEnabled: true,
        audioEnabled: true,
        recentPredictions: [],//store the recent top predictions
        showTopFivePredictions: false,
      });

      if (userVideoStream.value) {
        const call = peer.value.call(user.peerId, userVideoStream.value);
        console.log("store peer connection");
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
    socket.on("getMessages", (data) => {
      userMessages.value = data;

      //wait the dom finished loading, then scroll to the bottom of the chat
      nextTick(() => {
        scrollToBottomChat();
      });
    });
    //when there's new message sent from other users inside the room
    socket.on("receiveNewMessage", (data) => {
      userMessages.value.push(data);
    })

    //Listen for sign language toggled
    socket.on("signLanguageRecognitionHasBeenToggled", ({peerId, signLanguageRecognitionIsToggled}) =>{
      const userIndex = users.value.findIndex(user => user.peerId === peerId);
      if (userIndex !== -1) {
        users.value[userIndex].signLanguageRecognitionIsToggled = signLanguageRecognitionIsToggled;
      }
    });

    // Listen for media state changes from other users
    socket.on("mediaStateChanged", ({ peerId, type, enabled }) => {
      const userIndex = users.value.findIndex(user => user.peerId === peerId);
      if (userIndex !== -1) {
        if (type === 'video') {
          users.value[userIndex].videoEnabled = enabled;
        } else if (type === 'audio') {
          users.value[userIndex].audioEnabled = enabled;
        }
      }
    });
    socket.on("receivedPrediction", ({peerId, prediction}) => {
        //modify the user's prediction value
        const userIndex = users.value.findIndex(user => user.peerId === peerId);
        users.value[userIndex].prediction = prediction;


        if(prediction === null)return;//dont add the null prediction to array of recent predictions
        let userRecentPredictions = users.value[userIndex].recentPredictions;
        // FIFO
        if(!userRecentPredictions?.some(value => value === prediction)){
          if(userRecentPredictions?.length >= 5){
            userRecentPredictions.shift();
          }
        }else{
          //move the value to the top
          let index = userRecentPredictions.findIndex(value => value === prediction);
          userRecentPredictions.splice(index, 1);
        }
          userRecentPredictions.push(prediction);
    });
  }

  //Add user information
  async function getMeetingDetails(){
    try{
      const {data} = await api.get("meetings/" + roomId.value);
      meeting.value = data;
    }catch(e){
      console.error("Error: " , e);
    }
  }
  // Add local video stream to the UI
  function addLocalStream(stream) {
    connectedStreams.value.push({
      stream,
      isLocal: true,
      name: username.value,
    });
  }

  // Add a new user's video stream
  function addVideoStream(stream, name) {
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
    video.muted = true; // To prevent toggle on local audio
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
        console.log("Frame processing error:", error);
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

        //whenever the prediction was done if the model keeps on yielding the same prediction, the prediction will be removed after 3 seconds
        if (currentPrediction.value !== actionIndex) {
          hasNewPrediction.value = true;
          currentPrediction.value = actionIndex;
          socket.emit("madePrediction", {
            roomId: roomId.value,
            peerId: peerId.value,
            prediction: actionIndex,
          })
          // Clear any existing timeout
          if (predictionTimeout) {
            clearTimeout(predictionTimeout);
          }

          // Set a new timeout
          predictionTimeout = setTimeout(() => {
            hasNewPrediction.value = false;
            predictionTimeout = null; // Reset the timeout ID
            socket.emit("madePrediction", {
              roomId: roomId.value,
              peerId: peerId.value,
              prediction: null,
            })
          }, 4000);
        }

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

  async function sendMessage(){
    let msg = message.value.trim();
    if(currentActiveChat.value === 'discussion' && socket && msg !== ''){
      socket.emit("sendParticipantMessage", {
        //data
        message: msg,
      },roomId.value);//send to other users inside the room
      userMessages.value.push({
        message: msg,
        sender: username.value,
      });

    }else if(currentActiveChat.value === 'ai'  && msg !== '' && !waitingResponse.value){
      //send prompt to llm model for prediction
      waitingResponse.value = true;
      message.value = "";//clear the input field
      chatbotMessages.value.push({
        message: msg,
        sender: username.value,
      });

      await nextTick(() => {
        scrollToBottomChat();
      });

      const {data} = await axios.post(`http://${host}:5000/chat`,{
        message: msg,
      });
      chatbotMessages.value.push({
        message: data.response,
        sender: 'AI',
      });

      waitingResponse.value = false;
    }


    await nextTick(() => {
      scrollToBottomChat();
    });
  }

  function changeChatMode(){
    //change the chat mode
    currentActiveChat.value = currentActiveChat.value === 'discussion' ? 'ai' : 'discussion';
  }
  function scrollToBottomChat(){
    document.querySelector('#discussion-wrapper').scrollTop = document.querySelector('#discussion-wrapper').scrollHeight;
  }
  function copyShareLink() {
    // Get the current page URL
    const currentUrl = window.location.href;

    // Use the Clipboard API to copy the URL to the clipboard
    navigator.clipboard.writeText(currentUrl)
        .then(() => {
          notification.value = "Link copied"
        })
        .catch((error) => {
          console.error("Failed to copy the link: ", error);
          alert("Failed to copy the link. Please try again.");
        });
  }
  function getUsername() {
    if (meetingFunctionStore.username) {
      username.value = meetingFunctionStore.username;
      initializeConnection();
    } else {
      // Show the modal instead of prompt
      const modalElement = document.querySelector('#modal-username');
      const modal = new bootstrap.Modal(modalElement);
      modal.show();
    }
  }

  async function handleUsernameSubmit() {


    //if the username is not valid or the username already been taken
    if (!username.value?.trim()) {
      notification.value = "Please fill in the valid username."
      username.value = null;
      return;
    }
    if(meeting.value?.participants?.length > 0 && meeting.value.participants?.find((p)=> p.name.toLowerCase() === username.value.trim().toLowerCase())){
      notification.value = "Username has already been taken, please try again."
      username.value = null;
      return;
    }

    // Hide the modal
    const modalElement = document.querySelector('#modal-username');
    const modal = bootstrap.Modal.getInstance(modalElement);
    modal.hide();

    // Remove modal backdrop
    const backdrop = document.querySelector('.modal-backdrop');
    if (backdrop) {
      backdrop.remove();
    }

    // Remove modal-open class from body
    document.body.classList.remove('modal-open');

    await initializeConnection();
  }
  // to handle media changes
  // Function to toggle video
  async function toggleVideo() {
    try {
      if (userVideoStream.value) {
        const videoTracks = userVideoStream.value.getVideoTracks();
        videoTracks.forEach(track => {
          track.enabled = !track.enabled;
        });
        meetingFunctionStore.isVideoActivated = videoTracks[0]?.enabled || false;

        //modify the user's media setting
        let userIndex = users.value.findIndex((u) => u.peerId === peerId.value);
        users.value[userIndex].videoEnabled = meetingFunctionStore.isVideoActivated;

        // Emit to other users about video state change
        socket.emit("mediaStateChange", {
          roomId: roomId.value,
          peerId: peerId.value,
          type: 'video',
          enabled: meetingFunctionStore.isVideoActivated
        });
      }
    } catch (error) {
      console.error('Error toggling video:', error);
    }
  }

  // Function to toggle audio
  async function toggleAudio() {
    try {
      if (userVideoStream.value) {
        const audioTracks = userVideoStream.value.getAudioTracks();
        audioTracks.forEach(track => {
          track.enabled = !track.enabled;
        });
        meetingFunctionStore.isAudioActivated = audioTracks[0]?.enabled || false;

        //modify the user's media setting
        let userIndex = users.value.findIndex((u) => u.peerId === peerId.value);
        users.value[userIndex].audioEnabled = meetingFunctionStore.isAudioActivated;

        // Emit to other users about audio state change
        socket.emit("mediaStateChange", {
          roomId: roomId.value,
          peerId: peerId.value,
          type: 'audio',
          enabled: meetingFunctionStore.isAudioActivated
        });
      }
    } catch (error) {
      console.error('Error toggling audio:', error);
    }
  }

  function toggleSettings(){
    const modalElement = document.querySelector("#modal-settings");
    // Try to get existing modal instance first
    let modal = bootstrap.Modal.getInstance(modalElement);
    // If no instance exists, create a new one
    if (!modal) {
      modal = new bootstrap.Modal(modalElement);
    }
    modal.show();
  }
  function hideModal(){
    // Clean up modal and backdrop before navigation
    const modalElement = document.querySelector('#modal-join-meeting');
    const modalInstance = bootstrap.Modal.getInstance(modalElement);
    modalInstance?.hide();

    // Remove modal backdrop
    const backdrop = document.querySelector('.modal-backdrop');
    if (backdrop) {
      backdrop.remove();
    }

    // Remove modal-open class from body
    document.body.classList.remove('modal-open');
  }
  function  enterSendMessage(){
    sendMessage();
    message.value = "";
  }
  //function to get available devices
  async function getAvailableDevices() {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();

      audioInputs.value = devices.filter(device => device.kind === 'audioinput');
      videoInputs.value = devices.filter(device => device.kind === 'videoinput');

      // Set initial selections if available
      if (audioInputs.value.length > 0 && !selectedAudioInput.value) {
        selectedAudioInput.value = audioInputs.value[0].deviceId;
      }
      if (videoInputs.value.length > 0 && !selectedVideoInput.value) {
        selectedVideoInput.value = videoInputs.value[0].deviceId;
      }
    } catch (error) {
      console.error('Error getting devices:', error);
    }
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
    //modify the user's sign language toggle status
    let userIndex = users.value.findIndex((u) => u.peerId === peerId.value);
    if(userIndex !== -1)
      users.value[userIndex].signLanguageRecognitionIsToggled = meetingFunctionStore.isSignLanguageRecognitionActivated;

    socket.emit("toggleSignLanguageRecognition", {
      roomId: roomId.value,
      peerId: peerId.value,
      signLanguageRecognitionIsToggled: meetingFunctionStore.isSignLanguageRecognitionActivated,
    });
  });




  watch(
      () => meetingFunctionStore.isVideoActivated,
      (newVal, oldVal) => {
        // When media state for the video is changing
        toggleVideo();
      }
  );

  watch(
      () => meetingFunctionStore.isAudioActivated,
      (newVal, oldVal) => {
        // When media state for the audio is changing
        toggleAudio();
      }
  );
  watch(
      () => meetingFunctionStore.isSettingsToggled,
      (newVal, oldVal) => {
        // When the settings is toggled
        toggleSettings();
      }
  );

  // lifecycle hooks
  // Call this in onMounted
  onMounted(() => {
    getUsername();
    // Add event listener for device changes
    navigator.mediaDevices.addEventListener('devicechange', getAvailableDevices);

    //get the meeeting details especially the list of participants currently are inside the meeting
    getMeetingDetails();

    nextTick(() => {
      const tooltipTriggerList = document.querySelectorAll('[data-bs-toggle="tooltip"]')
      tooltipTriggerList.forEach(tooltipTriggerEl => {
        new bootstrap.Tooltip(tooltipTriggerEl,{
          trigger : 'hover'
        })
      })
    })

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

    //hide any modal backdrop
    hideModal()
  });
  </script>

  <template>
<!--    loader when waiting for the user to join the meeting-->
    <div id="page-loading" v-if="pageLoading">
      <div class="squid-game-loader">
        <svg viewBox="0 0 80 80">
          <circle r="32" cy="40" cx="40" id="test"></circle>
        </svg>
      </div>

      <div class="squid-game-loader triangle">
        <svg viewBox="0 0 86 80">
          <polygon points="43 8 79 72 7 72"></polygon>
        </svg>
      </div>

      <div class="squid-game-loader">
        <svg viewBox="0 0 80 80">
          <rect height="64" width="64" y="8" x="8"></rect>
        </svg>
      </div>
    </div>

    <section aria-label="Online Meeting Section" id="section-meeting">
      <section>
        <header class="my-4">
          <small class="d-block  mb-2 text-white-50">{{getDates()}}</small>
          <div class="d-flex justify-content-between">
            <h1 class="mb-2" v-if="meeting">{{meeting.meeting_name}}</h1>
            <button class="btn-custom-primary" id="btn-share" @click="copyShareLink()">Share <i class="bi bi-share-fill"></i></button>
          </div>
        </header>
        <section aria-label="Videos Output Section" id="section-videos">
          <div class="videos-container">
            <article v-for="(streamObj, index) in connectedStreams" :key="index" class="video-container">
              <div class="video-inner-container">
  <!--              initially the first video/ user's video will be pinned-->
<!--                <video class="video" :class="{'video-pinned': index === 0}"-->
<!--                       autoplay-->
<!--                       playsinline-->
<!--                       :muted="streamObj.isLocal"-->
<!--                       :srcObject="streamObj.stream"-->
<!--                >-->
<!--                </video>-->
                <video class="video"
                       autoplay
                       playsinline
                       :muted="streamObj.isLocal"
                       :srcObject="streamObj.stream"
                >
                </video>
    <!--            for current user-->
                <template v-if="username === streamObj.name">
                  <!--        button to toggle top predictions table-->
                  <button v-if="topFivePredictions.length > 0 && isRunning" :toggled="showTopFivePredictions" @click="showTopFivePredictions= !showTopFivePredictions" :id="'btn-toggle-predictions-' + streamObj.name" class="btn-toggle-predictions" data-bs-toggle="tooltip" data-bs-title="Show Recent Predictions">
                    <i class="bi bi-caret-down-fill"></i>
                  </button>

                  <Transition name="fade" mode="out-in" >
                    <table class="table-prediction" v-if="topFivePredictions.length > 0 && showTopFivePredictions && isRunning" >
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

                  <!--              if the prediction is coming from the current user own model instance-->
                  <div class="prediction-subtitle" v-if="hasNewPrediction  && isRunning">
                    {{ACTIONS[currentPrediction]}}
                  </div>
                </template>

                <!--            for other user-->
                <template v-else>
                  <!--        button to toggle top predictions table-->
                  <button v-if="users.find((u)=> u.name === streamObj.name).recentPredictions?.length > 0" :toggled="users.find((u)=> u.name === streamObj.name).showTopFivePredictions" @click="users.find((u)=> u.name === streamObj.name).showTopFivePredictions= !users.find((u)=> u.name === streamObj.name).showTopFivePredictions" :id="'btn-toggle-predictions-' + streamObj.name" class="btn-toggle-predictions"  data-bs-toggle="tooltip" data-bs-title="Show Recent Predictions">
                    <i class="bi bi-caret-down-fill"></i>
                  </button>

                  <Transition name="fade" mode="out-in" >
    <!--                <table class="table-prediction" v-if="topFivePredictions.length > 0 && showTopFivePredictions && isRunning">-->
                    <table class="table-prediction" v-if="users.find((u)=> u.name === streamObj.name).recentPredictions?.length > 0 && users.find((u)=> u.name === streamObj.name).showTopFivePredictions">
                      <thead>
                      <tr>
                        <th colspan="3">Recent Predictions</th>
                      </tr>
                      </thead>
                      <tbody>
                      <template v-for="(prediction, index) in users.find((u)=> u.name === streamObj.name).recentPredictions" :key="index">
                        <tr :class="{'prediction-current': index === users.find((u)=> u.name === streamObj.name).recentPredictions?.length - 1}">
                          <td>{{++index}}. {{ACTIONS[prediction]}}</td>
                        </tr>
                      </template>
                      </tbody>
                    </table>
                  </Transition>
                  <!--              if the prediction is coming from the other users' model instance-->
                  <div class="prediction-subtitle" v-if="users.find((u)=> u.name === streamObj.name).prediction !== null">
                    {{ACTIONS[users.find((u)=> u.name === streamObj.name).prediction]}}
                  </div>
                </template>

                <!-- user name              -->
                <div :class="{'participant-name-current': username === streamObj.name }" class="participant-name">
                  {{streamObj.name}}
                </div>

                <!--        loading animation while waiting for the model to load up-->
                <div class="loader" v-if="modelIsLoading && username === streamObj.name ">
                  <li class="ball"></li>
                  <li class="ball"></li>
                  <li class="ball"></li>
                </div>
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
              <article v-for="user of users" :key="user.peerId" class="participant mb-2">
                <div class="participant-profile-data">
                  <i class="bi bi-person-fill"></i>
                  <div>{{user.name}}
                      <span v-if="user.name === username">(You)</span>
                  </div>
                </div>
                <div class="participant-input">
                  <i :class="['bi',user.audioEnabled ? 'bi-mic-fill' : 'bi-mic-mute-fill']"></i>
                  <i :class="['bi',user.videoEnabled ? 'bi-camera-video-fill' : 'bi-camera-video-off-fill']"></i>
                  <img v-if="user.signLanguageRecognitionIsToggled" src="/images/sign_language_icon.png" alt="Sign Language Toggled On Icon" class="img-sign-language-toggle">
                  <img v-else src="/images/sign_language_icon_muted.png" alt="Sign Language Toggled Off Icon" class="img-sign-language-toggle">
                </div>
              </article>
            </div>
        </div>

        <div id="discussion-list">
<!--          <h2 class="mb-2 pb-1 border-bottom border-dark">Chat</h2>-->

          <ul class="nav nav-tabs mb-3">
            <li class="nav-item">
              <a class="nav-link" :class="{'active': currentActiveChat === 'discussion'}" aria-current="page" href="#"  @click.prevent="changeChatMode()">Participants Discussion</a>
            </li>
            <li class="nav-item">
              <a class="nav-link" :class="{'active': currentActiveChat === 'ai'}" href="#"  @click.prevent="changeChatMode()">AI Assistance</a>
            </li>
          </ul>

          <div id="discussion-wrapper" class="mb-2">
            <template v-if="currentActiveChat === 'discussion'">
<!--              show participants chat messages-->
              <article v-for="(message, index) of userMessages" :key="index" class="discussion-message mb-2" :class="{'discussion-message-current-user': message.sender === username, 'discussion-message-other-user': message.sender !== username}">
                <div>{{message.sender}}</div>
                <div class="discussion-message-content">
                  {{message.message}}
                </div>
              </article>
            </template>
            <template v-else-if="currentActiveChat === 'ai'">
  <!--            chatbot messages-->



              <article class="discussion-message mb-2 discussion-message-other-user">
                <div class="mb-1 "><img src="/images/female_robot.png" alt="Icon of Echo AI" class="img-echo"> Echo AI</div>
                <div class="discussion-message-content">
                  Hi there, how can I help you today?
                </div>
              </article>

              <article v-for="(message, index) of chatbotMessages" :key="index" class="discussion-message mb-2" :class="{'discussion-message-current-user': message.sender === username, 'discussion-message-other-user': message.sender !== username}">
                <div v-if="message.sender === 'AI'" class="mb-1">  <img src="/images/female_robot.png" alt="Icon of Echo AI" class="img-echo me-1">Echo AI</div>
                <div v-else class="mb-1">You</div>
                <div class="discussion-message-content">
                  {{message.message}}
                </div>
              </article>

              <article class="discussion-message mb-2 discussion-message-other-user" v-if="waitingResponse">
                <div class="mb-1 "><img src="/images/female_robot.png" alt="Icon of Echo AI" class="img-echo "> Echo AI</div>
                <div class="discussion-message-content">
                  <!--        loading animation while waiting for the model to load up-->
                  <div class="loader" id="chat-loader">
                    <li class="ball"></li>
                    <li class="ball"></li>
                    <li class="ball"></li>
                  </div>
                </div>
              </article>

            </template>

          </div>
          <div id="discussion-input" class="d-flex gap-2">
            <input
                type="text"
                name="message"
                id="message"
                placeholder="Enter your message..."
                class="form-control"
                v-model="message"
                @keydown="(e) => { if (e.key === 'Enter') { enterSendMessage()} }"
            />
            <button id="btn-send" @click="sendMessage()"></button>
          </div>
        </div>
      </section>
    </section>

  <!--  modal dialog-->
    <div class="modal fade" id="modal-username" data-bs-backdrop="static" tabindex="-1" aria-labelledby="Modal to input new username" >
      <div class="modal-dialog modal-dialog-centered">
        <div class="modal-content">
          <div class="modal-header">
            <h1 class="modal-title fs-5">New User Detail</h1>
<!--            <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>-->
          </div>
          <div class="modal-body">
            <form action="#" @submit.prevent="handleUsernameSubmit()" id="form-username">
              <div class="mb-3">
                <label for="username" class="form-label">Username: </label>
                <input type="text" name="username" id="username" class="form-control" v-model="username">
              </div>
            </form>
          </div>
          <div class="modal-footer">
            <button class="btn btn-primary mx-auto" id="btn-username" form="form-username">Join Now</button>
          </div>
        </div>
      </div>
    </div>

  <!--  modal for settings input-->
    <!--  modal for settings input-->
    <div class="modal fade" id="modal-settings" tabindex="-1" data-bs-backdrop="static"  aria-labelledby="Modal to change the user's inputs settings">
      <div class="modal-dialog modal-dialog-centered">
        <div class="modal-content">
          <div class="modal-header">
            <h1 class="modal-title fs-5">Settings</h1>
            <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
          </div>
          <div class="modal-body">
            <form action="#" @submit.prevent="handleInputsUpdate" id="form-input">
              <!-- Microphone Selection -->
              <div class="mb-3">
                <label for="audioInput" class="form-label">Microphone</label>
                <select id="audioInput" class="form-select" v-model="selectedAudioInput">
                  <option v-for="device in audioInputs"
                          :key="device.deviceId"
                          :value="device.deviceId">
                    {{ device.label || `Microphone ${audioInputs.indexOf(device) + 1}` }}
                  </option>
                </select>
              </div>

              <!-- Camera Selection -->
              <div class="mb-3">
                <label for="videoInput" class="form-label">Camera</label>
                <select id="videoInput" class="form-select" v-model="selectedVideoInput">
                  <option v-for="device in videoInputs"
                          :key="device.deviceId"
                          :value="device.deviceId">
                    {{ device.label || `Camera ${videoInputs.indexOf(device) + 1}` }}
                  </option>
                </select>
              </div>
            </form>
          </div>
          <div class="modal-footer">
            <button class="btn btn-primary mx-auto" id="btn-save" form="form-input" type="submit">Save</button>
          </div>
        </div>
      </div>
    </div>


    <!--  notification -->
    <Transition name="fade" mode="out-in" >
      <Notification v-if="notification" @closeNotification="notification = null">
        {{notification}}
      </Notification>
    </Transition>

  </template>

  <style scoped>
  .nav-tabs .nav-link:not(.active){
    color: white;
  }
  #page-loading{
    width: 100%;
    height: 100%;
    position: fixed;
    top: 0;
    left: 0;
    background-color: var(--primary-color);
    display: flex;
    justify-content: center;
    align-items: center;
    z-index: 888;
  }
  #section-meeting{
    display: flex;
    gap: 1.5rem;
    flex-wrap: wrap;

    section:first-child{
      flex: 0 1 65%;
    }
    #section-meeting-meta{
      //flex: 1 1 30%;
      width: 420px;
      max-width: 100%;
      position: fixed;
      right: 12px;

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
  .img-echo{
    width: 40px;
    height: 40px;
    object-fit: cover;
  }
  .videos-container{
    display: flex;
    justify-content: center;
    flex-wrap: wrap;
    gap: 1rem;
  }
  .video-inner-container{
    position: relative;
  }
  .video-container{
    flex: 0 1 49%;
    height: fit-content;
  }

  .video{
    border-radius: 0.5rem;
    border: 5px solid var(--secondary-color);
    width: 100%;
    object-fit: cover;

  }
  .video-pinned{
    //width: 100%;
    max-width: 600px;
    //width: max-content;
    object-fit: contain;
    //height: 500px;
  }
  /* Container with pinned video */
  .video-container:has(.video-pinned) {
    flex: 1 0 100%; /* Take full width */
    max-width: 100%; /* Allow container to stretch */
    display: flex;
    justify-content: center;
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
  .img-sign-language-toggle{
    width: 25px;
    height: 25px;
  }
  .loader{
    position: absolute;
    bottom: 10%;
    left: 50%;
    transform: translateX(-50%);
  }
  .btn-toggle-predictions{
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
  .btn-toggle-predictions:hover{
    background-color: var(--bs-primary);
  }
  .btn-toggle-predictions[toggled=true]{
    i{
      transform: rotate(180deg);
    }
  }
  .discussion-message-content:has(#chat-loader){
    height: 65px;
    width: 50%;
    position: relative;
  }
  #chat-loader{
    top:70%;
    width: 40px!important;
    .ball{
      background-color: var(--secondary-color);
    }
  }
  </style>
