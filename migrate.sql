-- MacroAI — Migration: Add missing columns to checkins table
-- Run this once in the Supabase SQL Editor:
-- https://supabase.com/dashboard/project/qslgxeodsdbqsgksphty/sql

ALTER TABLE checkins
  ADD COLUMN IF NOT EXISTS note           TEXT,
  ADD COLUMN IF NOT EXISTS workout_specific TEXT,
  ADD COLUMN IF NOT EXISTS calories_burned  INTEGER DEFAULT 0;

-- ─────────────────────────────────────────────────────────────────────────
-- Migration: Add YouTube video_url to all public workout program exercises
-- Cada exercício já tinha o campo video_url:""  — apenas populamos os links.
-- Todos os links são do formato embed para uso direto no iframe do app.
-- Você pode atualizar os links a qualquer momento por aqui ou via painel.
-- ─────────────────────────────────────────────────────────────────────────

-- Vídeos do canal @Gymworkout143 (UCHzVvAVzH0rHp52LhP1nW3A) — animações 3D
-- ✅ = vídeo verificado como correto para o exercício | sem url = não confirmado
UPDATE workout_programs
SET exercises = '[
  {"name":"Supino Reto","sets":4,"reps":"8-12","target_weight":60,"video_url":"https://www.youtube.com/embed/XVYD6356Orw","rest_seconds":90},
  {"name":"Supino Inclinado Halteres","sets":3,"reps":"10-12","target_weight":24,"video_url":"","rest_seconds":90},
  {"name":"Crucifixo Máquina","sets":3,"reps":"12-15","target_weight":40,"video_url":"","rest_seconds":60},
  {"name":"Tríceps Corda","sets":4,"reps":"12-15","target_weight":20,"video_url":"https://www.youtube.com/embed/fPG8Nciy_D8","rest_seconds":60},
  {"name":"Tríceps Francês","sets":3,"reps":"10-12","target_weight":18,"video_url":"https://www.youtube.com/embed/Nw2dPlGz8_Q","rest_seconds":60}
]'::jsonb
WHERE name = 'Peito & Tríceps' AND is_public = true AND created_by IS NULL;

UPDATE workout_programs
SET exercises = '[
  {"name":"Puxada Frente","sets":4,"reps":"8-12","target_weight":50,"video_url":"","rest_seconds":90},
  {"name":"Remada Curvada","sets":4,"reps":"8-10","target_weight":60,"video_url":"https://www.youtube.com/embed/_oI7eEG-G3E","rest_seconds":90},
  {"name":"Pulldown","sets":3,"reps":"12-15","target_weight":25,"video_url":"","rest_seconds":60},
  {"name":"Rosca Direta","sets":4,"reps":"10-12","target_weight":15,"video_url":"https://www.youtube.com/embed/gSYqGJNFqWE","rest_seconds":60},
  {"name":"Rosca Martelo","sets":3,"reps":"12","target_weight":14,"video_url":"https://www.youtube.com/embed/-kW2fTFVAA0","rest_seconds":60}
]'::jsonb
WHERE name = 'Costas & Bíceps' AND is_public = true AND created_by IS NULL;

UPDATE workout_programs
SET exercises = '[
  {"name":"Agachamento Livre","sets":4,"reps":"8-10","target_weight":80,"video_url":"https://www.youtube.com/embed/OSb5-r6XMVo","rest_seconds":120},
  {"name":"Leg Press 45","sets":4,"reps":"10-12","target_weight":120,"video_url":"","rest_seconds":90},
  {"name":"Cadeira Extensora","sets":3,"reps":"12-15","target_weight":50,"video_url":"","rest_seconds":60},
  {"name":"Mesa Flexora","sets":3,"reps":"12-15","target_weight":40,"video_url":"","rest_seconds":60},
  {"name":"Panturrilha Sentado","sets":4,"reps":"15-20","target_weight":40,"video_url":"","rest_seconds":45}
]'::jsonb
WHERE name = 'Pernas & Panturrilha' AND is_public = true AND created_by IS NULL;

UPDATE workout_programs
SET exercises = '[
  {"name":"Desenvolvimento c/ Halteres","sets":4,"reps":"8-10","target_weight":24,"video_url":"https://www.youtube.com/embed/-MS0boEyfuE","rest_seconds":90},
  {"name":"Elevação Lateral","sets":4,"reps":"12-15","target_weight":12,"video_url":"https://www.youtube.com/embed/MLWNw1PGNMM","rest_seconds":60},
  {"name":"Encolhimento c/ Barra","sets":4,"reps":"10-12","target_weight":80,"video_url":"","rest_seconds":60},
  {"name":"Crucifixo Inverso","sets":3,"reps":"12-15","target_weight":10,"video_url":"","rest_seconds":60},
  {"name":"Face Pull","sets":3,"reps":"15","target_weight":20,"video_url":"","rest_seconds":60}
]'::jsonb
WHERE name = 'Ombros & Trapézio' AND is_public = true AND created_by IS NULL;

UPDATE workout_programs
SET exercises = '[
  {"name":"Crunch na Máquina","sets":3,"reps":"15-20","target_weight":40,"video_url":"https://www.youtube.com/embed/ma3_HNpxR8Q","rest_seconds":45},
  {"name":"Elevação de Pernas","sets":3,"reps":"12-15","target_weight":0,"video_url":"https://www.youtube.com/embed/XAk2_1Dx65Q","rest_seconds":45},
  {"name":"Prancha","sets":3,"reps":"60s","target_weight":0,"video_url":"https://www.youtube.com/embed/E1ughhm_1aU","rest_seconds":45},
  {"name":"Russian Twist","sets":3,"reps":"20","target_weight":10,"video_url":"https://www.youtube.com/embed/e0mgDRSLheY","rest_seconds":45}
]'::jsonb
WHERE name = 'Abdominal' AND is_public = true AND created_by IS NULL;
