import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { ThemeProvider } from "@/components/ThemeProvider";
import Index from "./pages/Index";
import NotFound from "./pages/NotFound";
import Login from "./pages/Login";
import ProtectedRoute from "@/components/ProtectedRoute";
import { AuthProvider } from "@/contexts/AuthContext";
import Users from "./pages/Users";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <ThemeProvider>
      <TooltipProvider>
        <AuthProvider>
          <Toaster />
          <Sonner />
          <BrowserRouter>
            <Routes>
              <Route
                path="/"
                element={
                  <ProtectedRoute redirectTo="/login">
                    <Index />
                  </ProtectedRoute>
                }
              />
              <Route path="/login" element={<Login />} />
              <Route path="*" element={<NotFound />} />
              <Route
                path="/users"
                element={
                  <ProtectedRoute redirectTo="/login">
                    <Users />
                  </ProtectedRoute>
                }
              />
            </Routes>
          </BrowserRouter>
        </AuthProvider>
      </TooltipProvider>
    </ThemeProvider>
  </QueryClientProvider>
);

export default App;
