require('dotenv').config();

const express=require('express')

const app=express()

const cors=require('cors')

const allowedOrigins = [
  'https://hotel.rankanalytics.in',
  'http://hotel.rankanalytics.in',
  'https://aphiotel.rankanalytics.in',
  'https://apihotel.rankanalytics.in',
  'http://localhost:3000',
  'http://localhost:8000',
  'http://localhost:8001',
  'http://localhost:8002'
];

if (process.env.CLIENT_URL) {
  const cleanUrl = process.env.CLIENT_URL.replace(/\/$/, '');
  if (!allowedOrigins.includes(cleanUrl)) {
    allowedOrigins.push(cleanUrl);
  }
}

const corsOptions = {
  origin: function (origin, callback) {
    // Allow non-browser clients (curl, mobile, server-side, docker healthchecks)
    if (!origin) return callback(null, true);

    if (allowedOrigins.indexOf(origin) !== -1) {
      return callback(null, true);
    }

    try {
      const parsed = new URL(origin);
      if (
        parsed.hostname === 'rankanalytics.in' ||
        parsed.hostname.endsWith('.rankanalytics.in') ||
        parsed.hostname.endsWith('.vercel.app') ||
        parsed.hostname === 'localhost' ||
        parsed.hostname === '127.0.0.1'
      ) {
        return callback(null, true);
      }
    } catch (e) {}

    // Allow and reflect back origin to prevent unexpected CORS blocks in staging/previews
    return callback(null, true);
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: [
    'Content-Type',
    'Authorization',
    'x-organization-id',
    'Accept',
    'Origin',
    'X-Requested-With'
  ],
  exposedHeaders: ['Authorization', 'x-organization-id']
};

app.use(cors(corsOptions));

app.use(express.json());

const portNumber=process.env.PORT || 8002

const dbConnect=require('./config/db')
dbConnect()

// Health check endpoint for Docker / Coolify
app.get('/health', (req, res) => {
    res.status(200).json({ status: 'ok', uptime: process.uptime(), timestamp: new Date().toISOString() });
});
app.get('/', (req, res) => {
    res.status(200).send('POS Server API is running');
});

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

// Cart Route
const cartRoute=require('./routes/cartRoutes')
app.use('/api',cartRoute)

// Super Admin Routes
const superAdminRoute=require('./routes/superAdminRoutes')
app.use('/api',superAdminRoute)

// Organization Routes
const organizationRoute=require('./routes/organizationRoutes')
app.use('/api',organizationRoute)

// Role & Permission Routes
const roleRoute=require('./routes/roleRoutes')
app.use('/api',roleRoute)

// Rooms & Booking Routes
const roomRoute=require('./routes/roomRoutes')
app.use('/api',roomRoute)


const http = require('http')
const server = http.createServer(app)
const { initSocket } = require('./utils/socket')
initSocket(server)

server.listen( portNumber, ()=>{
    console.log(`Server & Socket.IO Running Successfully On ${portNumber}`);
})