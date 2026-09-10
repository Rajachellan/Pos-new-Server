const areaModel=require('../model/areaSchema')

async function addArea(req,res) {
     const {areaName,areaCode,branchName,createdBy}=req.body
    try{
        if(!areaName || !areaCode || !branchName){
            return res.status(401).json({
                success:false,
                message:"Please Provide Valid Inputs"
            })
        }
 const newArea=new           areaModel({areaName,areaCode,branchName,createdBy:req.user.userId})
        await newArea.save()
        res.status(201).json({
            success:true,
            message:"Area Added Successfully"
        })
    }
    catch(err){
        res.status(500).json({
            success:false,
            message:`ErrorName:${err.name} ErrorMessage:${err.message}`
        })
    }
}

//  Get Particular Areas By Branch
async function getAreaByBranch(req,res) {
    try{
        const data=await areaModel.find({ branchName: req.user.branch })
            .populate("branchName","branchName")

        res.status(200).json({
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

async function getAllArea(req,res) {
    try{
        const data=await areaModel.find().populate("branchName","branchName")
        res.status(200).json({
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

module.exports={addArea,getAreaByBranch,getAllArea}