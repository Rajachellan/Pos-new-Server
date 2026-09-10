const mongoose=require('mongoose')

const tableSchema=new mongoose.Schema({
    tableNumber:{
        type:String,
        trim:true,
        uppercase:true
    },

    areaName:{
        type:mongoose.Schema.Types.ObjectId,
        ref:"Areas",
        required:true,
        trim:true
    },
    availabilityStatus:{
        type:String,
        enum:["AVAILABLE","OCCUPIED"],
        required:true,
        default:"AVAILABLE"
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

const tableModel=mongoose.model("Tables",tableSchema)

module.exports=tableModel