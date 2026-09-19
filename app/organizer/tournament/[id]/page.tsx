"use client";
import { useEffect, useState } from "react";
import { doc, getDoc, collection, getDocs, addDoc, updateDoc, query } from "firebase/firestore";
import { db } from "../../../../lib/firebase";
import { useParams } from "next/navigation";
import Container from '@mui/material/Container';
import Typography from '@mui/material/Typography';
import Paper from '@mui/material/Paper';
import Button from '@mui/material/Button';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import Grid from '@mui/material/Grid';
import Box from '@mui/material/Box';

type Category = any;
type Match = any;

function shuffle<T>(arr: T[]){
  return [...arr].sort(()=>Math.random()-0.5)
}

export default function TournamentPage(){
  const params = useParams() as any;
  const id = params.id;
  const [tournament, setTournament] = useState<any>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [matches, setMatches] = useState<Record<string, Match[]>>({});

  useEffect(()=>{
    (async ()=>{
      const tdoc = await getDoc(doc(db,'tournaments',id));
      setTournament({id:tdoc.id, ...tdoc.data()});
      const catSnap = await getDocs(collection(db,'tournaments',id,'categories'));
      const cats = catSnap.docs.map(d=>({id:d.id,...d.data()}));
      setCategories(cats);
      // load matches
      for(const c of cats){
        const mSnap = await getDocs(collection(db,'tournaments',id,'categories',c.id,'matches'));
        setMatches(prev=>({...prev, [c.id]: mSnap.docs.map(d=>({id:d.id,...d.data()}))}));
      }
    })()
  },[id])

  async function createBracket(category: Category){
    const teamsStr = prompt('Enter team names separated by comma');
    if(!teamsStr) return;
    const teams = shuffle(teamsStr.split(',').map(s=>s.trim()).filter(Boolean));
    let generated: Match[] = [];
    if(category.type === 'roundrobin'){
      for(let i=0;i<teams.length;i++){
        for(let j=i+1;j<teams.length;j++){
          generated.push({teamA:teams[i],teamB:teams[j],court:null,scoreA:null,scoreB:null})
        }
      }
    } else {
      for(let i=0;i<teams.length;i+=2){
        const a = teams[i];
        const b = teams[i+1] ?? 'BYE';
        generated.push({teamA:a,teamB:b,court:null,scoreA:null,scoreB:null})
      }
    }

    for(const m of generated){
      await addDoc(collection(db,'tournaments',id,'categories',category.id,'matches'), m);
    }
    const mSnap = await getDocs(collection(db,'tournaments',id,'categories',category.id,'matches'));
    setMatches(prev=>({...prev, [category.id]: mSnap.docs.map(d=>({id:d.id,...d.data()}))}));
  }

  async function assignCourts(category: Category){
    const catMatches = matches[category.id]||[];
    let court = 1;
    for(const m of catMatches){
      const docRef = doc(db,'tournaments',id,'categories',category.id,'matches',m.id);
      await updateDoc(docRef,{court:`Court ${court}`});
      court = court+1;
    }
    const mSnap = await getDocs(collection(db,'tournaments',id,'categories',category.id,'matches'));
    setMatches(prev=>({...prev, [category.id]: mSnap.docs.map(d=>({id:d.id,...d.data()}))}));
  }

  async function inputScore(category: Category, match: Match){
    const a = prompt('Score for ' + match.teamA);
    const b = prompt('Score for ' + match.teamB);
    if(a==null || b==null) return;
    const docRef = doc(db,'tournaments',id,'categories',category.id,'matches',match.id);
    await updateDoc(docRef,{scoreA:parseInt(a), scoreB:parseInt(b)});
    const mSnap = await getDocs(collection(db,'tournaments',id,'categories',category.id,'matches'));
    setMatches(prev=>({...prev, [category.id]: mSnap.docs.map(d=>({id:d.id,...d.data()}))}));
  }

  function computeStandings(catId: string){
    const ms = matches[catId]||[];
    const map: Record<string,{played:number,win:number,loss:number,draw:number,points:number}> = {};
    for(const m of ms){
      if(!m.teamA || !m.teamB) continue;
      const a = m.teamA, b = m.teamB;
      if(!map[a]) map[a]={played:0,win:0,loss:0,draw:0,points:0};
      if(!map[b]) map[b]={played:0,win:0,loss:0,draw:0,points:0};
      if(m.scoreA==null || m.scoreB==null) continue;
      map[a].played++; map[b].played++;
      if(m.scoreA>m.scoreB){ map[a].win++; map[b].loss++; map[a].points+=3 }
      else if(m.scoreA<m.scoreB){ map[b].win++; map[a].loss++; map[b].points+=3 }
      else { map[a].draw++; map[b].draw++; map[a].points++; map[b].points++ }
    }
    return Object.entries(map).map(([team,st])=>({team,...st})).sort((x,y)=>y.points-x.points);
  }

  return (
    <Container sx={{mt:4}}>
      <Paper sx={{p:2}}>
        <Typography variant="h4">{tournament?.name}</Typography>
        <Typography variant="subtitle1" sx={{mb:2}}>{tournament?.location}</Typography>
        <Grid container spacing={2}>
          {categories.map((c:any)=> (
            <Grid size={12} key={c.id}>
              <Paper sx={{p:2}}>
                <Box sx={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                  <Typography variant="h6">{c.name} ({c.type})</Typography>
                  <Box>
                    <Button sx={{mr:1}} variant="contained" onClick={()=>createBracket(c)}>Generate Matches</Button>
                    <Button variant="outlined" onClick={()=>assignCourts(c)}>Assign Courts</Button>
                  </Box>
                </Box>

                <Typography sx={{mt:2}} variant="subtitle2">Matches / Schedule</Typography>
                <List>
                  {(matches[c.id]||[]).map((m:any)=> (
                    <ListItem key={m.id} secondaryAction={<Button onClick={()=>inputScore(c,m)}>Enter Score</Button>}>
                      {m.teamA} vs {m.teamB} — {m.court || 'Unassigned'} — {m.scoreA!=null?`${m.scoreA}-${m.scoreB}`:'-'}
                    </ListItem>
                  ))}
                </List>

                <Typography sx={{mt:1}} variant="subtitle2">Standings</Typography>
                <List>
                  {computeStandings(c.id).map((s:any)=> (
                    <ListItem key={s.team}>{s.team} — {s.points} pts (W{s.win} D{s.draw} L{s.loss})</ListItem>
                  ))}
                </List>
              </Paper>
            </Grid>
          ))}
        </Grid>
      </Paper>
    </Container>
  )
}
