import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import bodyParser from 'body-parser';
import path from 'path';
import { fileURLToPath } from 'url';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { createClient } from '@supabase/supabase-js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const JWT_SECRET = process.env.JWT_SECRET || 'macroai_secret_change_in_production';

// Supabase client — criado de forma lazy para não crashar se env vars ausentes
const getSupabase = (() => {
  let client = null;
  return () => {
    if (!client) {
      const url = process.env.SUPABASE_URL;
      const key = process.env.SUPABASE_SERVICE_KEY;
      if (!url || !key) throw new Error('SUPABASE_URL e SUPABASE_SERVICE_KEY são obrigatórios. Configure as variáveis de ambiente no Vercel.');
      client = createClient(url, key);
    }
    return client;
  };
})();

// Atalho — usar supabase.from(...) normalmente nas rotas
const supabase = new Proxy({}, {
  get: (_, prop) => (...args) => getSupabase()[prop](...args)
});

const app = express();
app.set('etag', false); // Desabilita ETags globalmente — evita respostas 304 com dados antigos
app.use(cors());
app.use(bodyParser.json({ limit: '10mb' }));

// Desabilita cache HTTP em todas as rotas /api — dados sempre frescos
app.use('/api', (req, res, next) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.set('Pragma', 'no-cache');
  res.set('Expires', '0');
  next();
});

const PORT = process.env.PORT || 3000;

// ── ARQUIVOS ESTÁTICOS (antes do authMiddleware) ───────────────
// Serve index.html e assets sem exigir autenticação
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));
app.get('/favicon.png', (req, res) => res.sendFile(path.join(__dirname, 'favicon.png')));
app.get('/favicon.ico', (req, res) => res.sendFile(path.join(__dirname, 'favicon.png')));
app.get('/logo.png', (req, res) => res.sendFile(path.join(__dirname, 'logo.png')));
app.use('/assets', express.static(path.join(__dirname, 'assets')));

// ── AUTH MIDDLEWARE ────────────────────────────────────────────
const authMiddleware = (req, res, next) => {
  const auth = req.headers['authorization'];
  if (!auth || !auth.startsWith('Bearer ')) return res.status(401).json({ error: 'Unauthorized' });
  try {
    const token = auth.split(' ')[1];
    const decoded = jwt.verify(token, JWT_SECRET);
    req.userId = decoded.userId;
    req.userEmail = decoded.email;
    req.userType = decoded.userType;
    next();
  } catch {
    return res.status(401).json({ error: 'Token inválido' });
  }
};

// ── FOOD DATABASE ──────────────────────────────────────────────
const FOOD_DB = {
  'frango grelhado': { cal: 165, p: 31, c: 0, f: 3.6 },
  'frango': { cal: 165, p: 31, c: 0, f: 3.6 },
  'peito de frango': { cal: 165, p: 31, c: 0, f: 3.6 },
  'carne bovina': { cal: 250, p: 26, c: 0, f: 17 },
  'patinho': { cal: 219, p: 27, c: 0, f: 11 },
  'ovos': { cal: 155, p: 13, c: 1.1, f: 11 },
  'ovo': { cal: 155, p: 13, c: 1.1, f: 11 },
  'atum': { cal: 116, p: 25.5, c: 0, f: 0.5 },
  'salmão': { cal: 208, p: 20, c: 0, f: 13 },
  'tilapia': { cal: 96, p: 20, c: 0, f: 1.7 },
  'peixe': { cal: 100, p: 20, c: 0, f: 2 },
  'arroz branco': { cal: 130, p: 2.7, c: 28, f: 0.3 },
  'arroz': { cal: 130, p: 2.7, c: 28, f: 0.3 },
  'arroz integral': { cal: 111, p: 2.6, c: 23, f: 0.9 },
  'batata doce': { cal: 86, p: 1.6, c: 20, f: 0.1 },
  'batata': { cal: 77, p: 2, c: 17, f: 0.1 },
  'macarrao': { cal: 158, p: 5.8, c: 31, f: 0.9 },
  'macarrão': { cal: 158, p: 5.8, c: 31, f: 0.9 },
  'pão': { cal: 265, p: 9, c: 49, f: 3.2 },
  'tapioca': { cal: 359, p: 0.2, c: 88, f: 0 },
  'aveia': { cal: 389, p: 17, c: 66, f: 7 },
  'salada': { cal: 15, p: 1.5, c: 2, f: 0.2 },
  'alface': { cal: 15, p: 1.5, c: 2, f: 0.2 },
  'brocolis': { cal: 34, p: 2.8, c: 7, f: 0.4 },
  'brócolis': { cal: 34, p: 2.8, c: 7, f: 0.4 },
  'tomate': { cal: 18, p: 0.9, c: 3.9, f: 0.2 },
  'pepino': { cal: 16, p: 0.7, c: 3.6, f: 0.1 },
  'banana': { cal: 89, p: 1.1, c: 23, f: 0.3 },
  'maçã': { cal: 52, p: 0.3, c: 14, f: 0.2 },
  'maca': { cal: 52, p: 0.3, c: 14, f: 0.2 },
  'laranja': { cal: 47, p: 0.9, c: 12, f: 0.1 },
  'morango': { cal: 32, p: 0.7, c: 7.7, f: 0.3 },
  'leite': { cal: 61, p: 3.2, c: 4.8, f: 3.3 },
  'iogurte': { cal: 59, p: 3.5, c: 3.6, f: 3.3 },
  'queijo': { cal: 402, p: 25, c: 1.3, f: 33 },
  'pizza': { cal: 266, p: 11, c: 33, f: 10 },
  'hamburguer': { cal: 295, p: 17, c: 24, f: 14 },
  'hambúrguer': { cal: 295, p: 17, c: 24, f: 14 },
  'sushi': { cal: 140, p: 5, c: 28, f: 1 },
  'chocolate': { cal: 546, p: 5, c: 60, f: 31 },
  'biscoito': { cal: 450, p: 6, c: 65, f: 18 },
  'red bull': { cal: 45, p: 0, c: 11, f: 0 },
  'coca cola': { cal: 37, p: 0, c: 9.3, f: 0 },
  'coca cola zero': { cal: 0, p: 0, c: 0, f: 0 },
  'suco de laranja': { cal: 45, p: 0.7, c: 10, f: 0.2 },
  'whey protein': { cal: 120, p: 25, c: 3, f: 2 },
  'creatina': { cal: 0, p: 0, c: 0, f: 0 },
  'barra de proteina': { cal: 200, p: 20, c: 20, f: 7 },
  'feijão': { cal: 77, p: 5, c: 14, f: 0.5 },
  'feijao': { cal: 77, p: 5, c: 14, f: 0.5 },
  'lentilha': { cal: 116, p: 9, c: 20, f: 0.4 },
  'grão de bico': { cal: 164, p: 9, c: 27, f: 2.6 },
  'atum em lata': { cal: 100, p: 22, c: 0, f: 1 },
  'default': { cal: 150, p: 10, c: 15, f: 5 }
};

const normalizeKey = (str) =>
  str.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9 ]/g, '').trim();

const matchFood = (name) => {
  const n = normalizeKey(name);
  for (const [key, val] of Object.entries(FOOD_DB)) {
    if (key === 'default') continue;
    if (n.includes(normalizeKey(key)) || normalizeKey(key).includes(n)) return val;
  }
  return null;
};

// ── AUTH ENDPOINTS (sem middleware) ───────────────────────────

// Cadastro
app.post('/api/auth/register', async (req, res) => {
  try {
    const { email, password, name, username, user_type = 'aluno' } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Email e senha obrigatórios' });

    const { data: existing } = await supabase
      .from('users')
      .select('id')
      .eq('email', email)
      .single();

    if (existing) return res.status(409).json({ error: 'Email já cadastrado' });

    const password_hash = await bcrypt.hash(password, 10);

    const { data: user, error } = await supabase
      .from('users')
      .insert({ email, password_hash, name, username, user_type })
      .select()
      .single();

    if (error) throw error;

    // Cria perfil vazio para o aluno
    if (user_type === 'aluno') {
      await supabase.from('profiles').insert({ user_id: user.id });
    }

    const token = jwt.sign({ userId: user.id, email, userType: user_type }, JWT_SECRET, { expiresIn: '30d' });
    res.json({ token, userId: user.id, email, name: user.name, userType: user_type });
  } catch (e) {
    console.error('Register error:', e);
    res.status(500).json({ error: 'Erro ao cadastrar' });
  }
});

// Login
app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Dados inválidos' });

    // Accept email OR @username
    const isUsername = email.startsWith('@') || (!email.includes('@'));
    let userQuery = supabase.from('users').select('*');
    if (isUsername) {
      const uname = email.startsWith('@') ? email : '@' + email;
      userQuery = userQuery.eq('username', uname);
    } else {
      userQuery = userQuery.eq('email', email);
    }
    const { data: user } = await userQuery.single();

    if (!user) return res.status(401).json({ error: 'Credenciais inválidas' });

    if (!user.password_hash) {
      return res.status(401).json({ error: 'Conta sem senha definida. Use recuperação de senha.' });
    }

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) return res.status(401).json({ error: 'Credenciais inválidas' });

    const token = jwt.sign(
      { userId: user.id, email: user.email, userType: user.user_type },
      JWT_SECRET,
      { expiresIn: '30d' }
    );

    // Never send avatar_url in login response — can be a huge base64 blob; use GET /api/profile
    res.json({ token, userId: user.id, email: user.email, name: user.name, username: user.username, userType: user.user_type });
  } catch (e) {
    console.error('[login] unexpected error:', e.message || e);
    res.status(500).json({ error: 'Erro interno. Tente novamente.' });
  }
});

// Verifica disponibilidade de email (sem criar conta)
app.post('/api/auth/check-email', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'Email obrigatório' });
    const { data: existing } = await supabase.from('users').select('id').eq('email', email).single();
    if (existing) return res.status(409).json({ error: 'Email já cadastrado' });
    res.json({ available: true });
  } catch (e) {
    res.json({ available: true }); // Supabase retorna erro quando não encontra — é available
  }
});

// Esqueci minha senha
app.post('/api/auth/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'Email obrigatório' });
    const { data: user } = await supabase.from('users').select('id, name').eq('email', email).single();
    if (!user) {
      // Don't reveal if email exists
      return res.json({ success: true, message: 'Se o email existir, você receberá as instruções.' });
    }
    // Generate a reset token (simple JWT valid 1h)
    const resetToken = jwt.sign({ userId: user.id, purpose: 'reset' }, JWT_SECRET, { expiresIn: '1h' });
    // Store token in profile (as a simple reset mechanism)
    await supabase.from('profiles').update({ reset_token: resetToken, reset_token_at: new Date().toISOString() }).eq('user_id', user.id);
    // In production, send an email. For now, log the token and return a success message.
    console.log(`[RESET] Token for ${email}: ${resetToken}`);
    res.json({ success: true, message: 'Email de recuperação enviado (verifique os logs em dev).' });
  } catch (e) {
    console.error('Forgot password error:', e);
    res.status(500).json({ error: 'Erro ao processar solicitação' });
  }
});

// Cadastro completo: cria conta + salva onboarding em uma transação
app.post('/api/auth/register-complete', async (req, res) => {
  try {
    const { email, password, name, username, user_type = 'aluno', onboardingData, profile, goals } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Email e senha obrigatórios' });

    const { data: existing } = await supabase.from('users').select('id').eq('email', email).single();
    if (existing) return res.status(409).json({ error: 'Email já cadastrado' });

    const password_hash = await bcrypt.hash(password, 10);
    const { data: user, error: userErr } = await supabase
      .from('users')
      .insert({ email, password_hash, name, username, user_type })
      .select()
      .single();
    if (userErr) throw userErr;

    // Salva avatar se enviado
    const avatarUrl = profile?.avatar || profile?.avatar_url;
    if (avatarUrl && typeof avatarUrl === 'string' && avatarUrl.startsWith('data:') && avatarUrl.length <= 200000) {
      await supabase.from('users').update({ avatar_url: avatarUrl }).eq('id', user.id);
    }

    // Salva perfil + onboarding juntos
    const d = onboardingData || {};
    const weight = parseFloat(d.weight) || null;
    const height = parseFloat(d.height) || null;
    const age = parseInt(d.age) || null;
    const gender = d.gender || null;
    const goal = d.goal || null;
    const activity_level = d.workoutFreq === '6+' ? 1.725 : d.workoutFreq === '3-5' ? 1.55 : 1.375;

    let daily_calories = null, daily_protein = null, daily_carbs = null, daily_fat = null;
    if (weight && height && age && gender) {
      // Mifflin-St Jeor (same formula as frontend)
      const bmr = gender === 'male'
        ? 10 * weight + 6.25 * height - 5 * age + 5
        : 10 * weight + 6.25 * height - 5 * age - 161;
      const tdee = Math.round(bmr * activity_level);
      daily_calories = goal === 'lose' ? tdee - 500 : goal === 'gain' ? tdee + 400 : tdee;
      // Protein: 2g/kg for lose/gain, 1.6g/kg for maintain/health
      const proteinPerKg = (goal === 'maintain' || goal === 'health') ? 1.6 : 2.0;
      daily_protein = Math.round(weight * proteinPerKg);
      daily_fat = Math.round(weight * 0.9);
      daily_carbs = Math.max(0, Math.round((daily_calories - (daily_protein * 4) - (daily_fat * 9)) / 4));
    }

    await supabase.from('profiles').insert({
      user_id: user.id,
      weight, height, age, gender, goal, activity_level,
      biotype: d.biotype, diet: d.diet,
      daily_calories, daily_protein, daily_carbs, daily_fat,
      onboarding_done: true,
      onboarding_data: d,
      updated_at: new Date().toISOString()
    });

    const token = jwt.sign({ userId: user.id, email, userType: user_type }, JWT_SECRET, { expiresIn: '30d' });
    res.json({ token, userId: user.id, email, name: user.name, userType: user_type, daily_calories, daily_protein, daily_carbs, daily_fat });
  } catch (e) {
    console.error('Register-complete error:', e);
    res.status(500).json({ error: 'Erro ao cadastrar. Tente novamente.' });
  }
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'online',
    database: !!process.env.SUPABASE_URL,
    providers: {
      groq: !!process.env.GROQ_API_KEY,
      gemini: !!process.env.GEMINI_API_KEY,
      openai: !!process.env.OPENAI_API_KEY,
    }
  });
});

// Aplica middleware em tudo abaixo
app.use(authMiddleware);

// ── PERFIL ─────────────────────────────────────────────────────

app.get('/api/profile', async (req, res) => {
  try {
    const { data: user } = await supabase
      .from('users')
      .select('name, username, phone, avatar_url, user_type, email')
      .eq('id', req.userId)
      .single();

    const { data: profile } = await supabase
      .from('profiles')
      .select('*')
      .eq('user_id', req.userId)
      .single();

    // Truncate huge base64 avatars — send a boolean flag instead so the client
    // knows an avatar exists but fetches it on demand via GET /api/profile/avatar
    const avatar_url = user?.avatar_url;
    const isBase64 = avatar_url && avatar_url.startsWith('data:');
    const safeAvatarUrl = isBase64 ? '__base64__' : (avatar_url || null);

    res.json({ ...user, avatar_url: safeAvatarUrl, ...profile });
  } catch (e) {
    res.status(500).json({ error: 'Erro ao buscar perfil' });
  }
});

// Retorna apenas o avatar (pode ser grande — chamada separada e opcional)
app.get('/api/profile/avatar', async (req, res) => {
  try {
    const { data: user } = await supabase.from('users').select('avatar_url').eq('id', req.userId).single();
    res.json({ avatar_url: user?.avatar_url || null });
  } catch (e) {
    res.status(500).json({ error: 'Erro ao buscar avatar' });
  }
});

app.post('/api/profile', async (req, res) => {
  try {
    const { name, username, phone, weight, height, age, gender, goal, activity_level, biotype, diet, streak, lastOpenDate } = req.body;
    // Accept both 'avatar_url' and 'avatar' from frontend; skip huge base64 blobs
    let avatar_url = req.body.avatar_url || req.body.avatar || undefined;
    if (avatar_url && avatar_url.startsWith('data:') && avatar_url.length > 200000) {
      avatar_url = undefined; // Too large — client must compress before sending
    }

    const userUpdate = { name, username, phone };
    if (avatar_url !== undefined) userUpdate.avatar_url = avatar_url;
    await supabase.from('users').update(userUpdate).eq('id', req.userId);

    const profileData = { weight, height, age, gender, goal, activity_level, biotype, diet, updated_at: new Date().toISOString() };
    // Persist streak + last open date if provided (requires streak, last_open_date columns in profiles table)
    if (streak !== undefined) profileData.streak = streak;
    if (lastOpenDate !== undefined) profileData.last_open_date = lastOpenDate;

    // Calcula metas calóricas se tiver dados suficientes (Mifflin-St Jeor)
    if (weight && height && age && gender) {
      const bmr = gender === 'male'
        ? 10 * weight + 6.25 * height - 5 * age + 5
        : 10 * weight + 6.25 * height - 5 * age - 161;
      const actLvl = parseFloat(activity_level) || 1.375;
      const tdee = Math.round(bmr * actLvl);
      const target = goal === 'lose' ? tdee - 500 : goal === 'gain' ? tdee + 400 : tdee;
      profileData.daily_calories = target;
      const proteinPerKg = (goal === 'maintain' || goal === 'health') ? 1.6 : 2.0;
      profileData.daily_protein = Math.round(weight * proteinPerKg);
      profileData.daily_fat = Math.round(weight * 0.9);
      profileData.daily_carbs = Math.max(0, Math.round((target - (profileData.daily_protein * 4) - (profileData.daily_fat * 9)) / 4));
    }

    const { data: existing } = await supabase.from('profiles').select('id').eq('user_id', req.userId).single();
    if (existing) {
      await supabase.from('profiles').update(profileData).eq('user_id', req.userId);
    } else {
      await supabase.from('profiles').insert({ user_id: req.userId, ...profileData });
    }

    res.json({ success: true });
  } catch (e) {
    console.error('Profile save error:', e);
    res.status(500).json({ error: 'Erro ao salvar perfil' });
  }
});

// ── ONBOARDING ─────────────────────────────────────────────────

app.post('/api/onboarding', async (req, res) => {
  try {
    const d = req.body.data || req.body;

    const weight = parseFloat(d.weight) || null;
    const height = parseFloat(d.height) || null;
    const age = parseInt(d.age) || null;
    const gender = d.gender || null;
    const goal = d.goal || null;
    const activity_level = d.workoutFreq === '6+' ? 1.725 : d.workoutFreq === '3-5' ? 1.55 : 1.375;

    let daily_calories = null, daily_protein = null, daily_carbs = null, daily_fat = null;

    if (weight && height && age && gender) {
      // Mifflin-St Jeor (same formula as frontend)
      const bmr = gender === 'male'
        ? 10 * weight + 6.25 * height - 5 * age + 5
        : 10 * weight + 6.25 * height - 5 * age - 161;
      const tdee = Math.round(bmr * activity_level);
      daily_calories = goal === 'lose' ? tdee - 500 : goal === 'gain' ? tdee + 400 : tdee;
      const proteinPerKg = (goal === 'maintain' || goal === 'health') ? 1.6 : 2.0;
      daily_protein = Math.round(weight * proteinPerKg);
      daily_fat = Math.round(weight * 0.9);
      daily_carbs = Math.max(0, Math.round((daily_calories - (daily_protein * 4) - (daily_fat * 9)) / 4));
    }

    if (d.name) await supabase.from('users').update({ name: d.name }).eq('id', req.userId);

    const profileData = {
      user_id: req.userId,
      weight, height, age, gender, goal, activity_level, biotype: d.biotype, diet: d.diet,
      daily_calories, daily_protein, daily_carbs, daily_fat,
      onboarding_done: true,
      onboarding_data: d,
      updated_at: new Date().toISOString()
    };

    const { data: existing } = await supabase.from('profiles').select('id').eq('user_id', req.userId).single();
    if (existing) {
      await supabase.from('profiles').update(profileData).eq('user_id', req.userId);
    } else {
      await supabase.from('profiles').insert(profileData);
    }

    res.json({ success: true, daily_calories, daily_protein, daily_carbs, daily_fat });
  } catch (e) {
    console.error('Onboarding error:', e);
    res.status(500).json({ error: 'Erro ao salvar onboarding' });
  }
});

// ── REFEIÇÕES ──────────────────────────────────────────────────

app.get('/api/meals', async (req, res) => {
  try {
    const { date } = req.query;
    let query = supabase.from('meals').select('*').eq('user_id', req.userId).order('logged_at', { ascending: false });

    if (date) {
      const start = `${date}T00:00:00.000Z`;
      const end = `${date}T23:59:59.999Z`;
      query = query.gte('logged_at', start).lte('logged_at', end);
    } else {
      query = query.limit(100);
    }

    const { data, error } = await query;
    if (error) throw error;
    // Map meal_type -> type for frontend compatibility
    const meals = (data || []).map(m => ({ ...m, type: m.meal_type }));
    res.json(meals);
  } catch (e) {
    res.status(500).json({ error: 'Erro ao buscar refeições' });
  }
});

app.post('/api/meals', async (req, res) => {
  try {
    const body = req.body;
    const id = body.id;
    const name = body.name;
    const type = body.type || body.meal_type || 'food';
    const grams = body.grams;
    const ingredients = body.ingredients;
    const meal_window = body.meal_window;

    // Support both flat fields and nested macros object (client sends macros: {cal,p,c,f})
    const macros = body.macros || {};
    const calories = body.calories ?? body.cals ?? macros.cal ?? macros.calories ?? 0;
    const protein  = body.protein  ?? macros.p  ?? macros.protein  ?? 0;
    const carbs    = body.carbs    ?? macros.c  ?? macros.carbs    ?? 0;
    const fat      = body.fat      ?? macros.f  ?? macros.fat      ?? 0;

    // Salva imagem base64 até 500KB — acima disso descarta para evitar estourar o DB
    // (canvas captura em 640x640 JPEG 0.65 ≈ 80-130KB → bem abaixo do limite)
    let image_url = body.image_url || body.image || null;
    if (image_url && image_url.startsWith('data:') && image_url.length > 500000) {
      image_url = null;
    }

    if (id) {
      const { data, error } = await supabase
        .from('meals')
        .update({ name, meal_type: type, calories, protein, carbs, fat, grams, ingredients, image_url, meal_window })
        .eq('id', id)
        .eq('user_id', req.userId)
        .select()
        .single();
      if (error) throw error;
      return res.json({ success: true, meal: { ...data, type: data.meal_type } });
    }

    const { data, error } = await supabase
      .from('meals')
      .insert({ user_id: req.userId, name, meal_type: type, calories, protein, carbs, fat, grams, ingredients, image_url, meal_window })
      .select()
      .single();

    if (error) throw error;
    res.json({ success: true, meal: { ...data, type: data.meal_type } });
  } catch (e) {
    console.error('Meal save error:', e);
    res.status(500).json({ error: 'Erro ao salvar refeição' });
  }
});

app.delete('/api/meals/:id', async (req, res) => {
  try {
    await supabase.from('meals').delete().eq('id', req.params.id).eq('user_id', req.userId);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: 'Erro ao deletar refeição' });
  }
});

// ── CHECK-INS ──────────────────────────────────────────────────

app.get('/api/checkins', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('checkins')
      .select('*')
      .eq('user_id', req.userId)
      .order('date', { ascending: false })
      .limit(90);
    if (error) throw error;
    // Retorna como objeto { "YYYY-MM-DD": {...} } para compatibilidade
    const result = {};
    (data || []).forEach(c => { result[c.date] = c; });
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: 'Erro ao buscar checkins' });
  }
});

app.post('/api/checkins', async (req, res) => {
  try {
    const entries = Array.isArray(req.body) ? req.body : Object.entries(req.body).map(([date, data]) => ({ date, ...data }));

    for (const entry of entries) {
      const { date, mood, workout_type, workout_specific, workout_duration, workout_intensity, sleep_minutes, water_ml, calories_burned, note } = entry;
      const upsertData = { user_id: req.userId, date: date || new Date().toISOString().split('T')[0], mood, workout_type, workout_duration, workout_intensity, sleep_minutes, water_ml };
      if (workout_specific !== undefined) upsertData.workout_specific = workout_specific;
      if (calories_burned !== undefined) upsertData.calories_burned = calories_burned;
      if (note !== undefined) upsertData.note = note;

      const { error } = await supabase.from('checkins').upsert(upsertData, { onConflict: 'user_id,date' });
      if (error) {
        console.error('Checkin upsert error:', JSON.stringify(error));
        // If extra columns don't exist yet (migration not run), retry with base columns only
        const isColumnError = error.code === 'PGRST204' || error.code === '42703' ||
          (error.message && (error.message.includes('column') || error.message.includes('does not exist')));
        if (isColumnError) {
          const baseData = { user_id: req.userId, date: upsertData.date, mood: upsertData.mood, workout_type: upsertData.workout_type, workout_duration: upsertData.workout_duration, workout_intensity: upsertData.workout_intensity, sleep_minutes: upsertData.sleep_minutes, water_ml: upsertData.water_ml };
          const { error: e2 } = await supabase.from('checkins').upsert(baseData, { onConflict: 'user_id,date' });
          if (e2) console.error('Checkin base upsert error:', JSON.stringify(e2));
          else console.log('Checkin saved (base fields only — run migrate.sql to enable full saving)');
        }
      }
    }
    res.json({ success: true });
  } catch (e) {
    console.error('Checkin error:', e);
    res.status(500).json({ error: 'Erro ao salvar checkin' });
  }
});

// ── HISTÓRICO DE CHAT ──────────────────────────────────────────

app.get('/api/chat/history', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('chat_history')
      .select('*')
      .eq('user_id', req.userId)
      .order('created_at', { ascending: true })
      .limit(100);
    if (error) throw error;
    res.json((data || []).map(m => ({ role: m.role, text: m.message, date: m.created_at })));
  } catch (e) {
    res.status(500).json({ error: 'Erro ao buscar histórico' });
  }
});

app.post('/api/chat/history', async (req, res) => {
  try {
    const messages = req.body.messages || [];
    // Salva apenas as últimas mensagens novas (evita duplicação)
    const toInsert = messages.slice(-20).map(m => ({
      user_id: req.userId,
      role: m.role === 'assistant' ? 'assistant' : 'user',
      message: m.text || m.message || ''
    }));
    if (toInsert.length) {
      await supabase.from('chat_history').delete().eq('user_id', req.userId);
      await supabase.from('chat_history').insert(toInsert);
    }
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: 'Erro ao salvar histórico' });
  }
});

// ── RESET DE CONTA ─────────────────────────────────────────────

app.post('/api/reset', async (req, res) => {
  try {
    await Promise.all([
      supabase.from('meals').delete().eq('user_id', req.userId),
      supabase.from('checkins').delete().eq('user_id', req.userId),
      supabase.from('chat_history').delete().eq('user_id', req.userId),
      supabase.from('workout_sessions').delete().eq('user_id', req.userId),
      supabase.from('profiles').update({ onboarding_done: false, onboarding_data: null }).eq('user_id', req.userId),
    ]);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: 'Erro ao resetar conta' });
  }
});

// ── BANCO DE ALIMENTOS ─────────────────────────────────────────

app.get('/api/foods', (req, res) => res.json(FOOD_DB));

// ── TREINOS ────────────────────────────────────────────────────

// Lista programas disponíveis (públicos + criados pela academia do aluno)
// O programa atribuído ao aluno vem primeiro com is_assigned:true e custom_exercises
app.get('/api/workouts', async (req, res) => {
  try {
    // Busca vínculos ativos — ordenados por updated_at DESC para garantir que o mais recente seja o card 1
    let link = null;
    const { data: links, error: linksErr } = await supabase
      .from('academia_students')
      .select('assigned_program_id, academia_id, custom_exercises')
      .eq('student_id', req.userId)
      .eq('status', 'active');

    if (linksErr) console.error('[workouts] links query error:', linksErr.message);
    console.log(`[workouts] student=${req.userId} found ${links?.length || 0} academia links`, JSON.stringify(links));

    if (links?.length) {
      // O mais recente (links[0]) é sempre o plano principal
      link = links[0];
    }

    let assignedProgram = null;

    // Caso 1: tem programa atribuído pela academia
    if (link?.assigned_program_id) {
      console.log(`[workouts] fetching assigned program id=${link.assigned_program_id}`);
      const { data: ap, error: apErr } = await supabase
        .from('workout_programs')
        .select('*')
        .eq('id', link.assigned_program_id)
        .single();
      if (apErr) console.error('[workouts] program fetch error:', apErr.message);
      console.log(`[workouts] program found:`, ap ? ap.name : 'NOT FOUND');
      if (ap) {
        assignedProgram = {
          ...ap,
          is_assigned: true,
          custom_exercises: link.custom_exercises || null,
          is_custom: !!link.custom_exercises
        };
      }
    }

    // Caso 2: tem plano personalizado (custom_exercises sem assigned_program_id)
    if (!assignedProgram && link?.custom_exercises) {
      const ce = link.custom_exercises;
      let exercises = [];
      let customName = 'Meu Plano Personalizado';
      if (Array.isArray(ce)) {
        exercises = ce;
      } else if (ce && typeof ce === 'object') {
        exercises = Array.isArray(ce.exercises) ? ce.exercises : [];
        if (ce.name) customName = ce.name;
      }
      if (exercises.length > 0) {
        assignedProgram = {
          id: 'custom_' + req.userId,
          name: customName,
          category: 'Personalizado',
          categories: [],
          exercises: exercises,
          is_assigned: true,
          is_custom: true,
          custom_exercises: link.custom_exercises
        };
      }
    }

    // Programas inscritos pelo próprio aluno (Personal Shop)
    const { data: profileData } = await supabase
      .from('profiles').select('onboarding_data').eq('user_id', req.userId).single();
    const subscribedIds = profileData?.onboarding_data?.subscribed_programs || [];
    let subscribedPrograms = [];
    if (subscribedIds.length > 0) {
      const { data: sp } = await supabase
        .from('workout_programs').select('*').in('id', subscribedIds);
      subscribedPrograms = (sp || []).map(p => ({ ...p, is_subscribed: true }));
    }

    // Programas do shop — qualquer programa marcado como is_public (built-in ou de academia que optou)
    const { data: fp } = await supabase
      .from('workout_programs')
      .select('*')
      .eq('is_public', true);
    const freePrograms = fp || [];

    console.log(`[workouts] assignedProgram=${assignedProgram?.name || 'none'} subscribed=${subscribedPrograms.length} shop=${freePrograms.length}`);

    // Ordem: atribuído → inscritos → shop (sem duplicatas)
    // Programas inscritos que também são públicos recebem is_shop:true (continuam no shop)
    const result = [];
    if (assignedProgram) result.push(assignedProgram);
    subscribedPrograms.forEach(p => {
      if (!result.some(r => r.id === p.id)) {
        const isPublic = freePrograms.some(f => f.id === p.id);
        result.push({ ...p, is_shop: isPublic ? true : undefined });
      }
    });
    freePrograms.forEach(p => {
      if (!result.some(r => r.id === p.id)) result.push({ ...p, is_shop: true });
    });

    res.json(result);
  } catch (e) {
    res.status(500).json({ error: 'Erro ao buscar treinos' });
  }
});

// Inscrição do aluno em programa do shop
app.post('/api/workouts/subscribe', async (req, res) => {
  try {
    const { program_id, set_as_main } = req.body;
    if (!program_id) return res.status(400).json({ error: 'program_id obrigatório' });

    const { data: profile } = await supabase
      .from('profiles').select('onboarding_data').eq('user_id', req.userId).single();
    const od = profile?.onboarding_data || {};
    const subs = Array.isArray(od.subscribed_programs) ? [...od.subscribed_programs] : [];

    if (!subs.includes(program_id)) subs.push(program_id);
    if (set_as_main) od.main_program_id = program_id;
    od.subscribed_programs = subs;

    await supabase.from('profiles').update({ onboarding_data: od }).eq('user_id', req.userId);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: 'Erro ao salvar inscrição' });
  }
});

// Desinscrição do aluno de um programa do shop
app.post('/api/workouts/unsubscribe', async (req, res) => {
  try {
    const { program_id } = req.body;
    if (!program_id) return res.status(400).json({ error: 'program_id obrigatório' });

    const { data: profile } = await supabase
      .from('profiles').select('onboarding_data').eq('user_id', req.userId).single();
    const od = profile?.onboarding_data || {};
    const subs = Array.isArray(od.subscribed_programs) ? od.subscribed_programs : [];
    od.subscribed_programs = subs.filter(id => id !== program_id);

    await supabase.from('profiles').update({ onboarding_data: od }).eq('user_id', req.userId);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: 'Erro ao remover inscrição' });
  }
});

// Progresso de treino do usuário
app.get('/api/workouts/progress', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('workout_sessions')
      .select('*')
      .eq('user_id', req.userId)
      .order('date', { ascending: false })
      .limit(60);
    if (error) throw error;
    const result = {};
    (data || []).forEach(s => {
      if (!result[s.date]) result[s.date] = {};
      if (s.program_id) result[s.date][s.program_id] = s.completed_sets;
    });
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: 'Erro ao buscar progresso' });
  }
});

app.post('/api/workouts/progress', async (req, res) => {
  try {
    // Accept either { date: { programId: completed_sets } } or
    // { date: { programId: { completed_sets, notes, duration_minutes } } }
    const entries = req.body;
    for (const [date, programs] of Object.entries(entries)) {
      for (const [programId, payload] of Object.entries(programs)) {
        const isRich = payload && typeof payload === 'object' && !Array.isArray(payload) && ('completed_sets' in payload || 'notes' in payload);
        const completed_sets = isRich ? payload.completed_sets : payload;
        const upsertRow = { user_id: req.userId, program_id: programId || null, date, completed_sets };
        if (isRich && payload.notes) upsertRow.notes = payload.notes;
        if (isRich && payload.duration_minutes) upsertRow.duration_minutes = payload.duration_minutes;
        const { error } = await supabase.from('workout_sessions').upsert(upsertRow, { onConflict: 'user_id,program_id,date' });
        if (error) console.error('Workout session upsert error:', JSON.stringify(error));
      }
    }
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: 'Erro ao salvar progresso' });
  }
});

// ── ACADEMIA ENDPOINTS ─────────────────────────────────────────

// Lista alunos da academia
app.get('/api/academia/students', async (req, res) => {
  try {
    if (req.userType !== 'academia') return res.status(403).json({ error: 'Acesso negado' });

    // Busca links de alunos
    const { data: links, error } = await supabase
      .from('academia_students')
      .select('id, academia_id, student_id, assigned_program_id, status, custom_exercises')
      .eq('academia_id', req.userId);
    if (error) throw error;
    if (!links || links.length === 0) return res.json([]);

    // Busca dados dos alunos separadamente (evita depender de FK no Supabase)
    const studentIds = [...new Set(links.map(l => l.student_id).filter(Boolean))];
    const programIds = [...new Set(links.map(l => l.assigned_program_id).filter(Boolean))];

    const [studentsRes, programsRes] = await Promise.all([
      studentIds.length > 0
        ? supabase.from('users').select('id, name, email').in('id', studentIds)
        : Promise.resolve({ data: [] }),
      programIds.length > 0
        ? supabase.from('workout_programs').select('id, name, category').in('id', programIds)
        : Promise.resolve({ data: [] })
    ]);

    const studentsMap = Object.fromEntries((studentsRes.data || []).map(s => [s.id, s]));
    const programsMap = Object.fromEntries((programsRes.data || []).map(p => [p.id, p]));

    const result = links.map(link => ({
      ...link,
      student: studentsMap[link.student_id] || null,
      program: link.assigned_program_id ? (programsMap[link.assigned_program_id] || null) : null
    }));

    res.json(result);
  } catch (e) {
    console.error('academia/students error:', e);
    res.status(500).json({ error: 'Erro ao buscar alunos' });
  }
});

// Adiciona aluno à academia
app.post('/api/academia/students', async (req, res) => {
  try {
    if (req.userType !== 'academia') return res.status(403).json({ error: 'Acesso negado' });
    const { student_email, student_username, assigned_program_id, custom_exercises } = req.body;

    // Busca por email ou por @username ou por nome
    const identifier = (student_username || student_email || '').trim();
    let student = null;

    if (!identifier) {
      return res.status(400).json({ error: 'Informe o email ou @username do aluno' });
    }

    // Busca em users — sem filtro user_type pois alunos podem ter diferentes tipos
    const baseQ = () => supabase.from('users').select('id, name, email, username, user_type');

    console.log(`[add-student] identifier="${identifier}"`);

    if (identifier.startsWith('@')) {
      // @username — case-insensitive
      const uname = identifier.slice(1);
      const { data, error } = await baseQ().ilike('username', uname).limit(1);
      console.log(`[add-student] @username lookup "${uname}":`, JSON.stringify(data), error?.message);
      student = data?.[0] || null;
    } else if (identifier.includes('@')) {
      // email
      const { data, error } = await baseQ().eq('email', identifier.toLowerCase()).limit(1);
      console.log(`[add-student] email lookup:`, JSON.stringify(data), error?.message);
      student = data?.[0] || null;
    } else {
      // Texto livre: tenta username primeiro, depois nome, depois email parcial
      const { data: byUser, error: e1 } = await baseQ().ilike('username', identifier).limit(1);
      console.log(`[add-student] username lookup "${identifier}":`, JSON.stringify(byUser), e1?.message);
      if (byUser?.[0]) {
        student = byUser[0];
      } else {
        const { data: byName, error: e2 } = await baseQ().ilike('name', `%${identifier}%`).limit(1);
        console.log(`[add-student] name lookup:`, JSON.stringify(byName), e2?.message);
        if (byName?.[0]) {
          student = byName[0];
        } else {
          const { data: byEmail, error: e3 } = await baseQ().ilike('email', `%${identifier}%`).limit(1);
          console.log(`[add-student] email-partial lookup:`, JSON.stringify(byEmail), e3?.message);
          student = byEmail?.[0] || null;
        }
      }
    }

    // Rejeita academia tentando adicionar outra academia como aluno
    if (student && student.user_type === 'academia') {
      return res.status(400).json({ error: 'Este usuário é uma academia, não pode ser adicionado como aluno.' });
    }

    console.log(`[add-student] student found:`, student ? `id=${student.id} type=${student.user_type}` : 'NOT FOUND');
    if (!student) return res.status(404).json({ error: 'Aluno não encontrado. Verifique o email ou @username.' });

    // Busca link existente com maybeSingle() — não lança exceção se não encontrar
    const { data: existing } = await supabase
      .from('academia_students')
      .select('id, assigned_program_id')
      .eq('academia_id', req.userId)
      .eq('student_id', student.id)
      .maybeSingle();

    const prevProgramId = existing?.assigned_program_id || null;

    const linkFields = {
      assigned_program_id: assigned_program_id ?? null,
      status: 'active'
    };
    if (custom_exercises !== undefined) linkFields.custom_exercises = custom_exercises;

    let result;
    if (existing) {
      // Atualiza link existente
      const { data: upd, error: updErr } = await supabase
        .from('academia_students')
        .update(linkFields)
        .eq('id', existing.id)
        .select()
        .single();
      if (updErr) {
        console.error('[add-student update]', JSON.stringify(updErr));
        return res.status(500).json({ error: 'Erro ao atualizar vínculo do aluno' });
      }
      result = upd;
    } else {
      // Insere novo link
      const { data: ins, error: insErr } = await supabase
        .from('academia_students')
        .insert({ academia_id: req.userId, student_id: student.id, ...linkFields })
        .select()
        .single();
      if (insErr) {
        console.error('[add-student insert]', JSON.stringify(insErr));
        return res.status(500).json({ error: 'Erro ao criar vínculo do aluno' });
      }
      result = ins;
    }

    // Preserva histórico: move programa anterior para subscribed_programs do aluno
    // NÃO toca em pinned_program_id — isso é escolha do próprio aluno
    if (assigned_program_id && student?.id && prevProgramId && prevProgramId !== assigned_program_id) {
      const { data: profData } = await supabase
        .from('profiles').select('onboarding_data').eq('user_id', student.id).single();
      const od = profData?.onboarding_data || {};
      const subs = Array.isArray(od.subscribed_programs) ? [...od.subscribed_programs] : [];
      if (!subs.includes(prevProgramId)) subs.push(prevProgramId);
      od.subscribed_programs = subs;
      await supabase.from('profiles').update({ onboarding_data: od }).eq('user_id', student.id);
    }

    res.json({ success: true, data: result });
  } catch (e) {
    console.error('[add-student exception]', e.message, JSON.stringify(e));
    res.status(500).json({ error: 'Erro ao adicionar aluno' });
  }
});

// Atualiza programa e/ou exercícios customizados do aluno
app.patch('/api/academia/students/:studentId', async (req, res) => {
  try {
    if (req.userType !== 'academia') return res.status(403).json({ error: 'Acesso negado' });
    const { assigned_program_id, status, custom_exercises } = req.body;

    // Busca student_id e programa anterior para preservar histórico
    const { data: linkData } = await supabase
      .from('academia_students')
      .select('student_id, assigned_program_id')
      .eq('academia_id', req.userId)
      .eq('id', req.params.studentId)
      .single();

    const updateData = {};
    if (assigned_program_id !== undefined) updateData.assigned_program_id = assigned_program_id;
    if (status !== undefined) updateData.status = status;
    if (custom_exercises !== undefined) updateData.custom_exercises = custom_exercises;
    if (Object.keys(updateData).length === 0) return res.json({ success: true }); // nada mudou

    const { error } = await supabase
      .from('academia_students')
      .update(updateData)
      .eq('academia_id', req.userId)
      .eq('id', req.params.studentId);

    if (error) return res.status(500).json({ error: error.message });

    // Preserva histórico: move programa anterior para subscribed_programs do aluno
    // NÃO toca em pinned_program_id — isso é escolha do próprio aluno
    const prevProgramId = linkData?.assigned_program_id || null;
    if (assigned_program_id && linkData?.student_id && prevProgramId && prevProgramId !== assigned_program_id) {
      const { data: profData } = await supabase
        .from('profiles').select('onboarding_data').eq('user_id', linkData.student_id).single();
      const od = profData?.onboarding_data || {};
      const subs = Array.isArray(od.subscribed_programs) ? [...od.subscribed_programs] : [];
      if (!subs.includes(prevProgramId)) subs.push(prevProgramId);
      od.subscribed_programs = subs;
      await supabase.from('profiles').update({ onboarding_data: od }).eq('user_id', linkData.student_id);
    }

    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: 'Erro ao atualizar aluno' });
  }
});

// Histórico do aluno (check-ins e treinos nos últimos N dias)
app.get('/api/academia/students/:studentId/history', async (req, res) => {
  try {
    if (req.userType !== 'academia') return res.status(403).json({ error: 'Acesso negado' });
    const days = Math.min(parseInt(req.query.days) || 30, 90);
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    // Verify the student belongs to this academia
    const { data: link } = await supabase
      .from('academia_students')
      .select('student_id')
      .eq('academia_id', req.userId)
      .eq('id', req.params.studentId)
      .single();

    if (!link) return res.status(404).json({ error: 'Aluno não encontrado' });

    // Try full select first (requires migrate.sql to have been run)
    let checkinData = null;
    const fullSelect = await supabase.from('checkins').select('date, mood, note, workout_type, workout_specific, workout_duration, calories_burned, water_ml').eq('user_id', link.student_id).gte('date', since).order('date', { ascending: false });
    if (fullSelect.error) {
      console.warn('Full checkin select failed (missing columns?), falling back to base columns:', fullSelect.error.message);
      const baseSelect = await supabase.from('checkins').select('date, mood, workout_type, workout_duration, water_ml').eq('user_id', link.student_id).gte('date', since).order('date', { ascending: false });
      checkinData = baseSelect.data;
    } else {
      checkinData = fullSelect.data;
    }

    const { data: sessions } = await supabase.from('workout_sessions').select('date, program_id, completed_sets, duration_minutes, notes, created_at').eq('user_id', link.student_id).gte('date', since).order('date', { ascending: false });

    // Merge workout session names into checkins as fallback for missing columns
    const sessionsByDate = {};
    (sessions || []).forEach(s => {
      if (!sessionsByDate[s.date]) sessionsByDate[s.date] = s;
    });
    const mergedCheckins = (checkinData || []).map(c => {
      const s = sessionsByDate[c.date];
      return {
        ...c,
        workout_specific: c.workout_specific || (s && s.notes) || null,
        workout_duration: c.workout_duration || (s && s.duration_minutes) || null
      };
    });

    // D2-I — Montar exercises_detail cruzando completed_sets com exercícios do programa
    const programIds = [...new Set((sessions||[]).map(s=>s.program_id).filter(Boolean))];
    let programsMap = {};
    if (programIds.length) {
      const { data: progs } = await supabase
        .from('workout_programs').select('id,name,exercises').in('id', programIds);
      (progs||[]).forEach(p => { programsMap[p.id] = p; });
    }
    const sessionsWithDetail = (sessions||[]).map(s => {
      const prog = programsMap[s.program_id];
      if (!prog || !s.completed_sets) return s;
      let flatEx = [];
      const ex = prog.exercises;
      if (Array.isArray(ex)) { flatEx = ex; }
      else if (ex?._structured) {
        const day = ex.days?.find(d => d.name === s.completed_sets._day);
        flatEx = day ? (day.exercises||[]) : (ex.flat||[]);
      }
      const sessionStatus = s.completed_sets?._status;
      const exercises_detail = flatEx.map((e, i) => {
        const total = e.sets || 3;
        const done = Array.from({length:total},(_,si)=>s.completed_sets[`${i}-${si}`]===true).filter(Boolean).length;
        const w = s.completed_sets._weights?.[e.name]
            ?? s.completed_sets._weights?.[String(i)] ?? 0;
        return { name:e.name, sets_done:done, sets_total:total, weight:w, reps:e.reps||'?' };
      // Fix 4A: Para sessões em andamento, mostrar todos os exercícios (não só os concluídos)
      }).filter(e => e.sets_done > 0 || sessionStatus === 'em_andamento');
      return { ...s, program_name: prog.name, exercises_detail };
    });

    res.json({ checkins: mergedCheckins, sessions: sessionsWithDetail });
  } catch (e) {
    res.status(500).json({ error: 'Erro ao buscar histórico' });
  }
});

// Remove aluno da academia
app.delete('/api/academia/students/:studentId', async (req, res) => {
  try {
    if (req.userType !== 'academia') return res.status(403).json({ error: 'Acesso negado' });
    await supabase
      .from('academia_students')
      .delete()
      .eq('academia_id', req.userId)
      .eq('id', req.params.studentId);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: 'Erro ao remover aluno' });
  }
});

// Programas criados pela academia
// ── IA: interpreta treino colado em texto livre e retorna exercícios estruturados
app.post('/api/academia/programs/parse-ai', async (req, res) => {
  try {
    if (req.userType !== 'academia') return res.status(403).json({ error: 'Acesso negado' });
    const { text } = req.body;
    if (!text || text.trim().length < 10) return res.status(400).json({ error: 'Texto muito curto para analisar' });

    const groqKey = process.env.GROQ_API_KEY;
    if (!groqKey) return res.status(500).json({ error: 'IA não configurada' });

    const prompt = `Você é especialista em educação física. Analise o texto de treino abaixo e retorne APENAS um JSON válido, sem nenhum texto extra antes ou depois.

TEXTO DO TREINO:
${text.substring(0, 4000)}

FORMATO DE SAÍDA (JSON puro):
{
  "name": "nome do protocolo se houver, senão deixe vazio",
  "observations": "instruções gerais extraídas do texto (ex: progressão de carga, frequência semanal, instruções do personal). Deixe '' se não houver.",
  "cardio": "prescrição de cardio extraída do texto (ex: '20min esteira zona 2 antes do treino'). Deixe '' se não houver.",
  "categories": ["lista EXATA de grupos presentes: Peito, Costas, Bíceps, Tríceps, Ombros, Pernas, Abdômen, Cardio"],
  "days": [
    {
      "name": "Treino A",
      "focus": "Peito/Bíceps",
      "rest_label": "35-45s",
      "weekday": null,
      "order": 1,
      "exercises": [
        {
          "name": "nome do exercício em português",
          "sets": 4,
          "reps": "10-12",
          "rest_seconds": 45,
          "target_weight": 0,
          "notes": "observações especiais se houver (ex: até a falha, drop set, isometria 10s)",
          "video_url": ""
        }
      ]
    }
  ],
  "exercises": []
}

REGRA CRÍTICA — DETECÇÃO DE DIAS:
- Se o texto contiver cabeçalhos como "Treino A:", "Treino B:", "Treino C:", "Dia 1:", "Dia 2:", "Dia A:", "Dia B:", ou qualquer seção com label que identifique dias/blocos distintos de treino → você DEVE retorná-los como objetos separados no array "days". NUNCA achate um programa multi-dia em uma lista única de exercícios.
- Cada dia deve preservar seus próprios exercícios, foco e informações de descanso.
- Se NÃO houver blocos distintos → "days" = [] e os exercícios vão em "exercises" (flat).

REGRAS DE WEEKDAY:
- "weekday" só deve ser preenchido se o texto EXPLICITAMENTE mencionar o dia da semana (ex: "Treino A - Segunda", "Terça-feira", "Monday").
- weekday: 0=Dom, 1=Seg, 2=Ter, 3=Qua, 4=Qui, 5=Sex, 6=Sáb
- Se o dia da semana NÃO for mencionado explicitamente → use weekday: null e adicione "order": 1, 2, 3... (ordem sequencial no texto).
- NUNCA infira ou distribua weekdays automaticamente (ex: Treino A = seg, Treino B = ter). Só preencha weekday quando o texto disser explicitamente.

REGRAS OBRIGATÓRIAS:
- Traduza exercícios para português brasileiro
- sets: número inteiro (padrão 3)
- reps: string como "10-12" ou "12" (padrão "10-12")
- rest_seconds: inteiro em segundos baseado no intervalo do bloco (padrão 60)
- target_weight sempre 0, video_url sempre ""
- notes: capture observações do exercício (ex: "até a falha", "drop set 6/6/falha", "isometria 10s", "execução lenta", "2x 12-15 + 2x 10-12"). Deixe "" se não houver.
- Detecte TODOS os grupos musculares. Use EXATAMENTE: Peito, Costas, Bíceps, Tríceps, Ombros, Pernas, Abdômen, Cardio
- "days" SEMPRE presente — mesmo que vazio []
- "exercises" raiz = TODOS os exercícios de TODOS os dias juntos numa lista plana (fallback de compatibilidade)
- Retorne APENAS o JSON, absolutamente nada mais`;

    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${groqKey}` },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.1,
        max_tokens: 8000
      })
    });

    const aiData = await response.json();
    const raw = aiData.choices?.[0]?.message?.content || '';
    console.log('[parse-ai] finish_reason:', aiData.choices?.[0]?.finish_reason, '| raw length:', raw.length);

    // Extract JSON block from response
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.error('AI parse: no JSON found in response:', raw.substring(0, 200));
      return res.status(500).json({ error: 'IA não conseguiu interpretar o treino. Tente reformatar o texto.' });
    }

    // Tenta reparar JSON truncado por max_tokens
    let rawJson = jsonMatch[0];
    let parsed;
    try {
      parsed = JSON.parse(rawJson);
    } catch (parseErr) {
      console.warn('[parse-ai] JSON truncado, tentando reparar...', parseErr.message);
      // Fecha arrays e objetos abertos no final do JSON truncado
      let depth = 0;
      let inString = false;
      let escape = false;
      for (const ch of rawJson) {
        if (escape) { escape = false; continue; }
        if (ch === '\\' && inString) { escape = true; continue; }
        if (ch === '"') { inString = !inString; continue; }
        if (!inString) {
          if (ch === '{' || ch === '[') depth++;
          else if (ch === '}' || ch === ']') depth--;
        }
      }
      // Remove trailing comma/incomplete element before closing
      let repaired = rawJson.replace(/,\s*$/, '').replace(/,\s*([}\]])/g, '$1');
      // Fecha estruturas abertas
      const stack = [];
      inString = false; escape = false;
      for (const ch of repaired) {
        if (escape) { escape = false; continue; }
        if (ch === '\\' && inString) { escape = true; continue; }
        if (ch === '"') { inString = !inString; continue; }
        if (!inString) {
          if (ch === '{') stack.push('}');
          else if (ch === '[') stack.push(']');
          else if (ch === '}' || ch === ']') stack.pop();
        }
      }
      repaired += stack.reverse().join('');
      try {
        parsed = JSON.parse(repaired);
        console.log('[parse-ai] JSON reparado com sucesso');
      } catch (e2) {
        console.error('[parse-ai] Falha ao reparar JSON:', e2.message, '| raw snippet:', rawJson.slice(-200));
        return res.status(500).json({ error: 'Erro ao analisar com IA: JSON inválido. Tente dividir o treino em partes menores.' });
      }
    }
    if (!Array.isArray(parsed.exercises) || parsed.exercises.length === 0) {
      return res.status(400).json({ error: 'Nenhum exercício encontrado no texto. Verifique o formato.' });
    }

    // Garante days como array
    if (!Array.isArray(parsed.days)) parsed.days = [];

    // Normaliza exercícios dentro de cada dia
    const normalizeEx = ex => ({
      name:          ex.name || 'Exercício',
      sets:          parseInt(ex.sets) || 3,
      reps:          String(ex.reps || '10-12'),
      rest_seconds:  parseInt(ex.rest_seconds) || 60,
      target_weight: 0,
      notes:         ex.notes || '',
      video_url:     ''
    });

    parsed.days = parsed.days.map((d, i) => ({
      name:       d.name || `Treino ${String.fromCharCode(65 + i)}`,
      focus:      d.focus || '',
      rest_label: d.rest_label || '',
      weekday:    (d.weekday != null && Number.isInteger(d.weekday)) ? d.weekday : null,
      order:      d.order ?? (i + 1),
      exercises:  Array.isArray(d.exercises) ? d.exercises.map(normalizeEx) : []
    }));

    // Reconstrói exercises flat a partir dos dias (se days preenchido) — ou normaliza o que veio
    if (parsed.days.length > 0) {
      parsed.exercises = parsed.days.flatMap(d => d.exercises);
    } else {
      if (!Array.isArray(parsed.exercises)) parsed.exercises = [];
      parsed.exercises = parsed.exercises.map(normalizeEx);
    }

    if (Array.isArray(parsed.exercises) && parsed.exercises.length === 0 && parsed.days.length === 0) {
      return res.status(400).json({ error: 'Nenhum exercício encontrado no texto. Verifique o formato.' });
    }

    if (!Array.isArray(parsed.categories)) parsed.categories = [];
    // Fix 1B: Garantir que observations e cardio estão no response
    if (typeof parsed.observations !== 'string') parsed.observations = '';
    if (typeof parsed.cardio !== 'string') parsed.cardio = '';
    res.json(parsed);
  } catch (e) {
    console.error('AI parse error:', e);
    res.status(500).json({ error: 'Erro ao analisar com IA: ' + e.message });
  }
});

app.get('/api/academia/programs', async (req, res) => {
  try {
    if (req.userType !== 'academia') return res.status(403).json({ error: 'Acesso negado' });
    const { data } = await supabase
      .from('workout_programs')
      .select('*')
      .eq('created_by', req.userId);
    res.json(data || []);
  } catch (e) {
    res.status(500).json({ error: 'Erro ao buscar programas' });
  }
});

// Cria programa de treino
app.post('/api/academia/programs', async (req, res) => {
  try {
    if (req.userType !== 'academia') return res.status(403).json({ error: 'Acesso negado' });
    const { name, category, categories, description, exercises, days, observations = '', cardio = '' } = req.body;

    // Normaliza: category = string CSV, categories derivado do mesmo
    const categoryStr = category || (Array.isArray(categories) ? categories.join(',') : '');

    // Se há dias estruturados, salvar exercises como objeto { _structured, days, flat, observations, cardio }
    // Isso evita dependência de coluna extra no banco
    let exercisesPayload = exercises;
    if (Array.isArray(days) && days.length > 0) {
      exercisesPayload = { _structured: true, observations, cardio, days, flat: exercises || [] };
    } else if (observations || cardio) {
      exercisesPayload = { _structured: true, observations, cardio, days: [], flat: exercises || [] };
    }

    // Insert robusto — apenas campos que certamente existem na tabela
    const insertData = {
      name,
      category: categoryStr,
      created_by: req.userId,
      is_public: false
    };
    // Campos opcionais — só inclui se tiver valor (evita erro de coluna inexistente)
    if (description) insertData.description = description;
    if (exercisesPayload) insertData.exercises = exercisesPayload;

    const { data, error } = await supabase
      .from('workout_programs')
      .insert(insertData)
      .select()
      .single();

    if (error) {
      console.error('Supabase insert program error:', JSON.stringify(error));
      return res.status(500).json({ error: error.message || 'Erro ao criar programa' });
    }
    // Retorna com categories como array para o frontend
    res.json({ success: true, program: { ...data, categories: categoryStr.split(',').map(s => s.trim()).filter(Boolean) } });
  } catch (e) {
    console.error('Create program error:', e);
    res.status(500).json({ error: 'Erro ao criar programa' });
  }
});

// Atualiza programa de treino
app.put('/api/academia/programs/:id', async (req, res) => {
  try {
    if (req.userType !== 'academia') return res.status(403).json({ error: 'Acesso negado' });
    const { name, category, categories, description, exercises, is_public } = req.body;

    // Só atualiza campos enviados — permite toggle de is_public sem sobrescrever nome/categoria
    const updateData = {};
    if (name !== undefined) updateData.name = name;
    if (category !== undefined || categories !== undefined) {
      updateData.category = category || (Array.isArray(categories) ? categories.join(',') : '');
    }
    if (description !== undefined) updateData.description = description;
    if (exercises !== undefined) updateData.exercises = exercises;
    if (is_public !== undefined) updateData.is_public = is_public;

    const { error } = await supabase
      .from('workout_programs')
      .update(updateData)
      .eq('id', req.params.id)
      .eq('created_by', req.userId);

    if (error) {
      console.error('Supabase update program error:', JSON.stringify(error));
      return res.status(500).json({ error: error.message });
    }
    res.json({ success: true });
  } catch (e) {
    console.error('Update program error:', e);
    res.status(500).json({ error: 'Erro ao atualizar programa' });
  }
});

// Toggle visibilidade no Shop (is_public) — endpoint dedicado para simplicidade e confiabilidade
app.patch('/api/academia/programs/:id/shop', async (req, res) => {
  try {
    if (req.userType !== 'academia') return res.status(403).json({ error: 'Acesso negado' });
    const { is_public } = req.body;
    if (typeof is_public !== 'boolean') return res.status(400).json({ error: 'is_public deve ser true ou false' });

    const { data, error } = await supabase
      .from('workout_programs')
      .update({ is_public })
      .eq('id', req.params.id)
      .eq('created_by', req.userId)
      .select('id, is_public')
      .single();

    if (error) {
      console.error('Shop toggle error:', JSON.stringify(error));
      return res.status(500).json({ error: error.message });
    }
    if (!data) return res.status(404).json({ error: 'Programa não encontrado ou sem permissão' });

    console.log(`[shop toggle] programa ${req.params.id} → is_public=${data.is_public}`);
    res.json({ success: true, is_public: data.is_public });
  } catch (e) {
    console.error('Shop toggle exception:', e);
    res.status(500).json({ error: 'Erro ao atualizar visibilidade' });
  }
});

// Exclui programa de treino
app.delete('/api/academia/programs/:id', async (req, res) => {
  try {
    if (req.userType !== 'academia') return res.status(403).json({ error: 'Acesso negado' });
    // Remove o programa (apenas se foi criado por esta academia)
    const { error } = await supabase
      .from('workout_programs')
      .delete()
      .eq('id', req.params.id)
      .eq('created_by', req.userId);
    if (error) return res.status(500).json({ error: error.message });

    const deletedId = req.params.id;

    // 1. Limpa assigned_program_id em academia_students (evita referência órfã)
    await supabase
      .from('academia_students')
      .update({ assigned_program_id: null })
      .eq('assigned_program_id', deletedId);

    // 2. Limpa subscribed_programs, main_program_id e pinned_program_id em profiles
    const { data: affectedProfiles } = await supabase
      .from('profiles')
      .select('user_id, onboarding_data')
      .not('onboarding_data', 'is', null);

    for (const prof of (affectedProfiles || [])) {
      const od = prof.onboarding_data || {};
      let changed = false;

      if (Array.isArray(od.subscribed_programs) && od.subscribed_programs.includes(deletedId)) {
        od.subscribed_programs = od.subscribed_programs.filter(id => id !== deletedId);
        changed = true;
      }
      if (od.main_program_id === deletedId)    { od.main_program_id    = null; changed = true; }
      if (od.pinned_program_id === deletedId)  { od.pinned_program_id  = null; changed = true; }

      if (changed) {
        await supabase.from('profiles').update({ onboarding_data: od }).eq('user_id', prof.user_id);
      }
    }

    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: 'Erro ao excluir programa' });
  }
});

// ── ANÁLISE DE IMAGEM (IA) ─────────────────────────────────────

const applyFoodDB = (result) => {
  if (result?.items && Array.isArray(result.items)) {
    result.items = result.items.map(item => {
      // Only use FoodDB as fallback — never override values the AI already calculated
      const aiHasMacros = (item.calories > 0) || (item.protein > 0) || (item.carbs > 0) || (item.fat > 0);
      if (!aiHasMacros) {
        const dbMatch = matchFood(item.name);
        if (dbMatch) {
          const grams = item.grams || 100;
          item.calories = Math.round(dbMatch.cal * grams / 100);
          item.protein = Math.round(dbMatch.p * grams / 100);
          item.carbs = Math.round(dbMatch.c * grams / 100);
          item.fat = Math.round(dbMatch.f * grams / 100);
        }
      }
      return item;
    });
  }
  return result;
};

app.post('/api/analyze-image', async (req, res) => {
  try {
    let { image, audio, provider } = req.body;
    let apiKey;

    if (!provider) {
      if (process.env.GROQ_API_KEY) { provider = 'groq'; apiKey = process.env.GROQ_API_KEY; }
      else if (process.env.GEMINI_API_KEY) { provider = 'gemini'; apiKey = process.env.GEMINI_API_KEY; }
      else if (process.env.OPENAI_API_KEY) { provider = 'openai'; apiKey = process.env.OPENAI_API_KEY; }
      else { provider = 'huggingface'; apiKey = process.env.HF_API_KEY; }
    } else {
      apiKey = provider === 'groq' ? process.env.GROQ_API_KEY
        : provider === 'gemini' ? process.env.GEMINI_API_KEY
        : provider === 'openai' ? process.env.OPENAI_API_KEY
        : process.env.HF_API_KEY;
    }

    if (provider === 'groq') {
      if (!apiKey) throw new Error('Chave Groq não configurada');
      const prompt = 'Você é um nutricionista. Analise a imagem e identifique os alimentos, estime o peso (em gramas) e calcule calorias e macros. Retorne APENAS um JSON: {"items":[{"name":"Alimento","grams":100,"calories":0,"protein":0,"carbs":0,"fat":0}],"confidence":0.9}';
      const base64Data = image?.includes('base64,') ? image.split('base64,')[1] : image;
      const imageUrl = image?.startsWith('data:') ? image : `data:image/jpeg;base64,${base64Data}`;

      const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
        body: JSON.stringify({
          model: 'meta-llama/llama-4-scout-17b-16e-instruct',
          messages: [{ role: 'user', content: [{ type: 'text', text: prompt }, { type: 'image_url', image_url: { url: imageUrl } }] }],
          max_tokens: 500
        })
      });

      if (!response.ok) throw new Error(`Groq API error: ${response.status}`);
      const json = await response.json();
      const content = json.choices?.[0]?.message?.content || '{}';
      const cleaned = content.replace(/```json/g, '').replace(/```/g, '').trim();
      let parsed;
      try {
        parsed = JSON.parse(cleaned);
      } catch {
        // GROQ sometimes wraps JSON in extra text — extract the first {...} block
        const match = cleaned.match(/\{[\s\S]*\}/);
        if (match) {
          try { parsed = JSON.parse(match[0]); } catch { parsed = {}; }
        } else {
          parsed = {};
        }
      }
      return res.json({ provider: 'groq', result: applyFoodDB(parsed) });
    }

    if (provider === 'gemini') {
      if (!apiKey) throw new Error('Chave Gemini não configurada');
      const { GoogleGenerativeAI } = await import('@google/generative-ai');
      const genAI = new GoogleGenerativeAI(apiKey);
      const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
      const prompt = 'Você é um nutricionista. Analise a imagem e identifique os alimentos, estime o peso (em gramas) e calcule calorias e macros. Retorne APENAS um JSON: {"items":[{"name":"Alimento","grams":100,"calories":0,"protein":0,"carbs":0,"fat":0}],"confidence":0.9}';
      const base64Data = image?.includes('base64,') ? image.split('base64,')[1] : image;
      const result = await model.generateContent([prompt, { inlineData: { data: base64Data, mimeType: 'image/jpeg' } }]);
      const text = result.response.text().replace(/```json/g, '').replace(/```/g, '').trim();
      let geminiParsed;
      try { geminiParsed = JSON.parse(text); } catch {
        const m = text.match(/\{[\s\S]*\}/);
        try { geminiParsed = m ? JSON.parse(m[0]) : {}; } catch { geminiParsed = {}; }
      }
      return res.json({ provider: 'gemini', result: applyFoodDB(geminiParsed) });
    }

    if (provider === 'openai') {
      if (!apiKey) throw new Error('Chave OpenAI não configurada');
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages: [{ role: 'user', content: [
            { type: 'text', text: 'Identifique os alimentos e retorne JSON: {"items":[{"name":"","grams":0,"calories":0,"protein":0,"carbs":0,"fat":0}],"confidence":0.9}' },
            { type: 'image_url', image_url: { url: image } }
          ]}],
          max_tokens: 500
        })
      });
      const json = await response.json();
      const rawContent = (json.choices?.[0]?.message?.content || '{}').replace(/```json/g, '').replace(/```/g, '').trim();
      let openaiParsed;
      try { openaiParsed = JSON.parse(rawContent); } catch {
        const m = rawContent.match(/\{[\s\S]*\}/);
        try { openaiParsed = m ? JSON.parse(m[0]) : {}; } catch { openaiParsed = {}; }
      }
      return res.json({ provider: 'openai', result: applyFoodDB(openaiParsed) });
    }

    throw new Error('Nenhum provider de IA configurado');
  } catch (error) {
    console.error('Analyze image error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ── CHAT COM IA ────────────────────────────────────────────────

app.post('/api/chat', async (req, res) => {
  try {
    const { message, context, history } = req.body;
    const groqKey = process.env.GROQ_API_KEY;
    if (!groqKey) return res.status(401).json({ error: 'Chave Groq não configurada' });

    const systemPrompt = `Você é o assistente de IA do app "AorType".
Você tem acesso total aos dados do usuário e deve usá-los nas respostas.

DADOS DO USUÁRIO:
${JSON.stringify(context || {}, null, 2)}

REGRAS:
- Responda SEMPRE em português do Brasil
- Seja direto, motivador e use os dados reais do usuário
- Se o usuário cumprimentar, resuma o status atual do dia
- Se pedir sugestão de refeição, sugira 3 opções que caibam nos macros restantes
- Se pedir análise, use os dados reais de consistência e streak
- Nunca invente dados que não estão no contexto`;

    const messages = [{ role: 'system', content: systemPrompt }];
    if (history?.length) {
      history.slice(-10).forEach(h => messages.push({ role: h.role === 'assistant' ? 'assistant' : 'user', content: h.text }));
    }
    messages.push({ role: 'user', content: message });

    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${groqKey}` },
      body: JSON.stringify({ model: 'llama-3.3-70b-versatile', messages, max_tokens: 600, temperature: 0.7 })
    });

    if (!response.ok) throw new Error(`Groq error: ${response.status}`);
    const json = await response.json();
    res.json({ text: json.choices?.[0]?.message?.content || '' });
  } catch (error) {
    console.error('Chat error:', error);
    res.status(500).json({ error: 'Erro no chat' });
  }
});

// ── EXPORTA PARA VERCEL ────────────────────────────────────────
export default app;

if (process.env.NODE_ENV !== 'production') {
  app.listen(PORT, () => console.log(`AorType rodando em http://localhost:${PORT}`));
}

