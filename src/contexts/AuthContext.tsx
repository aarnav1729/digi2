
import React, { createContext, useContext, useState, useEffect } from 'react';
import { toast } from '@/hooks/use-toast';

interface User {
  email: string;
  id: string;
}

interface AuthContextType {
  user: User | null;
  login: (email: string, password: string) => Promise<boolean>;
  register: (email: string, password: string) => Promise<boolean>;
  logout: () => void;
  isAuthenticated: boolean;
  sendOTP: (email: string) => Promise<string>;
  verifyOTP: (email: string, otp: string) => boolean;
  resetPassword: (email: string, newPassword: string) => boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    const savedUser = localStorage.getItem('currentUser');
    if (savedUser) {
      setUser(JSON.parse(savedUser));
    }
  }, []);

  const sendOTP = async (email: string): Promise<string> => {
    const otp = Math.random().toString().slice(2, 8);
    const otpData = {
      otp,
      email,
      timestamp: Date.now(),
      expires: Date.now() + 5 * 60 * 1000 // 5 minutes
    };
    
    localStorage.setItem(`otp_${email}`, JSON.stringify(otpData));
    
    // Show OTP in toast for demo purposes
    toast({
      title: "OTP Sent",
      description: `Your OTP is: ${otp}`,
      duration: 10000,
    });
    
    return otp;
  };

  const verifyOTP = (email: string, otp: string): boolean => {
    const savedOTP = localStorage.getItem(`otp_${email}`);
    if (!savedOTP) return false;
    
    const otpData = JSON.parse(savedOTP);
    
    if (Date.now() > otpData.expires) {
      localStorage.removeItem(`otp_${email}`);
      return false;
    }
    
    if (otpData.otp === otp) {
      localStorage.removeItem(`otp_${email}`);
      return true;
    }
    
    return false;
  };

  const register = async (email: string, password: string): Promise<boolean> => {
    try {
      const users = JSON.parse(localStorage.getItem('users') || '[]');
      
      if (users.find((u: any) => u.email === email)) {
        toast({
          title: "Registration Failed",
          description: "User already exists",
          variant: "destructive",
        });
        return false;
      }

      const newUser = {
        id: Date.now().toString(),
        email,
        password
      };

      users.push(newUser);
      localStorage.setItem('users', JSON.stringify(users));
      
      const userSession = { email, id: newUser.id };
      setUser(userSession);
      localStorage.setItem('currentUser', JSON.stringify(userSession));
      
      toast({
        title: "Registration Successful",
        description: "Welcome to Premier Energies Digital Portal",
      });
      
      return true;
    } catch (error) {
      toast({
        title: "Registration Failed",
        description: "An error occurred during registration",
        variant: "destructive",
      });
      return false;
    }
  };

  const login = async (email: string, password: string): Promise<boolean> => {
    try {
      const users = JSON.parse(localStorage.getItem('users') || '[]');
      const foundUser = users.find((u: any) => u.email === email && u.password === password);
      
      if (foundUser) {
        const userSession = { email, id: foundUser.id };
        setUser(userSession);
        localStorage.setItem('currentUser', JSON.stringify(userSession));
        
        toast({
          title: "Login Successful",
          description: "Welcome back!",
        });
        
        return true;
      } else {
        toast({
          title: "Login Failed",
          description: "Invalid email or password",
          variant: "destructive",
        });
        return false;
      }
    } catch (error) {
      toast({
        title: "Login Failed",
        description: "An error occurred during login",
        variant: "destructive",
      });
      return false;
    }
  };

  const logout = () => {
    setUser(null);
    localStorage.removeItem('currentUser');
    toast({
      title: "Logged Out",
      description: "You have been successfully logged out",
    });
  };

  const resetPassword = (email: string, newPassword: string): boolean => {
    try {
      const users = JSON.parse(localStorage.getItem('users') || '[]');
      const userIndex = users.findIndex((u: any) => u.email === email);
      
      if (userIndex !== -1) {
        users[userIndex].password = newPassword;
        localStorage.setItem('users', JSON.stringify(users));
        
        toast({
          title: "Password Reset",
          description: "Your password has been successfully updated",
        });
        
        return true;
      }
      
      return false;
    } catch (error) {
      return false;
    }
  };

  return (
    <AuthContext.Provider value={{
      user,
      login,
      register,
      logout,
      isAuthenticated: !!user,
      sendOTP,
      verifyOTP,
      resetPassword
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
