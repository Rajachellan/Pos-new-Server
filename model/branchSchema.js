const mongoose=require('mongoose')

const branchSchema=new mongoose.Schema({
    branchName:{
        type:String,
        required:true,
        trim:true
    },
    branchCode:{
        type:String,
        required:true,
        uppercase:true,
    },
    address:{
        type:String,
    },
   isActive:{
    type:Boolean,
    default:true
   },
   createdBy:{
    type:mongoose.Schema.Types.ObjectId,
    ref:"User",
    required:true
   },
   },
   {
    timestamps:true
   }
)

const branchModel=mongoose.model("Branch",branchSchema)

module.exports=branchModel