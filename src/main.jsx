import React, { useEffect, useState, createContext, useContext } from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter as Router, Routes, Route, Navigate, useNavigate } from "react-router-dom";
import "./index.css";
import Login from "./pages/login.jsx";
import Landing from "./pages/landing.jsx";
import AdminTasks from "./pages/admintasks.jsx";
import NotifyReady from "./pages/notifyready.jsx";
import Moves from "./pages/moves.jsx";
import TempCheck from "./pages/tempcheck.jsx";
import { auth } from "./firebase";
import { onAuthStateChanged } from "firebase/auth";
import Dashboard from "./pages/dashboard.jsx";


// Create an authentication context
const AuthContext = createContext();

const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setUser(user || null);
      setLoading(false);
      console.log("Authentication state changed:", user);
    });

    return () => unsubscribe(); // Cleanup listener
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading }}>
      {children}
    </AuthContext.Provider>
  );
};

const useAuth = () => useContext(AuthContext);

// ProtectedRoute component to guard routes that require authentication
const ProtectedRoute = ({ children }) => {
  const { user, loading } = useAuth();

  if (loading) {
    return <div>Loading...</div>; // Optional: Add a loading spinner or placeholder here
  }

  return user ? children : <Navigate to="/" />;
};

// Main App component with routing
const App = () => {
  return (
    <Routes>
      {/* Public routes */}
      <Route path="/" element={<Login />} />
      
      {/* Protected routes */}
      <Route path="/landing" element={<ProtectedRoute><Landing /></ProtectedRoute>} />
      <Route path="/admin-tasks" element={<ProtectedRoute><AdminTasks /></ProtectedRoute>} />
      <Route path="/notify-ready" element={<ProtectedRoute><NotifyReady /></ProtectedRoute>} />
      <Route path="/moves" element={<ProtectedRoute><Moves /></ProtectedRoute>} />
      <Route path="/temp-check" element={<TempCheck />} />
      <Route path="/dashboard" element={<Dashboard />} />
    </Routes>
  );
};

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <AuthProvider>
      <Router>
        <App />
      </Router>
    </AuthProvider>
  </React.StrictMode>
);
