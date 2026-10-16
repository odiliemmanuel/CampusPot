import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import ThemeProvider from "./providers/ThemeProvider";
import { GroupProvider } from "./providers/GroupProvider";
import ProtectedRoute from "./components/ProtectedRoute";

import LandingPage from "./pages/landing/LandingPage";
import SignUp from "./pages/auth/SignUp";
import Login from "./pages/auth/Login";
import Pots from "./pages/pots/Pots";
import PotLayout from "./layouts/PotLayout";
import PotDashboard from "./pages/pots/PotDashboard";
import { ContributionsInner } from "./pages/contributions/Contributions";
import { LeviesInner } from "./pages/levies/Levies";
import { ExpensesInner } from "./pages/expenses/Expenses";
import { MembersInner } from "./pages/members/Members";
import { LedgerInner } from "./pages/ledger/Ledger";
import { AssistantInner } from "./pages/assistant/Assistant";
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

            {/* Authenticated — the pots list and creating a pot */}
            <Route path="/pots" element={<ProtectedRoute><Pots /></ProtectedRoute>} />
            <Route path="/pots/new" element={<ProtectedRoute><NewPot /></ProtectedRoute>} />

            {/* Everything that belongs to one pot lives under /pots/:id */}
            <Route path="/pots/:id" element={<ProtectedRoute><PotLayout /></ProtectedRoute>}>
              <Route index element={<PotDashboard />} />
              <Route path="contributions" element={<ContributionsInner />} />
              <Route path="levies" element={<LeviesInner />} />
              <Route path="payouts" element={<ExpensesInner />} />
              <Route path="members" element={<MembersInner />} />
              <Route path="ledger" element={<LedgerInner />} />
              <Route path="assistant" element={<AssistantInner />} />
            </Route>

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
