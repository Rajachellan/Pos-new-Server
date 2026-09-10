const express=require('express')

const router=express.Router()

const {userRegister,userLogin,getUserProfile}=require('../controller/userController')

const authMiddleware=require('../middleware/authMiddleware')

router.post('/user/register', authMiddleware, userRegister)
router.post('/user/login',userLogin)
router.get('/user/get',authMiddleware,getUserProfile)

module.exports=router