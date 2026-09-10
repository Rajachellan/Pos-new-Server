const mongoose=require('mongoose')

const userSchema=new mongoose.Schema({
    name:{
        type:String,
        required:true,
        trim:true,
        minlength:2,
        maxlength:100
    },
    email:{
        type:String,
        required:true,
        lowercase:true,
        trim:true,
        unique:true,
        match:[/^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/,"Please Provide Valid Email Address"]
    },
    role:{
        type:String,
        enum:["Super-Admin","Admin","Staff"]
    },
    password:{
        type:String,
        required:true,
        trim:true
    },
    branch:{
        type:mongoose.Schema.Types.ObjectId,
        ref:"Branch",
        required:function (){
            return this.role !=="Super-Admin"
        }
    },
    createdBy:{
        type:mongoose.Schema.Types.ObjectId,
        ref:"User",
        required:function (){
            return this.role !=="Super-Admin"
        }
       },
    },
        {
        timestamps:true
        }
)

const userModel=mongoose.model("User",userSchema)

module.exports=userModel