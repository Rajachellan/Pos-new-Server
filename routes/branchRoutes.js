const express=require('express')

const router=express.Router()

const authMiddleware=require('../middleware/authMiddleware')

const {addBranch,getBranch,getBranchByRole}=require('../controller/branchController')

router.post('/add/branch',authMiddleware,addBranch)

router.get('/get/branch',authMiddleware, getBranch)

router.get('/get/branch/role', authMiddleware, getBranchByRole)

module.exports=router