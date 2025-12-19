const nodemailer = require('nodemailer');
require('dotenv').config();

// Create transporter using free email service[citation:5]
const transporter = nodemailer.createTransport({
  service: 'gmail', // You can change this to outlook, yahoo, etc.
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASSWORD
  },
  tls: {
    rejectUnauthorized: false
  }
});

// Test email connection
transporter.verify((error, success) => {
  if (error) {
    console.log('❌ Email service error:', error);
  } else {
    console.log('✅ Email server is ready to send messages');
  }
});

// Email templates
const emailTemplates = {
  rideNotification: (data) => ({
    subject: `🚗 New Ride Available Near You - ${data.startLocation} to ${data.endLocation}`,
    text: `Hello ${data.driverName},

A new ride has been requested near your location:

👤 Passenger: ${data.userName}
📍 Pickup: ${data.startLocation}
🎯 Destination: ${data.endLocation}
📏 Distance: ${data.distance} miles
💰 Fare: $${data.fare}

Log in to SyncWay to claim this ride!

Best regards,
SyncWay Team`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #4F46E5;">🚗 New Ride Available Near You</h2>
        <div style="background: #f3f4f6; padding: 20px; border-radius: 8px; margin: 20px 0;">
          <p><strong>👤 Passenger:</strong> ${data.userName}</p>
          <p><strong>📍 Pickup:</strong> ${data.startLocation}</p>
          <p><strong>🎯 Destination:</strong> ${data.endLocation}</p>
          <p><strong>📏 Distance:</strong> ${data.distance} miles</p>
          <p><strong>💰 Fare:</strong> $${data.fare}</p>
        </div>
        <a href="http://localhost:3000/driver" style="background: #4F46E5; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">
          Claim This Ride
        </a>
        <p style="margin-top: 30px; color: #6b7280; font-size: 14px;">
          Best regards,<br>
          SyncWay Team
        </p>
      </div>
    `
  }),

  rideClaimed: (data) => ({
    subject: `✅ Your Ride Has Been Claimed!`,
    text: `Hello ${data.userName},

Great news! Your ride has been claimed by a driver.

👤 Driver: ${data.driverName}
📞 Phone: ${data.driverPhone}
📍 Pickup: ${data.startLocation}
🎯 Destination: ${data.endLocation}
💰 Fare: $${data.fare}

The driver will contact you shortly. Please be ready at the pickup location.

Best regards,
SyncWay Team`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #10B981;">✅ Your Ride Has Been Claimed!</h2>
        <div style="background: #f0fdf4; padding: 20px; border-radius: 8px; margin: 20px 0;">
          <p><strong>👤 Driver:</strong> ${data.driverName}</p>
          <p><strong>📞 Phone:</strong> ${data.driverPhone}</p>
          <p><strong>📍 Pickup:</strong> ${data.startLocation}</p>
          <p><strong>🎯 Destination:</strong> ${data.endLocation}</p>
          <p><strong>💰 Fare:</strong> $${data.fare}</p>
        </div>
        <p style="color: #059669; font-weight: bold;">
          The driver will contact you shortly. Please be ready at the pickup location.
        </p>
        <p style="margin-top: 30px; color: #6b7280; font-size: 14px;">
          Best regards,<br>
          SyncWay Team
        </p>
      </div>
    `
  }),

  welcomeEmail: (data) => ({
    subject: `🎉 Welcome to SyncWay Ride Sharing!`,
    text: `Welcome ${data.name},

Thank you for joining SyncWay! You're now part of our ride-sharing community.

Your account details:
👤 Name: ${data.name}
📞 Phone: ${data.phone}
📧 Email: ${data.email}
🚗 Account Type: ${data.userType}

Get started:
• Users: Request rides from your dashboard
• Drivers: Claim available rides or offer your own

Need help? Contact us at support@syncway.com

Happy riding!
SyncWay Team`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #4F46E5;">🎉 Welcome to SyncWay!</h2>
        <p>Thank you for joining our ride-sharing community.</p>
        
        <div style="background: #f3f4f6; padding: 20px; border-radius: 8px; margin: 20px 0;">
          <p><strong>👤 Name:</strong> ${data.name}</p>
          <p><strong>📞 Phone:</strong> ${data.phone}</p>
          <p><strong>📧 Email:</strong> ${data.email}</p>
          <p><strong>🚗 Account Type:</strong> ${data.userType}</p>
        </div>
        
        <div style="margin: 30px 0;">
          <h3 style="color: #4F46E5;">Get Started</h3>
          <p>🚶 <strong>Users:</strong> Request rides from your dashboard</p>
          <p>🚗 <strong>Drivers:</strong> Claim available rides or offer your own</p>
        </div>
        
        <a href="http://localhost:3000" style="background: #4F46E5; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">
          Go to Dashboard
        </a>
        
        <p style="margin-top: 30px; color: #6b7280; font-size: 14px;">
          Need help? Contact us at support@syncway.com<br><br>
          Happy riding!<br>
          SyncWay Team
        </p>
      </div>
    `
  })
};

// Send email function
const sendEmail = async ({ to, subject, text, html }) => {
  try {
    const mailOptions = {
      from: `"SyncWay" <${process.env.EMAIL_USER}>`,
      to,
      subject,
      text,
      html
    };

    const info = await transporter.sendMail(mailOptions);
    console.log('📧 Email sent:', info.messageId);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error('❌ Email sending failed:', error);
    throw error;
  }
};

// Specific email functions
const sendRideNotification = async (data) => {
  const template = emailTemplates.rideNotification(data);
  return sendEmail({
    to: data.to,
    subject: template.subject,
    text: template.text,
    html: template.html
  });
};

const sendRideClaimedNotification = async (data) => {
  const template = emailTemplates.rideClaimed(data);
  return sendEmail({
    to: data.to,
    subject: template.subject,
    text: template.text,
    html: template.html
  });
};

const sendWelcomeEmail = async (data) => {
  const template = emailTemplates.welcomeEmail(data);
  return sendEmail({
    to: data.to,
    subject: template.subject,
    text: template.text,
    html: template.html
  });
};

module.exports = {
  sendEmail,
  sendRideNotification,
  sendRideClaimedNotification,
  sendWelcomeEmail
};