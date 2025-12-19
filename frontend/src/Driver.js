import React, { useState, useEffect } from 'react';
import { Car, User, MapPin, DollarSign, Phone, X, Calendar, Clock, Search, Navigation, Filter } from 'lucide-react';
import io from 'socket.io-client';

const socket = io('http://localhost:5000');

function Driver() {
  const [userName, setUserName] = useState('');
  const [userPhone, setUserPhone] = useState('');
  const [userId, setUserId] = useState(null);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [activeTab, setActiveTab] = useState('available');
  
  // Ride data
  const [availableRides, setAvailableRides] = useState([]);
  const [claimedRides, setClaimedRides] = useState([]);
  const [offers, setOffers] = useState([]);
  
  // Filter states
  const [searchAvailable, setSearchAvailable] = useState('');
  const [searchClaimed, setSearchClaimed] = useState('');
  const [searchMyOffers, setSearchMyOffers] = useState('');
  const [sortBy, setSortBy] = useState('distance'); // 'distance', 'fare', 'time'
  
  // Offer form
  const [offerStart, setOfferStart] = useState('');
  const [offerEnd, setOfferEnd] = useState('');
  const [offerDate, setOfferDate] = useState('');
  const [offerTime, setOfferTime] = useState('');
  
  // Driver location
  const [driverLocation, setDriverLocation] = useState({ lat: 0, lon: 0, address: '' });

  // Get driver's location
  const getDriverLocation = () => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        async (position) => {
          const { latitude, longitude } = position.coords;
          setDriverLocation({
            lat: latitude,
            lon: longitude,
            address: `Lat: ${latitude.toFixed(4)}, Lon: ${longitude.toFixed(4)}`
          });
          
          // Get address
          try {
            const response = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}`);
            const data = await response.json();
            if (data.display_name) {
              setOfferStart(data.display_name.split(',')[0]);
            }
          } catch (error) {
            console.log('Using coordinates as address');
          }
        },
        (error) => {
          console.log('Geolocation error:', error);
          setDriverLocation({
            lat: 0,
            lon: 0,
            address: 'Location not available'
          });
        }
      );
    }
  };

  useEffect(() => {
    if (isLoggedIn) {
      getDriverLocation();
      loadAvailableRides();
      loadDriverOffers();
    }
  }, [isLoggedIn]);

  // Calculate distance between driver and ride
  const calculateDistance = (rideLat, rideLon) => {
    const R = 6371; // Earth's radius in km
    const dLat = (rideLat - driverLocation.lat) * Math.PI / 180;
    const dLon = (rideLon - driverLocation.lon) * Math.PI / 180;
    const a = 
      Math.sin(dLat/2) * Math.sin(dLat/2) +
      Math.cos(driverLocation.lat * Math.PI / 180) * Math.cos(rideLat * Math.PI / 180) * 
      Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return (R * c * 0.621371).toFixed(1); // Convert to miles
  };

  // Sort rides by distance from driver
  const sortRidesByDistance = (rides) => {
    return [...rides].sort((a, b) => {
      const distA = calculateDistance(a.userLat || 0, a.userLon || 0);
      const distB = calculateDistance(b.userLat || 0, b.userLon || 0);
      return parseFloat(distA) - parseFloat(distB);
    });
  };

  const handleLogin = async () => {
    if (userName.trim() && userPhone.trim()) {
      try {
        const response = await fetch('http://localhost:5000/api/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            name: userName, 
            phone: userPhone, 
            userType: 'driver'
          })
        });
        
        const data = await response.json();
        
        if (data.success) {
          setIsLoggedIn(true);
          setUserId(data.user.id);
        }
      } catch (error) {
        console.error('Login error:', error);
        // Fallback for demo
        setIsLoggedIn(true);
        setUserId(Date.now().toString());
        setUserName(userName);
      }
    }
  };

  const loadAvailableRides = async () => {
    try {
      const response = await fetch('http://localhost:5000/api/rides/available');
      const data = await response.json();
      if (data.success) {
        const sortedRides = sortRidesByDistance(data.rides || []);
        setAvailableRides(sortedRides);
      }
    } catch (error) {
      console.log('Loading from localStorage');
      const savedRides = JSON.parse(localStorage.getItem('userRides') || '[]');
      const available = savedRides.filter(r => !r.claimed);
      const sorted = sortRidesByDistance(available);
      setAvailableRides(sorted);
    }
  };

  const loadDriverOffers = async () => {
    try {
      const response = await fetch(`http://localhost:5000/api/offers/driver/${userId}`);
      const data = await response.json();
      if (data.success) setOffers(data.offers || []);
    } catch (error) {
      const savedOffers = JSON.parse(localStorage.getItem('driverOffers') || '[]');
      setOffers(savedOffers.filter(o => o.driverId === userId));
    }
  };

  const handleClaimRide = async (ride) => {
    const rideId = ride._id || ride.id;
    
    const updatedRide = {
      ...ride,
      claimed: true,
      claimedBy: userName,
      claimedDriverPhone: userPhone
    };
    
    try {
      const response = await fetch(`http://localhost:5000/api/rides/${rideId}/claim`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          claimedBy: userName,
          claimedDriverPhone: userPhone
        })
      });
      
      if (response.ok) {
        setAvailableRides(prev => prev.filter(r => (r._id || r.id) !== rideId));
        setClaimedRides(prev => [updatedRide, ...prev]);
      }
    } catch (error) {
      // Local update for demo
      setAvailableRides(prev => prev.filter(r => (r._id || r.id) !== rideId));
      setClaimedRides(prev => [updatedRide, ...prev]);
      
      // Update localStorage
      const savedRides = JSON.parse(localStorage.getItem('userRides') || '[]');
      const updatedRides = savedRides.map(r => 
        (r._id || r.id) === rideId ? updatedRide : r
      );
      localStorage.setItem('userRides', JSON.stringify(updatedRides));
    }
  };

  const handleOfferRide = async () => {
    if (offerStart && offerEnd && offerDate && offerTime) {
      const newOffer = {
        driverId: userId,
        driverName: userName,
        driverPhone: userPhone,
        startLocation: offerStart,
        endLocation: offerEnd,
        date: offerDate,
        time: offerTime
      };
      
      try {
        const response = await fetch('http://localhost:5000/api/offers', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(newOffer)
        });
        
        if (response.ok) {
          const data = await response.json();
          setOffers(prev => [data.offer, ...prev]);
          
          // Update localStorage
          const savedOffers = JSON.parse(localStorage.getItem('driverOffers') || '[]');
          localStorage.setItem('driverOffers', JSON.stringify([...savedOffers, data.offer]));
        }
      } catch (error) {
        // Local storage fallback
        const offerWithId = { ...newOffer, id: Date.now() };
        setOffers(prev => [offerWithId, ...prev]);
        
        const savedOffers = JSON.parse(localStorage.getItem('driverOffers') || '[]');
        localStorage.setItem('driverOffers', JSON.stringify([...savedOffers, offerWithId]));
      }
      
      setOfferStart('');
      setOfferEnd('');
      setOfferDate('');
      setOfferTime('');
      alert('Ride offer posted successfully!');
    }
  };

  const handleDeleteOffer = async (offerId) => {
    try {
      await fetch(`http://localhost:5000/api/offers/${offerId}`, {
        method: 'DELETE',
      });
    } catch (error) {
      console.log('Offline delete');
    }
    
    setOffers(prev => prev.filter(offer => offer._id !== offerId && offer.id !== offerId));
    
    // Update localStorage
    const savedOffers = JSON.parse(localStorage.getItem('driverOffers') || '[]');
    localStorage.setItem('driverOffers', JSON.stringify(
      savedOffers.filter(o => o._id !== offerId && o.id !== offerId)
    ));
  };

  const filterRides = (ridesList, searchTerm) => {
    if (!searchTerm) return ridesList;
    const term = searchTerm.toLowerCase();
    return ridesList.filter(ride => 
      ride.startLocation.toLowerCase().includes(term) ||
      ride.endLocation.toLowerCase().includes(term) ||
      (ride.userName && ride.userName.toLowerCase().includes(term))
    );
  };

  // Login Screen
  if (!isLoggedIn) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-500 to-indigo-600 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-2xl p-8 max-w-md w-full">
          <div className="text-center mb-8">
            <div className="w-20 h-20 bg-purple-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <Car className="text-purple-500" size={40} />
            </div>
            <h1 className="text-4xl font-bold text-gray-800 mb-2">SyncWay Driver</h1>
            <p className="text-gray-600">Driver Portal</p>
          </div>
          
          <div className="space-y-4 mb-6">
            <div className="relative">
              <User className="absolute left-3 top-3 text-gray-400" size={20} />
              <input
                type="text"
                placeholder="Your Name"
                value={userName}
                onChange={(e) => setUserName(e.target.value)}
                className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
              />
            </div>
            <div className="relative">
              <Phone className="absolute left-3 top-3 text-gray-400" size={20} />
              <input
                type="tel"
                placeholder="Phone Number"
                value={userPhone}
                onChange={(e) => setUserPhone(e.target.value)}
                className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
              />
            </div>
          </div>
          
          <button
            onClick={handleLogin}
            className="w-full bg-gradient-to-r from-purple-500 to-purple-600 text-white py-3 rounded-lg font-semibold hover:from-purple-600 hover:to-purple-700 transition flex items-center justify-center gap-2 shadow-lg"
          >
            <Car size={20} />
            Login as Driver
          </button>
          
          <p className="text-center mt-4 text-gray-600">
            <a href="/" className="text-blue-500 hover:underline">Go to User Portal</a>
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-gradient-to-r from-purple-500 to-purple-600 text-white p-4 shadow-lg">
        <div className="max-w-6xl mx-auto flex justify-between items-center">
          <div className="flex items-center gap-3">
            <div className="bg-white/20 p-2 rounded-lg">
              <Car size={24} />
            </div>
            <div>
              <h1 className="text-2xl font-bold">Driver Dashboard</h1>
              <p className="text-sm opacity-90">Welcome, {userName}</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <button
              onClick={getDriverLocation}
              className="flex items-center gap-2 bg-white/20 hover:bg-white/30 px-4 py-2 rounded-lg transition"
            >
              <Navigation size={18} />
              Update Location
            </button>
            <button
              onClick={() => setIsLoggedIn(false)}
              className="bg-white text-purple-600 px-4 py-2 rounded-lg font-semibold hover:bg-gray-100 shadow"
            >
              Logout
            </button>
          </div>
        </div>
      </div>
      
      <div className="max-w-6xl mx-auto p-4">
        {/* Tabs */}
        <div className="bg-white rounded-xl shadow-md mb-6 overflow-hidden">
          <div className="flex">
            {['available', 'claimed', 'offer', 'myoffers'].map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`flex-1 py-4 px-6 font-semibold transition-all ${activeTab === tab 
                  ? 'bg-purple-500 text-white' 
                  : 'text-gray-600 hover:bg-gray-50'}`}
              >
                {tab === 'available' && 'Available Rides'}
                {tab === 'claimed' && 'My Claims'}
                {tab === 'offer' && 'Offer Ride'}
                {tab === 'myoffers' && 'My Offers'}
              </button>
            ))}
          </div>
        </div>

        {/* Available Rides Tab */}
        {activeTab === 'available' && (
          <div className="bg-white rounded-xl shadow-md p-6">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-bold text-gray-800">Available Rides</h2>
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                  <Filter size={18} className="text-gray-500" />
                  <select
                    value={sortBy}
                    onChange={(e) => setSortBy(e.target.value)}
                    className="border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-purple-500"
                  >
                    <option value="distance">Sort by Distance</option>
                    <option value="fare">Sort by Fare</option>
                    <option value="time">Sort by Time</option>
                  </select>
                </div>
              </div>
            </div>
            
            <div className="relative mb-6">
              <Search className="absolute left-3 top-3 text-gray-400" size={20} />
              <input
                type="text"
                placeholder="Search rides..."
                value={searchAvailable}
                onChange={(e) => setSearchAvailable(e.target.value)}
                className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
              />
            </div>

            {filterRides(availableRides, searchAvailable).length === 0 ? (
              <div className="text-center py-12">
                <div className="w-24 h-24 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Car className="text-gray-400" size={40} />
                </div>
                <h3 className="text-xl font-medium text-gray-600 mb-2">No rides available</h3>
                <p className="text-gray-500">Check back later for ride requests</p>
              </div>
            ) : (
              <div className="grid md:grid-cols-2 gap-6">
                {filterRides(availableRides, searchAvailable).map(ride => {
                  const distance = calculateDistance(ride.userLat || 0, ride.userLon || 0);
                  
                  return (
                    <div key={ride.id || ride._id} className="border border-gray-200 rounded-xl p-5 hover:shadow-lg transition">
                      <div className="flex justify-between items-start mb-4">
                        <div>
                          <h3 className="font-bold text-lg">{ride.startLocation.split(',')[0]} → {ride.endLocation.split(',')[0]}</h3>
                          <div className="flex items-center gap-4 mt-2">
                            <span className="bg-purple-100 text-purple-700 px-3 py-1 rounded-full text-sm font-medium">
                              {distance} miles away
                            </span>
                            <span className="bg-green-100 text-green-700 px-3 py-1 rounded-full text-sm font-bold">
                              ${ride.fare}
                            </span>
                          </div>
                        </div>
                        <span className="bg-yellow-100 text-yellow-700 px-3 py-1 rounded-full text-sm">
                          Available
                        </span>
                      </div>
                      
                      <div className="space-y-2 text-gray-600">
                        <div className="flex items-center gap-2">
                          <User size={14} />
                          <span>User: {ride.userName}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Phone size={14} />
                          <span>{ride.userPhone}</span>
                        </div>
                      </div>
                      
                      <button
                        onClick={() => handleClaimRide(ride)}
                        className="w-full mt-4 bg-gradient-to-r from-purple-500 to-purple-600 text-white py-3 rounded-lg font-semibold hover:from-purple-600 hover:to-purple-700 transition"
                      >
                        Claim This Ride
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* My Claims Tab */}
        {activeTab === 'claimed' && (
          <div className="bg-white rounded-xl shadow-md p-6">
            <h2 className="text-2xl font-bold text-gray-800 mb-6">Your Claimed Rides</h2>
            
            <div className="relative mb-6">
              <Search className="absolute left-3 top-3 text-gray-400" size={20} />
              <input
                type="text"
                placeholder="Search your claims..."
                value={searchClaimed}
                onChange={(e) => setSearchClaimed(e.target.value)}
                className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
              />
            </div>

            {filterRides(claimedRides, searchClaimed).length === 0 ? (
              <div className="text-center py-12">
                <div className="w-24 h-24 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Car className="text-green-400" size={40} />
                </div>
                <h3 className="text-xl font-medium text-gray-600 mb-2">No claimed rides</h3>
                <p className="text-gray-500">Claim rides from the Available Rides tab</p>
              </div>
            ) : (
              <div className="grid md:grid-cols-2 gap-6">
                {filterRides(claimedRides, searchClaimed).map(ride => (
                  <div key={ride.id || ride._id} className="border border-green-200 rounded-xl p-5 bg-green-50 hover:shadow-lg transition">
                    <div className="flex justify-between items-start mb-4">
                      <div>
                        <h3 className="font-bold text-lg text-green-800">{ride.startLocation.split(',')[0]} → {ride.endLocation.split(',')[0]}</h3>
                        <div className="flex items-center gap-4 mt-2">
                          <span className="bg-green-200 text-green-800 px-3 py-1 rounded-full text-sm">
                            {ride.distance} miles
                          </span>
                          <span className="bg-green-200 text-green-800 px-3 py-1 rounded-full text-sm font-bold">
                            ${ride.fare}
                          </span>
                        </div>
                      </div>
                      <span className="bg-green-200 text-green-800 px-3 py-1 rounded-full text-sm font-medium">
                        Claimed ✓
                      </span>
                    </div>
                    
                    <div className="space-y-2 text-gray-700">
                      <div className="flex items-center gap-2">
                        <User size={14} />
                        <span className="font-medium">User: {ride.userName}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Phone size={14} />
                        <span>{ride.userPhone}</span>
                      </div>
                    </div>
                    
                    <div className="mt-4 pt-4 border-t border-green-200">
                      <button className="w-full bg-red-500 text-white py-2 rounded-lg font-medium hover:bg-red-600 transition">
                        Unclaim Ride
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Offer Ride Tab */}
        {activeTab === 'offer' && (
          <div className="bg-white rounded-xl shadow-md p-6">
            <h2 className="text-2xl font-bold text-gray-800 mb-6">Offer a Ride</h2>
            
            <div className="space-y-6">
              <div className="grid md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="block text-sm font-medium text-gray-700">Start Location</label>
                  <div className="relative">
                    <MapPin className="absolute left-3 top-3 text-gray-400" size={20} />
                    <input
                      type="text"
                      value={offerStart}
                      onChange={(e) => setOfferStart(e.target.value)}
                      placeholder="Enter start location"
                      className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                    />
                  </div>
                  {driverLocation.address && (
                    <button
                      onClick={() => setOfferStart(driverLocation.address)}
                      className="text-sm text-purple-600 hover:text-purple-700 flex items-center gap-1"
                    >
                      <Navigation size={14} />
                      Use My Current Location
                    </button>
                  )}
                </div>
                
                <div className="space-y-2">
                  <label className="block text-sm font-medium text-gray-700">End Location</label>
                  <div className="relative">
                    <MapPin className="absolute left-3 top-3 text-gray-400" size={20} />
                    <input
                      type="text"
                      value={offerEnd}
                      onChange={(e) => setOfferEnd(e.target.value)}
                      placeholder="Enter destination"
                      className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                    />
                  </div>
                </div>
              </div>
              
              <div className="grid md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="block text-sm font-medium text-gray-700">Date</label>
                  <div className="relative">
                    <Calendar className="absolute left-3 top-3 text-gray-400" size={20} />
                    <input
                      type="date"
                      value={offerDate}
                      onChange={(e) => setOfferDate(e.target.value)}
                      className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                    />
                  </div>
                </div>
                
                <div className="space-y-2">
                  <label className="block text-sm font-medium text-gray-700">Time</label>
                  <div className="relative">
                    <Clock className="absolute left-3 top-3 text-gray-400" size={20} />
                    <input
                      type="time"
                      value={offerTime}
                      onChange={(e) => setOfferTime(e.target.value)}
                      className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                    />
                  </div>
                </div>
              </div>
              
              <button
                onClick={handleOfferRide}
                className="w-full bg-gradient-to-r from-purple-500 to-purple-600 text-white py-4 rounded-xl font-semibold hover:from-purple-600 hover:to-purple-700 transition text-lg shadow-lg"
              >
                Post Ride Offer
              </button>
            </div>
          </div>
        )}

        {/* My Offers Tab */}
        {activeTab === 'myoffers' && (
          <div className="bg-white rounded-xl shadow-md p-6">
            <h2 className="text-2xl font-bold text-gray-800 mb-6">My Offers</h2>
            
            <div className="relative mb-6">
              <Search className="absolute left-3 top-3 text-gray-400" size={20} />
              <input
                type="text"
                placeholder="Search your offers..."
                value={searchMyOffers}
                onChange={(e) => setSearchMyOffers(e.target.value)}
                className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
              />
            </div>

            {offers.filter(o => o.driverId === userId).length === 0 ? (
              <div className="text-center py-12">
                <div className="w-24 h-24 bg-purple-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Car className="text-purple-400" size={40} />
                </div>
                <h3 className="text-xl font-medium text-gray-600 mb-2">No offers created</h3>
                <p className="text-gray-500">Create your first ride offer</p>
              </div>
            ) : (
              <div className="grid md:grid-cols-2 gap-6">
                {offers.filter(o => o.driverId === userId).map(offer => (
                  <div key={offer.id || offer._id} className="border border-purple-200 rounded-xl p-5 hover:shadow-lg transition">
                    <div className="flex justify-between items-start mb-4">
                      <div>
                        <h3 className="font-bold text-lg">{offer.startLocation.split(',')[0]} → {offer.endLocation.split(',')[0]}</h3>
                        <div className="flex items-center gap-3 mt-2">
                          <span className="flex items-center gap-1 text-purple-600">
                            <Calendar size={14} />
                            {offer.date}
                          </span>
                          <span className="flex items-center gap-1 text-purple-600">
                            <Clock size={14} />
                            {offer.time}
                          </span>
                        </div>
                      </div>
                      <button
                        onClick={() => handleDeleteOffer(offer.id || offer._id)}
                        className="text-red-500 hover:text-red-600"
                      >
                        <X size={20} />
                      </button>
                    </div>
                    
                    <div className="mt-4">
                      <button className="w-full bg-red-500 text-white py-2 rounded-lg font-medium hover:bg-red-600 transition">
                        Delete Offer
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default Driver;