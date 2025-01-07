import axios from "axios";
import { getAuth } from "firebase/auth";

const API = axios.create({ baseURL: import.meta.env.VITE_API_BASE_URL });

API.interceptors.request.use(
  async (config) => {
    const auth = getAuth(); // Initialize Firebase Auth
    const user = auth.currentUser;

    console.log("Current User in Interceptor:", user);

    if (user) {
      const token = await user.getIdToken(); // Fetch the token
      config.headers.Authorization = `Bearer ${token}`;
      console.log("Authorization Header Set:", config.headers.Authorization);
    } else {
      console.warn("No authenticated user found in Axios interceptor.");
    }

    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

export default API;
