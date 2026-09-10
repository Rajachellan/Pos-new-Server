const tableModel=require('../model/tableModel')


async function addTableFun(req,res) {
    const {tableNumber,areaName}=req.body
    try{

        if(!tableNumber || !areaName){
            return res.status(401).json({
                success:false,
                message:"Please Provide Valid Inputs"
            })
        }

        const addData=new tableModel({tableNumber,areaName,createdBy:req.user.userId})

        await addData.save()
        res.status(201).json({
            success:true,
            message:"Table Added Successfully"
        })
    }
    catch(err){
        res.status(500).json({
            success:false,
            message:`ErrorName:${err.name} ErrorMessage:${err.message}`
        })
    }
}

async function getAllTables(req,res) {
    try{
        const getData=await tableModel.find().populate({
            path:"areaName",
            select:"areaName branchName",
            populate:{
                path:"branchName",
                select:"branchName"
            }
        })
        if(!getData){
            return res.status(401).json({
                success:false,
                message:"No Data Found"
            })
        }

        res.status(201).json({
            success:true,
            message:"Data Fetched",
            data:getData
        })
    }
    catch(err){
        res.status(500).json({
            success:false,
            message:`ErrorName:${err.name} ErrorMessage:${err.message}`
        })
    }
}

async function getTableByArea(req,res) {
    const {id}=req.params
    try{
const getData = await tableModel
  .find({ areaName: id })
  .populate({
    path: "areaName",
    select: "areaName branchName",
    populate: {
      path: "branchName",
      select: "branchName"
    }
  });
        if(!getData){
            return res.status(401).json({
                success:false,
                message:"No Data Found"
            })
        }

        res.status(201).json({
            success:true,
            message:"Tables Fetched Successfully",
            data:getData
        })
    }
    catch(err){
         res.status(500).json({
            success:false,
            message:`ErrorName:${err.name} ErrorMessage:${err.message}`
        })
    }
}

const areaModel=require('../model/areaSchema')

// Get Table By Branch
async function getTableByBranch(req, res) {
  try {
    const areas = await areaModel.find({ branchName: req.user.branch }).select("_id");

    if (!areas.length) {
      return res.status(404).json({
        success: false,
        message: "No areas found for this branch"
      });
    }

    const areaIds = areas.map((area) => area._id);

    const tables = await tableModel.find({
      areaName: { $in: areaIds }
    }).populate({
      path: "areaName",
      select: "areaName branchName",
      populate: {
        path: "branchName",
        select: "branchName"
      }
    });

    return res.status(200).json({
      success: true,
      message: "Tables fetched by branch",
      data: tables
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: err.message
    });
  }
}

module.exports={addTableFun,getAllTables,getTableByArea,getTableByBranch}