const express=require('express')

const router=express.Router()

const {addArea,getAreaByBranch,getAllArea}=require('../controller/areaController')

const authMiddleware=require('../middleware/authMiddleware')

router.post('/add/area', authMiddleware, addArea)
router.get('/get/area/branch',authMiddleware,getAreaByBranch)
router.get('/get/area/all',authMiddleware,getAllArea)

module.exports=router