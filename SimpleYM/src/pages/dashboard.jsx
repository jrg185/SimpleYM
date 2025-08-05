import React, { useState, useEffect } from "react";
import { collection, query, where, getDocs, orderBy } from "firebase/firestore";
import { firestore, auth } from "../firebase";
import { saveAs } from "file-saver";
import * as XLSX from "xlsx";
import { format, differenceInMinutes, isAfter, isBefore, parseISO, startOfDay, endOfDay } from "date-fns";
import { useNavigate } from "react-router-dom";
import axios from "axios";

const Dashboard = () => {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState("openMoves");
  const [openMovesList, setOpenMovesList] = useState([]);
  const [recentMoves, setRecentMoves] = useState([]);
  const [tempCheckList, setTempCheckList] = useState([]);
  const [lastKnownLocations, setLastKnownLocations] = useState([]);
  const [trailerStats, setTrailerStats] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [dataLoaded, setDataLoaded] = useState(false);

  // Pagination states
  const [currentPage, setCurrentPage] = useState({
    openMoves: 1,
    recentMoves: 1,
    tempChecks: 1,
    lastKnownLocations: 1
  });
  const ITEMS_PER_PAGE = 25;

  // Enhanced filters with date search parameters
  const [openMovesFilter, setOpenMovesFilter] = useState({
    trailer_id: "",
    from_warehouse: "",
    from_door: "",
    relativeTime: "",
    startDate: "",
    endDate: "",
  });
  const [recentMovesFilter, setRecentMovesFilter] = useState({
    trailer_id: "",
    from_warehouse: "",
    to_warehouse: "",
    email: "",
    relativeTime: "",
    startDate: "",
    endDate: "",
    completedAfter: "",
    completedBefore: "",
  });
  const [tempCheckFilter, setTempCheckFilter] = useState({
    trailer_id: "",
    email: "",
    relativeTime: "",
    startDate: "",
    endDate: "",
    temperatureMin: "",
    temperatureMax: "",
  });
  const [lastKnownFilter, setLastKnownFilter] = useState({
    trailer_id: "",
    location: "",
    startDate: "",
    endDate: "",
    lastSeenAfter: "",
    lastSeenBefore: "",
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

  // Check authentication on component mount
  useEffect(() => {
    const user = auth.currentUser;
    if (!user) {
      navigate("/");
    }
  }, [navigate]);

  const fetchDashboardData = async () => {
    setLoading(true);
    setError(null);

    try {
      const user = auth.currentUser;
      if (!user) {
        navigate("/");
        return;
      }

      // Fetch Open Moves
      const movesCollection = collection(firestore, "moves");
      const openMovesQuery = query(movesCollection, where("status", "in", ["open", "Open", "OPEN"]));
      const openMovesSnapshot = await getDocs(openMovesQuery);
      setOpenMovesList(
        openMovesSnapshot.docs.map((doc) => {
          const data = doc.data();

          // Fix timezone issue by ensuring consistent time handling
          let minutesSinceSubmission = 0;
          if (data.timestamp) {
            try {
              // Parse the timestamp and calculate difference more reliably
              const moveTimestamp = new Date(data.timestamp);
              const currentTime = new Date();
              minutesSinceSubmission = Math.max(0, differenceInMinutes(currentTime, moveTimestamp));
            } catch (error) {
              console.error("Error calculating time difference:", error);
              minutesSinceSubmission = 0;
            }
          }

          return {
            ...data,
            minutesSinceSubmission,
          };
        })
      );

      // Fetch Recent Moves
      const recentMovesQuery = query(
        movesCollection,
        where("status", "in", ["completed", "Completed", "COMPLETED"]),
        orderBy("completed_at", "desc")
      );
      const recentMovesSnapshot = await getDocs(recentMovesQuery);
      setRecentMoves(
        recentMovesSnapshot.docs.map((doc) => {
          const data = doc.data();

          // Fix timezone issue for completed moves
          let minutesSinceCompletion = 0;
          if (data.completed_at || data.timestamp) {
            try {
              const completionTime = new Date(data.completed_at || data.timestamp);
              const currentTime = new Date();
              minutesSinceCompletion = Math.max(0, differenceInMinutes(currentTime, completionTime));
            } catch (error) {
              console.error("Error calculating completion time difference:", error);
              minutesSinceCompletion = 0;
            }
          }

          return {
            ...data,
            minutesSinceCompletion,
          };
        })
      );

      // Fetch Temp Checks
      const tempCheckCollection = collection(firestore, "temperature_checks");
      const tempCheckQuery = query(tempCheckCollection, orderBy("timestamp", "desc"));
      const tempCheckSnapshot = await getDocs(tempCheckQuery);
      setTempCheckList(
        tempCheckSnapshot.docs.map((doc) => doc.data())
      );

      // Generate Last Known Locations from moves data
      await generateLastKnownLocations();

      // Fetch Trailer Statistics (optional - can be removed if API not available)
      try {
        const token = await user.getIdToken();
        const statsResponse = await axios.get(
          `${import.meta.env.VITE_API_BASE_URL}/trailer-statistics`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        setTrailerStats(statsResponse.data);
      } catch (apiError) {
        console.log("Trailer statistics API not available, skipping...");
        setTrailerStats(null);
      }

      setDataLoaded(true);
      setLoading(false);
    } catch (err) {
      console.error("Dashboard fetch error:", err);
      setError("Failed to load dashboard data.");
      setLoading(false);
    }
  };

  const generateLastKnownLocations = async () => {
    try {
      // Fetch ALL moves (both open and completed) to determine last known locations
      const movesCollection = collection(firestore, "moves");
      const allMovesQuery = query(movesCollection, orderBy("timestamp", "desc"));
      const allMovesSnapshot = await getDocs(allMovesQuery);

      const allMoves = allMovesSnapshot.docs.map((doc) => doc.data());

      // Group moves by trailer_id and find the most recent move for each trailer
      const trailerLastMoves = {};

      allMoves.forEach((move) => {
        const trailerId = move.trailer_id;
        if (!trailerId) return;

        if (!trailerLastMoves[trailerId] ||
            new Date(move.timestamp) > new Date(trailerLastMoves[trailerId].timestamp)) {
          trailerLastMoves[trailerId] = move;
        }
      });

      // Convert to array format for the table
      const lastKnownLocationsList = Object.values(trailerLastMoves).map((move) => ({
        trailer_id: move.trailer_id,
        last_location: move.to_location || move.from_wh_yard || "Unknown", // Use to_location as last known location
        timestamp: move.timestamp,
        from_location: move.from_wh_yard,
        from_door: move.from_door,
        to_door: move.to_door,
        status: move.status,
        last_seen_at: move.timestamp, // For filter compatibility
      }));

      setLastKnownLocations(lastKnownLocationsList);
    } catch (err) {
      console.error("Error generating last known locations:", err);
      setError("Failed to generate last known locations from moves data.");
    }
  };

  // Enhanced filter functions with date support
  const filterOpenMoves = (moves) => {
    return moves.filter((move) => {
      // Existing filters
      if (openMovesFilter.trailer_id && !move.trailer_id?.toString().toLowerCase().includes(openMovesFilter.trailer_id.toLowerCase())) return false;
      if (openMovesFilter.from_warehouse && move.from_wh_yard !== openMovesFilter.from_warehouse) return false;
      if (openMovesFilter.from_door && !move.from_door?.toString().includes(openMovesFilter.from_door)) return false;
      if (openMovesFilter.relativeTime) {
        const minutes = parseInt(openMovesFilter.relativeTime);
        if (move.minutesSinceSubmission < minutes) return false;
      }

      // Date filters
      if (openMovesFilter.startDate && move.timestamp) {
        const itemDate = parseISO(move.timestamp);
        const startDate = startOfDay(parseISO(openMovesFilter.startDate));
        if (isBefore(itemDate, startDate)) return false;
      }
      if (openMovesFilter.endDate && move.timestamp) {
        const itemDate = parseISO(move.timestamp);
        const endDate = endOfDay(parseISO(openMovesFilter.endDate));
        if (isAfter(itemDate, endDate)) return false;
      }

      return true;
    });
  };

  const filterRecentMoves = (moves) => {
    return moves.filter((move) => {
      // Existing filters
      if (recentMovesFilter.trailer_id && !move.trailer_id?.toString().toLowerCase().includes(recentMovesFilter.trailer_id.toLowerCase())) return false;
      if (recentMovesFilter.from_warehouse && move.from_wh_yard !== recentMovesFilter.from_warehouse) return false;
      if (recentMovesFilter.to_warehouse && move.to_location !== recentMovesFilter.to_warehouse) return false;
      if (recentMovesFilter.email && !((move.email && move.email.toLowerCase().includes(recentMovesFilter.email.toLowerCase())) ||
          (move.user_id && move.user_id.toLowerCase().includes(recentMovesFilter.email.toLowerCase())))) return false;
      if (recentMovesFilter.relativeTime) {
        const minutes = parseInt(recentMovesFilter.relativeTime);
        if (move.minutesSinceCompletion < minutes) return false;
      }

      // Date filters
      if (recentMovesFilter.startDate && move.timestamp) {
        const itemDate = parseISO(move.timestamp);
        const startDate = startOfDay(parseISO(recentMovesFilter.startDate));
        if (isBefore(itemDate, startDate)) return false;
      }
      if (recentMovesFilter.endDate && move.timestamp) {
        const itemDate = parseISO(move.timestamp);
        const endDate = endOfDay(parseISO(recentMovesFilter.endDate));
        if (isAfter(itemDate, endDate)) return false;
      }
      if (recentMovesFilter.completedAfter && move.completed_at) {
        const completedDate = parseISO(move.completed_at);
        const afterDate = parseISO(recentMovesFilter.completedAfter);
        if (isBefore(completedDate, afterDate)) return false;
      }
      if (recentMovesFilter.completedBefore && move.completed_at) {
        const completedDate = parseISO(move.completed_at);
        const beforeDate = parseISO(recentMovesFilter.completedBefore);
        if (isAfter(completedDate, beforeDate)) return false;
      }

      return true;
    });
  };

  const filterTempChecks = (checks) => {
    return checks.filter((check) => {
      // Existing filters
      if (tempCheckFilter.trailer_id && !check.trailer_id?.toString().toLowerCase().includes(tempCheckFilter.trailer_id.toLowerCase())) return false;
      if (tempCheckFilter.email && !((check.email && check.email.toLowerCase().includes(tempCheckFilter.email.toLowerCase())) ||
          (check.user_id && check.user_id.toLowerCase().includes(tempCheckFilter.email.toLowerCase())))) return false;

      // Date filters
      if (tempCheckFilter.startDate && check.timestamp) {
        const itemDate = parseISO(check.timestamp);
        const startDate = startOfDay(parseISO(tempCheckFilter.startDate));
        if (isBefore(itemDate, startDate)) return false;
      }
      if (tempCheckFilter.endDate && check.timestamp) {
        const itemDate = parseISO(check.timestamp);
        const endDate = endOfDay(parseISO(tempCheckFilter.endDate));
        if (isAfter(itemDate, endDate)) return false;
      }

      // Temperature filters
      if (tempCheckFilter.temperatureMin && check.clr_temp && parseFloat(check.clr_temp) < parseFloat(tempCheckFilter.temperatureMin)) return false;
      if (tempCheckFilter.temperatureMax && check.clr_temp && parseFloat(check.clr_temp) > parseFloat(tempCheckFilter.temperatureMax)) return false;

      return true;
    });
  };

  const filterLastKnownLocations = (locations) => {
    return locations.filter((location) => {
      // Existing filters
      if (lastKnownFilter.trailer_id && !location.trailer_id?.toString().toLowerCase().includes(lastKnownFilter.trailer_id.toLowerCase())) return false;
      if (lastKnownFilter.location && !location.last_location?.toLowerCase().includes(lastKnownFilter.location.toLowerCase())) return false;

      // Date filters
      if (lastKnownFilter.startDate && location.timestamp) {
        const itemDate = parseISO(location.timestamp);
        const startDate = startOfDay(parseISO(lastKnownFilter.startDate));
        if (isBefore(itemDate, startDate)) return false;
      }
      if (lastKnownFilter.endDate && location.timestamp) {
        const itemDate = parseISO(location.timestamp);
        const endDate = endOfDay(parseISO(lastKnownFilter.endDate));
        if (isAfter(itemDate, endDate)) return false;
      }
      if (lastKnownFilter.lastSeenAfter && location.last_seen_at) {
        const lastSeenDate = parseISO(location.last_seen_at);
        const afterDate = parseISO(lastKnownFilter.lastSeenAfter);
        if (isBefore(lastSeenDate, afterDate)) return false;
      }
      if (lastKnownFilter.lastSeenBefore && location.last_seen_at) {
        const lastSeenDate = parseISO(location.last_seen_at);
        const beforeDate = parseISO(lastKnownFilter.lastSeenBefore);
        if (isAfter(lastSeenDate, beforeDate)) return false;
      }

      return true;
    });
  };

  // Clear filters function
  const clearFilters = (filterSetter, tabName) => {
    filterSetter(prev => {
      const cleared = {};
      Object.keys(prev).forEach(key => {
        cleared[key] = "";
      });
      return cleared;
    });
    // Reset pagination when clearing filters
    setCurrentPage(prev => ({ ...prev, [tabName]: 1 }));
  };

  // Pagination helper functions
  const paginateData = (data, tabName) => {
    const page = currentPage[tabName] || 1;
    const startIndex = (page - 1) * ITEMS_PER_PAGE;
    const endIndex = startIndex + ITEMS_PER_PAGE;
    return data.slice(startIndex, endIndex);
  };

  const getTotalPages = (totalItems) => {
    return Math.ceil(totalItems / ITEMS_PER_PAGE);
  };

  const handlePageChange = (tabName, page) => {
    setCurrentPage(prev => ({ ...prev, [tabName]: page }));
  };

  // Reset pagination when filters change
  const updateFilter = (filterSetter, newFilters, tabName) => {
    filterSetter(newFilters);
    setCurrentPage(prev => ({ ...prev, [tabName]: 1 }));
  };

  // Pagination component
  const Pagination = ({ totalItems, currentPageNum, tabName }) => {
    const totalPages = getTotalPages(totalItems);
    if (totalPages <= 1) return null;

    const getPageNumbers = () => {
      const pages = [];
      const maxVisiblePages = 5;

      if (totalPages <= maxVisiblePages) {
        for (let i = 1; i <= totalPages; i++) {
          pages.push(i);
        }
      } else {
        if (currentPageNum <= 3) {
          for (let i = 1; i <= 4; i++) {
            pages.push(i);
          }
          pages.push('...');
          pages.push(totalPages);
        } else if (currentPageNum >= totalPages - 2) {
          pages.push(1);
          pages.push('...');
          for (let i = totalPages - 3; i <= totalPages; i++) {
            pages.push(i);
          }
        } else {
          pages.push(1);
          pages.push('...');
          for (let i = currentPageNum - 1; i <= currentPageNum + 1; i++) {
            pages.push(i);
          }
          pages.push('...');
          pages.push(totalPages);
        }
      }
      return pages;
    };

    return (
      <div className="flex items-center justify-between mt-4 px-4 py-3 bg-gray-50 rounded-lg">
        <div className="text-sm text-gray-700">
          Showing {((currentPageNum - 1) * ITEMS_PER_PAGE) + 1} to{' '}
          {Math.min(currentPageNum * ITEMS_PER_PAGE, totalItems)} of{' '}
          {totalItems} results
          {/* Debug Info - Remove this section once issues are resolved */}
          {debugInfo && (
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-6">
              <h3 className="text-lg font-semibold text-yellow-800 mb-2">Debug Information</h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                <div>
                  <strong>Total Moves in DB:</strong> {debugInfo.totalMoves}
                </div>
                <div>
                  <strong>Open Moves Found:</strong> {debugInfo.openMovesFound}
                </div>
                <div>
                  <strong>Recent Moves Found:</strong> {debugInfo.recentMovesFound}
                </div>
                <div className="col-span-full">
                  <strong>Status Breakdown:</strong>
                  <div className="mt-1 text-xs">
                    {Object.entries(debugInfo.statusBreakdown).map(([status, count]) => (
                      <span key={status} className="inline-block bg-gray-200 rounded px-2 py-1 mr-2 mb-1">
                        {status}: {count}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
        <div className="flex items-center space-x-2">
          <button
            onClick={() => handlePageChange(tabName, currentPageNum - 1)}
            disabled={currentPageNum === 1}
            className={`px-3 py-1 rounded text-sm ${
              currentPageNum === 1 
                ? 'bg-gray-200 text-gray-400 cursor-not-allowed' 
                : 'bg-white text-gray-700 hover:bg-gray-100 border'
            }`}
          >
            Previous
          </button>

          {getPageNumbers().map((page, index) => (
            page === '...' ? (
              <span key={index} className="px-2 text-gray-500">...</span>
            ) : (
              <button
                key={index}
                onClick={() => handlePageChange(tabName, page)}
                className={`px-3 py-1 rounded text-sm ${
                  page === currentPageNum
                    ? 'bg-indigo-600 text-white'
                    : 'bg-white text-gray-700 hover:bg-gray-100 border'
                }`}
              >
                {page}
              </button>
            )
          ))}

          <button
            onClick={() => handlePageChange(tabName, currentPageNum + 1)}
            disabled={currentPageNum === totalPages}
            className={`px-3 py-1 rounded text-sm ${
              currentPageNum === totalPages 
                ? 'bg-gray-200 text-gray-400 cursor-not-allowed' 
                : 'bg-white text-gray-700 hover:bg-gray-100 border'
            }`}
          >
            Next
          </button>
        </div>
      </div>
    );
  };

  // Export functions
  const exportToExcel = (data, filename) => {
    const worksheet = XLSX.utils.json_to_sheet(data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Data");
    const excelBuffer = XLSX.write(workbook, { bookType: "xlsx", type: "array" });
    const blob = new Blob([excelBuffer], { type: "application/octet-stream" });
    saveAs(blob, `${filename}_${format(new Date(), "yyyy-MM-dd_HH-mm")}.xlsx`);
  };

  const formatTimestamp = (timestamp) => {
    if (!timestamp) return "N/A";
    try {
      return format(new Date(timestamp), "MM/dd/yyyy HH:mm:ss");
    } catch {
      return "Invalid Date";
    }
  };

  return (
    <div className="min-h-screen bg-gray-100 p-6">
      <div className="max-w-7xl mx-auto">
        {error && <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">{error}</div>}

        {/* Header */}
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-gray-900 mb-4">Yard Management Dashboard</h1>

          {/* Search/Load Data Button */}
          <div className="flex gap-4 mb-4">
            <button
              onClick={fetchDashboardData}
              disabled={loading}
              className={`px-6 py-3 rounded-lg font-semibold ${
                loading 
                  ? "bg-gray-400 text-gray-700 cursor-not-allowed" 
                  : "bg-indigo-600 text-white hover:bg-indigo-500"
              }`}
            >
              {loading ? (
                <div className="flex items-center">
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                  Loading Data...
                </div>
              ) : (
                dataLoaded ? "Refresh Data" : "Load Dashboard Data"
              )}
            </button>

            <button
              onClick={() => navigate("/landing")}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-500"
            >
              Home
            </button>
          </div>

          {/* Trailer Statistics */}
          {trailerStats && (
            <div className="bg-white p-4 rounded-lg shadow-md mb-4">
              <h2 className="text-lg font-semibold mb-2">Trailer Statistics</h2>
              <div className="grid grid-cols-3 gap-4 text-center">
                <div>
                  <div className="text-2xl font-bold text-blue-600">{trailerStats.total_trailers_with_moves}</div>
                  <div className="text-sm text-gray-600">Total Trailers</div>
                </div>
                <div>
                  <div className="text-2xl font-bold text-yellow-600">{trailerStats.trailers_in_motion}</div>
                  <div className="text-sm text-gray-600">In Motion</div>
                </div>
                <div>
                  <div className="text-2xl font-bold text-green-600">{trailerStats.trailers_at_rest}</div>
                  <div className="text-sm text-gray-600">At Rest</div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Show message if no data loaded */}
        {!dataLoaded && !loading && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-6 text-center mb-6">
            <h2 className="text-xl font-semibold text-blue-800 mb-2">Welcome to the Dashboard</h2>
            <p className="text-blue-700">Click "Load Dashboard Data" to fetch and display the latest information.</p>
          </div>
        )}

        {/* Tabs - only show if data is loaded */}
        {dataLoaded && (
          <>
            <div className="mb-6 flex space-x-2 flex-wrap">
              <button
                onClick={() => {
                  setActiveTab("openMoves");
                  setCurrentPage(prev => ({ ...prev, openMoves: 1 }));
                }}
                className={`px-4 py-2 rounded-lg ${
                  activeTab === "openMoves" ? "bg-indigo-600 text-white" : "bg-gray-200"
                }`}
              >
                Open Moves ({filterOpenMoves(openMovesList).length})
              </button>
              <button
                onClick={() => {
                  setActiveTab("recentMoves");
                  setCurrentPage(prev => ({ ...prev, recentMoves: 1 }));
                }}
                className={`px-4 py-2 rounded-lg ${
                  activeTab === "recentMoves" ? "bg-indigo-600 text-white" : "bg-gray-200"
                }`}
              >
                Recent Moves ({filterRecentMoves(recentMoves).length})
              </button>
              <button
                onClick={() => {
                  setActiveTab("tempChecks");
                  setCurrentPage(prev => ({ ...prev, tempChecks: 1 }));
                }}
                className={`px-4 py-2 rounded-lg ${
                  activeTab === "tempChecks" ? "bg-indigo-600 text-white" : "bg-gray-200"
                }`}
              >
                Temp Checks ({filterTempChecks(tempCheckList).length})
              </button>
              <button
                onClick={() => {
                  setActiveTab("lastKnownLocations");
                  setCurrentPage(prev => ({ ...prev, lastKnownLocations: 1 }));
                }}
                className={`px-4 py-2 rounded-lg ${
                  activeTab === "lastKnownLocations" ? "bg-indigo-600 text-white" : "bg-gray-200"
                }`}
              >
                Last Known Location ({filterLastKnownLocations(lastKnownLocations).length})
              </button>
            </div>

            {/* Open Moves */}
            {activeTab === "openMoves" && (
              <div className="mb-6">
                <div className="bg-white p-6 rounded-lg shadow-md">
                  <div className="flex justify-between items-center mb-4">
                    <h2 className="text-xl font-semibold">Open Moves</h2>
                    <button
                      onClick={() => exportToExcel(filterOpenMoves(openMovesList), "open_moves")}
                      className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-500"
                    >
                      Export to Excel
                    </button>
                  </div>

                  {/* Enhanced Filters */}
                  <div className="mb-4 space-y-3">
                    <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
                      <input
                        type="text"
                        placeholder="Trailer ID"
                        value={openMovesFilter.trailer_id}
                        onChange={(e) =>
                          updateFilter(setOpenMovesFilter, { ...openMovesFilter, trailer_id: e.target.value }, 'openMoves')
                        }
                        className="border p-2 rounded"
                      />
                      <select
                        value={openMovesFilter.from_warehouse}
                        onChange={(e) =>
                          updateFilter(setOpenMovesFilter, { ...openMovesFilter, from_warehouse: e.target.value }, 'openMoves')
                        }
                        className="border p-2 rounded"
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
                          updateFilter(setOpenMovesFilter, { ...openMovesFilter, from_door: e.target.value }, 'openMoves')
                        }
                        className="border p-2 rounded"
                      />
                      <input
                        type="number"
                        placeholder="Minutes Since"
                        value={openMovesFilter.relativeTime}
                        onChange={(e) =>
                          updateFilter(setOpenMovesFilter, { ...openMovesFilter, relativeTime: e.target.value }, 'openMoves')
                        }
                        className="border p-2 rounded"
                      />
                      <input
                        type="date"
                        placeholder="Start Date"
                        value={openMovesFilter.startDate}
                        onChange={(e) =>
                          updateFilter(setOpenMovesFilter, { ...openMovesFilter, startDate: e.target.value }, 'openMoves')
                        }
                        className="border p-2 rounded"
                        title="Filter records from this date"
                      />
                      <input
                        type="date"
                        placeholder="End Date"
                        value={openMovesFilter.endDate}
                        onChange={(e) =>
                          updateFilter(setOpenMovesFilter, { ...openMovesFilter, endDate: e.target.value }, 'openMoves')
                        }
                        className="border p-2 rounded"
                        title="Filter records until this date"
                      />
                    </div>
                    <button
                      onClick={() => clearFilters(setOpenMovesFilter, 'openMoves')}
                      className="px-3 py-1 bg-gray-500 text-white rounded text-sm hover:bg-gray-600"
                    >
                      Clear All Filters
                    </button>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="min-w-full table-auto">
                      <thead>
                        <tr className="bg-gray-50">
                          <th className="px-4 py-2 text-left">Trailer ID</th>
                          <th className="px-4 py-2 text-left">From Warehouse</th>
                          <th className="px-4 py-2 text-left">From Door</th>
                          <th className="px-4 py-2 text-left">Minutes Since Submission</th>
                          <th className="px-4 py-2 text-left">Status</th>
                          <th className="px-4 py-2 text-left">Timestamp</th>
                        </tr>
                      </thead>
                      <tbody>
                        {paginateData(filterOpenMoves(openMovesList), 'openMoves').map((move, index) => (
                          <tr key={index} className={index % 2 === 0 ? "bg-white" : "bg-gray-50"}>
                            <td className="px-4 py-2 font-medium">{move.trailer_id}</td>
                            <td className="px-4 py-2">{move.from_wh_yard}</td>
                            <td className="px-4 py-2">{move.from_door}</td>
                            <td className="px-4 py-2">{move.minutesSinceSubmission}</td>
                            <td className="px-4 py-2">
                              <span className={`px-2 py-1 rounded text-sm ${
                                move.status === "picked up" ? "bg-yellow-200 text-yellow-800" : "bg-red-200 text-red-800"
                              }`}>
                                {move.status || "open"}
                              </span>
                            </td>
                            <td className="px-4 py-2">{formatTimestamp(move.timestamp)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {filterOpenMoves(openMovesList).length === 0 && (
                      <div className="text-center py-8 text-gray-500">
                        No open moves found matching your filters.
                      </div>
                    )}
                  </div>

                  <Pagination
                    totalItems={filterOpenMoves(openMovesList).length}
                    currentPageNum={currentPage.openMoves}
                    tabName="openMoves"
                  />
                </div>
              </div>
            )}

            {/* Recent Moves */}
            {activeTab === "recentMoves" && (
              <div className="mb-6">
                <div className="bg-white p-6 rounded-lg shadow-md">
                  <div className="flex justify-between items-center mb-4">
                    <h2 className="text-xl font-semibold">Recent Completed Moves</h2>
                    <button
                      onClick={() => exportToExcel(filterRecentMoves(recentMoves), "recent_moves")}
                      className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-500"
                    >
                      Export to Excel
                    </button>
                  </div>

                  {/* Enhanced Filters */}
                  <div className="mb-4 space-y-3">
                    <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
                      <input
                        type="text"
                        placeholder="Trailer ID"
                        value={recentMovesFilter.trailer_id}
                        onChange={(e) =>
                          updateFilter(setRecentMovesFilter, { ...recentMovesFilter, trailer_id: e.target.value }, 'recentMoves')
                        }
                        className="border p-2 rounded"
                      />
                      <select
                        value={recentMovesFilter.from_warehouse}
                        onChange={(e) =>
                          updateFilter(setRecentMovesFilter, { ...recentMovesFilter, from_warehouse: e.target.value }, 'recentMoves')
                        }
                        className="border p-2 rounded"
                      >
                        <option value="">From Warehouse</option>
                        {WAREHOUSE_OPTIONS.map((option) => (
                          <option key={option} value={option}>
                            {option}
                          </option>
                        ))}
                      </select>
                      <select
                        value={recentMovesFilter.to_warehouse}
                        onChange={(e) =>
                          updateFilter(setRecentMovesFilter, { ...recentMovesFilter, to_warehouse: e.target.value }, 'recentMoves')
                        }
                        className="border p-2 rounded"
                      >
                        <option value="">To Warehouse</option>
                        {WAREHOUSE_OPTIONS.map((option) => (
                          <option key={option} value={option}>
                            {option}
                          </option>
                        ))}
                      </select>
                      <input
                        type="text"
                        placeholder="User Email"
                        value={recentMovesFilter.email}
                        onChange={(e) =>
                          updateFilter(setRecentMovesFilter, { ...recentMovesFilter, email: e.target.value }, 'recentMoves')
                        }
                        className="border p-2 rounded"
                      />
                      <input
                        type="date"
                        placeholder="Start Date"
                        value={recentMovesFilter.startDate}
                        onChange={(e) =>
                          updateFilter(setRecentMovesFilter, { ...recentMovesFilter, startDate: e.target.value }, 'recentMoves')
                        }
                        className="border p-2 rounded"
                        title="Filter moves from this date"
                      />
                      <input
                        type="date"
                        placeholder="End Date"
                        value={recentMovesFilter.endDate}
                        onChange={(e) =>
                          updateFilter(setRecentMovesFilter, { ...recentMovesFilter, endDate: e.target.value }, 'recentMoves')
                        }
                        className="border p-2 rounded"
                        title="Filter moves until this date"
                      />
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                      <input
                        type="datetime-local"
                        placeholder="Completed After"
                        value={recentMovesFilter.completedAfter}
                        onChange={(e) =>
                          updateFilter(setRecentMovesFilter, { ...recentMovesFilter, completedAfter: e.target.value }, 'recentMoves')
                        }
                        className="border p-2 rounded"
                        title="Show moves completed after this date/time"
                      />
                      <input
                        type="datetime-local"
                        placeholder="Completed Before"
                        value={recentMovesFilter.completedBefore}
                        onChange={(e) =>
                          updateFilter(setRecentMovesFilter, { ...recentMovesFilter, completedBefore: e.target.value }, 'recentMoves')
                        }
                        className="border p-2 rounded"
                        title="Show moves completed before this date/time"
                      />
                      <input
                        type="number"
                        placeholder="Minutes Since Completion"
                        value={recentMovesFilter.relativeTime}
                        onChange={(e) =>
                          updateFilter(setRecentMovesFilter, { ...recentMovesFilter, relativeTime: e.target.value }, 'recentMoves')
                        }
                        className="border p-2 rounded"
                      />
                    </div>
                    <button
                      onClick={() => clearFilters(setRecentMovesFilter, 'recentMoves')}
                      className="px-3 py-1 bg-gray-500 text-white rounded text-sm hover:bg-gray-600"
                    >
                      Clear All Filters
                    </button>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="min-w-full table-auto">
                      <thead>
                        <tr className="bg-gray-50">
                          <th className="px-4 py-2 text-left">Trailer ID</th>
                          <th className="px-4 py-2 text-left">From</th>
                          <th className="px-4 py-2 text-left">To</th>
                          <th className="px-4 py-2 text-left">User Email</th>
                          <th className="px-4 py-2 text-left">Completed At</th>
                          <th className="px-4 py-2 text-left">Minutes Ago</th>
                        </tr>
                      </thead>
                      <tbody>
                        {paginateData(filterRecentMoves(recentMoves), 'recentMoves').map((move, index) => (
                          <tr key={index} className={index % 2 === 0 ? "bg-white" : "bg-gray-50"}>
                            <td className="px-4 py-2 font-medium">{move.trailer_id}</td>
                            <td className="px-4 py-2">{move.from_wh_yard}</td>
                            <td className="px-4 py-2">{move.to_location}</td>
                            <td className="px-4 py-2">{move.email || move.user_id}</td>
                            <td className="px-4 py-2">{formatTimestamp(move.completed_at)}</td>
                            <td className="px-4 py-2">{move.minutesSinceCompletion}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {filterRecentMoves(recentMoves).length === 0 && (
                      <div className="text-center py-8 text-gray-500">
                        No recent moves found matching your filters.
                      </div>
                    )}
                  </div>

                  <Pagination
                    totalItems={filterRecentMoves(recentMoves).length}
                    currentPageNum={currentPage.recentMoves}
                    tabName="recentMoves"
                  />
                </div>
              </div>
            )}

            {/* Temp Checks */}
            {activeTab === "tempChecks" && (
              <div className="mb-6">
                <div className="bg-white p-6 rounded-lg shadow-md">
                  <div className="flex justify-between items-center mb-4">
                    <h2 className="text-xl font-semibold">Temperature Checks</h2>
                    <button
                      onClick={() => exportToExcel(filterTempChecks(tempCheckList), "temp_checks")}
                      className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-500"
                    >
                      Export to Excel
                    </button>
                  </div>

                  {/* Enhanced Filters */}
                  <div className="mb-4 space-y-3">
                    <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
                      <input
                        type="text"
                        placeholder="Trailer ID"
                        value={tempCheckFilter.trailer_id}
                        onChange={(e) =>
                          updateFilter(setTempCheckFilter, { ...tempCheckFilter, trailer_id: e.target.value }, 'tempChecks')
                        }
                        className="border p-2 rounded"
                      />
                      <input
                        type="text"
                        placeholder="User Email"
                        value={tempCheckFilter.email}
                        onChange={(e) =>
                          updateFilter(setTempCheckFilter, { ...tempCheckFilter, email: e.target.value }, 'tempChecks')
                        }
                        className="border p-2 rounded"
                      />
                      <input
                        type="date"
                        placeholder="Start Date"
                        value={tempCheckFilter.startDate}
                        onChange={(e) =>
                          updateFilter(setTempCheckFilter, { ...tempCheckFilter, startDate: e.target.value }, 'tempChecks')
                        }
                        className="border p-2 rounded"
                        title="Filter checks from this date"
                      />
                      <input
                        type="date"
                        placeholder="End Date"
                        value={tempCheckFilter.endDate}
                        onChange={(e) =>
                          updateFilter(setTempCheckFilter, { ...tempCheckFilter, endDate: e.target.value }, 'tempChecks')
                        }
                        className="border p-2 rounded"
                        title="Filter checks until this date"
                      />
                      <input
                        type="number"
                        placeholder="Min Temp (°F)"
                        value={tempCheckFilter.temperatureMin}
                        onChange={(e) =>
                          updateFilter(setTempCheckFilter, { ...tempCheckFilter, temperatureMin: e.target.value }, 'tempChecks')
                        }
                        className="border p-2 rounded"
                        title="Minimum temperature filter"
                      />
                      <input
                        type="number"
                        placeholder="Max Temp (°F)"
                        value={tempCheckFilter.temperatureMax}
                        onChange={(e) =>
                          updateFilter(setTempCheckFilter, { ...tempCheckFilter, temperatureMax: e.target.value }, 'tempChecks')
                        }
                        className="border p-2 rounded"
                        title="Maximum temperature filter"
                      />
                    </div>
                    <button
                      onClick={() => clearFilters(setTempCheckFilter, 'tempChecks')}
                      className="px-3 py-1 bg-gray-500 text-white rounded text-sm hover:bg-gray-600"
                    >
                      Clear All Filters
                    </button>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="min-w-full table-auto">
                      <thead>
                        <tr className="bg-gray-50">
                          <th className="px-4 py-2 text-left">Trailer ID</th>
                          <th className="px-4 py-2 text-left">CLR Temp</th>
                          <th className="px-4 py-2 text-left">FZR Temp</th>
                          <th className="px-4 py-2 text-left">User Email</th>
                          <th className="px-4 py-2 text-left">Timestamp</th>
                        </tr>
                      </thead>
                      <tbody>
                        {paginateData(filterTempChecks(tempCheckList), 'tempChecks').map((check, index) => (
                          <tr key={index} className={index % 2 === 0 ? "bg-white" : "bg-gray-50"}>
                            <td className="px-4 py-2 font-medium">{check.trailer_id}</td>
                            <td className="px-4 py-2">
                              <span className={`font-medium ${
                                parseFloat(check.clr_temp) > 40 ? "text-red-600" : 
                                parseFloat(check.clr_temp) < 32 ? "text-blue-600" : "text-green-600"
                              }`}>
                                {check.clr_temp}°F
                              </span>
                            </td>
                            <td className="px-4 py-2">
                              <span className={`font-medium ${
                                parseFloat(check.fzr_temp) > 10 ? "text-red-600" : "text-blue-600"
                              }`}>
                                {check.fzr_temp}°F
                              </span>
                            </td>
                            <td className="px-4 py-2">{check.email || check.user_id}</td>
                            <td className="px-4 py-2">{formatTimestamp(check.timestamp)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {filterTempChecks(tempCheckList).length === 0 && (
                      <div className="text-center py-8 text-gray-500">
                        No temperature checks found matching your filters.
                      </div>
                    )}
                  </div>

                  <Pagination
                    totalItems={filterTempChecks(tempCheckList).length}
                    currentPageNum={currentPage.tempChecks}
                    tabName="tempChecks"
                  />
                </div>
              </div>
            )}

            {/* Last Known Locations Tab */}
            {activeTab === "lastKnownLocations" && (
              <div className="mb-6">
                <div className="bg-white p-6 rounded-lg shadow-md">
                  <div className="flex justify-between items-center mb-4">
                    <h2 className="text-xl font-semibold">Last Known Location Report</h2>
                    <button
                      onClick={() => exportToExcel(filterLastKnownLocations(lastKnownLocations), "last_known_locations")}
                      className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-500"
                    >
                      Export to Excel
                    </button>
                  </div>

                  <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                    <p className="text-blue-800 text-sm">
                      <strong>Note:</strong> Last known locations are generated from the moves database.
                      The location shown is the "to_location" from each trailer's most recent move.
                    </p>
                  </div>

                  {/* Enhanced Filters */}
                  <div className="mb-4 space-y-3">
                    <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
                      <input
                        type="text"
                        placeholder="Filter by Trailer ID"
                        value={lastKnownFilter.trailer_id}
                        onChange={(e) => updateFilter(setLastKnownFilter, { ...lastKnownFilter, trailer_id: e.target.value }, 'lastKnownLocations')}
                        className="border p-2 rounded"
                      />
                      <input
                        type="text"
                        placeholder="Filter by Location"
                        value={lastKnownFilter.location}
                        onChange={(e) => updateFilter(setLastKnownFilter, { ...lastKnownFilter, location: e.target.value }, 'lastKnownLocations')}
                        className="border p-2 rounded"
                      />
                      <input
                        type="date"
                        placeholder="Start Date"
                        value={lastKnownFilter.startDate}
                        onChange={(e) => updateFilter(setLastKnownFilter, { ...lastKnownFilter, startDate: e.target.value }, 'lastKnownLocations')}
                        className="border p-2 rounded"
                        title="Filter locations from this date"
                      />
                      <input
                        type="date"
                        placeholder="End Date"
                        value={lastKnownFilter.endDate}
                        onChange={(e) => updateFilter(setLastKnownFilter, { ...lastKnownFilter, endDate: e.target.value }, 'lastKnownLocations')}
                        className="border p-2 rounded"
                        title="Filter locations until this date"
                      />
                      <input
                        type="datetime-local"
                        placeholder="Last Seen After"
                        value={lastKnownFilter.lastSeenAfter}
                        onChange={(e) => updateFilter(setLastKnownFilter, { ...lastKnownFilter, lastSeenAfter: e.target.value }, 'lastKnownLocations')}
                        className="border p-2 rounded"
                        title="Show trailers last seen after this date/time"
                      />
                      <input
                        type="datetime-local"
                        placeholder="Last Seen Before"
                        value={lastKnownFilter.lastSeenBefore}
                        onChange={(e) => updateFilter(setLastKnownFilter, { ...lastKnownFilter, lastSeenBefore: e.target.value }, 'lastKnownLocations')}
                        className="border p-2 rounded"
                        title="Show trailers last seen before this date/time"
                      />
                    </div>
                    <button
                      onClick={() => clearFilters(setLastKnownFilter, 'lastKnownLocations')}
                      className="px-3 py-1 bg-gray-500 text-white rounded text-sm hover:bg-gray-600"
                    >
                      Clear All Filters
                    </button>
                  </div>

                  {/* Table */}
                  <div className="overflow-x-auto">
                    <table className="min-w-full table-auto">
                      <thead>
                        <tr className="bg-gray-50">
                          <th className="px-4 py-2 text-left">Trailer ID</th>
                          <th className="px-4 py-2 text-left">Last Known Location</th>
                          <th className="px-4 py-2 text-left">To Door</th>
                          <th className="px-4 py-2 text-left">Last Move Timestamp</th>
                          <th className="px-4 py-2 text-left">From Location</th>
                          <th className="px-4 py-2 text-left">From Door</th>
                          <th className="px-4 py-2 text-left">Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {paginateData(filterLastKnownLocations(lastKnownLocations), 'lastKnownLocations').map((location, index) => (
                          <tr key={index} className={index % 2 === 0 ? "bg-white" : "bg-gray-50"}>
                            <td className="px-4 py-2 font-medium text-blue-600">
                              {location.trailer_id}
                            </td>
                            <td className="px-4 py-2 font-semibold text-green-700">
                              {location.last_location}
                            </td>
                            <td className="px-4 py-2">
                              {location.to_door}
                            </td>
                            <td className="px-4 py-2">
                              {formatTimestamp(location.timestamp)}
                            </td>
                            <td className="px-4 py-2">
                              {location.from_location}
                            </td>
                            <td className="px-4 py-2">
                              {location.from_door}
                            </td>
                            <td className="px-4 py-2">
                              <span className={`px-2 py-1 rounded text-xs ${
                                location.status === "completed" ? "bg-green-200 text-green-800" : 
                                location.status === "open" ? "bg-yellow-200 text-yellow-800" : 
                                "bg-gray-200 text-gray-800"
                              }`}>
                                {location.status}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {filterLastKnownLocations(lastKnownLocations).length === 0 && (
                      <div className="text-center py-8 text-gray-500">
                        No trailer location data found matching your filters.
                      </div>
                    )}
                  </div>

                  <Pagination
                    totalItems={filterLastKnownLocations(lastKnownLocations).length}
                    currentPageNum={currentPage.lastKnownLocations}
                    tabName="lastKnownLocations"
                  />

                  <div className="mt-4 text-sm text-gray-600">
                    Showing {filterLastKnownLocations(lastKnownLocations).length} of {lastKnownLocations.length} trailers
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default Dashboard;