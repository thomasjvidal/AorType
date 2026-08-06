-- Tabela de alimentos dinâmicos (substitui FOOD_DB hardcoded no server.js)
-- Alimentos com status='approved' são carregados automaticamente pelo servidor a cada 30 min
-- Alimentos com status='pending' são sugestões dos usuários aguardando aprovação do admin

CREATE TABLE IF NOT EXISTS foods (
  id          BIGSERIAL PRIMARY KEY,
  name        TEXT NOT NULL UNIQUE,
  calories    NUMERIC(8,2) DEFAULT 0,
  protein     NUMERIC(8,2) DEFAULT 0,
  carbs       NUMERIC(8,2) DEFAULT 0,
  fat         NUMERIC(8,2) DEFAULT 0,
  status      TEXT NOT NULL DEFAULT 'approved' CHECK (status IN ('approved', 'pending', 'rejected')),
  source      TEXT DEFAULT 'admin',   -- 'admin' | 'user_suggestion' | 'import'
  suggested_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS foods_status_idx ON foods(status);
CREATE INDEX IF NOT EXISTS foods_name_idx   ON foods(name);

-- Tabela para sugestões dos usuários (via /api/foods/suggest)
-- Quando aprovadas pelo admin, devem ser inseridas/movidas para a tabela foods
CREATE TABLE IF NOT EXISTS food_suggestions (
  id          BIGSERIAL PRIMARY KEY,
  user_id     UUID REFERENCES users(id) ON DELETE SET NULL,
  name        TEXT NOT NULL,
  calories    NUMERIC(8,2) DEFAULT 0,
  protein     NUMERIC(8,2) DEFAULT 0,
  carbs       NUMERIC(8,2) DEFAULT 0,
  fat         NUMERIC(8,2) DEFAULT 0,
  status      TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS food_suggestions_status_idx ON food_suggestions(status);
