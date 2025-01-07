import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import { auth } from "../firebase.js";



const AdminTasks = () => {
  const [collection, setCollection] = useState("user_master"); // Default collection
  const [records, setRecords] = useState([]);
  const [filteredRecords, setFilteredRecords] = useState([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [searchColumn, setSearchColumn] = useState("all");
  const [newRecord, setNewRecord] = useState({}); // For adding a new record
  const [showAddForm, setShowAddForm] = useState(false); // Toggle for Add Record form
  const [addMethod, setAddMethod] = useState("individual"); // Add method toggle
  const [file, setFile] = useState(null); // File for Excel upload
  const [error, setError] = useState(null);

  const navigate = useNavigate();

  const schema = {
    trailer_master: [
      "id",          // String
      "year",        // String
      "length",      // String
      "manufacturer", // String
      "roll_up_door", // String ("Y" or "N")
      "reefer",      // String ("Y" or "N")
      "zones"        // String
    ],
    user_master: [
      "id",          // String
      "name",        // String
      "email",       // String
      "role",        // String
      "permissions"  // String
    ],
    moves: [
      "from_door",     // String
      "from_wh_yard",  // String
      "status",        // String
      "timestamp",     // Timestamp
      "to_door",       // String
      "to_location",   // String
      "trailer_id",    // String
      "user_id"        // String
    ],
    temperature_checks: [
      "clr_temp",    // Number
      "fzr_temp",    // Number
      "id",          // String
      "timestamp",   // Timestamp
      "trailer_id",  // String
      "user_id"      // String
    ],
    load_submission: [
      "from_door",   // String
      "from_wh",     // String
      "id",          // String
      "trailer_id",  // String
      "user_id"      // String
    ],
    inbound_pos: [
      "id",           // String
      "po_numbers",   // Number
      "status",       // String
      "timestamp",    // Timestamp
      "trailer_id"    // String
    ]
  };
  

  const fetchRecords = async () => {
    try {
      const user = auth.currentUser;

      if (!user) {
        console.warn("No authenticated user found during fetchRecords.");
        navigate("/");
        return;
      }

      const token = await user.getIdToken();
      console.log("Token fetched manually in fetchRecords:", token);

      const response = await axios.get(
        `${import.meta.env.VITE_API_BASE_URL}/fetch-data?collection=${collection}`,
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );

      setRecords(response.data.data || []);
      setFilteredRecords(response.data.data || []);
      console.log("Fetched records:", response.data.data);
    } catch (err) {
      console.error("Error fetching records:", err);
      setError("Failed to fetch records. Please check the backend service or network connection.");
    }
  };

  useEffect(() => {
    const checkUser = async () => {
      const user = auth.currentUser;
  
      if (!user) {
        console.warn("No authenticated user. Redirecting to login.");
        navigate("/");
      }
    };
  
    checkUser();
  }, []);

  const handleSearch = () => {
    if (searchTerm.trim() === "" || searchTerm.trim() === "*") {
      setFilteredRecords(records); // Show all records if search term is blank or "*"
      return;
    }

    if (searchColumn === "all") {
      // Filter by all columns
      setFilteredRecords(
        records.filter((record) =>
          schema[collection].some((field) =>
            record[field]?.toString().toLowerCase().includes(searchTerm.toLowerCase())
          )
        )
      );
    } else {
      // Filter by the selected column only
      setFilteredRecords(
        records.filter((record) =>
          record[searchColumn]?.toString().toLowerCase().includes(searchTerm.toLowerCase())
        )
      );
    }
  };

  const handleAddRecord = async () => {
    const requiredFields = schema[collection];
  
    // Validate required fields
    for (const field of requiredFields) {
      if (!newRecord[field] || newRecord[field].trim() === "") {
        alert(`Please fill in the required field: ${field}`);
        return;
      }
    }
  
    // If adding a user, validate email and password
    if (collection === "user_master") {
      if (!newRecord.email || !newRecord.password) {
        alert("Please provide both email and password for the user.");
        return;
      }
    }
  
    try {
      const user = auth.currentUser;
      if (!user) {
        alert("User not authenticated. Please log in.");
        navigate("/");
        return;
      }
  
      const token = await user.getIdToken();
  
      // If adding a user, call the `/create-auth-user` backend endpoint
      if (collection === "user_master") {
        const payload = {
          email: newRecord.email,
          password: newRecord.password,
          name: newRecord.name,
          role: newRecord.role,
          permissions: newRecord.permissions,
        };
  
        try {
          const response = await axios.post(
            `${import.meta.env.VITE_API_BASE_URL}/create-auth-user`,
            payload,
            { headers: { Authorization: `Bearer ${token}` } }
          );
  
          console.log("User added to Firebase Auth and Firestore:", response.data);
          alert("User added successfully!");
        } catch (error) {
          console.error("Error creating user:", error);
          alert("Failed to create user. Please check your input or try again.");
          return;
        }
      }
  
      // Clear the form and refresh records
      fetchRecords();
      setNewRecord({});
      setShowAddForm(false);
    } catch (err) {
      console.error("Error adding record:", err);
      alert(err.response?.data?.detail || "Failed to add record.");
    }
  };

  

  const handleUploadExcel = async () => {
    if (!file) {
      alert("Please select an Excel file to upload.");
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

      const formData = new FormData();
      formData.append("file", file);
      formData.append("collection", collection);

      console.log("Uploading file to collection:", collection);
      const response = await axios.post(
        `${import.meta.env.VITE_API_BASE_URL}/upload-excel`,
        formData,
        { headers: { Authorization: `Bearer ${token}` } }
      );

      console.log("File upload response:", response.data);
      alert("File uploaded successfully!");

      fetchRecords(); // Refresh records after successful upload
      setFile(null); // Reset the file input
    } catch (err) {
      console.error("Error uploading file:", err);
      alert(err.response?.data?.detail || "Failed to upload file.");
    }
  };

  const renderTable = () => {
    if (!filteredRecords.length) return <p>No records found.</p>;

    return (
      <table className="min-w-full bg-white border-collapse border border-gray-200">
        <thead>
          <tr>
            {schema[collection].map((key) => (
              <th key={key} className="border px-4 py-2">
                {key}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {filteredRecords.map((record, index) => (
            <tr key={index}>
              {schema[collection].map((key) => (
                <td key={key} className="border px-4 py-2">
                  {record[key] || ""}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    );
  };

  return (
    <div className="min-h-screen bg-gray-100 p-4">
      <h1 className="text-2xl font-bold mb-4">Admin Tasks</h1>
      {error && <p className="text-red-500">{error}</p>}
      <div className="bg-white p-6 rounded-lg shadow-md">
        <div className="mb-4">
          <button
            onClick={() => navigate("/landing")}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-500"
          >
            Home
          </button>
        </div>

        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700">Select Table:</label>
          <select
            value={collection}
            onChange={(e) => setCollection(e.target.value)}
            className="w-full px-2 py-1 border"
          >
            {Object.keys(schema).map((table) => (
              <option key={table} value={table}>
                {table.replace("_", " ").toUpperCase()}
              </option>
            ))}
          </select>
        </div>

        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700">Search:</label>
          <div className="flex items-center">
            <select
              value={searchColumn}
              onChange={(e) => setSearchColumn(e.target.value)}
              className="mr-2 px-2 py-1 border"
            >
              <option value="all">All Columns</option>
              {schema[collection].map((column) => (
                <option key={column} value={column}>
                  {column}
                </option>
              ))}
            </select>
            <input
              type="text"
              placeholder="Search records..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="flex-grow px-2 py-1 border"
            />
            <button
              onClick={() => {
                fetchRecords();
                handleSearch();
              }}
              className="ml-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-500"
            >
              Search
            </button>

          </div>
        </div>

        <div className="mb-4">
          {!showAddForm && (
            <button
              onClick={() => setShowAddForm(true)}
              className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-500"
            >
              Add Record
            </button>
          )}
        </div>

        {showAddForm && (
          <div className="mb-4 border p-4 rounded-lg bg-gray-50">
            <h2 className="text-lg font-medium">Add New Record</h2>

            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700">Add Method:</label>
              <select
                onChange={(e) => setAddMethod(e.target.value)}
                className="w-full px-2 py-1 border"
              >
                <option value="individual">Individual Record</option>
                <option value="excel">Excel Upload</option>
              </select>
            </div>

            {addMethod === "individual" && (
  <>
    {schema[collection].map((key) => (
  <div key={key} className="mb-2">
    <label className="block text-sm font-medium text-gray-700">{key}:</label>
    {key === "role" && collection === "user_master" ? (
      // Dropdown for role selection
      <select
        value={newRecord[key] || ""}
        onChange={(e) => setNewRecord({ ...newRecord, [key]: e.target.value })}
        className="w-full px-2 py-1 border"
      >
        <option value="">Select Role</option>
        <option value="Admin">Admin</option>
        <option value="Yard">Yard</option>
        <option value="Load">Load</option>
      </select>
    ) : (
      // Regular input for other fields
      <input
        value={newRecord[key] || ""}
        onChange={(e) => setNewRecord({ ...newRecord, [key]: e.target.value })}
        className="w-full px-2 py-1 border"
        type="text"
      />
    )}
  </div>
))}


    {/* Add Email and Password fields for user_master */}
    {collection === "user_master" && (
      <>
        <div className="mb-2">
          <label className="block text-sm font-medium text-gray-700">Email:</label>
          <input
            value={newRecord.email || ""}
            onChange={(e) => setNewRecord({ ...newRecord, email: e.target.value })}
            className="w-full px-2 py-1 border"
            type="email"
          />
        </div>
        <div className="mb-2">
          <label className="block text-sm font-medium text-gray-700">Password:</label>
          <input
            value={newRecord.password || ""}
            onChange={(e) => setNewRecord({ ...newRecord, password: e.target.value })}
            className="w-full px-2 py-1 border"
            type="password"
          />
        </div>
      </>
    )}

    <div className="flex justify-end">
      <button
        onClick={handleAddRecord}
        className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-500 mr-2"
      >
        Submit
      </button>
      <button
        onClick={() => setShowAddForm(false)}
        className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-500"
      >
        Cancel
      </button>
    </div>
  </>
)}

            {addMethod === "excel" && (
              <>
                <div className="mb-2">
                  <label className="block text-sm font-medium text-gray-700">Upload Excel File:</label>
                  <input
                    type="file"
                    accept=".xlsx, .xls"
                    onChange={(e) => setFile(e.target.files[0])}
                    className="w-full px-2 py-1 border"
                  />
                </div>
                <div className="flex justify-end">
                  <button
                    onClick={handleUploadExcel}
                    className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-500 mr-2"
                  >
                    Upload
                  </button>
                  <button
                    onClick={() => setShowAddForm(false)}
                    className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-500"
                  >
                    Cancel
                  </button>
                </div>
              </>
            )}
          </div>
        )}

        {renderTable()}
      </div>
    </div>
  );
};

export default AdminTasks;

