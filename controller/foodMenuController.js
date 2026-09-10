const menuModel=require('../model/foodMenuSchema')

async function addMenuFun(req,res) {

    const { category,name,price}=req.body

    try{

        if(!category || !name || !price){
            return res.status(401).json({
                success:true,
                message:"Please Provide Valid Inputs"
            })
        }

        const addMenu=new menuModel({
            category,name,price
        })
        await addMenu.save()
        res.status(201).json({
            success:true,
            message:"Menu Added Successfully"
        })
    }
    catch(err){
        res.status(500).json({
            success:false,
            message:`ErrorName:${err.name} ErrorMessage:${err.message}`
        })
    }
}

async function getMenuFun(req,res) {
    try{
        const getData=await menuModel.find()

        if(!getData){
            return res.status(401).json({
                success:false,
                message:"No Menus Founded"
            })
        }

        res.status(200).json({
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

module.exports={addMenuFun,getMenuFun}