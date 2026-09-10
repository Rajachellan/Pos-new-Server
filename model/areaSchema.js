const mongoose=require('mongoose')


const areaSchema=new mongoose.Schema({
    areaName:{
        type:String,
        required:true,
        trim:true
    },
    areaCode:{
        type:String,
        required:true,
        uppercase:true
    },
    branchName:{
        type:mongoose.Schema.Types.ObjectId,
        ref:"Branch",
        required:true
    },
    createdBy:{
        type:mongoose.Schema.Types.ObjectId,
        ref:"User",
        required:true
    }
},
    {
        timestamps:true
    }

)

const areaModel=mongoose.model("Areas",areaSchema)

module.exports=areaModel