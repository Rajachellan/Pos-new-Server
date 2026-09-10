const express=require('express')


const router=express.Router()

const {addMenuFun,getMenuFun}=require('../controller/foodMenuController')

router.post('/add/menu',addMenuFun)
router.get('/get/menus',getMenuFun)

module.exports=router
