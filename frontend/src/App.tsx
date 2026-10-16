import { BrowserRouter, Routes, Route } from "react-router-dom";
import ThemeProvider from "./providers/ThemeProvider";
import { GroupProvider } from "./providers/GroupProvider";
import ProtectedRoute from "./components/ProtectedRoute";

import LandingPage from "./pages/landing/LandingPage";
import SignUp from "./pages/auth/SignUp";
import Login from "./pages/auth/Login";
import Dashboard from "./pages/dashboard/Dashboard";
import Contributions from "./pages/contributions/Contributions";
import Levies from "./pages/levies/Levies";
import Expenses from "./pages/expenses/Expenses";
import Members from "./pages/members/Members";
import Ledger from "./pages/ledger/Ledger";
import Assistant from "./pages/assistant/Assistant";
import Settings from "./pages/settings/Settings";
import JoinPot from "./pages/join/JoinPot";
import NewPot from "./pages/pots/NewPot";

export default function App() {
  return (
    <ThemeProvider>
      <BrowserRouter>
        <GroupProvider>
          <Routes>
            {/* Public */}
            <Route path="/" element={<LandingPage />} />
            <Route path="/signup" element={<SignUp />} />
            <Route path="/login" element={<Login />} />

            {/* Authenticated — redirects to /login if there's no session */}
            <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
            <Route path="/contributions" element={<ProtectedRoute><Contributions /></ProtectedRoute>} />
            <Route path="/levies" element={<ProtectedRoute><Levies /></ProtectedRoute>} />
            <Route path="/expenses" element={<ProtectedRoute><Expenses /></ProtectedRoute>} />
            <Route path="/members" element={<ProtectedRoute><Members /></ProtectedRoute>} />
            <Route path="/ledger" element={<ProtectedRoute><Ledger /></ProtectedRoute>} />
            <Route path="/assistant" element={<ProtectedRoute><Assistant /></ProtectedRoute>} />
            <Route path="/settings" element={<ProtectedRoute><Settings /></ProtectedRoute>} />

            {/* Start an additional pot (treasurers with existing pots) */}
            <Route path="/pots/new" element={<ProtectedRoute><NewPot /></ProtectedRoute>} />

            {/* Join by code or scanned QR link */}
            <Route path="/join" element={<ProtectedRoute><JoinPot /></ProtectedRoute>} />
            <Route path="/join/:code" element={<ProtectedRoute><JoinPot /></ProtectedRoute>} />
          </Routes>
        </GroupProvider>
      </BrowserRouter>
    </ThemeProvider>
  );
}
