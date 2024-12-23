const socket = require("socket.io");
const axios = require("axios");
const FormData = require("form-data");
const multer = require("multer");
const tf = require("@tensorflow/tfjs");
const { Holistic } = require("@mediapipe/holistic");

// Configure Multer for handling video frame uploads
const upload = multer({ storage: multer.memoryStorage() });

// Room management
const rooms = {};

// TensorFlow Model
let model = null;
const ACTIONS = [
  "Hi", "Saya Sayang Awak", "Makan", "Selamat Malam", "Terima Kasih",
  "Apa Khabar", "Awak", "Saya", "Minum", "Salah", "Betul", "Minta Maaf",
  "Tolong", "Hijau", "Kita", "Mereka", "Ini", "Itu", "Apa", "Siapa",
];
const SEQUENCE_LENGTH = 30; // Predetermined sequence length for the model
const sequences = {}; // To store keypoints for each user

// Load TensorFlow Model
(async function loadModel() {
  try {
    model = await tf.loadLayersModel("./model/model.json");
    console.log("Model loaded successfully.");
  } catch (error) {
    console.error("Error loading TensorFlow model:", error);
  }
})();

module.exports = function (server) {
  const io = socket(server, {
    cors: {
      origin: ["*"],
    },
  });

  const videoMeet = io.of("/meet");
  const clientSequences = new Map(); // Store sequences for each client

  videoMeet.on("connection", (socket) => {
    console.log("Client connected");
    clientSequences.set(socket.id, []); // Initialize an empty buffer for the connected client

    socket.on("video-frame", async (base64Image) => {
      try {
        const sequenceBuffer = clientSequences.get(socket.id) || []; // Get current buffer
        const base64Data = base64Image.replace(/^data:image\/\w+;base64,/, "");
        const imageBuffer = Buffer.from(base64Data, "base64");

        // Append the new frame to the buffer
        sequenceBuffer.push(imageBuffer);

        // If the buffer exceeds SEQUENCE_LENGTH, remove the oldest frame
        if (sequenceBuffer.length > SEQUENCE_LENGTH) {
          sequenceBuffer.shift(); // Remove the oldest frame to maintain rolling buffer
        }

        // Update the buffer for the client
        clientSequences.set(socket.id, sequenceBuffer);

        // Send the latest sequence to the Flask server only when we have SEQUENCE_LENGTH frames
        if (sequenceBuffer.length === SEQUENCE_LENGTH) {
          const formData = new FormData();

          // Add the frames to the form data
          for (let i = 0; i < SEQUENCE_LENGTH; i++) {
            formData.append(`frame${i}`, sequenceBuffer[i], `frame${i}.jpg`);
          }

          // Make a POST request to Flask server for prediction
          const response = await axios.post("http://localhost:5000/predict", formData, {
            headers: formData.getHeaders(),
          });

          // Emit prediction results to all connected clients
          videoMeet.emit("prediction", response.data);
        }
      } catch (err) {
        console.error("Error during prediction", err.message);
      }
    });

  socket.on("video-keypoints", async (keypoints) => {
      console.log("Received keypoints:", keypoints);

      // Now, forward the keypoints to Flask predict endpoint
      try {
        const response = await axios.post("http://localhost:5000/predict", {
          keypoints: keypoints,  // Send keypoints as JSON payload
        });

        // Handle the response from Flask (prediction)
        console.log("Flask Prediction:", response.data);

        // Optionally, emit prediction to the client
        socket.emit("prediction", response.data);

      } catch (error) {
        console.error("Error sending keypoints to Flask:", error);
        socket.emit("prediction", { error: "Prediction failed" });
      }
    });
    socket.on("disconnect", () => {
      console.log("Client disconnected");
      clientSequences.delete(socket.id); // Clean up the buffer when client disconnects
    });
  });
};


/***backup 23/12/2024***/

const socket = require("socket.io");
const axios = require("axios");
const FormData = require("form-data");
const multer = require("multer");
const tf = require('@tensorflow/tfjs-node')
// Configure Multer for handling video frame uploads
const upload = multer({ storage: multer.memoryStorage() });

// Room management
const rooms = {};

// TensorFlow Model
// let model = null;
// const ACTIONS = [
//   "Hi", "Saya Sayang Awak", "Makan", "Selamat Malam", "Terima Kasih",
//   "Apa Khabar", "Awak", "Saya", "Minum", "Salah", "Betul", "Minta Maaf",
//   "Tolong", "Hijau", "Kita", "Mereka", "Ini", "Itu", "Apa", "Siapa",
// ];
// const SEQUENCE_LENGTH = 30; // Predetermined sequence length for the model
// const sequences = {}; // To store keypoints for each user
// // Preprocessing constants
// const POSE_LANDMARKS = 33;
// const POSE_VALUES_PER_LANDMARK = 4; // x, y, z, visibility
// const HAND_LANDMARKS = 21;
// const HAND_VALUES_PER_LANDMARK = 3; // x, y, z
// const TOTAL_POSE_VALUES = POSE_LANDMARKS * POSE_VALUES_PER_LANDMARK;
// const TOTAL_HAND_VALUES = HAND_LANDMARKS * HAND_VALUES_PER_LANDMARK;
// const TOTAL_FEATURE_VALUES = TOTAL_POSE_VALUES + 2 * TOTAL_HAND_VALUES;


// Load TensorFlow model asynchronously
// (async function loadModel() {
//   try {
//     model = await tf.loadGraphModel('http://localhost:3000/model/model.json', {
//       weightPathPrefix: 'http://localhost:3000/model/'
//     });
//     console.log('Model loaded successfully.');
//
//     // Detailed input information
//     console.log('Model Inputs:');
//     model.inputs.forEach((input, index) => {
//       console.log(`Input ${index}:`);
//       console.log('  Signature Key:', input.signatureKey);
//       console.log('  Shape:', input.shape);
//       console.log('  Dtype:', input.dtype);
//     });
//
//     // Detailed output information
//     console.log('\nModel Outputs:');
//     model.outputs.forEach((output, index) => {
//       console.log(`Output ${index}:`);
//       console.log('  Signature Key:', output.signatureKey);
//       console.log('  Shape:', output.shape);
//       console.log('  Dtype:', output.dtype);
//     });
//
//     console.log('Model Output Layer Names:', model.outputs.map(out => out.name));
//     // Verify model execution capability
//     if (model.execute) {
//       console.log('\nModel execution method available');
//     }
//     if (model.inputs && model.inputs.length > 0) {
//       console.log('Input Shape:', model.inputs[0].shape);
//     } else {
//       console.warn('Input shape could not be determined from the model.');
//     }
//   } catch (error) {
//     console.error('Error loading TensorFlow model:', error);
//   }
// })();

/**
 * Preprocesses the sequence of frames into a tensor suitable for model input.
 * @param {Array} sequence - Array of frames, each containing pose, leftHand, and rightHand keypoints.
 * @returns {tf.Tensor} A tensor shaped [1, SEQUENCE_LENGTH, TOTAL_FEATURE_VALUES].
 */
// function preprocessSequence(sequence) {
//   try {
//     // Validate and flatten the sequence
//     const flattenedSequence = sequence.map((frame, index) => {
//       if (
//           !frame.pose || frame.pose.length !== TOTAL_POSE_VALUES ||
//           !frame.leftHand || frame.leftHand.length !== TOTAL_HAND_VALUES ||
//           !frame.rightHand || frame.rightHand.length !== TOTAL_HAND_VALUES
//       ) {
//         throw new Error(`Invalid frame structure at index ${index}`);
//       }
//       return [...frame.pose, ...frame.leftHand, ...frame.rightHand];
//     });
//
//     const totalElements = flattenedSequence.flat().length;
//     const expectedElements = SEQUENCE_LENGTH * TOTAL_FEATURE_VALUES;
//
//     if (totalElements !== expectedElements) {
//       throw new Error(`Shape mismatch: Expected ${expectedElements}, got ${totalElements}`);
//     }
//
//     return tf.tensor(flattenedSequence).reshape([1, SEQUENCE_LENGTH, TOTAL_FEATURE_VALUES]);
//   } catch (error) {
//     console.error('Preprocessing Error:', error);
//     throw error;
//   }
// }
// function preprocessSequence(sequences) {
//   // Ensure exactly 30 sequences
//   const paddedFrames = sequences.slice(-30);
//   while (paddedFrames.length < 30) {
//     paddedFrames.unshift({
//       pose: Array(33).fill([0, 0, 0, 0]),
//       leftHand: Array(21).fill([0, 0, 0]),
//       rightHand: Array(21).fill([0, 0, 0])
//     });
//   }
//
//   // Flatten and normalize sequences
//   const processedFrames = paddedFrames.map(frame => {
//     const pose = frame.pose.slice(0, 33).flatMap(landmark => [
//       landmark[0] || 0,  // x
//       landmark[1] || 0,  // y
//       landmark[2] || 0,  // z
//       landmark[3] || 0   // visibility
//     ]).slice(0, 132);
//
//     const leftHand = frame.leftHand.slice(0, 21).flatMap(landmark => [
//       landmark[0] || 0,  // x
//       landmark[1] || 0,  // y
//       landmark[2] || 0   // z
//     ]).slice(0, 63);
//
//     const rightHand = frame.rightHand.slice(0, 21).flatMap(landmark => [
//       landmark[0] || 0,  // x
//       landmark[1] || 0,  // y
//       landmark[2] || 0   // z
//     ]).slice(0, 63);
//
//     return [...pose, ...leftHand, ...rightHand];
//   });
//
//   // Create tensor with correct shape: [30, 258]
//   return tf.tensor(processedFrames, [30, 258], 'float32');
// }

module.exports = function (server) {
  const io = socket(server, {
    cors: {
      origin: ["*"],
    },
  });

  const videoMeet = io.of("/meet");
  const clientSequences = new Map(); // Store sequences for each client

  // Socket.IO Connection
  videoMeet.on("connection", (socket) => {
    console.log("A user connected:", socket.id);

    // Joining a room
    socket.on("newUserJoining", (userId, roomId) => {
      socket.join(roomId);
      rooms[socket.id] = roomId;
      console.log(`User ${userId} joined room ${roomId}.`);
      socket.to(roomId).emit("newUserJoined", userId);
    });

    // Receiving video keypoints

    // socket.on("video-keypoints", async (keypoints) => {
    //   const roomId = rooms[socket.id];
    //   if (!roomId) return;
    //
    //   // Initialize sequence for this socket if not exists
    //   if (!sequences[socket.id]) {
    //     sequences[socket.id] = [];
    //   }
    //
    //   sequences[socket.id].push(keypoints);
    //
    //   // Trim sequence to exact length
    //   if (sequences[socket.id].length > SEQUENCE_LENGTH) {
    //     sequences[socket.id] = sequences[socket.id].slice(-SEQUENCE_LENGTH);
    //   }
    //
    //   console.log(`Current Sequence Length for ${socket.id}: ${sequences[socket.id].length}`);
    //
    //   // Prediction logic only when sequence is complete
    //   if (sequences[socket.id].length === SEQUENCE_LENGTH) {
    //     try {
    //       // Reshape sequence with correct dimensions
    //       const reshapedSequence = preprocessSequence(sequences[socket.id]).reshape([1, 30, 258]);
    //
    //       // Try different prediction methods
    //       let outputTensor;
    //       const inputOptions = [
    //         { "Identity": reshapedSequence },
    //         { "serving_default_input_1:0": reshapedSequence },
    //         reshapedSequence  // Direct tensor input
    //       ];
    //
    //       for (let option of inputOptions) {
    //         try {
    //           outputTensor = model.predict ?
    //               model.predict(option) :
    //               model.execute(option);
    //           break;
    //         } catch (err) {
    //           console.log('Prediction attempt failed:', err.message);
    //         }
    //       }
    //
    //
    //       const output = await outputTensor.array();
    //       const probabilities = tf.softmax(output[0]);
    //       const actionIndex = tf.argMax(probabilities).dataSync()[0];
    //       const confidence = tf.max(probabilities).dataSync()[0];
    //
    //       console.log(`Predicted Action: ${ACTIONS[actionIndex]}, Confidence: ${confidence}`)
    //       socket.to(roomId).emit("prediction", {
    //         action: ACTIONS[actionIndex],
    //         confidence: confidence,
    //       })
    //     } catch (error) {
    //       console.error('Comprehensive Prediction Error:', error);
    //     }
    //   }
    // });

    socket.on("disconnect", () => {
      const roomId = rooms[socket.id];
      if (roomId) {
        socket.leave(roomId);
        delete rooms[socket.id];
      }
      delete sequences[socket.id];
      console.log("A user disconnected:", socket.id);
    });
  });
};

