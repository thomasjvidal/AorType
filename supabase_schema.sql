-- ============================================================
-- MacroAI - Schema Supabase (versão corrigida)
-- Execute TODO este SQL no SQL Editor do Supabase
-- Clique em "Executar sem RLS" quando aparecer o aviso
-- ============================================================

-- TABELA: users
-- Todos os usuários do app (alunos e academias)
create table if not exists users (
  id            uuid default gen_random_uuid() primary key,
  email         text unique not null,
  password_hash text not null,
  name          text,
  username      text,
  phone         text,
  avatar_url    text,
  user_type     text not null default 'aluno' check (user_type in ('aluno', 'academia')),
  created_at    timestamptz default now()
);

-- TABELA: profiles
-- Dados físicos e metas de cada aluno
create table if not exists profiles (
  id              uuid default gen_random_uuid() primary key,
  user_id         uuid references users(id) on delete cascade unique not null,
  weight          numeric,
  height          numeric,
  age             integer,
  gender          text,
  goal            text check (goal in ('lose','gain','maintain','health')),
  activity_level  numeric default 1.375,
  biotype         text check (biotype in ('ecto','meso','endo')),
  diet            text,
  daily_calories  integer,
  daily_protein   integer,
  daily_carbs     integer,
  daily_fat       integer,
  streak          integer default 0,
  last_open_date  text,
  onboarding_done boolean default false,
  onboarding_data jsonb,
  updated_at      timestamptz default now()
);

-- TABELA: meals
-- Cada refeição registrada pelo aluno
create table if not exists meals (
  id          uuid default gen_random_uuid() primary key,
  user_id     uuid references users(id) on delete cascade not null,
  name        text not null,
  type        text default 'food' check (type in ('food','water','supplement')),
  calories    integer default 0,
  protein     numeric default 0,
  carbs       numeric default 0,
  fat         numeric default 0,
  grams       numeric default 100,
  ingredients jsonb,
  image_url   text,
  meal_window text,
  logged_at   timestamptz default now()
);

create index if not exists meals_user_id_logged_at on meals(user_id, logged_at desc);

-- TABELA: checkins
-- Registro diário de humor, treino, sono, água
create table if not exists checkins (
  id                 uuid default gen_random_uuid() primary key,
  user_id            uuid references users(id) on delete cascade not null,
  date               date not null,
  mood               text,
  workout_type       text,
  workout_duration   integer,
  workout_intensity  text,
  sleep_minutes      integer,
  water_ml           integer default 0,
  created_at         timestamptz default now(),
  unique(user_id, date)
);

-- TABELA: chat_history
-- Histórico de conversa com a IA por usuário
create table if not exists chat_history (
  id         uuid default gen_random_uuid() primary key,
  user_id    uuid references users(id) on delete cascade not null,
  role       text not null check (role in ('user','assistant')),
  message    text not null,
  created_at timestamptz default now()
);

create index if not exists chat_history_user_id on chat_history(user_id, created_at desc);

-- TABELA: workout_programs
-- Programas de treino criados pela academia ou pelo sistema
create table if not exists workout_programs (
  id          uuid default gen_random_uuid() primary key,
  name        text not null,
  category    text,
  description text,
  created_by  uuid references users(id) on delete set null,
  exercises   jsonb not null default '[]',
  is_public   boolean default false,
  created_at  timestamptz default now()
);

-- TABELA: workout_sessions
-- Sessões de treino realizadas pelo aluno
create table if not exists workout_sessions (
  id               uuid default gen_random_uuid() primary key,
  user_id          uuid references users(id) on delete cascade not null,
  program_id       uuid references workout_programs(id) on delete set null,
  date             date not null,
  completed_sets   jsonb,
  duration_minutes integer,
  notes            text,
  created_at       timestamptz default now()
);

create index if not exists workout_sessions_user_date on workout_sessions(user_id, date desc);

-- TABELA: academia_students
-- Vínculo entre academia e aluno
create table if not exists academia_students (
  id                  uuid default gen_random_uuid() primary key,
  academia_id         uuid references users(id) on delete cascade not null,
  student_id          uuid references users(id) on delete cascade not null,
  assigned_program_id uuid references workout_programs(id) on delete set null,
  status              text default 'active' check (status in ('active','inactive')),
  joined_at           timestamptz default now(),
  unique(academia_id, student_id)
);

-- ============================================================
-- PROGRAMAS DE TREINO PADRÃO DO SISTEMA
-- (disponíveis para todos os alunos)
-- ============================================================
insert into workout_programs (name, category, description, is_public, exercises) values

('Peito & Tríceps', 'chest-triceps', 'Treino focado em peitoral e tríceps', true, '[
  {"name":"Supino Reto","sets":4,"reps":"8-12","target_weight":60,"video_url":"","rest_seconds":90},
  {"name":"Supino Inclinado Halteres","sets":3,"reps":"10-12","target_weight":24,"video_url":"","rest_seconds":90},
  {"name":"Crucifixo Máquina","sets":3,"reps":"12-15","target_weight":40,"video_url":"","rest_seconds":60},
  {"name":"Tríceps Corda","sets":4,"reps":"12-15","target_weight":20,"video_url":"","rest_seconds":60},
  {"name":"Tríceps Francês","sets":3,"reps":"10-12","target_weight":18,"video_url":"","rest_seconds":60}
]'),

('Costas & Bíceps', 'back-biceps', 'Treino focado em costas e bíceps', true, '[
  {"name":"Puxada Frente","sets":4,"reps":"8-12","target_weight":50,"video_url":"","rest_seconds":90},
  {"name":"Remada Curvada","sets":4,"reps":"8-10","target_weight":60,"video_url":"","rest_seconds":90},
  {"name":"Pulldown","sets":3,"reps":"12-15","target_weight":25,"video_url":"","rest_seconds":60},
  {"name":"Rosca Direta","sets":4,"reps":"10-12","target_weight":15,"video_url":"","rest_seconds":60},
  {"name":"Rosca Martelo","sets":3,"reps":"12","target_weight":14,"video_url":"","rest_seconds":60}
]'),

('Pernas & Panturrilha', 'legs', 'Treino focado em pernas', true, '[
  {"name":"Agachamento Livre","sets":4,"reps":"8-10","target_weight":80,"video_url":"","rest_seconds":120},
  {"name":"Leg Press 45","sets":4,"reps":"10-12","target_weight":120,"video_url":"","rest_seconds":90},
  {"name":"Cadeira Extensora","sets":3,"reps":"12-15","target_weight":50,"video_url":"","rest_seconds":60},
  {"name":"Mesa Flexora","sets":3,"reps":"12-15","target_weight":40,"video_url":"","rest_seconds":60},
  {"name":"Panturrilha Sentado","sets":4,"reps":"15-20","target_weight":40,"video_url":"","rest_seconds":45}
]'),

('Ombros & Trapézio', 'shoulders', 'Treino focado em ombros', true, '[
  {"name":"Desenvolvimento c/ Halteres","sets":4,"reps":"8-10","target_weight":24,"video_url":"","rest_seconds":90},
  {"name":"Elevação Lateral","sets":4,"reps":"12-15","target_weight":12,"video_url":"","rest_seconds":60},
  {"name":"Encolhimento c/ Barra","sets":4,"reps":"10-12","target_weight":80,"video_url":"","rest_seconds":60},
  {"name":"Crucifixo Inverso","sets":3,"reps":"12-15","target_weight":10,"video_url":"","rest_seconds":60},
  {"name":"Face Pull","sets":3,"reps":"15","target_weight":20,"video_url":"","rest_seconds":60}
]'),

('Abdominal', 'abs', 'Treino focado em abdômen', true, '[
  {"name":"Crunch na Máquina","sets":3,"reps":"15-20","target_weight":40,"video_url":"","rest_seconds":45},
  {"name":"Elevação de Pernas","sets":3,"reps":"12-15","target_weight":0,"video_url":"","rest_seconds":45},
  {"name":"Prancha","sets":3,"reps":"60s","target_weight":0,"video_url":"","rest_seconds":45},
  {"name":"Russian Twist","sets":3,"reps":"20","target_weight":10,"video_url":"","rest_seconds":45}
]');
