const express=require('express')

const router=express.Router()
const { optionalAuth } = require('../middleware/authMiddleware')

const {
	addToCart,
	getCart,
	getKitchenOrders,
	getOrderHistory,
	takeOrder,
	payOrder,
	updateKitchenOrderStatus,
	removeFromCart,
	updateItemQuantity,
	toggleGst,
	getPosStats,
	releaseTable,
}=require('../controller/cartController')

router.get('/pos/stats', optionalAuth, getPosStats)
router.post('/add/cart', optionalAuth, addToCart)
router.post('/remove/cart', optionalAuth, removeFromCart)
router.post('/update/quantity', optionalAuth, updateItemQuantity)
router.post('/toggle/gst', optionalAuth, toggleGst)
router.get('/get/cart/:tableId', optionalAuth, getCart)
router.get('/kitchen/orders', optionalAuth, getKitchenOrders)
router.get('/orders/history', optionalAuth, getOrderHistory)
router.get('/cart/orders/history', optionalAuth, getOrderHistory)
router.post('/take/order', optionalAuth, takeOrder)
router.post('/orders/:orderId/confirm-kot', optionalAuth, takeOrder)
router.post('/pay/order', optionalAuth, payOrder)
router.patch('/orders/:id/status', optionalAuth, updateKitchenOrderStatus)
router.patch('/kitchen/orders/:id/status', optionalAuth, updateKitchenOrderStatus)
router.post('/tables/:tableId/release', optionalAuth, releaseTable)
router.post('/tables/release/:tableId', optionalAuth, releaseTable)

module.exports=router