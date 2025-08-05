import React, { useEffect, useState } from "react";
import { firestore, auth } from "../firebase"; // IMPORT AUTH
import { useNavigate } from "react-router-dom";
import { collection, doc, query, onSnapshot, updateDoc } from "firebase/firestore";
import { API_BASE_URL } from '../config';

const Moves = () => {
  const [openMoves, setOpenMoves] = useState([]);
  const [selectedMove, setSelectedMove] = useState(null);
  const [toOptions, setToOptions] = useState({
    to_location: "",
    to_door: "",
  });
  const [locations, setLocations] = useState([]);
  const [error, setError] = useState(null);
  const [successMessage, setSuccessMessage] = useState(null);
  const [currentTime, setCurrentTime] = useState("");
  const navigate = useNavigate();

  useEffect(() => {
    const fetchOpenMoves = () => {
      const q = query(collection(firestore, "moves"));

      // Real-time listener
      const unsubscribe = onSnapshot(
        q,
        (snapshot) => {
          const moves = snapshot.docs
            .map((doc) => ({
              id: doc.id,
              ...doc.data(),
            }))
            .filter(
              (move) =>
                !move.status || move.status === "open" || move.status === "picked up"
            )
            .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

          setOpenMoves(moves);
        },
        (err) => {
          console.error("Error fetching moves:", err);
          setError("Failed to load moves. Please try again.");
        }
      );

      return unsubscribe;
    };

    const fetchLocations = async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/locations`);
        if (!response.ok) {
          throw new Error(`Failed to fetch locations: ${response.statusText}`);
        }
        const data = await response.json();
        setLocations(data.locations);
      } catch (err) {
        console.error("Error fetching locations:", err);
        setError("Failed to load locations. Please try again.");
      }
    };

    const fetchCurrentTime = async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/current-time`);
        if (!response.ok) {
          throw new Error(`Failed to fetch current time: ${response.statusText}`);
        }
        const data = await response.json();
        setCurrentTime(data.current_time);
      } catch (err) {
        console.error("Error fetching current time:", err);
      }
    };

    const unsubscribe = fetchOpenMoves();
    fetchLocations();
    fetchCurrentTime();

    // Optional: Poll the server for the current time every 60 seconds
    const interval = setInterval(fetchCurrentTime, 60000);

    return () => {
      unsubscribe();
      clearInterval(interval);
    };
  }, []);

  const calculateMinutesSinceSubmission = (timestamp) => {
    if (!timestamp) return "N/A";
    const submissionTime = new Date(timestamp);
    const currentTime = new Date();
    const diffInMs = currentTime - submissionTime;
    return Math.floor(diffInMs / (1000 * 60));
  };

  const handleSelectMove = async (move) => {
    if (selectedMove) {
      setError("You can only pick up one move at a time.");
      return;
    }

    setSelectedMove(move);
    setError(null);
    setSuccessMessage(null);

    try {
      // GET CURRENT USER INFORMATION
      const user = auth.currentUser;
      if (!user) {
        setError("User not authenticated. Please log in.");
        navigate("/");
        return;
      }

      const moveDocRef = doc(firestore, "moves", move.id);
      await updateDoc(moveDocRef, {
        status: "picked up",
        picked_up_at: new Date().toISOString(),
        user_id: user.uid, // ADD USER ID
        email: user.email, // ADD USER EMAIL
      });
      console.log(`Move ${move.id} successfully updated with picked_up_at timestamp and user info.`);
    } catch (err) {
      console.error("Error marking move as picked up:", err);
      setError(`Failed to mark move as picked up: ${err.message}`);
    }
  };

  const handleCancelMoveCompletion = async () => {
    if (selectedMove) {
      try {
        const moveDocRef = doc(firestore, "moves", selectedMove.id);
        await updateDoc(moveDocRef, {
          status: "open",
          // Remove user info when cancelling
          user_id: null,
          email: null
        });
        setSelectedMove(null);
        setToOptions({ to_location: "", to_door: "" });
        setError(null);
        setSuccessMessage(null);
      } catch (err) {
        console.error("Error resetting move status:", err);
        setError("Failed to reset move status. Please try again.");
      }
    }
  };

  const handleToInputChange = (e) => {
    const { name, value } = e.target;
    setToOptions({ ...toOptions, [name]: value });
  };

  const handleSubmitTo = async () => {
    if (!toOptions.to_location || !toOptions.to_door) {
      setError("All fields are required to complete the move.");
      return;
    }

    try {
      // GET CURRENT USER INFORMATION
      const user = auth.currentUser;
      if (!user) {
        setError("User not authenticated. Please log in.");
        navigate("/");
        return;
      }

      const moveDocRef = doc(firestore, "moves", selectedMove.id);
      await updateDoc(moveDocRef, {
        to_location: toOptions.to_location,
        to_door: toOptions.to_door,
        status: "completed",
        completed_at: new Date().toISOString(),
        user_id: user.uid, // ADD/UPDATE USER ID
        email: user.email, // ADD/UPDATE USER EMAIL
      });
      setSuccessMessage("Move updated successfully!");
      console.log(`Move ${selectedMove.id} successfully updated with completed_at timestamp and user info.`);
      setSelectedMove(null);
      setToOptions({ to_location: "", to_door: "" });
    } catch (err) {
      console.error("Error updating move:", err);
      setError(`Failed to update move: ${err.message}`);
    }
  };

  return (
    <div className="min-h-screen bg-gray-100 p-6">
      {error && <p className="text-red-500">{error}</p>}
      {successMessage && <p className="text-green-500">{successMessage}</p>}

      <h2 className="text-3xl font-bold mb-6 text-indigo-700">Open Moves</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {openMoves.map((move) => (
          <div
            key={move.id}
            className={`p-4 bg-white shadow-lg rounded-lg border cursor-pointer hover:shadow-xl transform hover:scale-105 transition-all duration-200 ${
              selectedMove && selectedMove.id === move.id
                ? "border-yellow-500 bg-yellow-100"
                : move.status === "picked up"
                ? "border-green-500 bg-green-100"
                : "border-red-500 bg-red-100"
            }`}
            onClick={() => handleSelectMove(move)}
          >
            <h3 className="text-xl font-semibold text-indigo-700 mb-2">
              Trailer ID: {move.trailer_id || "Unknown"}
            </h3>
            <p
              className={`text-lg font-bold ${
                move.status === "picked up" ? "text-green-700" : "text-red-700"
              } mb-2`}
            >
              {move.status === "picked up" ? "Picked Up" : "Open"}
            </p>
            <p className="text-lg font-bold text-gray-600 mb-2">
              Minutes Since Submission: {calculateMinutesSinceSubmission(move.timestamp)}
            </p>
            <p className="text-gray-600">
              <span className="font-bold">From Location:</span> {move.from_wh_yard}
            </p>
            <p className="text-gray-600">
              <span className="font-bold">From Door:</span> {move.from_door}
            </p>
            <p className="text-gray-600">
              <span className="font-bold">Ready at:</span> {move.timestamp}
            </p>
            {/* DISPLAY USER INFO IF AVAILABLE */}
            {move.email && (
              <p className="text-gray-600">
                <span className="font-bold">Assigned to:</span> {move.email}
              </p>
            )}
          </div>
        ))}
      </div>

      {selectedMove && (
        <div className="mt-6 bg-white p-4 shadow-md rounded-lg">
          <h2 className="text-lg font-semibold mb-4">Complete Move</h2>
          <p>Trailer ID: {selectedMove.trailer_id}</p>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium">To Location:</label>
              <select
                name="to_location"
                value={toOptions.to_location}
                onChange={handleToInputChange}
                className="w-full px-3 py-2 border rounded-lg"
                required
              >
                <option value="">Select a location</option>
                {locations.map((location, index) => (
                  <option key={index} value={location}>
                    {location}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium">To Door:</label>
              <input
                type="text"
                name="to_door"
                value={toOptions.to_door}
                onChange={handleToInputChange}
                className="w-full px-3 py-2 border rounded-lg"
                required
              />
            </div>
            <div className="flex space-x-4">
              <button
                onClick={handleSubmitTo}
                className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-500"
              >
                Submit
              </button>
              <button
                onClick={handleCancelMoveCompletion}
                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-500"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="mt-6">
        <button
          onClick={() => navigate("/landing")}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-500"
        >
          Home
        </button>
        <div className="mt-4 text-center">
          <p className="text-lg text-gray-600">
            Current Time: <span className="font-bold">{currentTime || "Loading..."}</span>
          </p>
        </div>
      </div>
    </div>
  );
};

export default Moves;