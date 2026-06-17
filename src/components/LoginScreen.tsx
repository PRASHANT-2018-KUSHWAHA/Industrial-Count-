import React, { useState } from 'react';
import { User } from '../types';
import { Mail, Lock, Eye, EyeOff, ArrowRight } from 'lucide-react';

interface LoginScreenProps {
  onLoginSuccess: (user: User) => void;
}

export default function LoginScreen({ onLoginSuccess }: LoginScreenProps) {
  const [email, setEmail] = useState('operator@buhler.com');
  const [password, setPassword] = useState('password');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');

    // Simulate authentic inspection terminal login
    setTimeout(() => {
      setIsLoading(false);
      if (email.trim() && password.length >= 4) {
        onLoginSuccess({
          email: email.trim(),
          name: email.split('@')[0].toUpperCase(),
          role: 'Plant Inspector',
          plantId: 'Bühler Plant 4 (Uzwil)',
        });
      } else {
        setError('Invalid operator credentials. Please review keyboard state.');
      }
    }, 800);
  };

  return (
    <div 
      className="min-h-screen flex items-center justify-center font-sans text-[#191c1e] antialiased bg-cover bg-center px-4"
      style={{
        backgroundImage: `url('https://lh3.googleusercontent.com/aida-public/AB6AXuD_bYtR7XAbEBvPzsT7Q3qai7xoQC4v3lR2XvZRsifintkU8s5Mfatx4oamsOE59PN4iWWIqeP2Luog3hZ1kY3g7kawEjc6wlHwh7ROk862-87ZCv0D2GmmeByjgCpIYxMiRozgaAiPZMr7qfAleUyC7vnA4YAahjXbH6XfXVvUCjdyd6bpmm4_n2HG30_hHyNIa9BL6268OX4fCYkX7D1J8uFLq_ipnDbLJLA0LEU7WSqpJwftvfsiLEfm86Qqhq7d6Qbu-DKb6bdC')`,
      }}
    >
      {/* Dark overlay to ensure form legibility */}
      <div className="absolute inset-0 bg-black/40 z-0"></div>

      <div className="w-full max-w-sm bg-[#f7f9fb]/95 backdrop-blur-md border border-[#bdc9c7] rounded-xl shadow-2xl overflow-hidden flex flex-col z-10 relative">
        
        {/* Header / Logo */}
        <div className="px-6 pt-8 pb-4 flex flex-col items-center border-b border-[#bdc9c7]/30">
          <div className="w-16 h-16 bg-brand-teal rounded-lg flex items-center justify-center mb-2 shadow-inner">
            {/* Box Icon styled with industrial look */}
            <div className="w-8 h-8 rounded border-2 border-white flex flex-col justify-between p-1">
              <div className="w-full h-1 bg-white"></div>
              <div className="w-3 h-1 bg-white mx-auto rounded-sm"></div>
            </div>
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-center text-brand-teal">
            Bühler
          </h1>
          <p className="text-xs font-semibold uppercase tracking-widest text-[#505f76] text-center mt-1">
            Inventory Management
          </p>
        </div>

        {/* Login Form */}
        <form onSubmit={handleSubmit} className="p-6 flex flex-col gap-4">
          {error && (
            <div className="bg-brand-error-container text-brand-brand-error-on-container border border-red-200 text-xs p-2.5 rounded text-center">
              {error}
            </div>
          )}

          {/* Email Input */}
          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-bold text-gray-700 tracking-wider uppercase" htmlFor="email">
              Operator Email
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 z-10">
                <Mail size={16} />
              </span>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full h-[44px] pl-10 pr-3 bg-white border border-[#bdc9c7] rounded hover:border-brand-teal focus:border-brand-teal focus:ring-1 focus:ring-brand-teal outline-none transition-all text-sm"
                placeholder="operator@buhler.com"
                required
              />
            </div>
          </div>

          {/* Password Input */}
          <div className="flex flex-col gap-1">
            <div className="flex justify-between items-center">
              <label className="text-[11px] font-bold text-gray-700 tracking-wider uppercase" htmlFor="password">
                Password
              </label>
            </div>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 z-10">
                <Lock size={16} />
              </span>
              <input
                id="password"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full h-[44px] pl-10 pr-10 bg-white border border-[#bdc9c7] rounded hover:border-brand-teal focus:border-brand-teal focus:ring-1 focus:ring-brand-teal outline-none transition-all text-sm font-mono"
                placeholder="••••••••"
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-brand-teal transition-colors flex items-center justify-center p-1"
                aria-label="Toggle password visibility"
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          {/* Forgot Password Link */}
          <div className="flex justify-end">
            <a href="#" className="text-xs font-semibold text-brand-teal hover:text-brand-teal-light transition-colors">
              Forgot password?
            </a>
          </div>

          {/* Actions */}
          <div className="pt-2 mt-1">
            <button
              type="submit"
              disabled={isLoading}
              className="w-full h-[44px] bg-brand-teal hover:bg-brand-teal-dark text-white font-semibold text-sm rounded flex items-center justify-center gap-2 transition-all shadow active:scale-[0.98] disabled:opacity-75 disabled:pointer-events-none"
            >
              {isLoading ? (
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
              ) : (
                <>
                  <span>Login</span>
                  <ArrowRight size={16} />
                </>
              )}
            </button>
          </div>
        </form>

        {/* Footer Info */}
        <div className="px-6 pb-6 text-center mt-auto">
          <p className="text-[10px] font-medium text-gray-500 uppercase tracking-wider leading-relaxed">
            Authorized Personnel Only.<br />
            v2.4.1 (Build 409)
          </p>
        </div>
      </div>
    </div>
  );
}
