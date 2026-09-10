
require('dotenv').config()

const jwt=require('jsonwebtoken')


function generateToken(User){
    return jwt.sign({
        userId:User._id,
        role:User.role,
        branch:User.branch
     },
        process.env.JWT_SECRET_KEY,
        {
            expiresIn:process.env.JWT_EXPIRES_IN || "1d"
        }
    )
    }

    module.exports=generateToken