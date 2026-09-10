const branchModel=require('../model/branchSchema')


async function addBranch(req,res) {
    const {branchName,branchCode,address}=req.body

    try{
        if(!branchName || !branchCode || !address){
            return res.status(400).json({
                success:false,
                message:"Please Provide Valid Inputs"
            })
        }

        const newBranch=new branchModel({branchName,branchCode,address,createdBy:req.user.userId})

        await newBranch.save()
        res.status(200).json({
            success:true,
            message:"New Branch Created Successfully"
        })

    }
    catch(err){
        res.status(500).json({
            success:false,
            message:`ErrorName:${err.name} ErrorMessage:${err.message}`
        })
    }
}

// Get Branches 
async function getBranch(req,res) {
    try{
        const getBranchDatas=await branchModel.find().populate("createdBy","_id name email")
        res.status(201).json({
            success:true,
            message:"Data Fetched",
            data:getBranchDatas
        })
    }
    catch(err){
        res.status(500).json({
            success:false,
            message:`ErrorName:${err.name} ErrorMessage:${err.message}`
        })
    }
}   


// Get Branch By Role
async function getBranchByRole(req,res) {
    try{
        const filterBranch=req.user.role === "Super-Admin" ? {} :
        { _id:req.user.branch}

        const data=await branchModel.find(filterBranch)
        res.status(201).json({
            success:true,
            message:"Data Fetched",
            data:data
        })
    }
    catch(err){
        res.status(500).json({
            success:false,
            message:`ErrorName:${err.name} ErrorMessage:${err.message}`
        })
    }
}


module.exports={addBranch,getBranch,getBranchByRole}