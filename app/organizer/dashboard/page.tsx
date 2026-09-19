"use client";
import { useEffect, useState } from "react";
import { collection, getDocs, query, orderBy } from "firebase/firestore";
import { db } from "../../../lib/firebase";
import Link from "next/link";
import Container from '@mui/material/Container';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import Paper from '@mui/material/Paper';
import Box from '@mui/material/Box';

export default function Dashboard() {
  const [tournaments, setTournaments] = useState<any[]>([]);

  useEffect(()=>{
    (async ()=>{
      const q = query(collection(db, 'tournaments'), orderBy('createdAt','desc' as any));
      const snap = await getDocs(q);
      setTournaments(snap.docs.map(d=>({id:d.id,...d.data()})));
    })()
  },[])

  return (
    <Container sx={{mt:4}}>
      <Box sx={{display:'flex',justifyContent:'space-between',alignItems:'center',mb:2}}>
        <Typography variant="h4">Organizer Dashboard</Typography>
        <Link href="/organizer/create"><Button variant="contained">Create Tournament</Button></Link>
      </Box>
      <Paper>
        <List>
          {tournaments.map(t=> (
            <ListItem key={t.id} divider>
              <Link href={`/organizer/tournament/${t.id}`}>{t.name}</Link>
            </ListItem>
          ))}
        </List>
      </Paper>
    </Container>
  )
}
