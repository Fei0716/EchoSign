const express = require('express');
const router = express.Router();

const ParticipantController = require('../controllers/ParticipantController');


router.get('/' ,  ParticipantController.index);

module.exports = router;