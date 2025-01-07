import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { firestore } from "../firebase";
import { collection, getDocs, addDoc } from "firebase/firestore";
import Select from "react-select"; // Install react-select using `npm install react-select`

const NotifyReady = () => {
  const [formData, setFormData] = useState({
    trailer_id: "",
    from_wh_yard: "",
    from_door: "",
  });
  const [locations, setLocations] = useState([]);
  const [trailers, setTrailers] = useState([]); // Store trailer options
  const [error, setError] = useState(null);
  const [successMessage, setSuccessMessage] = useState(null);
  const [currentTime, setCurrentTime] = useState(""); // State for current time
  const navigate = useNavigate();

  useEffect(() => {
    // Fetch trailer list
    const fetchTrailers = async () => {
      try {
        const snapshot = await getDocs(collection(firestore, "trailer_master"));
        const trailerOptions = snapshot.docs.map((doc) => ({
          value: doc.data().id, // Trailer ID
          label: doc.data().id, // Display ID in dropdown
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
        const response = await fetch("http://127.0.0.1:8000/locations"); // Ensure correct URL
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
    
    // Update current time
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

    fetchTrailers();
    fetchLocations();
    updateTime(); // Initial update

    // Refresh the current time every second
    const interval = setInterval(updateTime, 1000);

    return () => clearInterval(interval); // Cleanup interval on unmount
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
      // Automatically add a timestamp during submission
      const timestampEST = currentTime;

      await addDoc(collection(firestore, "moves"), {
        ...formData,
        timestamp: timestampEST, // Use timestamp from frontend
        user_id: "currentUserId", // Replace with the actual user ID
      });

      setSuccessMessage("Move recorded successfully!");
      setFormData({
        trailer_id: "",
        from_wh_yard: "",
        from_door: "",
      });
    } catch (err) {
      console.error("Error adding move:", err);
      setError("Failed to record the move. Please try again.");
    }
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gray-100">
      <div className="w-full max-w-md p-6 bg-white rounded-lg shadow-md">
        <h1 className="text-2xl font-bold mb-4">Notify Ready</h1>
        {error && <p className="text-red-500">{error}</p>}
        {successMessage && <p className="text-green-500">{successMessage}</p>}
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
