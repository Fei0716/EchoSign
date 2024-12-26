const {PrismaClient} = require('@prisma/client');
const prisma = new PrismaClient();

async function index(req,res,next){
    try{
        const participants = await prisma.participants.findMany();
        res.status(200).json({
            "participants": participants,
            "message": "Successful query.",
        });
    }catch (e) {
        console.log(e);
    }
}

module.exports = {
    index,
};