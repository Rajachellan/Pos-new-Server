require('dotenv').config()

const jwt=require('jsonwebtoken')

function authMiddleware(req,res,next){
    const authHeader=req.headers.authorization;

    if(!authHeader || !authHeader.startsWith("Bearer")){
        return res.status(400).json({
            success:false,
            message:"Access Token Is Required"
        })
    }

    const token=authHeader.split(" ")[1]

    try{
        const decodedUser=jwt.verify(token,process.env.JWT_SECRET_KEY)
        req.user=decodedUser
        next()
    }
    catch(err){
       return res.status(400).json({
            success:false,
            message:"Invalid or Expired Token"
        })
    }

}

module.exports=authMiddleware