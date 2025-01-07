import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import { auth } from "../firebase";

const TempCheck = () => {
  const [trailerId, setTrailerId] = useState("");
  const [clrTemp, setClrTemp] = useState("");
  const [fzrTemp, setFzrTemp] = useState("");
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const navigate = useNavigate();

  const handleSubmit = async () => {
    // Validate input
    if (!trailerId || !clrTemp || !fzrTemp) {
      setError("Please fill in all fields.");
      setSuccess(null);
      return;
    }

    try {
      const user = auth.currentUser;

      if (!user) {
        alert("User not authenticated. Please log in.");
        navigate("/");
        return;
      }

      const token = await user.getIdToken();
      const timestamp = new Date().toISOString(); // Current timestamp
      const userId = user.uid; // Current user ID from Firebase Auth
      const id = `TC${Date.now()}`; // Generate unique ID based on current time

      const payload = {
        trailer_id: trailerId,
        clr_temp: parseFloat(clrTemp), // Convert to number
        fzr_temp: parseFloat(fzrTemp), // Convert to number
        timestamp: timestamp,
        user_id: userId,
        id: id,
      };

      console.log("Payload:", payload);

      // Send data to the backend
      const response = await axios.post(
        `${import.meta.env.VITE_API_BASE_URL}/add-temp-check`,
        payload,
        { headers: { Authorization: `Bearer ${token}` } }
      );

      console.log("Response:", response.data);
      setSuccess("Temperature check recorded successfully!");
      setError(null);

      // Reset form fields
      setTrailerId("");
      setClrTemp("");
      setFzrTemp("");
    } catch (err) {
      console.error("Error submitting temp check:", err);
      setError("Failed to record temperature check. Please try again.");
      setSuccess(null);
    }
  };

  return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center">
      <div className="bg-white p-6 rounded-lg shadow-md w-full max-w-md">
        <h1 className="text-2xl font-bold mb-4">Temp Check</h1>
        {error && <p className="text-red-500 mb-4">{error}</p>}
        {success && <p className="text-green-500 mb-4">{success}</p>}

        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700">Trailer ID</label>
          <input
            type="text"
            value={trailerId}
            onChange={(e) => setTrailerId(e.target.value)}
            className="w-full px-2 py-1 border rounded"
            placeholder="Enter Trailer ID"
          />
        </div>

        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700">Cooler Temp (°F)</label>
          <input
            type="number"
            value={clrTemp}
            onChange={(e) => setClrTemp(e.target.value)}
            className="w-full px-2 py-1 border rounded"
            placeholder="Enter Cooler Temp"
          />
        </div>

        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700">Freezer Temp (°F)</label>
          <input
            type="number"
            value={fzrTemp}
            onChange={(e) => setFzrTemp(e.target.value)}
            className="w-full px-2 py-1 border rounded"
            placeholder="Enter Freezer Temp"
          />
        </div>

        <div className="flex justify-between">
          <button
            onClick={handleSubmit}
            className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-500"
          >
            Submit
          </button>
          <button
            onClick={() => navigate("/landing")}
            className="px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-500"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
};

export default TempCheck;
