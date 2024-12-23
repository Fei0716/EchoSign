const tf = require('@tensorflow/tfjs-node');
const express = require("express");
const router = express.Router();

let model = null;
const ACTIONS = [
    "Hi", "Saya Sayang Awak", "Makan", "Selamat Malam", "Terima Kasih",
    "Apa Khabar", "Awak", "Saya", "Minum", "Salah", "Betul", "Minta Maaf",
    "Tolong", "Hijau", "Kita", "Mereka", "Ini", "Itu", "Apa", "Siapa",
];
const SEQUENCE_LENGTH = 30;
let frames = [];

// Preprocessing constants
const POSE_LANDMARKS = 33;
const POSE_VALUES_PER_LANDMARK = 4; // x, y, z, visibility
const HAND_LANDMARKS = 21;
const HAND_VALUES_PER_LANDMARK = 3; // x, y, z
const TOTAL_POSE_VALUES = POSE_LANDMARKS * POSE_VALUES_PER_LANDMARK;
const TOTAL_HAND_VALUES = HAND_LANDMARKS * HAND_VALUES_PER_LANDMARK;
const TOTAL_FEATURE_VALUES = TOTAL_POSE_VALUES + 2 * TOTAL_HAND_VALUES;

// Load TensorFlow model asynchronously
(async function loadModel() {
    try {
        model = await tf.loadGraphModel('http://localhost:3000/model/model.json', {
            weightPathPrefix: 'http://localhost:3000/model/'
        });
        console.log('Model loaded successfully.');

        // Detailed input information
        console.log('Model Inputs:');
        model.inputs.forEach((input, index) => {
            console.log(`Input ${index}:`);
            console.log('  Signature Key:', input.signatureKey);
            console.log('  Shape:', input.shape);
            console.log('  Dtype:', input.dtype);
        });

        // Detailed output information
        console.log('\nModel Outputs:');
        model.outputs.forEach((output, index) => {
            console.log(`Output ${index}:`);
            console.log('  Signature Key:', output.signatureKey);
            console.log('  Shape:', output.shape);
            console.log('  Dtype:', output.dtype);
        });

        console.log('Model Output Layer Names:', model.outputs.map(out => out.name));
        // Verify model execution capability
        if (model.execute) {
            console.log('\nModel execution method available');
        }
        if (model.inputs && model.inputs.length > 0) {
            console.log('Input Shape:', model.inputs[0].shape);
        } else {
            console.warn('Input shape could not be determined from the model.');
        }
    } catch (error) {
        console.error('Error loading TensorFlow model:', error);
    }
})();

/**
 * Preprocesses the sequence of frames into a tensor suitable for model input.
 * @param {Array} sequence - Array of frames, each containing pose, leftHand, and rightHand keypoints.
 * @returns {tf.Tensor} A tensor shaped [1, SEQUENCE_LENGTH, TOTAL_FEATURE_VALUES].
 */
function preprocessSequence(frames) {
    // Ensure exactly 30 frames
    const paddedFrames = frames.slice(-30);
    while (paddedFrames.length < 30) {
        paddedFrames.unshift({
            pose: Array(33).fill([0, 0, 0, 0]),
            leftHand: Array(21).fill([0, 0, 0]),
            rightHand: Array(21).fill([0, 0, 0])
        });
    }

    // Flatten and normalize frames
    const processedFrames = paddedFrames.map(frame => {
        const pose = frame.pose.slice(0, 33).flatMap(landmark => [
            landmark[0] || 0,  // x
            landmark[1] || 0,  // y
            landmark[2] || 0,  // z
            landmark[3] || 0   // visibility
        ]).slice(0, 132);

        const leftHand = frame.leftHand.slice(0, 21).flatMap(landmark => [
            landmark[0] || 0,  // x
            landmark[1] || 0,  // y
            landmark[2] || 0   // z
        ]).slice(0, 63);

        const rightHand = frame.rightHand.slice(0, 21).flatMap(landmark => [
            landmark[0] || 0,  // x
            landmark[1] || 0,  // y
            landmark[2] || 0   // z
        ]).slice(0, 63);

        return [...pose, ...leftHand, ...rightHand];
    });

    // Create tensor with correct shape: [30, 258]
    return tf.tensor(processedFrames, [30, 258], 'float32');
}

/**
 * POST endpoint to test the model with input frames.
 */
router.post('/test-model', async (req, res) => {
    if (!model) {
        return res.status(500).send({ error: 'Model not loaded yet.' });
    }

    const { frame } = req.body;

    if (!frame || !frame.pose || !frame.leftHand || !frame.rightHand) {
        return res.status(400).send({ error: 'Invalid frame format.' });
    }

    try {
        frames.push(frame);
        if (frames.length > SEQUENCE_LENGTH) {
            frames.shift();
        }

        if (frames.length === SEQUENCE_LENGTH) {
            const preprocessedSequence = preprocessSequence(frames);
            const reshapedSequence = preprocessedSequence.reshape([1, 30, 258]);

            // Predict and debug
            const outputTensor = await model.execute({ "Identity": preprocessedSequence });
            const output = await outputTensor.array();
            const truncatedOutput = output[0].slice(0, 20); // Use only the first 20 logits
            console.log('Truncated Output:', truncatedOutput);
            console.log('Model Output:', output);

            if (truncatedOutput.length === ACTIONS.length) {
                // Match directly to actions
                const probabilities = tf.softmax(truncatedOutput);
                const actionIndex = tf.argMax(probabilities).dataSync()[0];
                const confidence = tf.max(probabilities).dataSync()[0]; // Now this

                console.log(`Predicted Action: ${ACTIONS[actionIndex]}, Confidence: ${confidence}`);
                res.send({ action: ACTIONS[actionIndex], confidence });
            } else {
                throw new Error(`Model output length (${output[0].length}) does not match ACTIONS length (${ACTIONS.length}).`);
            }

            // Clean up tensors
            preprocessedSequence.dispose();
            reshapedSequence.dispose();
            outputTensor.dispose();
        } else {
            res.send({ status: 'Frame added', currentLength: frames.length });
        }
    } catch (error) {
        console.error('Prediction Error:', error);
        res.status(500).send({
            error: 'Error during prediction',
            details: error.message,
            stack: error.stack
        });
    }
});


module.exports = router;