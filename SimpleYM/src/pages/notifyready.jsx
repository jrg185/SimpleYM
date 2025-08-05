import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { firestore } from "../firebase";
import { collection, getDocs, addDoc } from "firebase/firestore";
import Select from "react-select";
import { API_BASE_URL } from '../config';

const NotifyReady = () => {
  const [formData, setFormData] = useState({
    trailer_id: "",
    from_wh_yard: "",
    from_door: "",
  });
  const [locations, setLocations] = useState([]);
  const [trailers, setTrailers] = useState([]);
  const [error, setError] = useState(null);
  const [successMessage, setSuccessMessage] = useState(null);
  const [currentTime, setCurrentTime] = useState("");
  const navigate = useNavigate();

  useEffect(() => {
    // Fetch trailer list
    const fetchTrailers = async () => {
      try {
        const snapshot = await getDocs(collection(firestore, "trailer_master"));
        const trailerOptions = snapshot.docs.map((doc) => ({
          value: doc.data().id,
          label: doc.data().id,
        }));
        setTrailers(trailerOptions);
      } catch (err) {
        console.error("Error fetching trailers:", err);
        setError("Failed to load trailers. Please try again.");
      }
    };

    // Fetch locations
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

    // Fetch current time from backend
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
        // Fallback to local time if backend is unavailable
        updateLocalTime();
      }
    };

    // Fallback: Update current time locally
    const updateLocalTime = () => {
      const options = { timeZone: "America/New_York", hour12: true };
      const formatter = new Intl.DateTimeFormat("en-US", {
        ...options,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      });
      setCurrentTime(formatter.format(new Date()));
    };

    fetchTrailers();
    fetchLocations();
    fetchCurrentTime();

    // Refresh the current time every minute
    const interval = setInterval(fetchCurrentTime, 60000);

    return () => clearInterval(interval);
  }, []);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData({ ...formData, [name]: value });
  };

  const handleTrailerChange = (selectedOption) => {
    setFormData({ ...formData, trailer_id: selectedOption.value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!formData.trailer_id || !formData.from_wh_yard || !formData.from_door) {
      setError("All fields are required!");
      return;
    }

    try {
      // Get fresh timestamp from backend for submission
      const timeResponse = await fetch(`${API_BASE_URL}/current-time`);
      const timeData = await timeResponse.json();
      const timestamp = timeData.current_time;

      await addDoc(collection(firestore, "moves"), {
        ...formData,
        timestamp: timestamp,
        user_id: "currentUserId", // TODO: Replace with actual user ID
      });

      setSuccessMessage("Move recorded successfully!");
      setFormData({
        trailer_id: "",
        from_wh_yard: "",
        from_door: "",
      });
      setError(null);
    } catch (err) {
      console.error("Error adding move:", err);
      setError("Failed to record the move. Please try again.");
      setSuccessMessage(null);
    }
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gray-100">
      <div className="w-full max-w-md p-6 bg-white rounded-lg shadow-md">
        <h1 className="text-2xl font-bold mb-4">Notify Ready</h1>
        {error && <p className="text-red-500 mb-4">{error}</p>}
        {successMessage && <p className="text-green-500 mb-4">{successMessage}</p>}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium">Trailer ID:</label>
            <Select
              options={trailers}
              onChange={handleTrailerChange}
              placeholder="Select or type trailer ID"
              className="w-full"
              isSearchable
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium">From Location:</label>
            <select
              name="from_wh_yard"
              value={formData.from_wh_yard}
              onChange={handleChange}
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
            <label className="block text-sm font-medium">From Door:</label>
            <input
              type="text"
              name="from_door"
              value={formData.from_door}
              onChange={handleChange}
              className="w-full px-3 py-2 border rounded-lg"
              required
            />
          </div>
          <button
            type="submit"
            className="w-full px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-500"
          >
            Submit
          </button>
        </form>
        <button
          onClick={() => navigate("/landing")}
          className="mt-4 w-full px-4 py-2 bg-gray-500 text-white rounded-lg hover:bg-gray-400"
        >
          Back to Home
        </button>
      </div>

      {/* Current Time Display */}
      <div className="mt-6 text-center">
        <p className="text-lg text-gray-600">
          Current Time: <span className="font-bold">{currentTime || "Loading..."}</span>
        </p>
      </div>
    </div>
  );
};

export default NotifyReady;