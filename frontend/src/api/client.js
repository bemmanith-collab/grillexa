import axios from 'axios';

// withCredentials makes the browser attach the session cookie. There is no
// token handling here any more: it lives in an httpOnly cookie the page cannot
// read, so nothing to store, attach, or accidentally leak.
const client = axios.create({ baseURL: '/api', withCredentials: true });

client.interceptors.response.use(
  (response) => response,
  (error) => {
    // /auth/ routes use 401 to mean "wrong password", not "session expired" —
    // redirecting there would hide the error and dump the user on the login
    // page for a typo in the Change Password modal.
    if (error.response?.status === 401 && !error.config?.url?.startsWith('/auth/')) {
      // The cookie is already invalid or gone; there is nothing for the client
      // to clear, so this only moves the user somewhere useful.
      if (window.location.pathname !== '/login') {
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  }
);

export default client;
