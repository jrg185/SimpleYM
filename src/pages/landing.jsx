import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { auth } from "../firebase";
import { collection, query, where, getDocs } from "firebase/firestore";
import { firestore } from "../firebase";

const Landing = () => {
  const [role, setRole] = useState(null);
  const [error, setError] = useState(null);
  const [currentTime, setCurrentTime] = useState(""); // State for current time
  const navigate = useNavigate();

  useEffect(() => {
    const fetchUserRole = async () => {
      const user = auth.currentUser;
    
      if (!user) {
        console.warn("No authenticated user found! Redirecting to login.");
        navigate("/");
        return;
      }
    
      try {
        const normalizedEmail = user.email.toLowerCase(); // Normalize email
        const userCollection = collection(firestore, "user_master");
        const userQuery = query(userCollection, where("email", "==", normalizedEmail));
        const snapshot = await getDocs(userQuery);
    
        if (!snapshot.empty) {
          const userDoc = snapshot.docs[0].data();
          console.log("Fetched User Document:", userDoc);
          const userRole = userDoc.role || "guest";
          setRole(userRole.toLowerCase());
          setError(null); // Clear any previous errors
        } else {
          console.warn(`No user document found for email: ${normalizedEmail}`);
          setError("No user document found. Please contact an admin.");
          setRole(null);
        }
      } catch (err) {
        console.error("Error fetching user role:", err);
        setError("An error occurred while fetching your account details. Please try again later.");
      }
    };
    

    const updateTime = () => {
      const options = { timeZone: "America/New_York", hour12: true };
      const formatter = new Intl.DateTimeFormat("en-US", {
        ...options,
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      });
      setCurrentTime(formatter.format(new Date()));
    };

    fetchUserRole();
    updateTime(); // Initial time update

    // Refresh the current time every second
    const interval = setInterval(updateTime, 1000);

    return () => clearInterval(interval); // Cleanup interval on unmount
  }, [navigate]);

  const logout = async () => {
    try {
      await auth.signOut();
      navigate("/");
    } catch (err) {
      console.error("Error during logout:", err);
      setError("Failed to log out. Please try again.");
    }
  };

  const blocks = [
    { name: "Admin Tasks", roles: ["admin"], route: "/admin-tasks" },
    { name: "Notify Ready", roles: ["admin", "yard", "load"], route: "/notify-ready" },
    { name: "Move", roles: ["admin", "yard"], route: "/moves" },
    { name: "Temp Check", roles: ["admin", "yard", "load"], route: "/temp-check" },
    { name: "Dashboard", roles: ["admin", "yard", "load"], route: "/dashboard" },
  ];
  

  const renderBlocks = () => {
    if (!role) {
      return <p>Loading...</p>;
    }
  
    const filteredBlocks = blocks.filter((block) =>
      block.roles.some((allowedRole) => allowedRole.toLowerCase() === role.toLowerCase())
    );
    if (filteredBlocks.length === 0) {
      return <p>No available options for your role.</p>;
    }
  
    return filteredBlocks.map((block) => (
      <button
        key={block.name}
        className="w-full px-6 py-4 mb-4 text-lg font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
        onClick={() => navigate(block.route)}
      >
        {block.name}
      </button>
    ));
  };
  

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gray-100">
      <header className="w-full bg-indigo-600 p-4 text-center text-white">
        <h1 className="text-2xl font-bold">{import.meta.env.VITE_COMPANY_NAME} - Landing Page</h1>
      </header>
      <main className="flex flex-col items-center mt-6 w-full max-w-md">
        <h2 className="text-lg font-semibold mb-4">Welcome to the Yard Management System</h2>
        <div className="bg-white shadow-md rounded-lg p-6 w-full">
          {error && <p className="text-red-500 mb-4">{error}</p>}
          {renderBlocks()}
        </div>
      </main>
      {/* Current Time Display */}
      <div className="mt-6 text-center">
        <p className="text-lg text-gray-600">
          Current Time: <span className="font-bold">{currentTime || "Loading..."}</span>
        </p>
      </div>
      <footer className="w-full bg-gray-200 p-4 text-center">
        <p>Logged in as: {auth.currentUser?.email}</p>
        <button
          onClick={logout}
          className="mt-2 px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-400 focus:outline-none focus:ring focus:ring-red-300"
        >
          Logout
        </button>
      </footer>
    </div>
  );
};

export default Landing;





