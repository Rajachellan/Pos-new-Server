const mongoose=require('mongoose')

const organizationSchema=new mongoose.Schema({
    name:{
        type:String,
        required:true,
        minlength:10,
        maxlength:100,
        trim:true,
    },
    legalName:{
        type:String,
        requiredtrue,
        maxLength:100
    },
    email:{
        type:String,
        required:true,
        lowercase:true,
        trim:true,
        unique:true,
        match:[/^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/,"Please Provide Valid Email Address"]
    },
    phno:{
        type:Number,
        minlength:10,
        trim:true
    },
    createdBy:{
        type:mongoose.Schema.Types.ObjectId,
        ref:"User"
    }
},
    {
        timestamps:true
    }
)
const model=mongoose.model("Organization",orgSchema)

module.exports=model