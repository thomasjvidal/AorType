import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import fetch from 'node-fetch';
import bodyParser from 'body-parser';
import path from 'path';
import { fileURLToPath } from 'url';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { createClient } from '@supabase/supabase-js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const JWT_SECRET = process.env.JWT_SECRET || 'macroai_secret_change_in_production';

// Supabase client (service role — bypasses RLS, só no servidor)
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

const app = express();
app.use(cors());
app.use(bodyParser.json({ limit: '10mb' }));
app.use(express.static(__dirname));

const PORT = process.env.PORT || 3000;

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

    const { data: user } = await supabase
      .from('users')
      .select('*')
      .eq('email', email)
      .single();

    if (!user) return res.status(401).json({ error: 'Credenciais inválidas' });

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) return res.status(401).json({ error: 'Credenciais inválidas' });

    const token = jwt.sign(
      { userId: user.id, email: user.email, userType: user.user_type },
      JWT_SECRET,
      { expiresIn: '30d' }
    );

    res.json({ token, userId: user.id, email: user.email, name: user.name, userType: user.user_type });
  } catch (e) {
    console.error('Login error:', e);
    res.status(500).json({ error: 'Erro ao autenticar' });
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

    res.json({ ...user, ...profile });
  } catch (e) {
    res.status(500).json({ error: 'Erro ao buscar perfil' });
  }
});

app.post('/api/profile', async (req, res) => {
  try {
    const { name, username, phone, weight, height, age, gender, goal, activity_level, biotype, diet, streak, lastOpenDate } = req.body;
    // Accept both 'avatar_url' and 'avatar' from frontend
    const avatar_url = req.body.avatar_url || req.body.avatar || undefined;

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

    // Truncate base64 image to avoid DB size limits (store URL or null for large images)
    let image_url = body.image_url || body.image || null;
    if (image_url && image_url.startsWith('data:') && image_url.length > 200000) {
      image_url = null; // Skip saving huge base64 blobs
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
      const { date, mood, workout_type, workout_specific, workout_duration, workout_intensity, sleep_minutes, water_ml, calories_burned } = entry;
      const upsertData = { user_id: req.userId, date: date || new Date().toISOString().split('T')[0], mood, workout_type, workout_duration, workout_intensity, sleep_minutes, water_ml };
      if (workout_specific !== undefined) upsertData.workout_specific = workout_specific;
      if (calories_burned !== undefined) upsertData.calories_burned = calories_burned;
      await supabase.from('checkins').upsert(upsertData, { onConflict: 'user_id,date' });
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
    // Verifica se o aluno tem programa atribuído com exercícios customizados
    const { data: link } = await supabase
      .from('academia_students')
      .select('assigned_program_id, academia_id, custom_exercises')
      .eq('student_id', req.userId)
      .eq('status', 'active')
      .single();

    let assignedProgram = null;
    if (link?.assigned_program_id) {
      const { data: ap } = await supabase
        .from('workout_programs')
        .select('*')
        .eq('id', link.assigned_program_id)
        .single();
      if (ap) {
        assignedProgram = {
          ...ap,
          is_assigned: true,
          custom_exercises: link.custom_exercises || null
        };
      }
    }

    const { data: publicPrograms } = await supabase
      .from('workout_programs')
      .select('*')
      .eq('is_public', true);

    let academiaPrograms = [];
    if (link?.academia_id) {
      const { data: ap } = await supabase
        .from('workout_programs')
        .select('*')
        .eq('created_by', link.academia_id);
      academiaPrograms = ap || [];
    }

    const others = [...(publicPrograms || []), ...academiaPrograms.filter(ap =>
      !(publicPrograms || []).find(pp => pp.id === ap.id)
    )];

    // Programa atribuído sempre primeiro; não duplicar na lista geral
    const result = [];
    if (assignedProgram) result.push(assignedProgram);
    others.forEach(p => {
      if (!assignedProgram || p.id !== assignedProgram.id) result.push(p);
    });

    res.json(result);
  } catch (e) {
    res.status(500).json({ error: 'Erro ao buscar treinos' });
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
    const entries = req.body;
    for (const [date, programs] of Object.entries(entries)) {
      for (const [programId, completed_sets] of Object.entries(programs)) {
        await supabase.from('workout_sessions').upsert(
          { user_id: req.userId, program_id: programId || null, date, completed_sets },
          { onConflict: 'user_id,program_id,date' }
        );
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

    const { data, error } = await supabase
      .from('academia_students')
      .select(`
        id, academia_id, student_id, assigned_program_id, status, custom_exercises,
        student:student_id(id, name, email, avatar_url),
        program:assigned_program_id(id, name, category)
      `)
      .eq('academia_id', req.userId);

    if (error) throw error;
    res.json(data || []);
  } catch (e) {
    res.status(500).json({ error: 'Erro ao buscar alunos' });
  }
});

// Adiciona aluno à academia
app.post('/api/academia/students', async (req, res) => {
  try {
    if (req.userType !== 'academia') return res.status(403).json({ error: 'Acesso negado' });
    const { student_email, assigned_program_id } = req.body;

    const { data: student } = await supabase
      .from('users')
      .select('id')
      .eq('email', student_email)
      .eq('user_type', 'aluno')
      .single();

    if (!student) return res.status(404).json({ error: 'Aluno não encontrado' });

    const { data, error } = await supabase
      .from('academia_students')
      .upsert({ academia_id: req.userId, student_id: student.id, assigned_program_id, status: 'active' })
      .select()
      .single();

    if (error) throw error;
    res.json({ success: true, data });
  } catch (e) {
    res.status(500).json({ error: 'Erro ao adicionar aluno' });
  }
});

// Atualiza programa e/ou exercícios customizados do aluno
app.patch('/api/academia/students/:studentId', async (req, res) => {
  try {
    if (req.userType !== 'academia') return res.status(403).json({ error: 'Acesso negado' });
    const { assigned_program_id, status, custom_exercises } = req.body;

    const updateData = {};
    if (assigned_program_id !== undefined) updateData.assigned_program_id = assigned_program_id;
    if (status !== undefined) updateData.status = status;
    if (custom_exercises !== undefined) updateData.custom_exercises = custom_exercises;

    await supabase
      .from('academia_students')
      .update(updateData)
      .eq('academia_id', req.userId)
      .eq('id', req.params.studentId); // usa id do link, não student_id

    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: 'Erro ao atualizar aluno' });
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
    const { name, category, description, exercises } = req.body;

    const { data, error } = await supabase
      .from('workout_programs')
      .insert({ name, category, description, exercises: exercises || [], created_by: req.userId, is_public: false })
      .select()
      .single();

    if (error) throw error;
    res.json({ success: true, program: data });
  } catch (e) {
    res.status(500).json({ error: 'Erro ao criar programa' });
  }
});

// Atualiza programa de treino
app.put('/api/academia/programs/:id', async (req, res) => {
  try {
    if (req.userType !== 'academia') return res.status(403).json({ error: 'Acesso negado' });
    const { name, category, description, exercises } = req.body;

    await supabase
      .from('workout_programs')
      .update({ name, category, description, exercises })
      .eq('id', req.params.id)
      .eq('created_by', req.userId);

    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: 'Erro ao atualizar programa' });
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

