const {PrismaClient} = require('@prisma/client');
const prisma = new PrismaClient();

//create a meeting room and return a meeting room id back to the user
async function store(req,res,next){
    try{
        const {meeting_name, username} = req.body;
        if(!meeting_name || !username){
            res.status(400).send('Request error.');
            return;
        }

        const user = await prisma.participants.create({
            data:{
                name: username,
                created_at: new Date(),
            }
        });

        //create the meeting
        const meeting = await prisma.meetings.create({
            data:{
                name: meeting_name,
                creator_id: user.id,
                created_at: new Date(),
            }
        });

        // Convert BigInt to String before sending  or else there will be error
        const response = {
            meeting: {
                ...meeting, //Copy all existing properties
                id: meeting.id.toString(),
                creator_id: meeting.creator_id.toString()
            },
            user: {
                ...user,
                id: user.id.toString()
            }
        };
        res.status(201).json(response)
    }catch(e){
        console.log(e);
    }
}

//get list of participants inside a meeting
async function index(req,res,next){
    try{
        const meeting_id = req.params.meeting_id;

        //check validity of the meeting room
        if(!meeting_id){
            res.status(400).send('Request error.');
            return;
        }
        // Get meeting with related participants through the junction table
        const meeting = await prisma.meetings.findFirst({
            where: {
                id: BigInt(meeting_id),  // or parseInt(meeting_id)
            },
            include: {
                participants_meetings: {
                    where:{
                        deleted_at: null,
                    },
                    include: {
                        participants: true  // Include the actual participant data
                    }
                }
            }
        });

        if (!meeting) {
            res.status(404).send('Meeting room not found.');
            return;
        }

        // Extract participants from the relation and format response
        const participants = meeting.participants_meetings.map(pm => ({
            id: pm.participants.id.toString(),
            name: pm.participants.name,
        }));

        const response = {
            meeting_id: meeting.id.toString(),
            meeting_name: meeting.name,
            participants: participants
        };

        res.status(200).json(response);
    }catch (e) {
        console.log(e);
    }
}

//a user join a meeting room
async function join(req,res,next){
    try{
        const {meeting_id, username} = req.body;
        //check validity of the meeting room
        if(!meeting_id || !username){
            res.status(400).send('Request error.');
            return;
        }
        // Get meeting with related participants through the junction table
        const meeting = await prisma.meetings.findFirst({
            where: {
                id: BigInt(meeting_id)  // or parseInt(meeting_id)
            },
            include:{
                participants_meetings:{
                    include: {
                        participants: true,
                    }
                }
            }
        });

        if (!meeting) {
            res.status(404).send('Meeting room not found.');
            return;
        }
        // Check if user with same name already exists in this meeting
        const existingParticipant = meeting.participants_meetings.find(
            pm => pm.participants.name === username
        );
        if (existingParticipant) {

            // Fetch the record by participant_id and meeting_id
            const existingRecord = await prisma.participants_meetings.findFirst({
                where: {
                    participant_id: BigInt(existingParticipant.participants.id), // Ensure consistent data type
                    meeting_id: BigInt(meeting_id), // Ensure consistent data type
                },
            });

            // Update the record using the unique `id`
            await prisma.participants_meetings.update({
                where: {
                    id: existingRecord.id, // Unique ID from the record
                },
                data: {
                    deleted_at:  null,
                    updated_at: new Date(),
                },
            });

            // Return existing participant data
            return res.status(200).json({
                meeting: {
                    id: meeting.id.toString(),
                    name: meeting.name,
                    creator_id: meeting.creator_id.toString()
                },
                user: {
                    ...existingParticipant.participants,
                    id: existingParticipant.participants.id.toString()
                },
                message: 'User already in meeting'
            });
        }

        // If user doesn't exist, create new participant
        const user = await prisma.participants.create({
            data: {
                name: username,
                created_at: new Date(),
            }
        });

        await prisma.participants_meetings.create({
            data: {
                participant_id: user.id,
                meeting_id: meeting.id,
                created_at: new Date(),
            }
        });

        const response = {
            meeting: {
                id: meeting.id.toString(),
                name: meeting.name,
                creator_id: meeting.creator_id.toString()
            },
            user: {
                ...user,
                id: user.id.toString()
            },
            message: 'New user joined the meeting'
        };

        res.status(201).json(response);
    }catch (e) {
        console.log(e);
    }
}

//for when user leave the meeting
async function leave(req,res,next){
    try{
        const {meeting_id, user_id} = req.body;
        //check validity of the meeting room
        if(!meeting_id || !user_id){
            res.status(400).send('Request error.');
            return;
        }
        // Get meeting with related participants through the junction table
        const meeting = await prisma.meetings.findFirst({
            where: {
                id: BigInt(meeting_id)  // or parseInt(meeting_id)
            },
            include:{
                participants_meetings:{
                    include: {
                        participants: true,
                    }
                }
            }
        });

        if (!meeting) {
            res.status(404).send('Meeting room not found.');
            return;
        }

        // Fetch the record by participant_id and meeting_id
        const existingRecord = await prisma.participants_meetings.findFirst({
            where: {
                participant_id: BigInt(user_id), // Ensure consistent data type
                meeting_id: BigInt(meeting_id), // Ensure consistent data type
            },
        });
        console.log("Existing Record: ", existingRecord.id)
        if (existingRecord) {
            // Update the record using the unique `id`
            await prisma.participants_meetings.update({
                where: {
                    id: existingRecord.id, // Unique ID from the record
                },
                data: {
                    deleted_at:  new Date(),
                    updated_at: new Date(),
                },
            });

            // Return existing participant data
            return res.status(200).json({
                message: 'User has left',
            });
        }

        res.status(404).send('Meeting record for the user not found.');
    }catch (e) {
        console.log(e);
    }
}

module.exports = {
    index,
    store,
    join,
    leave,
};