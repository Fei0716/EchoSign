const express = require('express');
const router = express.Router();

const MeetingController = require('../controllers/MeetingController');

router.get('/:meeting_id' ,  MeetingController.index);
router.post('/' ,  MeetingController.store);
router.post('/join' ,  MeetingController.join);
router.post('/leave' ,  MeetingController.leave);

module.exports = router;