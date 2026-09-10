require('dotenv').config()

const express=require('express')

const app=express()

const cors=require('cors')

app.use(express.json())
app.use(cors())

const portNumber=process.env.PORT || 8000

const dbConnect=require('./config/db')
dbConnect()

const userRoute=require('./routes/userRoutes')
app.use('/api',userRoute)

// Branch Route
const branchRoute=require('./routes/branchRoutes')
app.use('/api',branchRoute)

//Area Route
const areaRoute=require('./routes/areaRoutes')
app.use('/api',areaRoute)

// Tables Route
const tableRoute=require('./routes/tableRoutes')
app.use('/api',tableRoute)

// Menu Items Route
const menuRoute=require('./routes/menuRoutes')
app.use('/api',menuRoute)

app.listen( portNumber, ()=>{
    console.log(`Server Running Successfully On ${portNumber}`);
    
})