import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import LoginPage from "./pages/LoginPage";
import PatientHome from "./pages/PatientHome";

function PrivateRoute({ children }) {
  const user = localStorage.getItem("carebridge_user");
  return user ? children : <Navigate to="/login" replace />;
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route
          path="/home"
          element={
            <PrivateRoute>
              <PatientHome />
            </PrivateRoute>
          }
        />
        <Route
          path="/"
          element={
            localStorage.getItem("carebridge_user")
              ? <Navigate to="/home" replace />
              : <Navigate to="/login" replace />
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
