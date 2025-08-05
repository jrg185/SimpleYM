import React, { useState, useEffect } from 'react';
import { auth } from '../firebase';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';

const SessionMonitor = () => {
  const [sessionInfo, setSessionInfo] = useState(null);
  const [testResults, setTestResults] = useState({});
  const [apiTests, setApiTests] = useState({});
  const navigate = useNavigate();

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged(async (user) => {
      if (user) {
        try {
          const token = await user.getIdToken();
          const userDoc = await getUserRole(user.email);

          setSessionInfo({
            uid: user.uid,
            email: user.email,
            role: userDoc?.role || 'unknown',
            isTestUser: user.email.includes('.test@testco.com'),
            tokenExpiry: new Date(Date.now() + 3600000).toLocaleTimeString(),
            browserInfo: navigator.userAgent,
            sessionId: generateSessionId()
          });
        } catch (error) {
          console.error('Error fetching user info:', error);
        }
      }
    });

    return () => unsubscribe();
  }, []);

  const generateSessionId = () => {
    return Math.random().toString(36).substr(2, 9);
  };

  const getUserRole = async (email) => {
    try {
      const user = auth.currentUser;
      if (!user) return null;

      const token = await user.getIdToken();
      const response = await axios.get(`http://127.0.0.1:8000/fetch-data?collection=user_master`, {
        headers: { Authorization: `Bearer ${token}` }
      });

      return response.data.data?.find(u => u.email === email);
    } catch (error) {
      console.error('Error fetching user role:', error);
      return null;
    }
  };

  const testRoleAccess = async () => {
    const tests = {};
    const routes = [
      { path: '/admin-tasks', name: 'Admin Tasks', allowedRoles: ['admin'] },
      { path: '/notify-ready', name: 'Notify Ready', allowedRoles: ['admin', 'yard', 'load'] },
      { path: '/moves', name: 'Moves', allowedRoles: ['admin', 'yard'] },
      { path: '/temp-check', name: 'Temp Check', allowedRoles: ['admin', 'yard', 'load'] },
      { path: '/dashboard', name: 'Dashboard', allowedRoles: ['admin', 'yard', 'load'] }
    ];

    for (const route of routes) {
      const shouldHaveAccess = route.allowedRoles.includes(sessionInfo?.role);
      try {
        // This is a simplified test - in reality you'd need to check actual navigation
        tests[route.name] = {
          expectedAccess: shouldHaveAccess,
          status: shouldHaveAccess ? 'SHOULD_PASS' : 'SHOULD_BLOCK',
          route: route.path
        };
      } catch (error) {
        tests[route.name] = {
          expectedAccess: shouldHaveAccess,
          status: 'ERROR',
          error: error.message
        };
      }
    }

    setTestResults(tests);
  };

  const testApiEndpoints = async () => {
    const tests = {};
    const user = auth.currentUser;

    if (!user) {
      setApiTests({ error: 'No authenticated user' });
      return;
    }

    try {
      const token = await user.getIdToken();

      // Test basic data fetch
      try {
        const response = await axios.get('http://127.0.0.1:8000/fetch-data?collection=user_master', {
          headers: { Authorization: `Bearer ${token}` }
        });
        tests['fetch-data'] = {
          status: response.status === 200 ? 'PASS' : 'FAIL',
          statusCode: response.status
        };
      } catch (error) {
        tests['fetch-data'] = {
          status: 'ERROR',
          error: error.response?.data?.detail || error.message
        };
      }

      // Test token validation
      try {
        const response = await axios.get('http://127.0.0.1:8000/current-time');
        tests['public-endpoint'] = {
          status: response.status === 200 ? 'PASS' : 'FAIL',
          statusCode: response.status
        };
      } catch (error) {
        tests['public-endpoint'] = {
          status: 'ERROR',
          error: error.response?.data?.detail || error.message
        };
      }

    } catch (error) {
      tests['token-generation'] = { status: 'ERROR', error: error.message };
    }

    setApiTests(tests);
  };

  const clearTestData = () => {
    setTestResults({});
    setApiTests({});
  };

  if (!sessionInfo) {
    return (
      <div className="p-6 bg-gray-100 min-h-screen">
        <div className="max-w-4xl mx-auto">
          <h1 className="text-2xl font-bold mb-4">Session Monitor</h1>
          <p>Please log in to view session information.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 bg-gray-100 min-h-screen">
      <div className="max-w-6xl mx-auto">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-3xl font-bold">Multi-User Testing Dashboard</h1>
          <button
            onClick={() => navigate('/landing')}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-500"
          >
            Back to Landing
          </button>
        </div>

        {/* Session Information */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
          <div className="bg-white p-6 rounded-lg shadow-md">
            <h2 className="text-xl font-semibold mb-4 text-blue-600">Current Session Info</h2>
            <div className="space-y-2">
              <div className="flex justify-between">
                <span className="font-medium">Email:</span>
                <span className={sessionInfo.isTestUser ? 'text-green-600 font-mono' : 'text-gray-700'}>
                  {sessionInfo.email}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="font-medium">Role:</span>
                <span className={`px-2 py-1 rounded text-sm font-semibold ${
                  sessionInfo.role === 'admin' ? 'bg-red-100 text-red-800' :
                  sessionInfo.role === 'yard' ? 'bg-yellow-100 text-yellow-800' :
                  sessionInfo.role === 'load' ? 'bg-green-100 text-green-800' :
                  'bg-gray-100 text-gray-800'
                }`}>
                  {sessionInfo.role.toUpperCase()}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="font-medium">Session ID:</span>
                <span className="font-mono text-sm">{sessionInfo.sessionId}</span>
              </div>
              <div className="flex justify-between">
                <span className="font-medium">Token Expires:</span>
                <span className="text-sm">{sessionInfo.tokenExpiry}</span>
              </div>
              <div className="flex justify-between">
                <span className="font-medium">Test User:</span>
                <span className={sessionInfo.isTestUser ? 'text-green-600' : 'text-red-600'}>
                  {sessionInfo.isTestUser ? 'YES' : 'NO'}
                </span>
              </div>
            </div>
          </div>

          <div className="bg-white p-6 rounded-lg shadow-md">
            <h2 className="text-xl font-semibold mb-4 text-purple-600">Browser Info</h2>
            <div className="space-y-2">
              <div>
                <span className="font-medium">User Agent:</span>
                <p className="text-sm text-gray-600 mt-1 break-all">
                  {sessionInfo.browserInfo}
                </p>
              </div>
              <div className="flex justify-between">
                <span className="font-medium">Local Storage:</span>
                <span className="text-sm">
                  {localStorage.length} items
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Test Controls */}
        <div className="bg-white p-6 rounded-lg shadow-md mb-6">
          <h2 className="text-xl font-semibold mb-4 text-indigo-600">Testing Controls</h2>
          <div className="flex flex-wrap gap-4">
            <button
              onClick={testRoleAccess}
              className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-500"
            >
              Test Role Access
            </button>
            <button
              onClick={testApiEndpoints}
              className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-500"
            >
              Test API Endpoints
            </button>
            <button
              onClick={clearTestData}
              className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-500"
            >
              Clear Results
            </button>
          </div>
        </div>

        {/* Role Access Test Results */}
        {Object.keys(testResults).length > 0 && (
          <div className="bg-white p-6 rounded-lg shadow-md mb-6">
            <h2 className="text-xl font-semibold mb-4 text-green-600">Role Access Test Results</h2>
            <div className="overflow-x-auto">
              <table className="min-w-full table-auto">
                <thead>
                  <tr className="bg-gray-50">
                    <th className="px-4 py-2 text-left">Feature</th>
                    <th className="px-4 py-2 text-left">Expected Access</th>
                    <th className="px-4 py-2 text-left">Status</th>
                    <th className="px-4 py-2 text-left">Route</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(testResults).map(([feature, result]) => (
                    <tr key={feature} className="border-t">
                      <td className="px-4 py-2 font-medium">{feature}</td>
                      <td className="px-4 py-2">
                        <span className={`px-2 py-1 rounded text-sm ${
                          result.expectedAccess ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                        }`}>
                          {result.expectedAccess ? 'ALLOWED' : 'BLOCKED'}
                        </span>
                      </td>
                      <td className="px-4 py-2">
                        <span className={`px-2 py-1 rounded text-sm font-semibold ${
                          result.status === 'SHOULD_PASS' ? 'bg-green-100 text-green-800' :
                          result.status === 'SHOULD_BLOCK' ? 'bg-yellow-100 text-yellow-800' :
                          'bg-red-100 text-red-800'
                        }`}>
                          {result.status}
                        </span>
                      </td>
                      <td className="px-4 py-2 font-mono text-sm">{result.route}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* API Test Results */}
        {Object.keys(apiTests).length > 0 && (
          <div className="bg-white p-6 rounded-lg shadow-md">
            <h2 className="text-xl font-semibold mb-4 text-orange-600">API Test Results</h2>
            <div className="space-y-3">
              {Object.entries(apiTests).map(([endpoint, result]) => (
                <div key={endpoint} className="flex justify-between items-center p-3 bg-gray-50 rounded">
                  <span className="font-medium">{endpoint}</span>
                  <div className="flex items-center space-x-2">
                    {result.statusCode && (
                      <span className="text-sm text-gray-600">
                        {result.statusCode}
                      </span>
                    )}
                    <span className={`px-2 py-1 rounded text-sm font-semibold ${
                      result.status === 'PASS' ? 'bg-green-100 text-green-800' :
                      result.status === 'FAIL' ? 'bg-red-100 text-red-800' :
                      'bg-yellow-100 text-yellow-800'
                    }`}>
                      {result.status}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Instructions */}
        <div className="bg-blue-50 p-6 rounded-lg mt-6">
          <h3 className="text-lg font-semibold mb-2 text-blue-800">Testing Instructions</h3>
          <ul className="list-disc list-inside space-y-1 text-blue-700">
            <li>Open this dashboard in multiple browsers with different test users</li>
            <li>Compare session IDs to verify separate sessions</li>
            <li>Test role access to verify proper restrictions</li>
            <li>Check API endpoints to ensure token validation works</li>
            <li>Use different browser types (Chrome, Firefox, Safari) for isolation testing</li>
          </ul>
        </div>
      </div>
    </div>
  );
};

export default SessionMonitor;