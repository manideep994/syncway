import React, { useState, useEffect, useRef } from 'react';
import GoogleAd from "./GoogleAd";

import { 
  Car, User, MapPin, Phone, X, Search, 
  Navigation, Mail, MessageCircle, Star, DollarSign, 
  CheckCircle, AlertCircle, Users, LogOut, Eye, EyeOff, 
  PhoneCall, Calendar, Clock, UserPlus, Settings, FileText, Shield, AlertTriangle
} from 'lucide-react';
import io from 'socket.io-client';

const API_URL = 'http://52.91.43.199:5000/api';
const socket = io('http://52.91.43.199:5000');

function App() {
  const [user, setUser] = useState(null);
  const [activeTab, setActiveTab] = useState('request');
  const [notification, setNotification] = useState(null);
  
  // Login states
  const [loginData, setLoginData] = useState({
    name: '',
    phone: '',
    email: '',
    passcode: '',
    confirmPasscode: '',
    userType: 'user',
    showPasscode: false,
    isLogin: true,
    acceptedTerms: false
  });
  
  // Ride states
  const [startLocation, setStartLocation] = useState('');
  const [endLocation, setEndLocation] = useState('');
  const [distance, setDistance] = useState('');
  const [fare, setFare] = useState('');
  const [rideType, setRideType] = useState('standard');
  const [passengers, setPassengers] = useState(1);
  const [rideDate, setRideDate] = useState('');
  const [rideTime, setRideTime] = useState('');
  
  // Search states
  const [startSuggestions, setStartSuggestions] = useState([]);
  const [endSuggestions, setEndSuggestions] = useState([]);
  const [showStartSuggestions, setShowStartSuggestions] = useState(false);
  const [showEndSuggestions, setShowEndSuggestions] = useState(false);
  
  // Data states
  const [availableRides, setAvailableRides] = useState([]);
  const [myRides, setMyRides] = useState([]);
  const [driverRides, setDriverRides] = useState([]);
  const [onlineUsers, setOnlineUsers] = useState({ online: 0, total: 0 });
  
  // Settings
  const [showSettings, setShowSettings] = useState(false);
  const [emailNotifications, setEmailNotifications] = useState(true);
  const [showTerms, setShowTerms] = useState(false);
  
  const chatEndRef = useRef(null);
  
  // Helper function to format time to 12-hour format
  const formatTimeTo12Hour = (timeString) => {
    if (!timeString) return '';
    
    // Split the time string (format: "HH:MM")
    const [hours, minutes] = timeString.split(':');
    const hour = parseInt(hours, 10);
    const minute = minutes;
    
    // Convert to 12-hour format
    const period = hour >= 12 ? 'PM' : 'AM';
    const hour12 = hour % 12 || 12; // Convert 0 to 12 for 12 AM
    
    return `${hour12}:${minute} ${period}`;
  };
  
  // Helper function to format date
  const formatDate = (dateString) => {
    if (!dateString) return '';
    
    const date = new Date(dateString);
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    
    // Check if it's today, tomorrow, or another day
    if (date.toDateString() === today.toDateString()) {
      return 'Today';
    } else if (date.toDateString() === tomorrow.toDateString()) {
      return 'Tomorrow';
    } else {
      // Format as "Mon, Jan 15"
      return date.toLocaleDateString('en-US', { 
        weekday: 'short', 
        month: 'short', 
        day: 'numeric' 
      });
    }
  };
  
  // Set default date and time
  useEffect(() => {
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    
    const formatDateInput = (date) => {
      return date.toISOString().split('T')[0];
    };
    
    const formatTimeInput = (date) => {
      return date.toTimeString().slice(0, 5);
    };
    
    if (!rideDate) setRideDate(formatDateInput(tomorrow));
    if (!rideTime) setRideTime(formatTimeInput(new Date(today.getTime() + 3600000))); // 1 hour from now
  }, []);
  
  // Check login
  useEffect(() => {
    const storedUser = localStorage.getItem('user');
    if (storedUser) {
      const userData = JSON.parse(storedUser);
      setUser(userData);
      setEmailNotifications(userData.emailNotifications !== false);
      socket.emit('userConnected', userData.id);
      loadInitialData(userData);
    }
        

  }, []);
  
  // Socket event listeners
  useEffect(() => {
    if (!user) return;
    
    socket.on('newRideAvailable', (ride) => {
      if (user.userType === 'driver') {
        setAvailableRides(prev => [ride, ...prev]);
        showNotification(`🚗 New ride available: ${ride.startLocation} to ${ride.endLocation}`, 'info');
      }
    });
    
    socket.on(`rideClaimed_${user.id}`, (ride) => {
      setMyRides(prev => prev.map(r => 
        r._id === ride._id ? ride : r
      ));
      showNotification(`✅ Your ride has been claimed by ${ride.claimedDriverName}`, 'success');
    });
    
    socket.on(`rideUnclaimed_${user.id}`, (ride) => {
      setMyRides(prev => prev.map(r => 
        r._id === ride._id ? ride : r
      ));
      showNotification('ℹ️ Your ride has been unclaimed', 'info');
    });
    
    socket.on('rideRemovedFromAvailable', (rideId) => {
      setAvailableRides(prev => prev.filter(r => r._id !== rideId));
    });
    
    socket.on('onlineUsersUpdate', (data) => {
      setOnlineUsers(prev => ({ ...prev, online: data.onlineCount }));
    });
    
    fetchOnlineUsers();
    
    return () => {
      socket.off('newRideAvailable');
      socket.off(`rideClaimed_${user.id}`);
      socket.off(`rideUnclaimed_${user.id}`);
      socket.off('rideRemovedFromAvailable');
      socket.off('onlineUsersUpdate');
    };
  }, [user]);
  
  const fetchOnlineUsers = async () => {
    try {
      const response = await fetch(`${API_URL}/health`);
      const data = await response.json();
      if (data.success) {
        setOnlineUsers({ online: data.onlineUsers, total: data.onlineUsers });
      }
    } catch (error) {
      console.error('Error fetching online users:', error);
    }
  };
  
  const searchAddress = async (query, type = 'start') => {
    if (!query || query.trim().length < 2) {
      if (type === 'start') {
        setStartSuggestions([]);
        setShowStartSuggestions(false);
      } else {
        setEndSuggestions([]);
        setShowEndSuggestions(false);
      }
      return;
    }
    
    try {
      const response = await fetch(`${API_URL}/places/autocomplete?query=${encodeURIComponent(query)}`);
      const data = await response.json();
      
      if (type === 'start') {
        setStartSuggestions(data.predictions || []);
        setShowStartSuggestions(true);
      } else {
        setEndSuggestions(data.predictions || []);
        setShowEndSuggestions(true);
      }
    } catch (error) {
      console.error('Address search error:', error);
    }
  };
  
  const handleSelectAddress = async (prediction, type = 'start') => {
    try {
      const response = await fetch(`${API_URL}/places/details?placeId=${prediction.place_id}`);
      const data = await response.json();
      
      if (data.success) {
        const place = data.result;
        
        if (type === 'start') {
          setStartLocation(place.formatted_address);
          setShowStartSuggestions(false);
          
          if (endLocation) {
            calculateDistance();
          }
        } else {
          setEndLocation(place.formatted_address);
          setShowEndSuggestions(false);
          
          if (startLocation) {
            calculateDistance();
          }
        }
      }
    } catch (error) {
      console.error('Error getting place details:', error);
      if (type === 'start') {
        setStartLocation(prediction.description);
        setShowStartSuggestions(false);
      } else {
        setEndLocation(prediction.description);
        setShowEndSuggestions(false);
      }
    }
  };
  
 const calculateDistance = async () => {
  if (!startLocation || !endLocation) {
    // Clear distance and fare if locations are empty
    setDistance('');
    setFare('');
    return;
  }
  
  try {
    // First, get coordinates for both locations
    const getCoordinates = async (address) => {
      try {
        const response = await fetch(`${API_URL}/places/autocomplete?query=${encodeURIComponent(address)}`);
        const data = await response.json();
        
        if (data.predictions && data.predictions.length > 0) {
          const placeId = data.predictions[0].place_id;
          const detailsResponse = await fetch(`${API_URL}/places/details?placeId=${placeId}`);
          const detailsData = await detailsResponse.json();
          
          if (detailsData.success && detailsData.result) {
            return {
              lat: detailsData.result.lat,
              lng: detailsData.result.lng
            };
          }
        }
      } catch (error) {
        console.error('Error getting coordinates:', error);
      }
      return { lat: 0, lng: 0 };
    };
    
    // Get coordinates for both addresses
    const startCoords = await getCoordinates(startLocation);
    const endCoords = await getCoordinates(endLocation);
    
    // Call your backend distance calculation endpoint with coordinates
    const response = await fetch(
      `${API_URL}/distance/calculate?` +
      `lat1=${startCoords.lat}&lng1=${startCoords.lng}&` +
      `lat2=${endCoords.lat}&lng2=${endCoords.lng}`
    );
    
    const data = await response.json();
    
    if (data.success) {
      setDistance(data.distance);
      setFare(data.fare);
    } else {
      // Fallback to default calculation
      calculateDefaultFare();
    }
    
  } catch (error) {
    console.error('Distance calculation error:', error);
    // Use default calculation on error
    calculateDefaultFare();
  }
};

// Helper function for default fare calculation
const calculateDefaultFare = () => {
  // Simple mock calculation when API fails
  const baseRate = rideType === 'standard' ? 2.50 : 4.00; // per mile
  const baseFare = rideType === 'standard' ? 5.00 : 8.00; // base fee
  const passengerFee = passengers > 1 ? (passengers - 1) * 2.00 : 0;
  
  // Generate a realistic distance based on typical rides
  const mockDistance = (Math.random() * 18 + 2).toFixed(1); // 2-20 miles
  const calculatedFare = (baseFare + (parseFloat(mockDistance) * baseRate) + passengerFee).toFixed(2);
  
  setDistance(mockDistance);
  setFare(calculatedFare);
};
  
  const handleRegister = async () => {
    // Validation
    if (!loginData.name.trim()) {
      showNotification('Please enter your name', 'error');
      return;
    }
    
    if (!loginData.phone.trim()) {
      showNotification('Please enter your phone number', 'error');
      return;
    }
    
    if (!loginData.passcode) {
      showNotification('Please enter a passcode', 'error');
      return;
    }
    
    if (loginData.passcode.length < 4) {
      showNotification('Passcode must be at least 4 characters', 'error');
      return;
    }
    
    if (loginData.passcode !== loginData.confirmPasscode) {
      showNotification('Passcodes do not match', 'error');
      return;
    }
    
    if (!loginData.acceptedTerms) {
      showNotification('You must accept the Terms & Conditions to register', 'error');
      return;
    }
    
    try {
      const response = await fetch(`${API_URL}/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: loginData.name,
          phone: loginData.phone.replace(/\s+/g, '').toLowerCase(),
          email: loginData.email,
          passcode: loginData.passcode,
          userType: loginData.userType
        })
      });
      
      const data = await response.json();
      if (data.success) {
        showNotification('Account created successfully! Please login', 'success');
        setLoginData(prev => ({ ...prev, isLogin: true, passcode: '', confirmPasscode: '' }));
      } else {
        showNotification(data.error || 'Registration failed', 'error');
      }
    } catch (error) {
      showNotification('Network error. Please try again.', 'error');
    }
  };
  
  const handleLogin = async () => {
    if (!loginData.phone || !loginData.passcode) {
      showNotification('Phone and passcode required', 'error');
      return;
    }
    
    try {
      const response = await fetch(`${API_URL}/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone: loginData.phone.replace(/\s+/g, '').toLowerCase(),
          passcode: loginData.passcode
        })
      });
      
      const data = await response.json();
      if (data.success) {
        setUser(data.user);
        setEmailNotifications(data.user.emailNotifications !== false);
        localStorage.setItem('user', JSON.stringify(data.user));
        socket.emit('userConnected', data.user.id);
        loadInitialData(data.user);
        showNotification(`Welcome ${data.user.name}!`, 'success');
      } else {
        showNotification(data.error || 'Login failed', 'error');
      }
    } catch (error) {
      showNotification('Network error. Please try again.', 'error');
    }
  };
  
  const loadInitialData = async (currentUser) => {
    if (currentUser.userType === 'user') {
      loadMyRides(currentUser.id);
      loadAvailableRides();
    } else {
      loadDriverRides(currentUser.id);
      loadAvailableRides();
    }
  };
  
  const loadMyRides = async (userId) => {
    try {
      const response = await fetch(`${API_URL}/rides/user/${userId}`);
      const data = await response.json();
      if (data.success) setMyRides(data.rides || []);
    } catch (error) {
      console.error('Error loading my rides:', error);
    }
  };
  
  const loadDriverRides = async (driverId) => {
    try {
      const response = await fetch(`${API_URL}/rides/driver/${driverId}`);
      const data = await response.json();
      if (data.success) setDriverRides(data.rides || []);
    } catch (error) {
      console.error('Error loading driver rides:', error);
    }
  };
  
  const loadAvailableRides = async () => {
    try {
      const response = await fetch(`${API_URL}/rides/available`);
      const data = await response.json();
      if (data.success) setAvailableRides(data.rides || []);
    } catch (error) {
      console.error('Error loading available rides:', error);
    }
  };
  
  const handleRequestRide = async () => {
    if (!startLocation || !endLocation) {
      showNotification('Please enter both locations', 'error');
      return;
    }
    
    if (!rideDate || !rideTime) {
      showNotification('Please select date and time', 'error');
      return;
    }
    
    const rideData = {
      userId: user.id,
      userName: user.name,
      userPhone: user.phone,
      userEmail: user.email,
      startLocation,
      endLocation,
      distance: parseFloat(distance) || 5.2,
      fare: parseFloat(fare) || 15.40,
      rideType,
      passengers: parseInt(passengers) || 1,
      rideDate,
      rideTime,
      status: 'pending'
    };
    
    try {
      const response = await fetch(`${API_URL}/rides`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(rideData)
      });
      
      const data = await response.json();
      if (data.success) {
        setMyRides(prev => [data.ride, ...prev]);
        setStartLocation('');
        setEndLocation('');
        setDistance('');
        setFare('');
        setPassengers(1);
        showNotification('Ride requested successfully! Emails sent to drivers.', 'success');
        setActiveTab('myrides');
      }
    } catch (error) {
      showNotification('Failed to request ride', 'error');
    }
  };
  
  const handleClaimRide = async (ride) => {
    try {
      const response = await fetch(`${API_URL}/rides/${ride._id}/claim`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          driverId: user.id,
          driverName: user.name,
          driverPhone: user.phone,
          driverEmail: user.email
        })
      });
      
      const data = await response.json();
      if (data.success) {
        // Remove from available rides immediately
        setAvailableRides(prev => prev.filter(r => r._id !== ride._id));
        
        // Add to driver rides
        setDriverRides(prev => [data.ride, ...prev]);
        
        showNotification('Ride claimed successfully! Emails sent to user and driver.', 'success');
      } else if (data.error === 'Ride already claimed by another driver') {
        // Remove from available rides if already claimed
        setAvailableRides(prev => prev.filter(r => r._id !== ride._id));
        showNotification('Ride already claimed by another driver', 'error');
      } else {
        showNotification(data.error || 'Failed to claim ride', 'error');
      }
    } catch (error) {
      showNotification('Failed to claim ride', 'error');
    }
  };
  
  const handleUnclaimRide = async (ride) => {
    if (!window.confirm('Are you sure you want to unclaim this ride?')) return;
    
    try {
      const response = await fetch(`${API_URL}/rides/${ride._id}/unclaim`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: user.id,
          userType: user.userType
        })
      });
      
      const data = await response.json();
      if (data.success) {
        if (user.userType === 'user') {
          setMyRides(prev => prev.map(r => 
            r._id === ride._id ? data.ride : r
          ));
        } else {
          setDriverRides(prev => prev.filter(r => r._id !== ride._id));
        }
        showNotification('Ride unclaimed successfully. Emails sent.', 'success');
      }
    } catch (error) {
      showNotification('Failed to unclaim ride', 'error');
    }
  };
  
  const handleCancelRide = async (rideId) => {
    if (!window.confirm('Are you sure you want to cancel this ride?')) return;
    
    try {
      const response = await fetch(`${API_URL}/rides/${rideId}/cancel`, {
        method: 'PUT'
      });
      
      const data = await response.json();
      if (data.success) {
        setMyRides(prev => prev.filter(r => r._id !== rideId));
        showNotification('Ride cancelled. Emails sent.', 'info');
      }
    } catch (error) {
      showNotification('Failed to cancel ride', 'error');
    }
  };
  
  const handleCall = (phoneNumber) => {
    // Show disclaimer before calling
    if (window.confirm(
      '⚠️ IMPORTANT DISCLAIMER:\n\n' +
      'SyncWay is a FREE platform connecting users and drivers.\n' +
      'We do NOT verify user/driver identities or backgrounds.\n' +
      'Contact and meet at your own risk.\n' +
      'SyncWay is not responsible for any incidents.\n\n' +
      'Proceed with calling?'
    )) {
      window.location.href = `tel:${phoneNumber}`;
    }
  };
  
  const toggleEmailNotifications = async () => {
    try {
      const response = await fetch(`${API_URL}/user/notifications`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: user.id,
          enable: !emailNotifications
        })
      });
      
      const data = await response.json();
      if (data.success) {
        setEmailNotifications(!emailNotifications);
        showNotification(`Email notifications ${!emailNotifications ? 'enabled' : 'disabled'}`, 'success');
        
        // Update user in localStorage
        const updatedUser = { ...user, emailNotifications: !emailNotifications };
        setUser(updatedUser);
        localStorage.setItem('user', JSON.stringify(updatedUser));
      }
    } catch (error) {
      showNotification('Failed to update notifications', 'error');
    }
  };
  
  const handleDeleteAccount = async () => {
    if (!window.confirm('Are you sure you want to delete your account? This action cannot be undone.')) return;
    
    try {
      const response = await fetch(`${API_URL}/user/${user.id}`, {
        method: 'DELETE'
      });
      
      const data = await response.json();
      if (data.success) {
        handleLogout();
        showNotification('Account deleted successfully', 'info');
      }
    } catch (error) {
      showNotification('Failed to delete account', 'error');
    }
  };
  
  const handleLogout = () => {
    localStorage.removeItem('user');
    setUser(null);
    socket.disconnect();
    showNotification('Logged out successfully', 'info');
  };
  
  const showNotification = (message, type = 'info') => {
    setNotification({ message, type });
    setTimeout(() => setNotification(null), 3000);
  };
  
  // Terms and Conditions Content
  const TermsContent = () => (
    <div style={styles.termsContent}>
      <h2 style={styles.termsTitle}>Terms & Conditions</h2>
      
      <div style={styles.section}>
        <h3 style={styles.sectionTitle}>1. Service Description</h3>
        <p style={styles.termsText}>
          SyncWay is a FREE ride-sharing platform that connects users with available drivers. 
          We do NOT provide transportation services. We are a technology platform facilitating connections.
        </p>
      </div>
      
      <div style={styles.section}>
        <h3 style={styles.sectionTitle}>2. No Background Checks</h3>
        <p style={styles.termsText}>
          ⚠️ IMPORTANT: SyncWay does NOT conduct background checks, identity verification, 
          or screening of any users or drivers. You are solely responsible for your safety.
        </p>
      </div>
      
      <div style={styles.section}>
        <h3 style={styles.sectionTitle}>3. User Responsibility</h3>
        <p style={styles.termsText}>
          Users and drivers connect at their own risk. SyncWay is not responsible for:
          - Personal safety incidents
          - Property damage or loss
          - Personal injuries
          - Any criminal activities
          - Financial disputes between parties
        </p>
      </div>
      
      <div style={styles.section}>
        <h3 style={styles.sectionTitle}>4. No Insurance Coverage</h3>
        <p style={styles.termsText}>
          SyncWay does NOT provide insurance coverage for rides. Drivers are responsible 
          for maintaining their own vehicle insurance. Riders travel at their own risk.
        </p>
      </div>
      
      <div style={styles.section}>
        <h3 style={styles.sectionTitle}>5. Financial Arrangements</h3>
        <p style={styles.termsText}>
          All fare negotiations and payments occur directly between users and drivers. 
          SyncWay is NOT involved in financial transactions and does NOT guarantee payment.
        </p>
      </div>
      
      <div style={styles.section}>
        <h3 style={styles.sectionTitle}>6. Legal Compliance</h3>
        <p style={styles.termsText}>
          Users and drivers must comply with all local, state, and federal laws including:
          - Transportation regulations
          - Insurance requirements
          - Tax obligations
          - Safety standards
        </p>
      </div>
      
      <div style={styles.section}>
        <h3 style={styles.sectionTitle}>7. Privacy</h3>
        <p style={styles.termsText}>
          Phone numbers are shared between matched users and drivers. 
          SyncWay is not responsible for misuse of contact information.
        </p>
      </div>
      
      <div style={styles.section}>
        <h3 style={styles.sectionTitle}>8. Limitation of Liability</h3>
        <p style={styles.termsText}>
          SyncWay, its owners, and operators are not liable for any damages, injuries, 
          losses, or claims arising from use of this platform.
        </p>
      </div>
      
      <div style={styles.section}>
        <h3 style={styles.sectionTitle}>9. Revenue Model</h3>
        <p style={styles.termsText}>
          SyncWay is currently FREE. Future revenue may come from:
          - Voluntary donations
          - Optional premium features
          - Non-intrusive advertisements
          All revenue goes toward platform maintenance and improvement.
        </p>
      </div>
      
      <div style={styles.section}>
        <h3 style={styles.sectionTitle}>10. Acceptance</h3>
        <p style={styles.termsText}>
          By using SyncWay, you acknowledge and agree to these terms. 
          You understand the risks involved in ride-sharing with unverified individuals.
        </p>
      </div>
      
      <div style={styles.warningBox}>
        <AlertTriangle size={24} style={{ color: '#dc2626' }} />
        <p style={styles.warningText}>
          <strong>WARNING:</strong> Ride-sharing involves risks. Meet in public places, 
          verify identities independently, and use your best judgment. If you feel unsafe, 
          DO NOT proceed with the ride.
        </p>
      </div>
    </div>
  );
  
  // Terms and Conditions Modal
  if (showTerms) {
    return (
      <div style={styles.termsModal}>
        <div style={styles.termsContainer}>
          <div style={styles.termsHeader}>
            <div style={styles.termsHeaderLeft}>
              <Shield size={24} />
              <h2 style={styles.termsModalTitle}>Terms & Conditions</h2>

            </div>
            <button onClick={() => setShowTerms(false)} style={styles.closeButton}>
              <X size={24} />
            </button>
          </div>
          
          <div style={styles.termsScroll}>
            <TermsContent />
          </div>
          
          <div style={styles.termsFooter}>
            <button onClick={() => setShowTerms(false)} style={styles.agreeButton}>
              I Understand
            </button>
          </div>
        </div>
      </div>
    );
  }
  
  // Login/Register Screen
  if (!user) {
    return (
      <div style={styles.loginContainer}>
        <div style={styles.loginCard}>
          <div style={styles.loginHeader}>
            <div style={styles.loginLogo}>
              <Car size={40} />
            </div>
            <h1 style={styles.loginTitle}>SyncWay</h1>
            <p style={styles.loginSubtitle}>Secure Ride Sharing</p>
          </div>
          
          <div style={styles.disclaimerBanner}>
            <AlertTriangle size={16} />
            <span>FREE service - No background checks - Use at your own risk</span>
          </div>
          
          <div style={styles.toggleButtons}>
            <button
              style={{...styles.toggleButton, ...(loginData.isLogin ? styles.activeToggle : {})}}
              onClick={() => setLoginData({...loginData, isLogin: true})}
            >
              Login
            </button>
            <button
              style={{...styles.toggleButton, ...(!loginData.isLogin ? styles.activeToggle : {})}}
              onClick={() => setLoginData({...loginData, isLogin: false})}
            >
              Register
            </button>
          </div>
          
          <div style={styles.loginForm}>
            <div style={styles.inputGroup}>
              <User size={20} style={styles.inputIcon} />
              <input
                type="text"
                placeholder="Your Name"
                style={styles.loginInput}
                value={loginData.name}
                onChange={(e) => setLoginData({...loginData, name: e.target.value.trim()})}
              />
            </div>
            
            <div style={styles.inputGroup}>
              <Phone size={20} style={styles.inputIcon} />
              <input
                type="tel"
                placeholder="Phone Number (no spaces)"
                style={styles.loginInput}
                value={loginData.phone}
                onChange={(e) => setLoginData({...loginData, phone: e.target.value})}
              />
            </div>
            
            <div style={styles.inputGroup}>
              <Mail size={20} style={styles.inputIcon} />
              <input
                type="email"
                placeholder="Email (for notifications)"
                style={styles.loginInput}
                value={loginData.email}
                onChange={(e) => setLoginData({...loginData, email: e.target.value.trim()})}
              />
            </div>
            
            <div style={styles.inputGroup}>
              {loginData.showPasscode ? <EyeOff size={20} style={styles.inputIcon} /> : <Eye size={20} style={styles.inputIcon} />}
              <input
                type={loginData.showPasscode ? 'text' : 'password'}
                placeholder="Passcode (min 4 characters)"
                style={styles.loginInput}
                value={loginData.passcode}
                onChange={(e) => setLoginData({...loginData, passcode: e.target.value.trim()})}
              />
              <button
                type="button"
                onClick={() => setLoginData({...loginData, showPasscode: !loginData.showPasscode})}
                style={styles.showPasscodeButton}
              >
                {loginData.showPasscode ? 'Hide' : 'Show'}
              </button>
            </div>
            
            {!loginData.isLogin && (
              <div style={styles.inputGroup}>
                <Eye size={20} style={styles.inputIcon} />
                <input
                  type="password"
                  placeholder="Confirm Passcode"
                  style={styles.loginInput}
                  value={loginData.confirmPasscode}
                  onChange={(e) => setLoginData({...loginData, confirmPasscode: e.target.value.trim()})}
                />
              </div>
            )}
            
            {!loginData.isLogin && (
              <div style={styles.userTypeSelector}>
                <button
                  style={{...styles.userTypeBtn, ...(loginData.userType === 'user' ? styles.activeUserType : {})}}
                  onClick={() => setLoginData({...loginData, userType: 'user'})}
                >
                  <User size={18} /> User
                </button>
                <button
                  style={{...styles.userTypeBtn, ...(loginData.userType === 'driver' ? styles.activeUserType : {})}}
                  onClick={() => setLoginData({...loginData, userType: 'driver'})}
                >
                  <Car size={18} /> Driver
                </button>
              </div>
            )}
            
            {!loginData.isLogin && (
              <div style={styles.termsCheckbox}>
                <input
                  type="checkbox"
                  id="acceptTerms"
                  checked={loginData.acceptedTerms}
                  onChange={(e) => setLoginData({...loginData, acceptedTerms: e.target.checked})}
                  style={styles.checkboxInput}
                />
                <label htmlFor="acceptTerms" style={styles.termsLabel}>
                  I accept the <button type="button" onClick={() => setShowTerms(true)} style={styles.termsLink}>Terms & Conditions</button>
                </label>
              </div>
            )}
            
            <button
              onClick={loginData.isLogin ? handleLogin : handleRegister}
              style={styles.loginButton}
              disabled={loginData.isLogin ? (!loginData.phone || !loginData.passcode) : (!loginData.name || !loginData.phone || !loginData.passcode || !loginData.confirmPasscode || !loginData.acceptedTerms)}
            >
              {loginData.isLogin ? 'Login' : 'Register'}
            </button>
            
            <div style={styles.legalNotice}>
              <small>
                By using SyncWay, you acknowledge this is a FREE platform with no background checks. 
                You assume all risks associated with ride-sharing.
              </small>
            </div>
          </div>
        </div>
        
        {notification && (
          <div style={{...styles.notification, ...styles[notification.type]}}>
            {notification.message}
          </div>
        )}
      </div>
    );
  }
  
  // Settings Modal
  if (showSettings) {
    return (
      <div style={styles.settingsModal}>
        <div style={styles.settingsContent}>
          <div style={styles.settingsHeader}>
            <h2 style={styles.settingsTitle}>Account Settings</h2>
            <button onClick={() => setShowSettings(false)} style={styles.closeButton}>
              <X size={24} />
            </button>
          </div>
                <GoogleAd adSlot="1180164733" style={{ display: "block", width: 300, height: 250 }} />

          <div style={styles.settingsSection}>
            <h3 style={styles.settingsSectionTitle}>Legal Information</h3>
            <div style={styles.legalCard}>
              <AlertTriangle size={20} style={{ color: '#dc2626' }} />
              <div style={styles.legalText}>
                <strong>Important:</strong> SyncWay is a FREE platform. We do not verify users or drivers.
                You are responsible for your safety and financial arrangements.
              </div>
            </div>
            <button onClick={() => setShowTerms(true)} style={styles.viewTermsButton}>
              <FileText size={16} /> View Terms & Conditions
            </button>
          </div>
          
          <div style={styles.settingsSection}>
            <h3 style={styles.settingsSectionTitle}>Email Notifications</h3>
            <div style={styles.toggleContainer}>
              <span>Receive email notifications</span>
              <button
                onClick={toggleEmailNotifications}
                style={{...styles.toggleButton, ...(emailNotifications ? styles.toggleOn : styles.toggleOff)}}
              >
                <div style={{...styles.toggleCircle, ...(emailNotifications ? styles.toggleCircleOn : {})}} />
              </button>
            </div>
            <p style={styles.settingsDescription}>
              {emailNotifications ? 'You will receive emails for ride updates' : 'You will not receive any email notifications'}
            </p>
          </div>
          
          <div style={styles.settingsSection}>
            <h3 style={styles.settingsSectionTitle}>Account Information</h3>
            <div style={styles.infoGrid}>
              <div style={styles.infoItem}>
                <span style={styles.infoLabel}>Name:</span>
                <span style={styles.infoValue}>{user.name}</span>
                <span style={styles.infoLabel}>Phone:</span>
                <span style={styles.infoValue}>{user.phone}</span>
                <span style={styles.infoLabel}>Email:</span>
                <span style={styles.infoValue}>{user.email || 'Not provided'}</span>
                <span style={styles.infoLabel}>Account Type:</span>
                <span style={styles.infoValue}>{user.userType}</span>
              </div>
            </div>
          </div>
          
          <div style={{...styles.settingsSection, borderColor: '#ef4444'}}>
            <h3 style={{...styles.settingsSectionTitle, color: '#ef4444'}}>Danger Zone</h3>
            <p style={styles.warningText}>
              Deleting your account will permanently remove all your data and cancel all active rides.
            </p>
            <button onClick={handleDeleteAccount} style={styles.deleteButton}>
              Delete My Account
            </button>
          </div>
          
          <div style={styles.settingsActions}>
            <button onClick={() => setShowSettings(false)} style={styles.cancelButton}>
              Back to main
            </button>
            <button onClick={handleLogout} style={styles.logoutButton}>
              <LogOut size={18} /> Logout
            </button>
          </div>
        </div>
        
        {notification && (
          <div style={{...styles.notification, ...styles[notification.type]}}>
            {notification.message}
          </div>
        )}
      </div>
    );
  }
  
  return (
    <div style={styles.app}>
      {notification && (
        <div style={{...styles.notification, ...styles[notification.type]}}>
          {notification.message}
        </div>
      )}
      
      <header style={styles.header}>
        <div style={styles.headerLeft}>
          <div style={styles.logo}>
            <Car size={24} />
            <span>SyncWay</span>
          </div>
          <div style={styles.userInfo}>
            <span style={styles.userName}>{user.name}</span>
            <span style={styles.userType}>{user.userType}</span>
          </div>
        </div>
        
        <div style={styles.headerCenter}>
          {/*<div style={styles.onlineCount}>
            <Users size={16} />
            <span>{onlineUsers.online} online</span>
          </div>
          <div style={styles.disclaimerBadge}>
            <AlertTriangle size={14} />
            <span>Use at own risk</span>
          </div>*/}
        </div>
        
        <div style={styles.headerRight}>
          <button onClick={() => setShowTerms(true)} style={styles.termsButton}>
            <FileText size={18} />
          </button>
          <button onClick={() => setShowSettings(true)} style={styles.settingsButton}>
            <Settings size={18} />
          </button>
          {/*<button onClick={handleLogout} style={styles.logoutButton}>
            <LogOut size={18} /> Logout
          </button>*/}
        </div>
      </header>
      
      <main style={styles.mainContent}>
        <div style={styles.tabs}>
          {user.userType === 'user' ? (
            <>
              <button
                style={{...styles.tab, ...(activeTab === 'request' ? styles.activeTab : {})}}
                onClick={() => setActiveTab('request')}
              >
                Request Ride
              </button>
              <button
                style={{...styles.tab, ...(activeTab === 'myrides' ? styles.activeTab : {})}}
                onClick={() => setActiveTab('myrides')}
              >
                My Rides ({myRides.filter(r => r.status === 'pending').length})
              </button>
            </>
          ) : (
            <>
              <button
                style={{...styles.tab, ...(activeTab === 'available' ? styles.activeTab : {})}}
                onClick={() => setActiveTab('available')}
              >
                Available Rides ({availableRides.length})
              </button>
              <button
                style={{...styles.tab, ...(activeTab === 'myclaims' ? styles.activeTab : {})}}
                onClick={() => setActiveTab('myclaims')}
              >
                My Claims ({driverRides.length})
              </button>
            </>
          )}
        </div>
        
        <div style={styles.contentArea}>
          {user.userType === 'user' && activeTab === 'request' && (
            <div style={styles.card}>
              <h2 style={styles.cardTitle}>Request a Ride</h2>
              
              <div style={styles.safetyWarning}>
                <AlertTriangle size={16} />
                <span>Meet in public places. Verify driver identity. Share trip details with trusted contacts.</span>
              </div>
              
              <div style={styles.formGroup}>
                <label style={styles.formLabel}>Start Location</label>
                <div style={styles.inputWithIcon}>
                  <MapPin size={20} style={styles.inputIcon} />
                  <input
                    type="text"
                    placeholder="Enter pickup address"
                    style={styles.formInput}
                    value={startLocation}
                    onChange={(e) => {
                      setStartLocation(e.target.value);
                      searchAddress(e.target.value, 'start');
                    }}
                    onFocus={() => startLocation.length >= 2 && setShowStartSuggestions(true)}
                  />
                </div>
                
                {showStartSuggestions && startSuggestions.length > 0 && (
                  <div style={styles.suggestionsDropdown}>
                    {startSuggestions.map((prediction) => (
                      <div
                        key={prediction.place_id}
                        style={styles.suggestionItem}
                        onClick={() => handleSelectAddress(prediction, 'start')}
                      >
                        <div style={styles.suggestionText}>{prediction.description}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              
              <div style={styles.formGroup}>
                <label style={styles.formLabel}>End Location</label>
                <div style={styles.inputWithIcon}>
                  <MapPin size={20} style={styles.inputIcon} />
                  <input
                    type="text"
                    placeholder="Enter destination address"
                    style={styles.formInput}
                    value={endLocation}
                    onChange={(e) => {
                      setEndLocation(e.target.value);
                      searchAddress(e.target.value, 'end');
                    }}
                    onFocus={() => endLocation.length >= 2 && setShowEndSuggestions(true)}
                  />
                </div>
                
                {showEndSuggestions && endSuggestions.length > 0 && (
                  <div style={styles.suggestionsDropdown}>
                    {endSuggestions.map((prediction) => (
                      <div
                        key={prediction.place_id}
                        style={styles.suggestionItem}
                        onClick={() => handleSelectAddress(prediction, 'end')}
                      >
                        <div style={styles.suggestionText}>{prediction.description}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              
              <div style={styles.formRow}>
                <div style={{...styles.formGroup, flex: 1}}>
                  <label style={styles.formLabel}>Passengers</label>
                  <div style={styles.inputWithIcon}>
                    <UserPlus size={20} style={styles.inputIcon} />
                    <select 
                      style={styles.formSelect}
                      value={passengers}
                      onChange={(e) => setPassengers(parseInt(e.target.value))}
                    >
                      {[1, 2, 3, 4, 5, 6].map(num => (
                        <option key={num} value={num}>{num} {num === 1 ? 'passenger' : 'passengers'}</option>
                      ))}
                    </select>
                  </div>
                </div>
                
                <div style={{...styles.formGroup, flex: 1}}>
                  <label style={styles.formLabel}>Ride Type</label>
                  <select 
                    style={styles.formSelect}
                    value={rideType} 
                    onChange={(e) => setRideType(e.target.value)}
                  >
                    <option value="standard">Standard</option>
                  </select>
                </div>
              </div>
              
              <div style={styles.formRow}>
                <div style={{...styles.formGroup, flex: 1}}>
                  <label style={styles.formLabel}>Date</label>
                  <div style={styles.inputWithIcon}>
                    <Calendar size={20} style={styles.inputIcon} />
                    <input
                      type="date"
                      style={styles.formInput}
                      value={rideDate}
                      onChange={(e) => setRideDate(e.target.value)}
                      min={new Date().toISOString().split('T')[0]}
                    />
                  </div>
                </div>
                
                <div style={{...styles.formGroup, flex: 1}}>
                  <label style={styles.formLabel}>Time</label>
                  <div style={styles.inputWithIcon}>
                    <Clock size={20} style={styles.inputIcon} />
                    <input
                      type="time"
                      style={styles.formInput}
                      value={rideTime}
                      onChange={(e) => setRideTime(e.target.value)}
                    />
                  </div>
                </div>
              </div>
              
              {(distance || fare) && (
                <div style={styles.rideSummary}>
                  <div style={styles.summaryItem}>
                    <span>Distance:</span>
                    <strong>{distance} miles</strong>
                  </div>
                  <div style={styles.summaryItem}>
                    <span>Estimated Fare:</span>
                    <strong>${fare}</strong>
                  </div>
                </div>
              )}
              
              <button
                onClick={handleRequestRide}
                style={styles.primaryButton}
                disabled={!startLocation || !endLocation || !rideDate || !rideTime}
              >
                Request Ride (Emails drivers)
              </button>
            </div>
          )}
          
          {user.userType === 'user' && activeTab === 'myrides' && (
            <div style={styles.card}>
              <h2 style={styles.cardTitle}>My Rides</h2>
              <GoogleAd adSlot="1180164733" style={{ display: "block", width: 300, height: 250 }} />
              {myRides.length === 0 ? (
                <div style={styles.emptyState}>
                  <p>No rides yet. Request your first ride!</p>
                </div>
              ) : (
                <div style={styles.ridesList}>
                  {myRides.map(ride => (
                    <div key={ride._id} style={{...styles.rideItem, ...styles[`ride${ride.status.charAt(0).toUpperCase() + ride.status.slice(1)}`]}}>
                      <div style={styles.rideHeader}>
                        <div>
                          <h3 style={styles.rideTitle}>{ride.startLocation} → {ride.endLocation}</h3>
                          <div style={styles.rideMeta}>
                            <span style={styles.rideBadge}>{ride.rideType}</span>
                            <span style={styles.rideBadge}>
                              <UserPlus size={12} /> {ride.passengers}
                            </span>
                            <span style={styles.rideBadge}>{ride.distance} miles</span>
                            <span style={{...styles.rideBadge, backgroundColor: '#d1fae5', color: '#065f46'}}>${ride.fare}</span>
                            <span style={{...styles.rideBadge, ...styles[`status${ride.status.charAt(0).toUpperCase() + ride.status.slice(1)}`]}}>
                              {ride.status}
                            </span>
                          </div>
                          <div style={styles.rideTimeInfo}>
                            <Clock size={12} />
                            <span>{formatDate(ride.rideDate)} at {formatTimeTo12Hour(ride.rideTime)}</span>
                          </div>
                        </div>
                        <div style={styles.rideActions}>
                          {ride.status === 'pending' && (
                            <button
                              onClick={() => handleCancelRide(ride._id)}
                              style={styles.cancelButton}
                            >
                              <X size={16} /> Cancel
                            </button>
                          )}
                          {ride.claimed && (
                            <>
                              <button
                                onClick={() => handleCall(ride.claimedDriverPhone)}
                                style={styles.callButton}
                              >
                                <PhoneCall size={16} /> Call
                              </button>
                              <button
                                onClick={() => handleUnclaimRide(ride)}
                                style={styles.unclaimButton}
                              >
                                Unclaim
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                      
                      {ride.claimed && (
                        <div style={styles.driverInfo}>
                          <div style={styles.warningCallout}>
                            <AlertTriangle size={12} />
                            <span>Call to verify driver identity before meeting</span>
                          </div>
                          <div style={styles.contactInfo}>
                            <Phone size={16} />
                            <span>Driver: {ride.claimedDriverName} ({ride.claimedDriverPhone})</span>
                          </div>
                        </div>
                      )}
                      
                      <div style={styles.rideFooter}>
                        <span>Requested: {new Date(ride.createdAt).toLocaleString()}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
          
          {user.userType === 'driver' && activeTab === 'available' && (
            <div style={styles.card}>
              <div style={styles.cardHeader}>
                <h2 style={styles.cardTitle}>Available Rides ({availableRides.length})</h2>
                <button onClick={loadAvailableRides} style={styles.refreshButton}>
                  <Search size={16} /> Refresh
                </button>
              </div>
              
              <div style={styles.driverDisclaimer}>
                <AlertTriangle size={16} />
                <div>
                  <strong>Driver Notice:</strong> You are responsible for your own vehicle insurance, 
                  safety, and compliance with local laws. Verify passenger identity before pickup.
                </div>
              </div>
              
              {availableRides.length === 0 ? (
                <div style={styles.emptyState}>
                  <p>No available rides at the moment.</p>
                </div>
              ) : (
                <div style={styles.ridesList}>
                  {availableRides.map(ride => (
                    <div key={ride._id} style={styles.rideItem}>
                      <div style={styles.rideHeader}>
                        <div>
                          <h3 style={styles.rideTitle}>{ride.startLocation} → {ride.endLocation}</h3>
                          <div style={styles.rideMeta}>
                            <span style={{...styles.rideBadge, backgroundColor: '#dbeafe', color: '#1d4ed8'}}>
                              {ride.distance} miles
                            </span>
                            <span style={{...styles.rideBadge, backgroundColor: '#d1fae5', color: '#065f46'}}>
                              ${ride.fare}
                            </span>
                            <span style={{...styles.rideBadge, backgroundColor: '#f3e8ff', color: '#7c3aed'}}>
                              <UserPlus size={14} /> {ride.passengers}
                            </span>
                            <span style={{...styles.rideBadge, backgroundColor: '#fef3c7', color: '#92400e'}}>
                              <Calendar size={12} /> {formatDate(ride.rideDate)}
                            </span>
                            <span style={{...styles.rideBadge, backgroundColor: '#f0f9ff', color: '#0ea5e9'}}>
                              <Clock size={12} /> {formatTimeTo12Hour(ride.rideTime)}
                            </span>
                            <span style={{...styles.rideBadge, backgroundColor: '#f3e8ff', color: '#7c3aed'}}>
                              <User size={14} /> {ride.userName}
                            </span>
                          </div>
                        </div>
                        <button
                          onClick={() => handleClaimRide(ride)}
                          style={styles.claimButton}
                        >
                          <CheckCircle size={16} /> Claim Ride
                        </button>
                      </div>
                      
                      <div style={styles.passengerInfo}>
                        <div style={styles.warningCallout}>
                          <AlertTriangle size={12} />
                          <span>Call to verify passenger identity before pickup</span>
                        </div>
                        <div style={styles.contactRow}>
                          <Phone size={16} />
                          <span>{ride.userPhone}</span>
                          <button
                            onClick={() => handleCall(ride.userPhone)}
                            style={styles.smallCallButton}
                          >
                            <PhoneCall size={14} /> Call
                          </button>
                        </div>
                      </div>
                      
                      <div style={styles.rideFooter}>
                        <span>Requested: {new Date(ride.createdAt).toLocaleString()}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
          
          {user.userType === 'driver' && activeTab === 'myclaims' && (
            <div style={styles.card}>
              <h2 style={styles.cardTitle}>My Claimed Rides</h2>
              
              <div style={styles.driverDisclaimer}>
                <AlertTriangle size={16} />
                <div>
                  <strong>Remember:</strong> You are solely responsible for passenger safety, 
                  fare collection, and compliance with all applicable laws.
                </div>
              </div>
                              <GoogleAd adSlot="1180164733" style={{ display: "block", width: 300, height: 250 }} />

              {driverRides.length === 0 ? (
                <div style={styles.emptyState}>
                  <p>No claimed rides yet.</p>
                </div>
              ) : (
                <div style={styles.ridesList}>
                  {driverRides.map(ride => (
                    <div key={ride._id} style={styles.rideItem}>
                      <div style={styles.rideHeader}>
                        <div>
                          <h3 style={styles.rideTitle}>{ride.startLocation} → {ride.endLocation}</h3>
                          <div style={styles.rideMeta}>
                            <span style={styles.rideBadge}>{ride.distance} miles</span>
                            <span style={{...styles.rideBadge, backgroundColor: '#d1fae5', color: '#065f46'}}>${ride.fare}</span>
                            <span style={{...styles.rideBadge, backgroundColor: '#f3e8ff', color: '#7c3aed'}}>
                              <UserPlus size={14} /> {ride.passengers}
                            </span>
                            <span style={{...styles.rideBadge, backgroundColor: '#fef3c7', color: '#92400e'}}>
                              <Calendar size={12} /> {formatDate(ride.rideDate)}
                            </span>
                            <span style={{...styles.rideBadge, backgroundColor: '#f0f9ff', color: '#0ea5e9'}}>
                              <Clock size={12} /> {formatTimeTo12Hour(ride.rideTime)}
                            </span>
                            <span style={{...styles.rideBadge, backgroundColor: '#d1fae5', color: '#065f46'}}>
                              Claimed
                            </span>
                          </div>
                        </div>
                        <div style={styles.rideActions}>
                          <button
                            onClick={() => handleCall(ride.userPhone)}
                            style={styles.callButton}
                          >
                            <PhoneCall size={16} /> Call
                          </button>
                          <button
                            onClick={() => handleUnclaimRide(ride)}
                            style={styles.unclaimButton}
                          >
                            Unclaim
                          </button>
                        </div>
                      </div>
                      
                      <div style={styles.passengerInfo}>
                        <div style={styles.warningCallout}>
                          <AlertTriangle size={12} />
                          <span>Verify passenger identity before pickup</span>
                        </div>
                        <div style={styles.contactInfo}>
                          <User size={16} />
                          <span>Passenger: {ride.userName} ({ride.userPhone})</span>
                        </div>
                      </div>
                      
                      <div style={styles.rideFooter}>
                        <span>Claimed: {new Date(ride.createdAt).toLocaleString()}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

const styles = {
  // Login Styles
  loginContainer: {
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
    padding: '20px'
  },
  loginCard: {
    background: 'white',
    borderRadius: '12px',
    padding: '40px',
    width: '100%',
    maxWidth: '400px',
    boxShadow: '0 10px 40px rgba(0,0,0,0.1)'
  },
  loginHeader: {
    textAlign: 'center',
    marginBottom: '20px'
  },
  loginLogo: {
    width: '80px',
    height: '80px',
    background: '#4f46e5',
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    margin: '0 auto 20px',
    color: 'white'
  },
  loginTitle: {
    fontSize: '28px',
    color: '#1f2937',
    marginBottom: '8px'
  },
  loginSubtitle: {
    color: '#6b7280',
    fontSize: '14px'
  },
  disclaimerBanner: {
    background: '#fef3c7',
    border: '1px solid #f59e0b',
    color: '#92400e',
    padding: '8px 12px',
    borderRadius: '6px',
    fontSize: '12px',
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    marginBottom: '20px'
  },
  toggleButtons: {
    display: 'flex',
    marginBottom: '20px'
  },
  toggleButton: {
    flex: 1,
    padding: '12px',
    border: '2px solid #e5e7eb',
    background: 'white',
    borderRadius: '8px',
    cursor: 'pointer',
    fontWeight: '500',
    fontSize: '16px'
  },
  activeToggle: {
    borderColor: '#4f46e5',
    background: '#4f46e5',
    color: 'white'
  },
  loginForm: {
    display: 'flex',
    flexDirection: 'column',
    gap: '16px'
  },
  inputGroup: {
    position: 'relative'
  },
  inputIcon: {
    position: 'absolute',
    left: '12px',
    top: '50%',
    transform: 'translateY(-50%)',
    color: '#9ca3af'
  },
  loginInput: {
    padding: '12px 16px 12px 40px',
    border: '2px solid #e5e7eb',
    borderRadius: '8px',
    fontSize: '16px',
    width: '100%',
    transition: 'border-color 0.3s'
  },
  showPasscodeButton: {
    position: 'absolute',
    right: '12px',
    top: '50%',
    transform: 'translateY(-50%)',
    background: 'none',
    border: 'none',
    color: '#4f46e5',
    cursor: 'pointer',
    fontWeight: '500'
  },
  userTypeSelector: {
    display: 'flex',
    gap: '12px',
    margin: '10px 0'
  },
  userTypeBtn: {
    flex: 1,
    padding: '12px',
    border: '2px solid #e5e7eb',
    background: 'white',
    borderRadius: '8px',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '8px',
    transition: 'all 0.3s',
    fontWeight: '500'
  },
  activeUserType: {
    borderColor: '#4f46e5',
    background: '#4f46e5',
    color: 'white'
  },
  termsCheckbox: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    margin: '10px 0'
  },
  checkboxInput: {
    width: '16px',
    height: '16px'
  },
  termsLabel: {
    fontSize: '14px',
    color: '#4b5563'
  },
  termsLink: {
    background: 'none',
    border: 'none',
    color: '#4f46e5',
    textDecoration: 'underline',
    cursor: 'pointer',
    padding: 0,
    fontSize: '14px'
  },
  loginButton: {
    background: '#4f46e5',
    color: 'white',
    border: 'none',
    padding: '14px',
    borderRadius: '8px',
    fontSize: '16px',
    fontWeight: '600',
    cursor: 'pointer',
    marginTop: '10px'
  },
  legalNotice: {
    marginTop: '16px',
    padding: '12px',
    background: '#f3f4f6',
    borderRadius: '8px',
    fontSize: '12px',
    color: '#6b7280',
    textAlign: 'center'
  },

  // Terms and Conditions Styles
  termsModal: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    background: 'rgba(0, 0, 0, 0.7)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '20px',
    zIndex: 2000
  },
  termsContainer: {
    background: 'white',
    borderRadius: '12px',
    width: '100%',
    maxWidth: '800px',
    maxHeight: '90vh',
    display: 'flex',
    flexDirection: 'column',
    boxShadow: '0 20px 60px rgba(0,0,0,0.3)'
  },
  termsHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '24px',
    borderBottom: '1px solid #e5e7eb'
  },
  termsHeaderLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    color: '#4f46e5'
  },
  termsModalTitle: {
    fontSize: '24px',
    fontWeight: '600',
    color: '#1f2937'
  },
  termsScroll: {
    flex: 1,
    overflowY: 'auto',
    padding: '24px'
  },
  termsContent: {
    display: 'flex',
    flexDirection: 'column',
    gap: '24px'
  },
  termsTitle: {
    fontSize: '28px',
    fontWeight: '700',
    color: '#1f2937',
    marginBottom: '8px'
  },
  section: {
    marginBottom: '20px'
  },
  sectionTitle: {
    fontSize: '18px',
    fontWeight: '600',
    color: '#374151',
    marginBottom: '8px'
  },
  termsText: {
    fontSize: '14px',
    color: '#4b5563',
    lineHeight: '1.6',
    whiteSpace: 'pre-line'
  },
  warningBox: {
    background: '#fee2e2',
    border: '1px solid #fca5a5',
    borderRadius: '8px',
    padding: '16px',
    display: 'flex',
    gap: '12px',
    alignItems: 'flex-start',
    marginTop: '24px'
  },
  warningText: {
    color: '#7f1d1d',
    fontSize: '14px',
    lineHeight: '1.5'
  },
  termsFooter: {
    padding: '24px',
    borderTop: '1px solid #e5e7eb',
    display: 'flex',
    justifyContent: 'center'
  },
  agreeButton: {
    background: '#4f46e5',
    color: 'white',
    border: 'none',
    padding: '12px 32px',
    borderRadius: '8px',
    fontSize: '16px',
    fontWeight: '600',
    cursor: 'pointer'
  },

  // Settings Modal Styles
  settingsModal: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    background: 'rgba(0, 0, 0, 0.5)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '20px',
    zIndex: 1000
  },
  settingsContent: {
    background: 'white',
    borderRadius: '12px',
    width: '100%',
    maxWidth: '500px',
    maxHeight: '90vh',
    overflowY: 'auto',
    boxShadow: '0 10px 40px rgba(0,0,0,0.2)'
  },
  settingsHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '24px',
    borderBottom: '1px solid #e5e7eb'
  },
  settingsTitle: {
    fontSize: '24px',
    fontWeight: '600',
    color: '#1f2937'
  },
  closeButton: {
    background: 'none',
    border: 'none',
    color: '#6b7280',
    cursor: 'pointer',
    padding: '4px'
  },
  settingsSection: {
    padding: '24px',
    borderBottom: '1px solid #e5e7eb'
  },
  settingsSectionTitle: {
    fontSize: '18px',
    fontWeight: '600',
    color: '#1f2937',
    marginBottom: '16px'
  },
  legalCard: {
    background: '#fef3c7',
    border: '1px solid #f59e0b',
    borderRadius: '8px',
    padding: '16px',
    display: 'flex',
    gap: '12px',
    alignItems: 'flex-start',
    marginBottom: '16px'
  },
  legalText: {
    color: '#92400e',
    fontSize: '14px',
    flex: 1
  },
  viewTermsButton: {
    background: '#f3f4f6',
    color: '#374151',
    border: 'none',
    padding: '10px 16px',
    borderRadius: '6px',
    cursor: 'pointer',
    fontWeight: '500',
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    width: '100%'
  },
  toggleContainer: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '8px'
  },
  toggleButton: {
    width: '44px',
    height: '24px',
    borderRadius: '12px',
    border: 'none',
    cursor: 'pointer',
    position: 'relative',
    transition: 'background 0.3s'
  },
  toggleOn: {
    background: '#10b981'
  },
  toggleOff: {
    background: '#d1d5db'
  },
  toggleCircle: {
    position: 'absolute',
    top: '2px',
    left: '2px',
    width: '20px',
    height: '20px',
    borderRadius: '50%',
    background: 'white',
    transition: 'transform 0.3s'
  },
  toggleCircleOn: {
    transform: 'translateX(20px)'
  },
  settingsDescription: {
    color: '#6b7280',
    fontSize: '14px'
  },
  infoGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, 1fr)',
    gap: '12px'
  },
  infoItem: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px'
  },
  infoLabel: {
    fontSize: '14px',
    color: '#6b7280'
  },
  infoValue: {
    fontSize: '16px',
    color: '#1f2937',
    fontWeight: '500'
  },
  deleteButton: {
    background: '#ef4444',
    color: 'white',
    border: 'none',
    padding: '12px 24px',
    borderRadius: '8px',
    cursor: 'pointer',
    fontWeight: '600',
    width: '100%'
  },
  settingsActions: {
    padding: '24px',
    display: 'flex',
    gap: '12px'
  },
  cancelButton: {
    flex: 1,
    background: '#e5e7eb',
    color: '#374151',
    border: 'none',
    padding: '12px',
    borderRadius: '8px',
    cursor: 'pointer',
    fontWeight: '600'
  },
  logoutButton: {
    flex: 1,
    background: '#1f2937',
    color: 'white',
    border: 'none',
    padding: '12px',
    borderRadius: '8px',
    cursor: 'pointer',
    fontWeight: '600',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '8px'
  },

  // Main App Styles
  app: {
    minHeight: '100vh',
    background: '#f3f4f6'
  },
header: {
  flexShrink: 0,
  background: 'white',
  borderBottom: '1px solid #e5e7eb',
  padding: '12px 16px',
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  position: 'sticky',
  top: 0,
  zIndex: 100,
  flexWrap: 'nowrap', // Keep in single line
  overflowX: 'auto', // Allow horizontal scrolling if needed
  whiteSpace: 'nowrap', // Prevent text wrapping
  minHeight: '60px' // Fixed height
},
  headerLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: '4px'
  },
  logo: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    fontSize: '20px',
    fontWeight: '700',
    color: '#4f46e5'
  },
  userInfo: {
    display: 'flex',
    flexDirection: 'column',
    gap: '2px'
  },
  userName: {
    fontSize: '14px',
    fontWeight: '600',
    color: '#1f2937'
  },
  userType: {
    fontSize: '12px',
    color: '#6b7280',
    textTransform: 'capitalize'
  },
  headerCenter: {
    display: 'flex',
    alignItems: 'center',
    gap: '16px'
  },
  onlineCount: {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    fontSize: '14px',
    color: '#6b7280'
  },
  disclaimerBadge: {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    fontSize: '12px',
    color: '#dc2626',
    background: '#fee2e2',
    padding: '4px 8px',
    borderRadius: '4px'
  },
  headerRight: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px'
  },
  termsButton: {
    background: 'none',
    border: 'none',
    color: '#6b7280',
    cursor: 'pointer',
    padding: '8px',
    borderRadius: '6px'
  },
  settingsButton: {
    background: 'none',
    border: 'none',
    color: '#6b7280',
    cursor: 'pointer',
    padding: '8px',
    borderRadius: '6px'
  },
  mainContent: {
    padding: '24px',
    maxWidth: '1200px',
    margin: '0 auto'
  },
  tabs: {
    display: 'flex',
    gap: '8px',
    marginBottom: '24px'
  },
  tab: {
    background: 'white',
    border: '1px solid #e5e7eb',
    padding: '12px 24px',
    borderRadius: '8px',
    cursor: 'pointer',
    fontWeight: '500',
    transition: 'all 0.3s'
  },
  activeTab: {
    background: '#4f46e5',
    borderColor: '#4f46e5',
    color: 'white'
  },
  contentArea: {
    background: 'white',
    borderRadius: '12px',
    padding: '24px',
    boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
  },
  card: {
    display: 'flex',
    flexDirection: 'column',
    gap: '24px'
  },
  cardHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '16px'
  },
  cardTitle: {
    fontSize: '24px',
    fontWeight: '600',
    color: '#1f2937',
    marginBottom: '8px'
  },
  safetyWarning: {
    background: '#fef3c7',
    border: '1px solid #f59e0b',
    color: '#92400e',
    padding: '12px',
    borderRadius: '8px',
    fontSize: '14px',
    display: 'flex',
    alignItems: 'flex-start',
    gap: '8px'
  },
  driverDisclaimer: {
    background: '#e0f2fe',
    border: '1px solid #0ea5e9',
    color: '#0369a1',
    padding: '12px',
    borderRadius: '8px',
    fontSize: '14px',
    display: 'flex',
    alignItems: 'flex-start',
    gap: '8px'
  },
  formGroup: {
    position: 'relative'
  },
  formLabel: {
    display: 'block',
    fontSize: '14px',
    fontWeight: '500',
    color: '#374151',
    marginBottom: '8px'
  },
  inputWithIcon: {
    position: 'relative'
  },
  formInput: {
    width: '100%',
    padding: '12px 16px 12px 40px',
    border: '2px solid #e5e7eb',
    borderRadius: '8px',
    fontSize: '16px',
    transition: 'border-color 0.3s'
  },
  formSelect: {
    width: '100%',
    padding: '12px 16px',
    border: '2px solid #e5e7eb',
    borderRadius: '8px',
    fontSize: '16px',
    background: 'white'
  },
  suggestionsDropdown: {
    position: 'absolute',
    top: '100%',
    left: 0,
    right: 0,
    background: 'white',
    border: '1px solid #e5e7eb',
    borderRadius: '8px',
    marginTop: '4px',
    maxHeight: '200px',
    overflowY: 'auto',
    zIndex: 10,
    boxShadow: '0 4px 6px rgba(0,0,0,0.1)'
  },
  suggestionItem: {
    padding: '12px 16px',
    borderBottom: '1px solid #e5e7eb',
    cursor: 'pointer',
    transition: 'background 0.2s'
  },
  suggestionItemHover: {
    background: '#f3f4f6'
  },
  suggestionText: {
    fontSize: '14px',
    color: '#374151'
  },
  formRow: {
    display: 'flex',
    flexDirection: 'column',
    gap: '16px'
  },
  rideSummary: {
    display: 'flex',
    gap: '24px',
    padding: '16px',
    background: '#f0f9ff',
    borderRadius: '8px',
    border: '1px solid #e0f2fe'
  },
  summaryItem: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px'
  },
  summaryItemSpan: {
    fontSize: '14px',
    color: '#6b7280'
  },
  summaryItemStrong: {
    fontSize: '18px',
    color: '#1f2937',
    fontWeight: '600'
  },
  primaryButton: {
    background: '#4f46e5',
    color: 'white',
    border: 'none',
    padding: '14px 24px',
    borderRadius: '8px',
    fontSize: '16px',
    fontWeight: '600',
    cursor: 'pointer',
    transition: 'background 0.3s'
  },
  primaryButtonDisabled: {
    background: '#9ca3af',
    cursor: 'not-allowed'
  },
  refreshButton: {
    background: '#f3f4f6',
    color: '#374151',
    border: 'none',
    padding: '8px 16px',
    borderRadius: '6px',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    fontSize: '14px'
  },
  emptyState: {
    textAlign: 'center',
    padding: '48px 24px',
    color: '#6b7280'
  },
  ridesList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '16px'
  },
  rideItem: {
    background: 'white',
    border: '1px solid #e5e7eb',
    borderRadius: '12px',
    padding: '20px',
    transition: 'all 0.3s'
  },
  rideHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: '12px'
  },
  rideTitle: {
    fontSize: '18px',
    fontWeight: '600',
    color: '#1f2937',
    marginBottom: '8px'
  },
  rideMeta: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '8px',
    marginBottom: '8px'
  },
  rideBadge: {
    background: '#f3f4f6',
    color: '#374151',
    padding: '4px 8px',
    borderRadius: '4px',
    fontSize: '12px',
    display: 'inline-flex',
    alignItems: 'center',
    gap: '4px'
  },
  statusPending: {
    background: '#fef3c7',
    color: '#92400e'
  },
  statusClaimed: {
    background: '#d1fae5',
    color: '#065f46'
  },
  rideTimeInfo: {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    fontSize: '14px',
    color: '#6b7280'
  },
  rideActions: {
    display: 'flex',
    gap: '8px'
  },
  callButton: {
    background: '#10b981',
    color: 'white',
    border: 'none',
    padding: '8px 12px',
    borderRadius: '6px',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    fontWeight: '500'
  },
  claimButton: {
    background: '#10b981',
    color: 'white',
    border: 'none',
    padding: '8px 12px',
    borderRadius: '6px',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    fontWeight: '500'
  },
  unclaimButton: {
    background: '#f59e0b',
    color: 'white',
    border: 'none',
    padding: '8px 12px',
    borderRadius: '6px',
    cursor: 'pointer',
    fontWeight: '500'
  },
  cancelButton: {
    background: '#ef4444',
    color: 'white',
    border: 'none',
    padding: '8px 12px',
    borderRadius: '6px',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    fontWeight: '500'
  },
  smallCallButton: {
    background: '#3b82f6',
    color: 'white',
    border: 'none',
    padding: '4px 8px',
    borderRadius: '4px',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    fontSize: '12px'
  },
  warningCallout: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    fontSize: '12px',
    color: '#dc2626',
    background: '#fee2e2',
    padding: '6px 10px',
    borderRadius: '4px',
    marginBottom: '8px'
  },
  driverInfo: {
    margin: '12px 0'
  },
  passengerInfo: {
    margin: '12px 0'
  },
  contactRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    color: '#6b7280',
    fontSize: '14px'
  },
  contactInfo: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    color: '#6b7280',
    fontSize: '14px'
  },
  rideFooter: {
    paddingTop: '12px',
    borderTop: '1px solid #e5e7eb',
    color: '#9ca3af',
    fontSize: '12px'
  },

  // Notification Styles
  notification: {
    position: 'fixed',
    top: '20px',
    right: '20px',
    padding: '16px 24px',
    borderRadius: '8px',
    color: 'white',
    fontWeight: '500',
    zIndex: 1000,
    animation: 'slideIn 0.3s ease-out'
  },
  info: {
    background: '#3b82f6'
  },
  success: {
    background: '#10b981'
  },
  error: {
    background: '#ef4444'
  }
};

export default App;