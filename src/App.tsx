import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Index from "./pages/Index";
import AgentPanel from "./pages/AgentPanel";
import ManagementDashboard from "./pages/ManagementDashboard";
import ChoosePortal from "./pages/ChoosePortal";
import NotFound from "./pages/NotFound";
import ProtectedRoute from "./components/ProtectedRoute";
import AccountabilityList from "./pages/accountability/AccountabilityList";
import AccountabilityNew from "./pages/accountability/AccountabilityNew";
import AccountabilityDetail from "./pages/accountability/AccountabilityDetail";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Index />} />
          <Route path="/agent" element={
            <ProtectedRoute allowedRoles={['agent', 'manager']}>
              <AgentPanel />
            </ProtectedRoute>
          } />
          <Route path="/choose" element={
            <ProtectedRoute allowedRoles={['manager', 'lead_admin']}>
              <ChoosePortal />
            </ProtectedRoute>
          } />
          <Route path="/management" element={
            <ProtectedRoute allowedRoles={['manager']}>
              <ManagementDashboard />
            </ProtectedRoute>
          } />
          <Route path="/accountability" element={
            <ProtectedRoute allowedRoles={['agent', 'manager', 'lead_admin']}>
              <AccountabilityList />
            </ProtectedRoute>
          } />
          <Route path="/accountability/new" element={
            <ProtectedRoute allowedRoles={['manager', 'lead_admin']}>
              <AccountabilityNew />
            </ProtectedRoute>
          } />
          <Route path="/accountability/:id" element={
            <ProtectedRoute allowedRoles={['agent', 'manager', 'lead_admin']}>
              <AccountabilityDetail />
            </ProtectedRoute>
          } />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
