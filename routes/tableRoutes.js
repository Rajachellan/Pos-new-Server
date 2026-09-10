const express=require('express')

const router=express.Router()

const {addTableFun,getAllTables,getTableByArea,getTableByBranch}=require('../controller/tableController')

const authMiddleware=require('../middleware/authMiddleware')

router.post('/add/tables', authMiddleware, addTableFun)
router.get('/get/all/tables', authMiddleware, getAllTables)
router.get('/get/tables/area/:id', authMiddleware, getTableByArea)
router.get('/get/tables/branch', authMiddleware, getTableByBranch)

module.exports=router