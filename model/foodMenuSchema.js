const mongoose=require('mongoose')

const schema=mongoose.Schema({
    category:{
        type:String,
        required:true,
        enum:["Biryani","Starters","Tandoori","Chinese","Fast-Food","Soups","Desserts","Drinks","Meals"]
    },
    name:{
    type:String,
    required:true,
    trim:true
    },
    price:{
        type:Number,
        required:true
    },

})

const model=mongoose.model("MenuLists",schema)

module.exports=model