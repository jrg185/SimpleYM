import React, { useState, useEffect } from "react";
import { collection, query, where, getDocs, orderBy } from "firebase/firestore";
import { firestore } from "../firebase";
import { saveAs } from "file-saver";
import * as XLSX from "xlsx";
import { format, differenceInMinutes } from "date-fns";
import { useNavigate } from "react-router-dom";

const Dashboard = () => {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState("openMoves");
  const [openMovesList, setOpenMovesList] = useState([]);
  const [recentMoves, setRecentMoves] = useState([]);
  const [tempCheckList, setTempCheckList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Filters
  const [openMovesFilter, setOpenMovesFilter] = useState({
    trailer_id: "",
    from_warehouse: "",
    from_door: "",
    relativeTime: "",
  });
  const [recentMovesFilter, setRecentMovesFilter] = useState({
    trailer_id: "",
    from_warehouse: "",
    to_warehouse: "",
    user_id: "",
    relativeTime: "",
  });
  const [tempCheckFilter, setTempCheckFilter] = useState({
    trailer_id: "",
    user_id: "",
    relativeTime: "",
  });

  const WAREHOUSE_OPTIONS = [
    "FRZ",
    "CLR",
    "SEAS",
    "DRY FRONT",
    "DRY BACK",
    "WAWA",
    "YARD",
    "HRTHSDE",
  ];

  useEffect(() => {
    const fetchDashboardData = async () => {
      setLoading(true);
      try {
        // Fetch Open Moves
        const movesCollection = collection(firestore, "moves");
        const openMovesQuery = query(movesCollection, where("status", "==", "open"));
        const openMovesSnapshot = await getDocs(openMovesQuery);
        setOpenMovesList(
          openMovesSnapshot.docs.map((doc) => {
            const data = doc.data();
            return {
              ...data,
              minutesSinceSubmission: differenceInMinutes(new Date(), new Date(data.timestamp)),
            };
          })
        );

        // Fetch Recent Moves
        const recentMovesQuery = query(
          movesCollection,
          where("status", "==", "completed"),
          orderBy("timestamp", "desc")
        );
        const recentMovesSnapshot = await getDocs(recentMovesQuery);
        setRecentMoves(
          recentMovesSnapshot.docs.map((doc) => {
            const data = doc.data();
            return {
              ...data,
              relativeTime: differenceInMinutes(new Date(), new Date(data.timestamp)),
            };
          })
        );

        // Fetch Temp Checks
        const tempCheckCollection = collection(firestore, "temperature_checks");
        const tempCheckQuery = query(tempCheckCollection, orderBy("timestamp", "desc"));
        const tempCheckSnapshot = await getDocs(tempCheckQuery);
        setTempCheckList(tempCheckSnapshot.docs.map((doc) => {
          const data = doc.data();
          return {
            ...data,
            relativeTime: differenceInMinutes(new Date(), new Date(data.timestamp)),
          };
        }));
      } catch (err) {
        console.error("Error fetching dashboard data:", err);
        setError("Failed to fetch dashboard data. Please try again later.");
      } finally {
        setLoading(false);
      }
    };

    fetchDashboardData();
  }, []);

  const handleExport = (data, fileName) => {
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Sheet1");
    const excelBuffer = XLSX.write(wb, { bookType: "xlsx", type: "array" });
    const blob = new Blob([excelBuffer], { type: "application/octet-stream" });
    saveAs(blob, `${fileName}_${format(new Date(), "yyyyMMdd_HHmmss")}.xlsx`);
  };

  const applyFilters = (data, filters) => {
    return data.filter((item) => {
      return Object.entries(filters).every(([key, value]) => {
        if (!value.trim()) return true; // Skip empty filters
        if (key === "relativeTime" && value) {
          return differenceInMinutes(new Date(), new Date(item.timestamp)) <= parseInt(value, 10);
        }
        return item[key]?.toString().toLowerCase().includes(value.toLowerCase());
      });
    });
  };

  const renderList = (data, filters) =>
    applyFilters(data, filters).map((item, index) => (
      <li key={index} className="border p-2 mb-2">
        {Object.entries(item).map(([key, value]) => (
          <div key={key}>
            <strong>{key.replace("_", " ").replace(/\b\w/g, (c) => c.toUpperCase())}:</strong>{" "}
            {key === "timestamp" ? format(new Date(value), "yyyy-MM-dd hh:mm:ss a") : value || "N/A"}
          </div>
        ))}
      </li>
    ));

  if (loading) {
    return <p className="text-center mt-6 text-lg">Loading Dashboard...</p>;
  }

  return (
    <div className="min-h-screen bg-gray-100 p-4">
      <h1 className="text-2xl font-bold mb-4">Dashboard</h1>
      {error && <p className="text-red-500">{error}</p>}

      {/* Navigation Buttons */}
      <div className="mb-4 flex gap-4">
        <button
          onClick={() => navigate("/landing")}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-500"
        >
          Home
        </button>
        <button
          onClick={() => navigate(-1)}
          className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-500"
        >
          Cancel
        </button>
      </div>

      {/* Tab Buttons */}
      <div className="mb-4 flex gap-4">
        <button
          onClick={() => setActiveTab("openMoves")}
          className={`px-4 py-2 rounded-lg ${
            activeTab === "openMoves" ? "bg-indigo-600 text-white" : "bg-gray-200"
          }`}
        >
          Open Moves
        </button>
        <button
          onClick={() => setActiveTab("recentMoves")}
          className={`px-4 py-2 rounded-lg ${
            activeTab === "recentMoves" ? "bg-indigo-600 text-white" : "bg-gray-200"
          }`}
        >
          Recent Moves
        </button>
        <button
          onClick={() => setActiveTab("tempChecks")}
          className={`px-4 py-2 rounded-lg ${
            activeTab === "tempChecks" ? "bg-indigo-600 text-white" : "bg-gray-200"
          }`}
        >
          Temp Checks
        </button>
      </div>

      {/* Open Moves */}
      {activeTab === "openMoves" && (
        <div className="mb-6">
          <h2 className="text-lg font-semibold">Open Moves</h2>
          <div className="mb-4 grid grid-cols-4 gap-4">
            <input
              type="text"
              placeholder="Trailer ID"
              value={openMovesFilter.trailer_id}
              onChange={(e) =>
                setOpenMovesFilter({ ...openMovesFilter, trailer_id: e.target.value })
              }
              className="border p-2"
            />
            <select
              value={openMovesFilter.from_warehouse}
              onChange={(e) =>
                setOpenMovesFilter({ ...openMovesFilter, from_warehouse: e.target.value })
              }
              className="border p-2"
            >
              <option value="">Select Warehouse</option>
              {WAREHOUSE_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
            <input
              type="text"
              placeholder="From Door"
              value={openMovesFilter.from_door}
              onChange={(e) =>
                setOpenMovesFilter({ ...openMovesFilter, from_door: e.target.value })
              }
              className="border p-2"
            />
            <input
              type="number"
              placeholder="Minutes Since Submission"
              value={openMovesFilter.relativeTime}
              onChange={(e) =>
                setOpenMovesFilter({ ...openMovesFilter, relativeTime: e.target.value })
              }
              className="border p-2"
            />
          </div>
          <button
            onClick={() => handleExport(openMovesList, "Open_Moves")}
            className="mt-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-500"
          >
            Export Open Moves
          </button>
          <ul>{renderList(openMovesList, openMovesFilter)}</ul>
        </div>
      )}

      {/* Recent Moves */}
      {activeTab === "recentMoves" && (
        <div className="mb-6">
          <h2 className="text-lg font-semibold">Recent Moves</h2>
          <div className="mb-4 grid grid-cols-5 gap-4">
            <input
              type="text"
              placeholder="Trailer ID"
              value={recentMovesFilter.trailer_id}
              onChange={(e) =>
                setRecentMovesFilter({ ...recentMovesFilter, trailer_id: e.target.value })
              }
              className="border p-2"
            />
            <select
              value={recentMovesFilter.from_warehouse}
              onChange={(e) =>
                setRecentMovesFilter({ ...recentMovesFilter, from_warehouse: e.target.value })
              }
              className="border p-2"
            >
              <option value="">Select From Warehouse</option>
              {WAREHOUSE_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
            <select
              value={recentMovesFilter.to_warehouse}
              onChange={(e) =>
                setRecentMovesFilter({ ...recentMovesFilter, to_warehouse: e.target.value })
              }
              className="border p-2"
            >
              <option value="">Select To Warehouse</option>
              {WAREHOUSE_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
            <input
              type="text"
              placeholder="User ID"
              value={recentMovesFilter.user_id}
              onChange={(e) =>
                setRecentMovesFilter({ ...recentMovesFilter, user_id: e.target.value })
              }
              className="border p-2"
            />
            <input
              type="number"
              placeholder="Minutes Since Completion"
              value={recentMovesFilter.relativeTime}
              onChange={(e) =>
                setRecentMovesFilter({ ...recentMovesFilter, relativeTime: e.target.value })
              }
              className="border p-2"
            />
          </div>
          <button
            onClick={() => handleExport(recentMoves, "Recent_Moves")}
            className="mt-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-500"
          >
            Export Recent Moves
          </button>
          <ul>{renderList(recentMoves, recentMovesFilter)}</ul>
        </div>
      )}

      {/* Temp Checks */}
      {activeTab === "tempChecks" && (
        <div className="mb-6">
          <h2 className="text-lg font-semibold">Recent Temp Checks</h2>
          <div className="mb-4 grid grid-cols-3 gap-4">
            <input
              type="text"
              placeholder="Trailer ID"
              value={tempCheckFilter.trailer_id}
              onChange={(e) =>
                setTempCheckFilter({ ...tempCheckFilter, trailer_id: e.target.value })
              }
              className="border p-2"
            />
            <input
              type="text"
              placeholder="User ID"
              value={tempCheckFilter.user_id}
              onChange={(e) =>
                setTempCheckFilter({ ...tempCheckFilter, user_id: e.target.value })
              }
              className="border p-2"
            />
            <input
              type="number"
              placeholder="Minutes Since Check"
              value={tempCheckFilter.relativeTime}
              onChange={(e) =>
                setTempCheckFilter({ ...tempCheckFilter, relativeTime: e.target.value })
              }
              className="border p-2"
            />
          </div>
          <button
            onClick={() => handleExport(tempCheckList, "Temp_Check_List")}
            className="mt-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-500"
          >
            Export Temp Check List
          </button>
          <ul>{renderList(tempCheckList, tempCheckFilter)}</ul>
        </div>
      )}
    </div>
  );
};

export default Dashboard;
