require('dotenv').config()

const mongoose=require('mongoose')

const MONGO_URI = process.env.MONGO_URI || process.env.MONGODB_URI;

async function dbConnect() {
    try{
        if(!MONGO_URI){
            throw new Error(" MONGO_URI is missing")
        }

        await mongoose.connect(MONGO_URI)

        console.log("Database Connected Successfully");
        
    }
    catch(err){
        console.error("Database Connection Failed:",err.message)
        throw err
    }
}

module.exports=dbConnect