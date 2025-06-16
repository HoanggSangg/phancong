// server.js
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
require('dotenv').config();

// Import routes
const wokerRoutes = require('./routes/wokerRoutes');
const supervisorRoutes = require('./routes/supervisorRoutes');
const carRoutes = require('./routes/carRoutes');
const app = express();
const PORT = process.env.PORT || 3000;

// CORS configuration
const corsOptions = {
  origin: ['http://localhost:3000', 'http://localhost:5173', 'https://fe-phancong.vercel.app'],
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'], // 👈 cho phép gửi token
  credentials: true,
};

app.use(cors(corsOptions));
app.use(express.json());

// Use routes
app.use('/api/worker', wokerRoutes);
app.use('/api/supervisors', supervisorRoutes);
app.use('/api/cars', carRoutes);
app.get("/", (req, res) => {
    res.status(200).send("🚀 Bá Thành backend is running.");
});
// MongoDB connection
// mongoose.connect('mongodb://localhost:27017/phancong', {
//   useNewUrlParser: true,
//   useUnifiedTopology: true,
// })
// .then(() => {
//   console.log('✅ Kết nối MongoDB thành công');
//   app.listen(PORT, () => {
//     console.log(`🚀 Server is running on http://localhost:${PORT}`);
//   });
// })
// .catch(err => {
//   console.error('❌ Kết nối MongoDB thất bại', err);
// });
    mongoose.connect(process.env.MONGODB_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true
}).then(() => {
    console.log('✅ Connected to MongoDB');

    // 👇 FIX: Dùng server.listen thay vì app.listen
    app.listen(PORT, () => {
        console.log(`🚀 Server is running on port ${PORT}`);
    });
}).catch(err => {
    console.error('❌ MongoDB connection error:', err);
});