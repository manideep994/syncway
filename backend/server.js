const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const http = require('http');
const socketIo = require('socket.io');
const bcrypt = require('bcryptjs');
require('dotenv').config();

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: { origin: "*" }
});

// MongoDB Connection
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/syncway')
  .then(() => console.log('✅ MongoDB connected'))
  .catch(err => console.error('❌ MongoDB error:', err));

// User Schema
const userSchema = new mongoose.Schema({
  name: String,
  phone: { type: String, unique: true },
  email: String,
  passcode: String,
  userType: String,
  rating: { type: Number, default: 5 },
  totalRides: { type: Number, default: 0 },
  isOnline: { type: Boolean, default: false },
  emailNotifications: { type: Boolean, default: true },
  accountActive: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now }
});

const rideSchema = new mongoose.Schema({
  userId: String,
  userName: String,
  userPhone: String,
  userEmail: String,
  startLocation: String,
  endLocation: String,
  distance: Number,
  fare: Number,
  rideType: String,
  passengers: { type: Number, default: 1 }, // Number of passengers
  rideDate: String, // Date of ride
  rideTime: String, // Time of ride
  claimed: { type: Boolean, default: false },
  claimedBy: String,
  claimedDriverName: String,
  claimedDriverPhone: String,
  claimedDriverEmail: String,
  status: { 
    type: String, 
    enum: ['pending', 'claimed', 'cancelled'],
    default: 'pending'
  },
  createdAt: { type: Date, default: Date.now }
});

const User = mongoose.model('User', userSchema);
const Ride = mongoose.model('Ride', rideSchema);

// Middleware
app.use(cors());
app.use(express.json());

// Store online users
const onlineUsers = new Map();

// Socket.IO
io.on('connection', (socket) => {
  console.log('🔌 New client connected:', socket.id);
  
  socket.on('userConnected', (userId) => {
    onlineUsers.set(userId, socket.id);
    socket.userId = userId;
    
    User.findByIdAndUpdate(userId, { 
      isOnline: true
    }).exec();
    
    console.log(`User ${userId} connected. Online: ${onlineUsers.size}`);
    io.emit('onlineUsersUpdate', { onlineCount: onlineUsers.size });
  });
  
  socket.on('joinRide', (rideId) => {
    socket.join(`ride_${rideId}`);
  });
  
  socket.on('disconnect', () => {
    if (socket.userId) {
      onlineUsers.delete(socket.userId);
      
      User.findByIdAndUpdate(socket.userId, { 
        isOnline: false
      }).exec();
      
      io.emit('onlineUsersUpdate', { onlineCount: onlineUsers.size });
      console.log(`User ${socket.userId} disconnected. Online: ${onlineUsers.size}`);
    }
  });
});

// ========== EMAIL SERVICE ==========
const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASSWORD
  }
});

const sendEmail = async (to, subject, html, userId) => {
  try {
    // Check if user has email notifications enabled
    if (userId) {
      const user = await User.findById(userId);
      if (user && !user.emailNotifications) {
        console.log(`📧 Email skipped for ${to} (notifications muted)`);
        return { success: true, skipped: true };
      }
    }

    const mailOptions = {
      from: `"SyncWay" <${process.env.EMAIL_USER}>`,
      to,
      subject,
      html
    };

    const info = await transporter.sendMail(mailOptions);
    console.log('📧 Email sent:', info.messageId);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error('❌ Email error:', error);
    return { success: false, error };
  }
};

// Helper function to normalize phone number
const normalizePhone = (phone) => {
  if (!phone) return '';
  return phone.toString().replace(/\s+/g, '').toLowerCase().trim();
};

// ========== USER AUTHENTICATION ==========
app.post('/api/register', async (req, res) => {
  try {
    let { name, phone, email, passcode, userType } = req.body;
    
    // Normalize phone number
    phone = normalizePhone(phone);
    
    // Trim all fields
    name = name ? name.trim() : '';
    email = email ? email.trim() : '';
    passcode = passcode ? passcode.trim() : '';
    userType = userType ? userType.trim().toLowerCase() : '';
    
    if (!name || !phone || !passcode || !userType) {
      return res.status(400).json({ 
        success: false, 
        error: 'Name, phone, passcode and user type are required' 
      });
    }
    
    // Check if user exists
    const existingUser = await User.findOne({ phone });
    if (existingUser) {
      if (!existingUser.accountActive) {
        // Reactivate deleted account
        existingUser.name = name;
        existingUser.email = email;
        existingUser.passcode = await bcrypt.hash(passcode, 10);
        existingUser.userType = userType;
        existingUser.isOnline = true;
        existingUser.accountActive = true;
        await existingUser.save();
        
        return res.json({ 
          success: true, 
          user: {
            id: existingUser._id,
            name: existingUser.name,
            phone: existingUser.phone,
            email: existingUser.email,
            userType: existingUser.userType,
            rating: existingUser.rating,
            totalRides: existingUser.totalRides,
            emailNotifications: existingUser.emailNotifications
          }
        });
      }
      return res.status(400).json({ 
        success: false, 
        error: 'Phone number already registered' 
      });
    }
    
    // Hash passcode
    const hashedPasscode = await bcrypt.hash(passcode, 10);
    
    // Create user
    const user = new User({ 
      name, 
      phone, 
      email, 
      passcode: hashedPasscode,
      userType,
      isOnline: true
    });
    
    await user.save();
    
    // Send welcome email
    if (email) {
      await sendEmail(
        email,
        'Welcome to SyncWay!',
        `<h2>Welcome ${name}!</h2>
         <p>Your ${userType} account has been created successfully.</p>
         <p>Phone: ${phone}</p>
         <p>Login to start using SyncWay.</p>`,
        user._id
      );
    }
    
    res.json({ 
      success: true, 
      user: {
        id: user._id,
        name: user.name,
        phone: user.phone,
        email: user.email,
        userType: user.userType,
        rating: user.rating,
        totalRides: user.totalRides,
        emailNotifications: user.emailNotifications
      }
    });
  } catch (error) {
    console.error('❌ Registration error:', error);
    res.status(500).json({ success: false, error: 'Registration failed' });
  }
});

app.post('/api/login', async (req, res) => {
  try {
    let { phone, passcode } = req.body;
    
    // Normalize phone number
    phone = normalizePhone(phone);
    passcode = passcode ? passcode.trim() : '';
    
    if (!phone || !passcode) {
      return res.status(400).json({ 
        success: false, 
        error: 'Phone and passcode required' 
      });
    }
    
    // Find active user
    const user = await User.findOne({ 
      phone,
      accountActive: true 
    });
    
    if (!user) {
      return res.status(401).json({ 
        success: false, 
        error: 'User not found' 
      });
    }
    
    // Check passcode
    const isMatch = await bcrypt.compare(passcode, user.passcode);
    if (!isMatch) {
      return res.status(401).json({ 
        success: false, 
        error: 'Invalid passcode' 
      });
    }
    
    // Update online status
    user.isOnline = true;
    await user.save();
    
    res.json({ 
      success: true, 
      user: {
        id: user._id,
        name: user.name,
        phone: user.phone,
        email: user.email,
        userType: user.userType,
        rating: user.rating,
        totalRides: user.totalRides,
        emailNotifications: user.emailNotifications
      }
    });
  } catch (error) {
    console.error('❌ Login error:', error);
    res.status(500).json({ success: false, error: 'Login failed' });
  }
});

// Toggle email notifications
app.put('/api/user/notifications', async (req, res) => {
  try {
    const { userId, enable } = req.body;
    
    const user = await User.findByIdAndUpdate(
      userId,
      { emailNotifications: enable },
      { new: true }
    );
    
    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }
    
    res.json({ 
      success: true, 
      message: `Email notifications ${enable ? 'enabled' : 'disabled'}`,
      emailNotifications: user.emailNotifications
    });
  } catch (error) {
    console.error('❌ Notification toggle error:', error);
    res.status(500).json({ success: false, error: 'Failed to update notifications' });
  }
});

// Delete account (soft delete)
app.delete('/api/user/:id', async (req, res) => {
  try {
    const user = await User.findByIdAndUpdate(
      req.params.id,
      { 
        accountActive: false,
        isOnline: false,
        emailNotifications: false
      },
      { new: true }
    );
    
    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }
    
    // Remove user from online users
    onlineUsers.delete(req.params.id);
    io.emit('onlineUsersUpdate', { onlineCount: onlineUsers.size });
    
    res.json({ 
      success: true, 
      message: 'Account deleted successfully' 
    });
  } catch (error) {
    console.error('❌ Account deletion error:', error);
    res.status(500).json({ success: false, error: 'Failed to delete account' });
  }
});

// ========== RIDE MANAGEMENT ==========

// Create new ride with passenger count and time
app.post('/api/rides', async (req, res) => {
  try {
    const ride = new Ride(req.body);
    await ride.save();
    
    // Notify all connected drivers about new ride via Socket
    io.emit('newRideAvailable', ride);
    
    // Send email to all online drivers about new ride
    const onlineDrivers = await User.find({ 
      userType: 'driver', 
      isOnline: true,
      accountActive: true,
      email: { $ne: null }
    });
    
    for (const driver of onlineDrivers) {
      if (driver.email && driver.emailNotifications) {
        await sendEmail(
          driver.email,
          '🚗 New Ride Available!',
          `<h2>New Ride Available</h2>
           <p><strong>From:</strong> ${ride.startLocation}</p>
           <p><strong>To:</strong> ${ride.endLocation}</p>
           <p><strong>Passengers:</strong> ${ride.passengers}</p>
           <p><strong>Date & Time:</strong> ${ride.rideDate} at ${ride.rideTime}</p>
           <p><strong>Distance:</strong> ${ride.distance} miles</p>
           <p><strong>Fare:</strong> $${ride.fare}</p>
           <p><strong>Passenger:</strong> ${ride.userName}</p>
           <p>Login to SyncWay to claim this ride!</p>`,
          driver._id
        );
      }
    }
    
    res.json({ success: true, ride });
  } catch (error) {
    console.error('❌ Error creating ride:', error);
    res.status(500).json({ success: false, error: 'Failed to create ride' });
  }
});

// Get all available rides (not claimed)
app.get('/api/rides/available', async (req, res) => {
  try {
    const rides = await Ride.find({ 
      claimed: false,
      status: 'pending'
    }).sort({ createdAt: -1 });
    res.json({ success: true, rides });
  } catch (error) {
    console.error('❌ Error loading rides:', error);
    res.status(500).json({ success: false, error: 'Failed to load rides' });
  }
});

// Get rides for specific user
app.get('/api/rides/user/:userId', async (req, res) => {
  try {
    const rides = await Ride.find({ 
      userId: req.params.userId
    }).sort({ createdAt: -1 });
    res.json({ success: true, rides });
  } catch (error) {
    console.error('❌ Error getting user rides:', error);
    res.status(500).json({ success: false, error: 'Failed to load user rides' });
  }
});

// Get rides claimed by specific driver
app.get('/api/rides/driver/:driverId', async (req, res) => {
  try {
    const rides = await Ride.find({ 
      claimedBy: req.params.driverId
    }).sort({ createdAt: -1 });
    res.json({ success: true, rides });
  } catch (error) {
    console.error('❌ Error getting driver rides:', error);
    res.status(500).json({ success: false, error: 'Failed to load driver rides' });
  }
});

// Claim a ride (CHECK IF ALREADY CLAIMED)
app.put('/api/rides/:id/claim', async (req, res) => {
  try {
    const { driverId, driverName, driverPhone, driverEmail } = req.body;
    
    // Check if ride already claimed
    const existingRide = await Ride.findById(req.params.id);
    if (!existingRide) {
      return res.status(404).json({ success: false, error: 'Ride not found' });
    }
    
    if (existingRide.claimed) {
      return res.status(400).json({ 
        success: false, 
        error: 'Ride already claimed by another driver' 
      });
    }
    
    const ride = await Ride.findByIdAndUpdate(
      req.params.id,
      { 
        claimed: true,
        claimedBy: driverId,
        claimedDriverName: driverName,
        claimedDriverPhone: driverPhone,
        claimedDriverEmail: driverEmail,
        status: 'claimed'
      },
      { new: true }
    );
    
    // Notify user via Socket
    io.emit(`rideClaimed_${ride.userId}`, ride);
    
    // Send email to user
    if (ride.userEmail) {
      await sendEmail(
        ride.userEmail,
        '✅ Your Ride Has Been Claimed!',
        `<h2>Your Ride Has Been Claimed!</h2>
         <p><strong>Driver:</strong> ${driverName}</p>
         <p><strong>Phone:</strong> ${driverPhone}</p>
         <p><strong>Passengers:</strong> ${ride.passengers}</p>
         <p><strong>Date & Time:</strong> ${ride.rideDate} at ${ride.rideTime}</p>
         <p><strong>From:</strong> ${ride.startLocation}</p>
         <p><strong>To:</strong> ${ride.endLocation}</p>
         <p>Your driver will contact you shortly.</p>
         <p>You can call your driver at: <strong>${driverPhone}</strong></p>`,
        ride.userId
      );
    }
    
    // Send email to driver
    if (driverEmail) {
      await sendEmail(
        driverEmail,
        '🚗 Ride Successfully Claimed',
        `<h2>You've Claimed a Ride!</h2>
         <p><strong>Passenger:</strong> ${ride.userName}</p>
         <p><strong>Passenger Phone:</strong> ${ride.userPhone}</p>
         <p><strong>Passengers:</strong> ${ride.passengers}</p>
         <p><strong>Date & Time:</strong> ${ride.rideDate} at ${ride.rideTime}</p>
         <p><strong>From:</strong> ${ride.startLocation}</p>
         <p><strong>To:</strong> ${ride.endLocation}</p>
         <p><strong>Fare:</strong> $${ride.fare}</p>
         <p>Please contact the passenger at: <strong>${ride.userPhone}</strong></p>
         <p>Pickup Location: ${ride.startLocation}</p>`,
        driverId
      );
    }
    
    // Remove from available rides for all drivers
    io.emit('rideRemovedFromAvailable', ride._id);
    
    res.json({ success: true, ride });
  } catch (error) {
    console.error('❌ Error claiming ride:', error);
    res.status(500).json({ success: false, error: 'Failed to claim ride' });
  }
});

// Unclaim a ride
app.put('/api/rides/:id/unclaim', async (req, res) => {
  try {
    const { userId, userType } = req.body;
    const ride = await Ride.findById(req.params.id);
    
    if (!ride) {
      return res.status(404).json({ success: false, error: 'Ride not found' });
    }
    
    // Check if user is authorized to unclaim
    if (userType === 'user' && ride.userId !== userId) {
      return res.status(403).json({ 
        success: false, 
        error: 'Not authorized to unclaim this ride' 
      });
    }
    
    if (userType === 'driver' && ride.claimedBy !== userId) {
      return res.status(403).json({ 
        success: false, 
        error: 'Not authorized to unclaim this ride' 
      });
    }
    
    // Store driver info before clearing
    const driverInfo = {
      name: ride.claimedDriverName,
      phone: ride.claimedDriverPhone,
      email: ride.claimedDriverEmail
    };
    
    // Reset ride to available
    const updatedRide = await Ride.findByIdAndUpdate(
      req.params.id,
      { 
        claimed: false,
        claimedBy: null,
        claimedDriverName: null,
        claimedDriverPhone: null,
        claimedDriverEmail: null,
        status: 'pending'
      },
      { new: true }
    );
    
    // Send email to user about unclaim
    if (ride.userEmail) {
      await sendEmail(
        ride.userEmail,
        'ℹ️ Ride Unclaimed',
        `<h2>Ride Unclaimed</h2>
         <p>Your ride has been unclaimed.</p>
         <p><strong>Passengers:</strong> ${ride.passengers}</p>
         <p><strong>Date & Time:</strong> ${ride.rideDate} at ${ride.rideTime}</p>
         <p><strong>From:</strong> ${ride.startLocation}</p>
         <p><strong>To:</strong> ${ride.endLocation}</p>
         <p>Your ride is now available for other drivers to claim.</p>`,
        ride.userId
      );
    }
    
    // Send email to driver
    if (driverInfo.email) {
      await sendEmail(
        driverInfo.email,
        'ℹ️ You Unclaimed a Ride',
        `<h2>Ride Unclaimed</h2>
         <p>You have unclaimed the ride from ${ride.userName}.</p>
         <p>The ride is now available for other drivers.</p>`,
        ride.claimedBy
      );
    }
    
    // Notify all drivers that ride is available again
    io.emit('newRideAvailable', updatedRide);
    
    // Notify user
    io.emit(`rideUnclaimed_${ride.userId}`, updatedRide);
    
    res.json({ success: true, ride: updatedRide });
  } catch (error) {
    console.error('❌ Error unclaiming ride:', error);
    res.status(500).json({ success: false, error: 'Failed to unclaim ride' });
  }
});

// Cancel a ride
app.put('/api/rides/:id/cancel', async (req, res) => {
  try {
    const ride = await Ride.findByIdAndUpdate(
      req.params.id,
      { 
        status: 'cancelled',
        claimed: false,
        claimedBy: null,
        claimedDriverName: null,
        claimedDriverPhone: null
      },
      { new: true }
    );
    
    if (!ride) {
      return res.status(404).json({ success: false, error: 'Ride not found' });
    }
    
    // Send cancellation email to user
    if (ride.userEmail) {
      await sendEmail(
        ride.userEmail,
        '🚫 Ride Cancelled',
        `<h2>Your Ride Has Been Cancelled</h2>
         <p>Your ride from ${ride.startLocation} to ${ride.endLocation} has been cancelled.</p>
         <p><strong>Passengers:</strong> ${ride.passengers}</p>
         <p><strong>Date & Time:</strong> ${ride.rideDate} at ${ride.rideTime}</p>
         <p>You can request a new ride anytime.</p>`,
        ride.userId
      );
    }
    
    // Send cancellation email to driver if ride was claimed
    if (ride.claimedDriverEmail) {
      await sendEmail(
        ride.claimedDriverEmail,
        'ℹ️ Ride Cancelled by Passenger',
        `<h2>Ride Cancelled</h2>
         <p>The ride you claimed from ${ride.startLocation} to ${ride.endLocation} has been cancelled by the passenger.</p>
         <p>Check the app for other available rides.</p>`,
        ride.claimedBy
      );
    }
    
    // Remove from available rides
    io.emit('rideRemovedFromAvailable', ride._id);
    
    res.json({ success: true, ride });
  } catch (error) {
    console.error('❌ Error cancelling ride:', error);
    res.status(500).json({ success: false, error: 'Failed to cancel ride' });
  }
});

// ========== GOOGLE PLACES API ==========
app.get('/api/places/autocomplete', async (req, res) => {
  try {
    const { query } = req.query;
    
    if (!query || query.length < 3) {
      return res.json({ predictions: [] });
    }
    
    const apiKey = process.env.GOOGLE_API_KEY;
    if (!apiKey) {
      console.warn('Google API key not configured');
      return res.json({ 
        predictions: [
          { place_id: '1', description: '123 Main St, New York, NY' },
          { place_id: '2', description: '456 Broadway, New York, NY' }
        ] 
      });
    }
    
    const apiUrl = `https://maps.googleapis.com/maps/api/place/autocomplete/json?input=${encodeURIComponent(query)}&key=${apiKey}&types=address`;
    
    const response = await fetch(apiUrl);
    const data = await response.json();
    
    res.json({ predictions: data.predictions || [] });
  } catch (error) {
    console.error('❌ Places API error:', error);
    res.json({ predictions: [] });
  }
});

app.get('/api/places/details', async (req, res) => {
  try {
    const { placeId } = req.query;
    
    if (!placeId) {
      return res.status(400).json({ success: false, error: 'Place ID required' });
    }
    
    const apiKey = process.env.GOOGLE_API_KEY;
    const apiUrl = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${placeId}&key=${apiKey}&fields=name,formatted_address,geometry`;
    
    const response = await fetch(apiUrl);
    const data = await response.json();
    
    if (data.status === 'OK' && data.result) {
      const place = data.result;
      const result = {
        formatted_address: place.formatted_address,
        name: place.name,
        lat: place.geometry?.location?.lat || 0,
        lng: place.geometry?.location?.lng || 0
      };
      res.json({ success: true, result });
    } else {
      res.json({ success: false, error: 'Place not found' });
    }
  } catch (error) {
    console.error('❌ Place details error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch place details' });
  }
});

// ========== DISTANCE CALCULATION ==========
function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371; // Earth's radius in km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = 
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
    Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c * 0.621371; // Convert to miles
}

app.get('/api/distance/calculate', (req, res) => {
  try {
    const { lat1, lng1, lat2, lng2 } = req.query;
    
    if (!lat1 || !lng1 || !lat2 || !lng2) {
      return res.json({ 
        success: true,
        distance: '5.2',
        fare: '15.40'
      });
    }
    
    const distanceMiles = calculateDistance(
      parseFloat(lat1), parseFloat(lng1),
      parseFloat(lat2), parseFloat(lng2)
    );
    
    const fare = Math.max(distanceMiles * 1.5, 10).toFixed(2);
    
    res.json({ 
      success: true,
      distance: distanceMiles.toFixed(2),
      fare: parseFloat(fare)
    });
  } catch (error) {
    console.error('❌ Distance calculation error:', error);
    res.json({ 
      success: true,
      distance: '5.2',
      fare: '15.40'
    });
  }
});

// ========== HEALTH CHECK ==========
app.get('/api/health', (req, res) => {
  res.json({ 
    success: true,
    status: 'OK', 
    timestamp: new Date().toISOString(),
    onlineUsers: onlineUsers.size
  });
});

// Start server
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📧 Email: ${process.env.EMAIL_USER ? 'Configured' : 'Not configured'}`);
  console.log(`🗺️  Google Places: ${process.env.GOOGLE_API_KEY ? 'Configured' : 'Not configured'}`);
});