"use client";
import { useState } from "react";
import { signInWithEmailAndPassword } from "firebase/auth";
import { auth } from "../../lib/firebase";
import { useRouter } from "next/navigation";
import Container from '@mui/material/Container';
import Box from '@mui/material/Box';
import TextField from '@mui/material/TextField';
import Button from '@mui/material/Button';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import Alert from '@mui/material/Alert';

export default function OrganizerLogin() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await signInWithEmailAndPassword(auth, email, password);
      router.push('/organizer/dashboard');
    } catch (err: any) {
      setError(err.message || 'Login failed');
    }
  }

  return (
    <Container maxWidth="sm" sx={{mt:6}}>
      <Paper elevation={3} sx={{p:4}}>
        <Typography variant="h5" component="h1" gutterBottom>Organizer Login</Typography>
        {error && <Alert severity="error" sx={{mb:2}}>{error}</Alert>}
        <Box component="form" onSubmit={handleLogin} sx={{display:'grid',gap:2}}>
          <TextField label="Email" type="email" value={email} onChange={(e)=>setEmail(e.target.value)} fullWidth />
          <TextField label="Password" type="password" value={password} onChange={(e)=>setPassword(e.target.value)} fullWidth />
          <Button type="submit" variant="contained">Sign in</Button>
        </Box>
      </Paper>
    </Container>
  );
}
