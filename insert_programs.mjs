const SB_URL = 'https://qslgxeodsdbqsgksphty.supabase.co';
const SB_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFzbGd4ZW9kc2RicXNna3NwaHR5Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NzkwMjcxMiwiZXhwIjoyMDkzNDc4NzEyfQ.ogqyc4XTFC6axMuQXh4tXAX9DYGsuGprrYWFNtWvyZM';

const programs = [
  {
    name: 'Nikolas — A: Peito & Bíceps',
    category: 'Peito,Bíceps',
    description: 'Ficha Nikolas Calixto — Emagrecimento. Intervalo 35-45s.',
    is_public: true,
    exercises: [
      { name:'Supino Inclinado com Halteres', sets:4, reps:'10-15', rest_seconds:40, target_weight:0, video_url:'' },
      { name:'Supino Reto com Halteres + Flexão de Braço', sets:3, reps:'12', rest_seconds:40, target_weight:0, video_url:'' },
      { name:'Crucifixo Inclinado', sets:4, reps:'10-12', rest_seconds:40, target_weight:0, video_url:'' },
      { name:'Supino Articulado + Voador na Máquina', sets:3, reps:'12-15', rest_seconds:40, target_weight:0, video_url:'' },
      { name:'Rosca Cross (Barra W) — Set 21', sets:5, reps:'21 (7+7+7)', rest_seconds:40, target_weight:0, video_url:'' },
      { name:'Rosca Martelo Alternada', sets:4, reps:'8-15', rest_seconds:40, target_weight:0, video_url:'' },
      { name:'Rosca Cross (Barra Reta) + Rosca Inversa', sets:4, reps:'8-15', rest_seconds:40, target_weight:0, video_url:'' }
    ]
  },
  {
    name: 'Nikolas — B: Costas & Tríceps',
    category: 'Costas,Tríceps',
    description: 'Ficha Nikolas Calixto — Emagrecimento. Intervalo 40-50s.',
    is_public: true,
    exercises: [
      { name:'Puxada Alta Frontal', sets:4, reps:'10-15', rest_seconds:45, target_weight:0, video_url:'' },
      { name:'Remada Articulada', sets:4, reps:'10-12', rest_seconds:45, target_weight:0, video_url:'' },
      { name:'Remada Sentada na Polia', sets:4, reps:'10-12', rest_seconds:45, target_weight:0, video_url:'' },
      { name:'Pull Down Barra Reta', sets:5, reps:'15-20', rest_seconds:45, target_weight:0, video_url:'' },
      { name:'Tríceps Pulley', sets:4, reps:'8-12', rest_seconds:45, target_weight:0, video_url:'' },
      { name:'Tríceps Corda à Frente', sets:4, reps:'10-12', rest_seconds:45, target_weight:0, video_url:'' },
      { name:'Tríceps Inverso — Set 21', sets:5, reps:'21 (7+7+7)', rest_seconds:45, target_weight:0, video_url:'' }
    ]
  },
  {
    name: 'Nikolas — C: Pernas, Panturrilhas & Ombros',
    category: 'Pernas,Ombros',
    description: 'Ficha Nikolas Calixto — Emagrecimento. Intervalo 50s-1min.',
    is_public: true,
    exercises: [
      { name:'Cadeira Extensora', sets:5, reps:'12-20', rest_seconds:55, target_weight:0, video_url:'' },
      { name:'Leg Press 45°', sets:4, reps:'12-15', rest_seconds:55, target_weight:0, video_url:'' },
      { name:'Adução de Quadril', sets:5, reps:'20-25', rest_seconds:55, target_weight:0, video_url:'' },
      { name:'Mesa Flexora', sets:4, reps:'12-15', rest_seconds:55, target_weight:0, video_url:'' },
      { name:'Panturrilha em Pé', sets:4, reps:'25-30', rest_seconds:55, target_weight:0, video_url:'' },
      { name:'Panturrilha Sentado (Solear)', sets:5, reps:'25-30', rest_seconds:55, target_weight:0, video_url:'' },
      { name:'Elevação Lateral', sets:3, reps:'10-12', rest_seconds:55, target_weight:0, video_url:'' },
      { name:'Elevação Frontal no Cross', sets:3, reps:'10', rest_seconds:55, target_weight:0, video_url:'' },
      { name:'Desenvolvimento com Halteres', sets:3, reps:'10-12', rest_seconds:55, target_weight:0, video_url:'' },
      { name:'Posterior de Ombro', sets:3, reps:'10-12', rest_seconds:55, target_weight:0, video_url:'' }
    ]
  },
  {
    name: 'Nikolas — Extra: Circuito Metabólico',
    category: 'Cardio,Abdômen',
    description: 'Circuito 4-5 séries sem descanso entre exercícios. Intervalo 1-2min entre séries.',
    is_public: true,
    exercises: [
      { name:'Remada no Cross + Agachamento', sets:5, reps:'45-60s', rest_seconds:90, target_weight:0, video_url:'' },
      { name:'Sobe/Desce no Step', sets:5, reps:'45-60s', rest_seconds:90, target_weight:0, video_url:'' },
      { name:'Corda Naval', sets:5, reps:'30s cada', rest_seconds:90, target_weight:0, video_url:'' },
      { name:'Prancha Frontal', sets:5, reps:'40-60s', rest_seconds:90, target_weight:0, video_url:'' },
      { name:'Elevação Pélvica Solo', sets:5, reps:'30-60s', rest_seconds:90, target_weight:0, video_url:'' },
      { name:'Abdominal Supra', sets:5, reps:'30-60s', rest_seconds:90, target_weight:0, video_url:'' }
    ]
  },
  {
    name: 'G9 Monique — T1: Pernas & Glúteos',
    category: 'Pernas,Abdômen',
    description: 'Protocolo G9 Monique Rayol — 12 semanas, volume progressivo. Intervalo 30-40s.',
    is_public: true,
    exercises: [
      { name:'Leg Press 45°', sets:3, reps:'10-12', rest_seconds:35, target_weight:0, video_url:'' },
      { name:'Cadeira Extensora', sets:3, reps:'10-12', rest_seconds:35, target_weight:0, video_url:'' },
      { name:'Cadeira Extensora Unilateral', sets:3, reps:'10-12', rest_seconds:35, target_weight:0, video_url:'' },
      { name:'Mesa Flexora', sets:3, reps:'10-12', rest_seconds:35, target_weight:0, video_url:'' },
      { name:'Abdução de Quadril', sets:3, reps:'12-15', rest_seconds:35, target_weight:0, video_url:'' },
      { name:'Elevação de Quadril', sets:3, reps:'10-12', rest_seconds:35, target_weight:0, video_url:'' },
      { name:'Abdominal Supra', sets:3, reps:'20-30', rest_seconds:30, target_weight:0, video_url:'' }
    ]
  },
  {
    name: 'G9 Monique — T2: Peito & Costas',
    category: 'Peito,Costas',
    description: 'Protocolo G9 Monique Rayol. Intervalo 30-40s. Cardio HIIT 18min ao final.',
    is_public: true,
    exercises: [
      { name:'Supino Reto com Halteres', sets:3, reps:'10-12', rest_seconds:35, target_weight:0, video_url:'' },
      { name:'Crucifixo Inclinado + Supino Inclinado Fechado', sets:3, reps:'10-15', rest_seconds:35, target_weight:0, video_url:'' },
      { name:'Puxada na Barra', sets:3, reps:'10-12', rest_seconds:35, target_weight:0, video_url:'' },
      { name:'Remada Articulada', sets:3, reps:'10-12', rest_seconds:35, target_weight:0, video_url:'' },
      { name:'Pull Down na Polia', sets:3, reps:'15-20', rest_seconds:35, target_weight:0, video_url:'' },
      { name:'HIIT na Esteira', sets:1, reps:'18 min', rest_seconds:0, target_weight:0, video_url:'' }
    ]
  },
  {
    name: 'G9 Monique — T3: Core & Cardio',
    category: 'Abdômen,Cardio',
    description: 'Protocolo G9 Monique Rayol. Core + 30-40min cardio.',
    is_public: true,
    exercises: [
      { name:'Abdominal Infra', sets:3, reps:'20-30', rest_seconds:35, target_weight:0, video_url:'' },
      { name:'Prancha Frontal', sets:3, reps:'45-60s', rest_seconds:35, target_weight:0, video_url:'' },
      { name:'Lombar no Banco', sets:3, reps:'20-30', rest_seconds:35, target_weight:0, video_url:'' },
      { name:'Caminhada Rápida', sets:1, reps:'30-40 min', rest_seconds:0, target_weight:0, video_url:'' }
    ]
  },
  {
    name: 'G9 Monique — T4: Pernas & Panturrilhas',
    category: 'Pernas',
    description: 'Protocolo G9 Monique Rayol. Intervalo 30-40s.',
    is_public: true,
    exercises: [
      { name:'Agachamento Livre', sets:3, reps:'10-12', rest_seconds:35, target_weight:0, video_url:'' },
      { name:'Hack Machine', sets:3, reps:'10-12', rest_seconds:35, target_weight:0, video_url:'' },
      { name:'Mesa Flexora Unilateral', sets:3, reps:'10-12', rest_seconds:35, target_weight:0, video_url:'' },
      { name:'Stiff', sets:3, reps:'12-15', rest_seconds:35, target_weight:0, video_url:'' },
      { name:'Adução de Quadril', sets:3, reps:'15-20', rest_seconds:35, target_weight:0, video_url:'' },
      { name:'Panturrilha em Pé', sets:3, reps:'20-25', rest_seconds:35, target_weight:0, video_url:'' }
    ]
  },
  {
    name: 'G9 Monique — T5: Full Body Circuito',
    category: 'Peito,Costas,Bíceps,Tríceps,Ombros,Pernas,Abdômen',
    description: 'Protocolo G9 Monique Rayol. Circuito Full Body — sem descanso entre exercícios.',
    is_public: true,
    exercises: [
      { name:'Elevação Lateral', sets:1, reps:'10-12', rest_seconds:0, target_weight:0, video_url:'' },
      { name:'Remada em Pé no Cross', sets:1, reps:'10-12', rest_seconds:0, target_weight:0, video_url:'' },
      { name:'Afundo Funcional Alternado', sets:1, reps:'30', rest_seconds:0, target_weight:0, video_url:'' },
      { name:'Tríceps Pulley', sets:1, reps:'10-12', rest_seconds:0, target_weight:0, video_url:'' },
      { name:'Agachamento Livre', sets:1, reps:'20', rest_seconds:0, target_weight:0, video_url:'' },
      { name:'Rosca Direta', sets:1, reps:'10-12', rest_seconds:0, target_weight:0, video_url:'' },
      { name:'Prancha Alpinista', sets:1, reps:'20', rest_seconds:0, target_weight:0, video_url:'' },
      { name:'Voador na Máquina', sets:3, reps:'12-15', rest_seconds:60, target_weight:0, video_url:'' }
    ]
  }
];

const headers = {
  'Content-Type': 'application/json',
  'apikey': SB_KEY,
  'Authorization': 'Bearer ' + SB_KEY,
  'Prefer': 'return=minimal'
};

for (const p of programs) {
  const r = await fetch(SB_URL + '/rest/v1/workout_programs', {
    method: 'POST', headers, body: JSON.stringify(p)
  });
  const txt = await r.text();
  console.log(r.status === 201 ? '✅' : '❌', p.name, '->', r.status, txt.substring(0,100));
}
