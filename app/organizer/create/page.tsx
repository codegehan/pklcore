"use client";
import { useState } from "react";
import { collection, addDoc, serverTimestamp } from "firebase/firestore";
import { db } from "../../../lib/firebase";
import { useRouter } from "next/navigation";
import Container from '@mui/material/Container';
import TextField from '@mui/material/TextField';
import Button from '@mui/material/Button';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import Grid from '@mui/material/Grid';
import Select from '@mui/material/Select';
import MenuItem from '@mui/material/MenuItem';
import Box from '@mui/material/Box';

type Category = { name: string; type: 'single'|'double'|'roundrobin'; topAdvance: number };

export default function CreateTournament() {
  const [name, setName] = useState('');
  const [location, setLocation] = useState('');
  const [categories, setCategories] = useState<Category[]>([{name:'Open',type:'single',topAdvance:1}]);
  const router = useRouter();

  function updateCategory(i: number, patch: Partial<Category>){
    setCategories(cs=>cs.map((c,idx)=> idx===i?{...c,...patch}:c))
  }

  function addCategory(){ setCategories(cs=>[...cs,{name:'New',type:'single',topAdvance:1}]) }

  async function handleCreate(e: React.FormEvent){
    e.preventDefault();
    const docRef = await addDoc(collection(db,'tournaments'),{
      name, location, createdAt: serverTimestamp()
    });
    // add categories as subcollection
    for(const c of categories){
      await addDoc(collection(db,'tournaments',docRef.id,'categories'),{
        ...c
      })
    }
    router.push(`/organizer/tournament/${docRef.id}`)
  }

  return (
    <Container sx={{mt:4}} maxWidth="md">
      <Paper sx={{p:3}}>
        <Typography variant="h5" gutterBottom>Create Tournament</Typography>
        <Box component="form" onSubmit={handleCreate}>
          <Grid container spacing={2}>
  <Grid size={{ xs: 12, md: 6 }}>
    <TextField label="Name" value={name} onChange={(e)=>setName(e.target.value)} fullWidth />
  </Grid>
  <Grid size={{ xs: 12, md: 6 }}>
    <TextField label="Location" value={location} onChange={(e)=>setLocation(e.target.value)} fullWidth />
  </Grid>

  <Grid size={12}>
    <Typography variant="h6">Categories</Typography>
    <Grid container spacing={2}>
      {categories.map((c,i)=> (
        <Grid size={12} key={i}>
          <Paper sx={{p:2}}>
            <Grid container spacing={2}>
              <Grid size={{ xs: 12, md: 4 }}>
                <TextField value={c.name} onChange={(e)=>updateCategory(i,{name:e.target.value})} label="Category name" fullWidth />
              </Grid>
              <Grid size={{ xs: 6, md: 4 }}>
                <Select value={c.type} onChange={(e)=>updateCategory(i,{type:e.target.value as any})} fullWidth>
                  <MenuItem value="single">Single Elimination</MenuItem>
                  <MenuItem value="double">Double Elimination</MenuItem>
                  <MenuItem value="roundrobin">Round Robin</MenuItem>
                </Select>
              </Grid>
              <Grid size={{ xs: 6, md: 2 }}>
                <TextField type="number" label="Top advance" value={c.topAdvance} onChange={(e)=>updateCategory(i,{topAdvance:parseInt(e.target.value||'1')})} fullWidth />
              </Grid>
            </Grid>
          </Paper>
        </Grid>
      ))}
    </Grid>
    <Button sx={{mt:2}} onClick={addCategory} variant="outlined">Add Category</Button>
  </Grid>

  <Grid size={12}>
    <Button type="submit" variant="contained">Create</Button>
  </Grid>
</Grid>
        </Box>
      </Paper>
    </Container>
  )
}
