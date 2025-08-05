import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import { auth } from "../firebase.js";

const AdminTasks = () => {
  const [collection, setCollection] = useState("user_master");
  const [records, setRecords] = useState([]);
  const [filteredRecords, setFilteredRecords] = useState([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [searchColumn, setSearchColumn] = useState("all");
  const [newRecord, setNewRecord] = useState({});
  const [showAddForm, setShowAddForm] = useState(false);
  const [addMethod, setAddMethod] = useState("individual");
  const [file, setFile] = useState(null);
  const [error, setError] = useState(null);

  // States for edit and delete functionality
  const [editingRecord, setEditingRecord] = useState(null);
  const [editData, setEditData] = useState({});
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(null);

  // States for manual loading
  const [dataLoaded, setDataLoaded] = useState(false);
  const [locations, setLocations] = useState([]);

  const navigate = useNavigate();

  // Updated schema - removed permissions, made id optional, added locations
  const schema = {
    user_master: ["name", "email", "role"], // removed "id" and "permissions"
    trailer_master: ["year", "length", "manufacturer", "roll_up_door", "reefer", "zones"], // removed "id"
    moves: ["from_door", "from_wh_yard", "status", "timestamp", "to_door", "to_location", "trailer_id", "user_id"], // removed "id"
    temperature_checks: ["clr_temp", "fzr_temp", "timestamp", "trailer_id", "user_id"], // removed "id"
    load_submission: ["from_door", "from_wh", "trailer_id", "user_id"], // removed "id"
    inbound_pos: ["po_numbers", "status", "timestamp", "trailer_id"], // removed "id"
    locations: ["name", "type", "capacity"] // New locations collection
  };

  // Load locations on component mount
  useEffect(() => {
    const loadLocations = async () => {
      try {
        const response = await axios.get(`${import.meta.env.VITE_API_BASE_URL}/locations`);
        setLocations(response.data.locations || []);
      } catch (err) {
        console.error("Error fetching locations:", err);
      }
    };
    loadLocations();
  }, []);

  // Manual fetch records function - only called when button is pressed
  const fetchRecords = async () => {
    try {
      const user = auth.currentUser;
      if (!user) {
        console.warn("No authenticated user found during fetchRecords.");
        navigate("/");
        return;
      }

      const token = await user.getIdToken();

      // Special handling for locations
      if (collection === "locations") {
        // Create mock location records from the locations array
        const locationRecords = locations.map((location, index) => ({
          id: `loc_${index}`,
          name: location,
          type: "warehouse", // default type
          capacity: "Unknown" // default capacity
        }));
        setRecords(locationRecords);
        setFilteredRecords(locationRecords);
        setDataLoaded(true);
        return;
      }

      const response = await axios.get(
        `${import.meta.env.VITE_API_BASE_URL}/fetch-data?collection=${collection}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );

      setRecords(response.data.data || []);
      setFilteredRecords(response.data.data || []);
      setDataLoaded(true);
      console.log("Fetched records:", response.data.data);
    } catch (err) {
      console.error("Error fetching records:", err);
      setError("Failed to fetch records. Please check the backend service or network connection.");
    }
  };

  // Reset data when collection changes
  useEffect(() => {
    setRecords([]);
    setFilteredRecords([]);
    setDataLoaded(false);
    setError(null);
  }, [collection]);

  const handleSearch = () => {
    if (searchTerm.trim() === "" || searchTerm.trim() === "*") {
      setFilteredRecords(records);
      return;
    }

    setFilteredRecords(
      searchColumn === "all"
        ? records.filter((record) =>
            schema[collection].some((key) =>
              record[key]?.toString().toLowerCase().includes(searchTerm.toLowerCase())
            )
          )
        : records.filter((record) =>
            record[searchColumn]?.toString().toLowerCase().includes(searchTerm.toLowerCase())
          )
    );
  };

  const handleAddRecord = async () => {
    // Only check required fields (id is now optional)
    const requiredFields = schema[collection];
    for (const field of requiredFields) {
      if (!newRecord[field] || newRecord[field].trim() === "") {
        alert(`Please fill in the required field: ${field}`);
        return;
      }
      if (["roll_up_door", "reefer"].includes(field) && !["Y", "N"].includes(newRecord[field])) {
        alert(`Please select a valid option (Y/N) for ${field}`);
        return;
      }
    }

    // Generate ID if not provided
    const recordData = {
      id: newRecord.id || `${collection}_${Date.now()}`, // Auto-generate ID if not provided
      ...newRecord,
      ...(collection === "temperature_checks" && {
        clr_temp: parseFloat(newRecord.clr_temp),
        fzr_temp: parseFloat(newRecord.fzr_temp),
      }),
      ...(collection === "inbound_pos" && {
        po_numbers: parseInt(newRecord.po_numbers, 10),
      }),
    };

    try {
      const user = auth.currentUser;
      if (!user) {
        alert("User not authenticated. Please log in.");
        navigate("/");
        return;
      }

      const token = await user.getIdToken();

      if (collection === "user_master") {
        const payload = {
          email: newRecord.email,
          password: newRecord.password,
          name: newRecord.name,
          role: newRecord.role,
          // Removed permissions from payload
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
      } else if (collection === "locations") {
        // Handle locations specially - this would typically update a config
        alert("Locations are managed through configuration. Please contact an administrator to add new locations.");
        return;
      } else {
        const payload = { collection, data: [recordData] };
        const response = await axios.post(
          `${import.meta.env.VITE_API_BASE_URL}/add-record`,
          payload,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        console.log("Record added:", response.data);
        alert("Record added successfully!");
      }

      fetchRecords();
      setNewRecord({});
      setShowAddForm(false);
    } catch (err) {
      console.error("Error adding record:", err);
      alert(err.response?.data?.detail || "Failed to add record.");
    }
  };

  const handleDeleteRecord = async (recordId) => {
    try {
      const user = auth.currentUser;
      if (!user) {
        alert("User not authenticated. Please log in.");
        navigate("/");
        return;
      }

      if (collection === "locations") {
        alert("Locations cannot be deleted from this interface. Please contact an administrator.");
        setShowDeleteConfirm(null);
        return;
      }

      const token = await user.getIdToken();
      const response = await axios.delete(
        `${import.meta.env.VITE_API_BASE_URL}/delete?collection=${collection}&id=${recordId}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );

      console.log("Delete response:", response.data);
      alert("Record deleted successfully!");

      fetchRecords();
      setShowDeleteConfirm(null);
    } catch (err) {
      console.error("Error deleting record:", err);
      alert(err.response?.data?.detail || "Failed to delete record.");
      setShowDeleteConfirm(null);
    }
  };

  const handleEditRecord = async () => {
    try {
      const user = auth.currentUser;
      if (!user) {
        alert("User not authenticated. Please log in.");
        navigate("/");
        return;
      }

      if (collection === "locations") {
        alert("Locations cannot be edited from this interface. Please contact an administrator.");
        setEditingRecord(null);
        return;
      }

      const token = await user.getIdToken();
      const response = await axios.put(
        `${import.meta.env.VITE_API_BASE_URL}/update?collection=${collection}&id=${editingRecord.id}`,
        editData,
        { headers: { Authorization: `Bearer ${token}` } }
      );

      console.log("Update response:", response.data);
      alert("Record updated successfully!");

      fetchRecords();
      setEditingRecord(null);
      setEditData({});
    } catch (err) {
      console.error("Error updating record:", err);
      alert(err.response?.data?.detail || "Failed to update record.");
    }
  };

  const startEdit = (record) => {
    setEditingRecord(record);
    setEditData({ ...record });
  };

  const cancelEdit = () => {
    setEditingRecord(null);
    setEditData({});
  };

  const handleUploadExcel = async () => {
    if (!file) {
      alert("Please select an Excel file to upload.");
      return;
    }

    if (collection === "locations") {
      alert("Locations cannot be uploaded via Excel. Please contact an administrator.");
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

      const response = await axios.post(
        `${import.meta.env.VITE_API_BASE_URL}/upload-excel`,
        formData,
        { headers: { Authorization: `Bearer ${token}` } }
      );

      console.log("File upload response:", response.data);
      alert("File uploaded successfully!");
      fetchRecords();
      setFile(null);
    } catch (err) {
      console.error("Error uploading file:", err);
      alert(err.response?.data?.detail || "Failed to upload file.");
    }
  };

  const renderTable = () => {
    if (!dataLoaded) {
      return (
        <div className="text-center py-8">
          <p className="text-gray-600 mb-4">Click "Load Data" to fetch records for the selected collection.</p>
          <button
            onClick={fetchRecords}
            className="px-6 py-3 bg-indigo-600 text-white rounded-lg hover:bg-indigo-500"
          >
            Load Data
          </button>
        </div>
      );
    }

    if (!filteredRecords.length) return <p>No records found.</p>;

    // Include id column in display (even though it's optional for creation)
    const displayColumns = ["id", ...schema[collection]];

    return (
      <div className="overflow-x-auto">
        <table className="min-w-full bg-white border-collapse border border-gray-200">
          <thead>
            <tr>
              {displayColumns.map((key) => (
                <th key={key} className="border px-4 py-2 bg-gray-50">
                  {key}
                </th>
              ))}
              <th className="border px-4 py-2 bg-gray-50">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredRecords.map((record, index) => (
              <tr key={record.id || index}>
                {displayColumns.map((key) => (
                  <td key={key} className="border px-4 py-2">
                    {editingRecord && editingRecord.id === record.id ? (
                      // Edit mode
                      key === "id" ? (
                        // ID field is read-only during edit
                        <span className="text-gray-500">{record[key] || ""}</span>
                      ) : (
                        <input
                          type="text"
                          value={editData[key] || ""}
                          onChange={(e) => setEditData({ ...editData, [key]: e.target.value })}
                          className="w-full px-2 py-1 border rounded"
                        />
                      )
                    ) : (
                      // View mode
                      record[key] || ""
                    )}
                  </td>
                ))}
                <td className="border px-4 py-2">
                  {editingRecord && editingRecord.id === record.id ? (
                    // Edit mode buttons
                    <div className="flex space-x-2">
                      <button
                        onClick={handleEditRecord}
                        className="px-2 py-1 bg-green-600 text-white rounded hover:bg-green-500 text-sm"
                      >
                        Save
                      </button>
                      <button
                        onClick={cancelEdit}
                        className="px-2 py-1 bg-gray-600 text-white rounded hover:bg-gray-500 text-sm"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    // View mode buttons
                    <div className="flex space-x-2">
                      <button
                        onClick={() => startEdit(record)}
                        className="px-2 py-1 bg-blue-600 text-white rounded hover:bg-blue-500 text-sm"
                        disabled={collection === "locations"}
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => setShowDeleteConfirm(record)}
                        className="px-2 py-1 bg-red-600 text-white rounded hover:bg-red-500 text-sm"
                        disabled={collection === "locations"}
                      >
                        Delete
                      </button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-gray-100 p-4">
      <h1 className="text-2xl font-bold mb-4">Admin Tasks</h1>
      {error && <p className="text-red-500 mb-4">{error}</p>}

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
          <label className="block text-sm font-medium text-gray-700">Select Collection:</label>
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

        {/* Load Data Button - only show if data not loaded */}
        {!dataLoaded && (
          <div className="mb-4">
            <button
              onClick={fetchRecords}
              className="px-6 py-3 bg-indigo-600 text-white rounded-lg hover:bg-indigo-500"
            >
              Load Data for {collection.replace("_", " ").toUpperCase()}
            </button>
          </div>
        )}

        {/* Search and other controls - only show if data is loaded */}
        {dataLoaded && (
          <>
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700">Search:</label>
              <div className="flex items-center">
                <select
                  value={searchColumn}
                  onChange={(e) => setSearchColumn(e.target.value)}
                  className="mr-2 px-2 py-1 border"
                >
                  <option value="all">All Columns</option>
                  <option value="id">ID</option>
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
                  onClick={handleSearch}
                  className="ml-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-500"
                >
                  Search
                </button>
              </div>
            </div>

            <div className="mb-4 flex space-x-2">
              <button
                onClick={fetchRecords}
                className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-500"
              >
                Refresh Data
              </button>
              {!showAddForm && collection !== "locations" && (
                <button
                  onClick={() => setShowAddForm(true)}
                  className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-500"
                >
                  Add Record
                </button>
              )}
            </div>
          </>
        )}

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
                {/* Optional ID field */}
                <div className="mb-2">
                  <label className="block text-sm font-medium text-gray-700">
                    ID (optional - will auto-generate if empty):
                  </label>
                  <input
                    value={newRecord.id || ""}
                    onChange={(e) => setNewRecord({ ...newRecord, id: e.target.value })}
                    className="w-full px-2 py-1 border"
                    type="text"
                    placeholder="Leave empty to auto-generate"
                  />
                </div>

                {schema[collection].map((key) => (
                  <div key={key} className="mb-2">
                    <label className="block text-sm font-medium text-gray-700">{key}:</label>
                    {key === "role" && collection === "user_master" ? (
                      <select
                        value={newRecord[key] || ""}
                        onChange={(e) => setNewRecord({ ...newRecord, [key]: e.target.value })}
                        className="w-full px-2 py-1 border"
                      >
                        <option value="">Select Role</option>
                        <option value="admin">Admin</option>
                        <option value="yard">Yard</option>
                        <option value="loader">Loader</option>
                      </select>
                    ) : (
                      <input
                        value={newRecord[key] || ""}
                        onChange={(e) => setNewRecord({ ...newRecord, [key]: e.target.value })}
                        className="w-full px-2 py-1 border"
                        type="text"
                      />
                    )}
                  </div>
                ))}

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

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white p-6 rounded-lg shadow-lg max-w-md w-full mx-4">
            <h3 className="text-lg font-bold mb-4">Confirm Delete</h3>
            <p className="mb-4">
              Are you sure you want to delete this record?
              {showDeleteConfirm.name && (
                <span className="font-semibold"> ({showDeleteConfirm.name})</span>
              )}
              {showDeleteConfirm.id && (
                <span className="font-semibold"> (ID: {showDeleteConfirm.id})</span>
              )}
            </p>
            <p className="text-red-600 text-sm mb-4">This action cannot be undone.</p>
            <div className="flex justify-end space-x-2">
              <button
                onClick={() => setShowDeleteConfirm(null)}
                className="px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-500"
              >
                Cancel
              </button>
              <button
                onClick={() => handleDeleteRecord(showDeleteConfirm.id)}
                className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-500"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminTasks;