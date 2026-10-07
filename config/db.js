require('dotenv').config()

const mongoose=require('mongoose')

const MONGO_URI = process.env.MONGO_URI || process.env.MONGODB_URI;

async function dbConnect() {
    try{
        if(!MONGO_URI){
            throw new Error(" MONGO_URI is missing")
        }

        await mongoose.connect(MONGO_URI)

        // Ensure all core schemas are registered
        require('../model/organizationSchema');
        require('../model/branchSchema');
        require('../model/permissionSchema');
        require('../model/roleSchema');
        require('../model/userSchema');
        require('../model/areaSchema');
        require('../model/tableModel');
        require('../model/foodMenuSchema');

        console.log("Database Connected Successfully and Schemas Registered");
        
    }
    catch(err){
        console.error("Database Connection Failed:",err.message)
        throw err
    }
}

module.exports=dbConnect