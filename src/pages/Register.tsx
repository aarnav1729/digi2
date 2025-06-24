
import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ThemeToggle } from '@/components/ThemeToggle';
import { useAuth } from '@/contexts/AuthContext';
import { Eye, EyeOff } from 'lucide-react';
import { toast } from '@/hooks/use-toast';

const Register = () => {
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [step, setStep] = useState<'email' | 'otp' | 'password'>('email');
  const [isLoading, setIsLoading] = useState(false);
  const [otpSent, setOtpSent] = useState(false);
  
  const { sendOTP, verifyOTP, register } = useAuth();
  const navigate = useNavigate();

  const handleSendOTP = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    
    try {
      await sendOTP(email);
      setOtpSent(true);
      setStep('otp');
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to send OTP",
        variant: "destructive",
      });
    }
    
    setIsLoading(false);
  };

  const handleResendOTP = async () => {
    setIsLoading(true);
    await sendOTP(email);
    setIsLoading(false);
  };

  const handleVerifyOTP = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (verifyOTP(email, otp)) {
      setStep('password');
      toast({
        title: "OTP Verified",
        description: "Please set your password",
      });
    } else {
      toast({
        title: "Invalid OTP",
        description: "Please check your OTP and try again",
        variant: "destructive",
      });
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (password !== confirmPassword) {
      toast({
        title: "Password Mismatch",
        description: "Passwords do not match",
        variant: "destructive",
      });
      return;
    }

    if (password.length < 6) {
      toast({
        title: "Weak Password",
        description: "Password must be at least 6 characters long",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);
    const success = await register(email, password);
    if (success) {
      navigate('/');
    }
    setIsLoading(false);
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <ThemeToggle />
      <Card className="w-full max-w-md p-8 glass animate-fade-in">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold">Create Account</h1>
          <p className="text-muted-foreground mt-2">
            {step === 'email' && 'Enter your email to get started'}
            {step === 'otp' && 'Verify your email address'}
            {step === 'password' && 'Set your password'}
          </p>
        </div>

        {step === 'email' && (
          <form onSubmit={handleSendOTP} className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                placeholder="Enter your email"
                className="transition-all duration-300 focus:scale-[1.02]"
              />
            </div>
            
            <Button 
              type="submit" 
              className="w-full transition-all duration-300 hover:scale-105"
              disabled={isLoading}
            >
              {isLoading ? 'Sending OTP...' : 'Send OTP'}
            </Button>
          </form>
        )}

        {step === 'otp' && (
          <form onSubmit={handleVerifyOTP} className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="otp">Enter OTP</Label>
              <Input
                id="otp"
                type="text"
                value={otp}
                onChange={(e) => setOtp(e.target.value)}
                required
                placeholder="Enter 6-digit OTP"
                maxLength={6}
                className="transition-all duration-300 focus:scale-[1.02] text-center text-lg tracking-widest"
              />
              <p className="text-xs text-muted-foreground">
                OTP sent to {email}
              </p>
            </div>
            
            <div className="space-y-3">
              <Button 
                type="submit" 
                className="w-full transition-all duration-300 hover:scale-105"
              >
                Verify OTP
              </Button>
              
              <Button 
                type="button"
                variant="ghost"
                className="w-full"
                onClick={handleResendOTP}
                disabled={isLoading}
              >
                {isLoading ? 'Resending...' : 'Resend OTP'}
              </Button>
            </div>
          </form>
        )}

        {step === 'password' && (
          <form onSubmit={handleRegister} className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  placeholder="Create a password"
                  className="transition-all duration-300 focus:scale-[1.02] pr-10"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="absolute right-0 top-0 h-full px-3 hover:bg-transparent"
                  onClick={() => setShowPassword(!showPassword)}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
              </div>
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="confirmPassword">Confirm Password</Label>
              <div className="relative">
                <Input
                  id="confirmPassword"
                  type={showConfirmPassword ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  placeholder="Confirm your password"
                  className="transition-all duration-300 focus:scale-[1.02] pr-10"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="absolute right-0 top-0 h-full px-3 hover:bg-transparent"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                >
                  {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
              </div>
            </div>

            <Button 
              type="submit" 
              className="w-full transition-all duration-300 hover:scale-105"
              disabled={isLoading}
            >
              {isLoading ? 'Creating Account...' : 'Create Account'}
            </Button>
          </form>
        )}

        <div className="mt-6 text-center">
          <div className="text-sm text-muted-foreground">
            Already have an account?{' '}
            <Link to="/login" className="text-primary hover:underline transition-colors">
              Sign in
            </Link>
          </div>
        </div>
      </Card>
    </div>
  );
};

export default Register;
