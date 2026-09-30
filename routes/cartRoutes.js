const express=require('express')

const router=express.Router()

const {
	addToCart,
	getCart,
	getKitchenOrders,
	getOrderHistory,
	takeOrder,
	payOrder,
	updateKitchenOrderStatus,
}=require('../controller/cartController')

router.post('/add/cart',addToCart)
router.get('/get/cart/:tableId',getCart)
router.get('/kitchen/orders',getKitchenOrders)
router.get('/orders/history',getOrderHistory)
router.get('/cart/orders/history',getOrderHistory)
router.post('/take/order',takeOrder)
router.post('/pay/order',payOrder)
router.patch('/orders/:id/status',updateKitchenOrderStatus)


module.exports=router