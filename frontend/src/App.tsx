import { BrowserRouter, Routes, Route, Navigate, useLocation, useParams } from "react-router-dom";
import ThemeProvider from "./providers/ThemeProvider";
import { GroupProvider } from "./providers/GroupProvider";
import ProtectedRoute from "./components/ProtectedRoute";

import LandingPage from "./pages/landing/LandingPage";
import SignUp from "./pages/auth/SignUp";
import Login from "./pages/auth/Login";
import Pots from "./pages/pots/Pots";
import PotLayout from "./layouts/PotLayout";
import PotPage from "./pages/pots/PotPage";
import Account from "./pages/account/Account";
import Settings from "./pages/settings/Settings";
import JoinPot from "./pages/join/JoinPot";
import NewPot from "./pages/pots/NewPot";

// Old pot sub-paths (/pots/:id/members, etc.) now open the matching inline tab.
function LegacyPotTab() {
  const { id } = useParams<{ id: string }>();
  const { pathname } = useLocation();
  const seg = pathname.split("/").filter(Boolean).pop() ?? "dashboard";
  const tab = seg === id ? "dashboard" : seg;
  return <Navigate to={`/pots/${id}?tab=${tab}`} replace />;
}

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

            {/* Authenticated — the pots list and creating a pot */}
            <Route path="/pots" element={<ProtectedRoute><Pots /></ProtectedRoute>} />
            <Route path="/pots/new" element={<ProtectedRoute><NewPot /></ProtectedRoute>} />

            {/* Everything that belongs to one pot lives under /pots/:id, as
                inline tabs. Legacy section URLs redirect to the right tab. */}
            <Route path="/pots/:id" element={<ProtectedRoute><PotLayout /></ProtectedRoute>}>
              <Route index element={<PotPage />} />
              <Route path="*" element={<LegacyPotTab />} />
            </Route>

            <Route path="/account" element={<ProtectedRoute><Account /></ProtectedRoute>} />
            <Route path="/settings" element={<ProtectedRoute><Settings /></ProtectedRoute>} />

            {/* The old flat routes now open from within a pot */}
            <Route path="/dashboard" element={<Navigate to="/pots" replace />} />
            <Route path="/contributions" element={<Navigate to="/pots" replace />} />
            <Route path="/levies" element={<Navigate to="/pots" replace />} />
            <Route path="/expenses" element={<Navigate to="/pots" replace />} />
            <Route path="/members" element={<Navigate to="/pots" replace />} />
            <Route path="/ledger" element={<Navigate to="/pots" replace />} />
            <Route path="/assistant" element={<Navigate to="/pots" replace />} />

            {/* Join by code or scanned QR link */}
            <Route path="/join" element={<ProtectedRoute><JoinPot /></ProtectedRoute>} />
            <Route path="/join/:code" element={<ProtectedRoute><JoinPot /></ProtectedRoute>} />
          </Routes>
        </GroupProvider>
      </BrowserRouter>
    </ThemeProvider>
  );
}
