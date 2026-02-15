import React, { useState } from 'react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { AlertCircle, Lock, Terminal } from 'lucide-react';
import { verifyPassword } from '../../api/developerClient';

interface DeveloperLoginProps {
  onLoginSuccess: () => void;
}

// Force dark mode CSS variables
const darkStyles: React.CSSProperties = {
  ['--background' as string]: '#09090b',
  ['--foreground' as string]: '#fafafa',
  ['--card' as string]: '#09090b',
  ['--card-foreground' as string]: '#fafafa',
  ['--popover' as string]: '#09090b',
  ['--popover-foreground' as string]: '#fafafa',
  ['--primary' as string]: '#fafafa',
  ['--primary-foreground' as string]: '#18181b',
  ['--secondary' as string]: '#27272a',
  ['--secondary-foreground' as string]: '#fafafa',
  ['--muted' as string]: '#27272a',
  ['--muted-foreground' as string]: '#a1a1aa',
  ['--accent' as string]: '#27272a',
  ['--accent-foreground' as string]: '#fafafa',
  ['--border' as string]: '#27272a',
  ['--input' as string]: '#27272a',
  ['--input-background' as string]: '#18181b',
};

export function DeveloperLogin({ onLoginSuccess }: DeveloperLoginProps) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      const result = await verifyPassword(password);

      if (result.success) {
        onLoginSuccess();
      } else {
        setError(result.error || 'Invalid password');
      }
    } catch (err) {
      setError('Failed to connect to server');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="dark min-h-screen bg-black flex items-center justify-center p-4" style={darkStyles}>
      <Card className="w-full max-w-md bg-zinc-900 border-zinc-700">
        <CardHeader className="text-center">
          <div className="mx-auto w-12 h-12 bg-zinc-800 rounded-full flex items-center justify-center mb-4">
            <Terminal className="h-6 w-6 text-green-400" />
          </div>
          <CardTitle className="text-2xl text-white">Developer Console</CardTitle>
          <CardDescription className="text-zinc-400">
            Enter your developer password to access the database management interface.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="password" className="text-white">
                Password
              </Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" />
                <Input
                  id="password"
                  type="password"
                  placeholder="Enter developer password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="pl-10 bg-black border-zinc-600 text-white placeholder-zinc-500 focus:border-green-500 focus:ring-green-500"
                  disabled={isLoading}
                  autoFocus
                />
              </div>
            </div>

            {error && (
              <div className="flex items-center gap-2 text-red-400 text-sm bg-red-900/30 p-3 rounded-md border border-red-700">
                <AlertCircle className="h-4 w-4" />
                <span>{error}</span>
              </div>
            )}

            <Button
              type="submit"
              className="w-full"
              disabled={isLoading || !password}
            >
              {isLoading ? 'Authenticating...' : 'Access Console'}
            </Button>
          </form>

          <div className="mt-6 text-center text-xs text-zinc-500">
            This interface is for authorized developers only.
            <br />
            All actions are logged.
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
