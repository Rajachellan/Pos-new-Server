const userModel=require('../model/userSchema.js')

const bcrypt=require('bcrypt')


// User Register
async function userRegister(req,res) {
    const {name,email,role,password,branch}=req.body
    try{

        if(!name || !email || !role || !password || !branch){
            return res.status(401).json({
                success:false,
                message:"Please Provide Valid Inputs"
            })
        }

        // Email Validation
        const regax=/^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/

        if(!regax.test(email)){
            return res.status(401).json({
                success:false,
                message:"Please Provide Valid Email"
            })
        }

        const genSalt=await bcrypt.genSalt(10)

        const hashedPass=await bcrypt.hash(password,genSalt)

        const newUser=new userModel({name,email,role,password:hashedPass,branch,createdBy:req.user.userId})
        await newUser.save()
        res.status(201).json({
            success:true,
            message:"User Added Successfully"
        })

    }
    catch(err){
        res.status(500).json({
            success:false,
            message:`ErrorName:${err.name} ErrorMessage:${err.message}`
        })
        
    }
}

const generateToken=require('../utils/generateToken.js')


// User Login
async function userLogin(req,res) {
    const {email,password}=req.body
    try{

        // Basic Validation
        if(!email || !password){
            return res.status(400).json({
                success:false,
                message:"Please Provide Valid Inputs"
            })
        }

        // Email Validation
        const regax=/^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/
        if(!regax.test(email)){
            return res.status(400).json({
                success:false,
                message:"Please Provide Valid Email Address"
            })
        }

        // Find User
        const User=await userModel.findOne({email})

        if(!User){
            return res.status(400).json({
                success:false,
                message:"User Not Found"
            })
        }

        // Comparing Password
        const comparePassword= await bcrypt.compare(password,User.password)

        if(!comparePassword){
            return res.status(400).json({
                success:false,
                message:"Incorrect Password, Please Enter Valid Password"
            })
        }

        // Jwt Token Generation
      const token=   generateToken(User)

        // Success
        res.status(200).json({
            success:true,
            message:"Logined Successfully",
            token,
            userId:User._id,
            userName:User.name,
            userRole:User.role,
            // role:User.role,
            userEmail:User.email,
            userBranch:User.branchName || null
        })

        

    }
    catch(err){
        res.status(500).json({
            success:false,
            message:`ErrorName:${err.name} ErrorMessage:${err.message}`
        })
    }
}

// Getting Particular User Details
async function getUserProfile(req,res) {
    try{
        const getDetail=await userModel.findById(req.user.userId)

        if(!getDetail){
            res.status(401).json({
                success:false,
                message:"Data Not Found"
            })
        }

        res.status(200).json({
            success:true,
            message:"Data Fetched",
            data:getDetail
        })
    }
    catch(err){
        res.status(500).json({
            success:false,
            message:`ErrorName:${err.name} ErrorMessage:${err.message}`
        })
    }   
}


module.exports={userRegister,userLogin,getUserProfile}