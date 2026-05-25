import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import bodyParser from 'body-parser';
import path from 'path';
import { fileURLToPath } from 'url';
import { readFileSync, writeFileSync, existsSync } from 'fs';
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
  // ── FRANGO ───────────────────────────────────────────────────
  'frango grelhado': { cal: 165, p: 31, c: 0, f: 3.6 },
  'frango': { cal: 165, p: 31, c: 0, f: 3.6 },
  'peito de frango': { cal: 165, p: 31, c: 0, f: 3.6 },
  'frango assado': { cal: 190, p: 29, c: 0, f: 8 },
  'frango frito': { cal: 246, p: 24, c: 8, f: 13 },
  'coxa de frango': { cal: 200, p: 22, c: 0, f: 12 },
  'sobrecoxa de frango': { cal: 222, p: 20, c: 0, f: 15 },
  'coxa e sobrecoxa': { cal: 215, p: 21, c: 0, f: 14 },
  'filé de frango': { cal: 160, p: 30, c: 0, f: 3.5 },
  'nuggets': { cal: 247, p: 15, c: 16, f: 14 },
  'frango desfiado': { cal: 170, p: 31, c: 0, f: 4 },

  // ── CARNES ───────────────────────────────────────────────────
  'carne bovina': { cal: 250, p: 26, c: 0, f: 17 },
  'patinho': { cal: 219, p: 27, c: 0, f: 11 },
  'picanha': { cal: 330, p: 26, c: 0, f: 25 },
  'contra filé': { cal: 271, p: 26, c: 0, f: 18 },
  'contrafilé': { cal: 271, p: 26, c: 0, f: 18 },
  'alcatra': { cal: 245, p: 27, c: 0, f: 15 },
  'maminha': { cal: 220, p: 27, c: 0, f: 12 },
  'carne moída': { cal: 255, p: 25, c: 0, f: 17 },
  'costela': { cal: 290, p: 22, c: 0, f: 22 },
  'carne de sol': { cal: 230, p: 30, c: 0, f: 12 },
  'carne seca': { cal: 255, p: 37, c: 0, f: 11 },
  'bife': { cal: 245, p: 26, c: 0, f: 15 },
  'steak': { cal: 270, p: 27, c: 0, f: 17 },
  'pernil': { cal: 218, p: 28, c: 0, f: 11 },
  'lombo': { cal: 200, p: 28, c: 0, f: 10 },
  'porco': { cal: 242, p: 27, c: 0, f: 14 },
  'bisteca': { cal: 230, p: 27, c: 0, f: 13 },

  // ── EMBUTIDOS ────────────────────────────────────────────────
  'linguiça': { cal: 300, p: 16, c: 2, f: 26 },
  'calabresa': { cal: 310, p: 14, c: 3, f: 27 },
  'salsicha': { cal: 290, p: 12, c: 2, f: 26 },
  'bacon': { cal: 541, p: 37, c: 1.4, f: 42 },
  'presunto': { cal: 145, p: 18, c: 2, f: 7 },
  'peito de peru': { cal: 107, p: 22, c: 1, f: 1.5 },
  'mortadela': { cal: 285, p: 14, c: 5, f: 24 },
  'copa': { cal: 320, p: 20, c: 1, f: 26 },
  'paio': { cal: 280, p: 15, c: 4, f: 23 },

  // ── PEIXES E FRUTOS DO MAR ───────────────────────────────────
  'atum': { cal: 116, p: 25.5, c: 0, f: 0.5 },
  'atum em lata': { cal: 100, p: 22, c: 0, f: 1 },
  'salmão': { cal: 208, p: 20, c: 0, f: 13 },
  'tilapia': { cal: 96, p: 20, c: 0, f: 1.7 },
  'tilápia': { cal: 96, p: 20, c: 0, f: 1.7 },
  'peixe': { cal: 100, p: 20, c: 0, f: 2 },
  'sardinha': { cal: 208, p: 24, c: 0, f: 12 },
  'camarão': { cal: 99, p: 24, c: 0, f: 0.3 },
  'bacalhau': { cal: 105, p: 25, c: 0, f: 0.5 },
  'merluza': { cal: 80, p: 18, c: 0, f: 0.8 },
  'traíra': { cal: 95, p: 20, c: 0, f: 1.5 },
  'frango do mar': { cal: 90, p: 20, c: 0, f: 1 },

  // ── OVOS E DERIVADOS ─────────────────────────────────────────
  'ovos': { cal: 155, p: 13, c: 1.1, f: 11 },
  'ovo': { cal: 155, p: 13, c: 1.1, f: 11 },
  'ovo mexido': { cal: 148, p: 10, c: 1.6, f: 11 },
  'ovo cozido': { cal: 155, p: 13, c: 1.1, f: 11 },
  'omelete': { cal: 154, p: 11, c: 1.6, f: 11 },
  'omelete de ovos': { cal: 154, p: 11, c: 1.6, f: 11 },
  'clara de ovo': { cal: 52, p: 11, c: 0.7, f: 0.2 },
  'gema de ovo': { cal: 322, p: 16, c: 1.8, f: 27 },

  // ── ARROZ E CEREAIS ──────────────────────────────────────────
  'arroz branco': { cal: 130, p: 2.7, c: 28, f: 0.3 },
  'arroz': { cal: 130, p: 2.7, c: 28, f: 0.3 },
  'arroz integral': { cal: 111, p: 2.6, c: 23, f: 0.9 },
  'arroz cozido': { cal: 130, p: 2.7, c: 28, f: 0.3 },
  'arroz de forno': { cal: 155, p: 4, c: 26, f: 4 },
  'risoto': { cal: 170, p: 5, c: 27, f: 5 },
  'milho cozido': { cal: 86, p: 3.2, c: 19, f: 1.2 },
  'milho': { cal: 86, p: 3.2, c: 19, f: 1.2 },
  'cuscuz': { cal: 112, p: 3.8, c: 23, f: 0.2 },
  'cuscuz nordestino': { cal: 112, p: 3.8, c: 23, f: 0.2 },

  // ── MACARRÃO E MASSAS ────────────────────────────────────────
  'macarrao': { cal: 158, p: 5.8, c: 31, f: 0.9 },
  'macarrão': { cal: 158, p: 5.8, c: 31, f: 0.9 },
  'macarrão cozido': { cal: 158, p: 5.8, c: 31, f: 0.9 },
  'espaguete': { cal: 158, p: 5.8, c: 31, f: 0.9 },
  'lasanha': { cal: 185, p: 9, c: 18, f: 8 },
  'nhoque': { cal: 130, p: 3, c: 25, f: 2 },
  'macarrão integral': { cal: 150, p: 6.5, c: 28, f: 1.5 },

  // ── PÃES E DERIVADOS ─────────────────────────────────────────
  'pão': { cal: 265, p: 9, c: 49, f: 3.2 },
  'pão de sal': { cal: 289, p: 8.5, c: 55, f: 3.5 },
  'pão francês': { cal: 289, p: 8.5, c: 55, f: 3.5 },
  'pão fatiado': { cal: 267, p: 8, c: 50, f: 4 },
  'pão de forma': { cal: 267, p: 8, c: 50, f: 4 },
  'pão integral': { cal: 247, p: 10, c: 42, f: 4.2 },
  'pão de queijo': { cal: 325, p: 6, c: 50, f: 12 },
  'pão de milho': { cal: 280, p: 6, c: 50, f: 6 },
  'pão de hot dog': { cal: 267, p: 8, c: 50, f: 4 },
  'pão de hamburguer': { cal: 267, p: 8, c: 50, f: 4 },
  'pão de hambúrguer': { cal: 267, p: 8, c: 50, f: 4 },
  'bisnaguinha': { cal: 280, p: 7, c: 52, f: 5 },
  'baguete': { cal: 275, p: 9, c: 51, f: 3 },
  'croissant': { cal: 406, p: 8, c: 46, f: 21 },
  'torrada': { cal: 395, p: 11, c: 75, f: 5 },
  'tapioca': { cal: 359, p: 0.2, c: 88, f: 0 },
  'beiju': { cal: 349, p: 0.4, c: 86, f: 0.2 },
  'broa': { cal: 260, p: 6, c: 48, f: 5 },
  'waffle': { cal: 291, p: 8, c: 41, f: 10 },
  'panqueca': { cal: 220, p: 6, c: 28, f: 9 },

  // ── TUBÉRCULOS E RAÍZES ──────────────────────────────────────
  'batata doce': { cal: 86, p: 1.6, c: 20, f: 0.1 },
  'batata': { cal: 77, p: 2, c: 17, f: 0.1 },
  'batata inglesa': { cal: 77, p: 2, c: 17, f: 0.1 },
  'batata cozida': { cal: 77, p: 2, c: 17, f: 0.1 },
  'batata frita': { cal: 312, p: 3.4, c: 41, f: 15 },
  'batata palha': { cal: 510, p: 5, c: 60, f: 28 },
  'purê de batata': { cal: 113, p: 2, c: 17, f: 4 },
  'mandioca': { cal: 160, p: 1.4, c: 38, f: 0.3 },
  'aipim': { cal: 160, p: 1.4, c: 38, f: 0.3 },
  'macaxeira': { cal: 160, p: 1.4, c: 38, f: 0.3 },
  'mandioquinha': { cal: 94, p: 1.5, c: 22, f: 0.2 },
  'cará': { cal: 98, p: 2, c: 23, f: 0.1 },
  'inhame': { cal: 118, p: 1.5, c: 28, f: 0.2 },

  // ── LEGUMINOSAS ──────────────────────────────────────────────
  'feijão': { cal: 77, p: 5, c: 14, f: 0.5 },
  'feijao': { cal: 77, p: 5, c: 14, f: 0.5 },
  'feijão preto': { cal: 77, p: 5, c: 14, f: 0.5 },
  'feijão carioca': { cal: 76, p: 4.8, c: 13.6, f: 0.5 },
  'feijão branco': { cal: 89, p: 6, c: 16, f: 0.4 },
  'lentilha': { cal: 116, p: 9, c: 20, f: 0.4 },
  'grão de bico': { cal: 164, p: 9, c: 27, f: 2.6 },
  'ervilha': { cal: 81, p: 5.4, c: 14, f: 0.4 },
  'soja': { cal: 400, p: 37, c: 30, f: 19 },
  'edamame': { cal: 122, p: 11, c: 9, f: 5 },
  'tofu': { cal: 76, p: 8, c: 2, f: 4.5 },

  // ── AVEIA E SUPLEMENTOS DE CEREAIS ──────────────────────────
  'aveia': { cal: 389, p: 17, c: 66, f: 7 },
  'aveia em flocos': { cal: 394, p: 14, c: 68, f: 7 },
  'farelo de aveia': { cal: 246, p: 17, c: 66, f: 7 },
  'granola': { cal: 471, p: 10, c: 64, f: 20 },
  'granola sem açúcar': { cal: 390, p: 10, c: 52, f: 18 },
  'quinoa': { cal: 120, p: 4.4, c: 21, f: 1.9 },
  'quinoa cozida': { cal: 120, p: 4.4, c: 21, f: 1.9 },
  'chia': { cal: 486, p: 17, c: 42, f: 31 },
  'linhaça': { cal: 534, p: 18, c: 29, f: 42 },
  'cereal matinal': { cal: 378, p: 8, c: 82, f: 2 },

  // ── VEGETAIS ─────────────────────────────────────────────────
  'salada': { cal: 15, p: 1.5, c: 2, f: 0.2 },
  'alface': { cal: 15, p: 1.5, c: 2, f: 0.2 },
  'brócolis': { cal: 34, p: 2.8, c: 7, f: 0.4 },
  'brocolis': { cal: 34, p: 2.8, c: 7, f: 0.4 },
  'tomate': { cal: 18, p: 0.9, c: 3.9, f: 0.2 },
  'pepino': { cal: 16, p: 0.7, c: 3.6, f: 0.1 },
  'cenoura': { cal: 41, p: 0.9, c: 10, f: 0.2 },
  'chuchu': { cal: 19, p: 0.8, c: 4.5, f: 0.1 },
  'abobrinha': { cal: 17, p: 1.2, c: 3.1, f: 0.3 },
  'beterraba': { cal: 43, p: 1.6, c: 10, f: 0.2 },
  'espinafre': { cal: 23, p: 2.9, c: 3.6, f: 0.4 },
  'couve': { cal: 49, p: 4.3, c: 9, f: 0.7 },
  'couve-flor': { cal: 25, p: 2, c: 5, f: 0.3 },
  'repolho': { cal: 25, p: 1.3, c: 5.8, f: 0.1 },
  'repolho roxo': { cal: 31, p: 1.4, c: 7, f: 0.2 },
  'cebola': { cal: 40, p: 1.1, c: 9.3, f: 0.1 },
  'alho': { cal: 149, p: 6.4, c: 33, f: 0.5 },
  'pimentão': { cal: 31, p: 1, c: 7, f: 0.3 },
  'pimentão vermelho': { cal: 31, p: 1, c: 7, f: 0.3 },
  'pimentão verde': { cal: 27, p: 0.9, c: 6, f: 0.3 },
  'berinjela': { cal: 25, p: 1, c: 6, f: 0.2 },
  'quiabo': { cal: 33, p: 2, c: 7.5, f: 0.2 },
  'vagem': { cal: 31, p: 1.8, c: 7, f: 0.1 },
  'milho verde': { cal: 86, p: 3.2, c: 19, f: 1.2 },
  'palmito': { cal: 115, p: 2.6, c: 26, f: 0.3 },
  'abóbora': { cal: 26, p: 1, c: 6.5, f: 0.1 },
  'aboboro': { cal: 26, p: 1, c: 6.5, f: 0.1 },
  'jiló': { cal: 27, p: 1.5, c: 5.5, f: 0.3 },
  'maxixe': { cal: 15, p: 0.8, c: 3.3, f: 0.1 },

  // ── FRUTAS ───────────────────────────────────────────────────
  'banana': { cal: 89, p: 1.1, c: 23, f: 0.3 },
  'banana prata': { cal: 89, p: 1.1, c: 23, f: 0.3 },
  'banana nanica': { cal: 92, p: 1, c: 24, f: 0.2 },
  'maçã': { cal: 52, p: 0.3, c: 14, f: 0.2 },
  'maca': { cal: 52, p: 0.3, c: 14, f: 0.2 },
  'laranja': { cal: 47, p: 0.9, c: 12, f: 0.1 },
  'morango': { cal: 32, p: 0.7, c: 7.7, f: 0.3 },
  'melancia': { cal: 30, p: 0.6, c: 7.6, f: 0.2 },
  'melão': { cal: 34, p: 0.8, c: 8.2, f: 0.2 },
  'abacaxi': { cal: 50, p: 0.5, c: 13, f: 0.1 },
  'uva': { cal: 67, p: 0.6, c: 17, f: 0.4 },
  'manga': { cal: 60, p: 0.8, c: 15, f: 0.4 },
  'mamão': { cal: 43, p: 0.5, c: 11, f: 0.1 },
  'mamão papaia': { cal: 39, p: 0.6, c: 9.8, f: 0.1 },
  'goiaba': { cal: 68, p: 2.6, c: 14, f: 1 },
  'acerola': { cal: 32, p: 0.8, c: 7.7, f: 0.3 },
  'caju': { cal: 43, p: 0.9, c: 10, f: 0.3 },
  'pêra': { cal: 57, p: 0.4, c: 15, f: 0.1 },
  'pera': { cal: 57, p: 0.4, c: 15, f: 0.1 },
  'pêssego': { cal: 39, p: 0.9, c: 9.5, f: 0.3 },
  'ameixa': { cal: 46, p: 0.7, c: 11, f: 0.3 },
  'kiwi': { cal: 61, p: 1.1, c: 15, f: 0.5 },
  'maracujá': { cal: 97, p: 2.2, c: 23, f: 0.7 },
  'abacate': { cal: 160, p: 2, c: 9, f: 15 },
  'coco': { cal: 354, p: 3.3, c: 15, f: 33 },
  'coco seco': { cal: 354, p: 3.3, c: 15, f: 33 },
  'coco verde': { cal: 20, p: 0.4, c: 4.5, f: 0.2 },
  'tangerina': { cal: 53, p: 0.8, c: 13, f: 0.3 },
  'mexerica': { cal: 53, p: 0.8, c: 13, f: 0.3 },
  'limão': { cal: 29, p: 1.1, c: 9, f: 0.3 },
  'framboesa': { cal: 52, p: 1.2, c: 12, f: 0.7 },
  'mirtilo': { cal: 57, p: 0.7, c: 14, f: 0.3 },
  'blueberry': { cal: 57, p: 0.7, c: 14, f: 0.3 },
  'pitanga': { cal: 37, p: 0.8, c: 9, f: 0.4 },
  'jabuticaba': { cal: 58, p: 0.5, c: 14.5, f: 0.1 },

  // ── LATICÍNIOS ───────────────────────────────────────────────
  'leite': { cal: 61, p: 3.2, c: 4.8, f: 3.3 },
  'leite integral': { cal: 61, p: 3.2, c: 4.8, f: 3.3 },
  'leite desnatado': { cal: 36, p: 3.4, c: 5, f: 0.1 },
  'leite semidesnatado': { cal: 47, p: 3.3, c: 4.8, f: 1.5 },
  'leite de soja': { cal: 43, p: 3.3, c: 3.7, f: 1.8 },
  'leite de aveia': { cal: 50, p: 1, c: 9, f: 1.5 },
  'leite de coco': { cal: 197, p: 2, c: 6, f: 21 },
  'iogurte': { cal: 59, p: 3.5, c: 3.6, f: 3.3 },
  'iogurte natural': { cal: 59, p: 3.5, c: 3.6, f: 3.3 },
  'iogurte grego': { cal: 97, p: 9, c: 3.6, f: 5 },
  'iogurte desnatado': { cal: 41, p: 4, c: 4.5, f: 0.3 },
  'iogurte proteico': { cal: 75, p: 12, c: 4, f: 0.8 },
  'coalhada': { cal: 62, p: 3.5, c: 3.8, f: 3.5 },
  'queijo': { cal: 402, p: 25, c: 1.3, f: 33 },
  'queijo minas': { cal: 264, p: 17, c: 3, f: 21 },
  'queijo minas frescal': { cal: 264, p: 17, c: 3, f: 21 },
  'queijo prato': { cal: 360, p: 23, c: 0.5, f: 29 },
  'mussarela': { cal: 318, p: 22, c: 2.2, f: 25 },
  'muçarela': { cal: 318, p: 22, c: 2.2, f: 25 },
  'parmesão': { cal: 392, p: 36, c: 3.2, f: 26 },
  'requeijão': { cal: 266, p: 11, c: 3, f: 24 },
  'cream cheese': { cal: 342, p: 6, c: 4, f: 34 },
  'ricota': { cal: 143, p: 11, c: 3, f: 10 },
  'queijo coalho': { cal: 320, p: 22, c: 0, f: 25 },
  'manteiga': { cal: 717, p: 0.9, c: 0.1, f: 81 },
  'margarina': { cal: 720, p: 0.2, c: 0.3, f: 80 },
  'creme de leite': { cal: 317, p: 2.8, c: 3.4, f: 33 },
  'nata': { cal: 317, p: 2.8, c: 3.4, f: 33 },

  // ── BEBIDAS ──────────────────────────────────────────────────
  'água': { cal: 0, p: 0, c: 0, f: 0 },
  'agua': { cal: 0, p: 0, c: 0, f: 0 },
  'suco de laranja': { cal: 45, p: 0.7, c: 10, f: 0.2 },
  'suco de maçã': { cal: 46, p: 0.1, c: 11, f: 0.1 },
  'suco de uva': { cal: 60, p: 0.4, c: 14, f: 0.1 },
  'suco de abacaxi': { cal: 54, p: 0.4, c: 13, f: 0.1 },
  'suco de manga': { cal: 60, p: 0.5, c: 14, f: 0.2 },
  'suco de goiaba': { cal: 62, p: 0.4, c: 15, f: 0.2 },
  'suco de tomate': { cal: 17, p: 0.9, c: 3.9, f: 0.2 },
  'suco de limão': { cal: 22, p: 0.4, c: 7, f: 0.2 },
  'suco de caju': { cal: 43, p: 0.6, c: 10, f: 0.3 },
  'suco de maracujá': { cal: 63, p: 1.4, c: 14.5, f: 0.6 },
  'suco integral': { cal: 50, p: 0.5, c: 12, f: 0.1 },
  'suco natural': { cal: 45, p: 0.6, c: 10, f: 0.1 },
  'vitamina de banana': { cal: 112, p: 3.8, c: 21, f: 2.5 },
  'vitamina de morango': { cal: 80, p: 3.5, c: 14, f: 1.5 },
  'smoothie': { cal: 70, p: 2, c: 14, f: 1 },
  'açaí': { cal: 247, p: 2.3, c: 25, f: 16 },
  'café': { cal: 2, p: 0.3, c: 0, f: 0 },
  'café preto': { cal: 2, p: 0.3, c: 0, f: 0 },
  'café com leite': { cal: 30, p: 1.5, c: 2.5, f: 1.5 },
  'cappuccino': { cal: 60, p: 3, c: 8, f: 2 },
  'chá verde': { cal: 1, p: 0, c: 0.2, f: 0 },
  'chá preto': { cal: 1, p: 0, c: 0.3, f: 0 },
  'chá de camomila': { cal: 1, p: 0, c: 0.2, f: 0 },
  'chá gelado': { cal: 20, p: 0, c: 5, f: 0 },
  'red bull': { cal: 45, p: 0, c: 11, f: 0 },
  'red bull zero': { cal: 5, p: 0, c: 1, f: 0 },
  'monster energy': { cal: 47, p: 0, c: 11, f: 0 },
  'coca cola': { cal: 37, p: 0, c: 9.3, f: 0 },
  'coca cola zero': { cal: 0, p: 0, c: 0, f: 0 },
  'pepsi': { cal: 41, p: 0, c: 10, f: 0 },
  'guaraná': { cal: 37, p: 0, c: 9, f: 0 },
  'guaraná zero': { cal: 0, p: 0, c: 0, f: 0 },
  'refrigerante': { cal: 37, p: 0, c: 9, f: 0 },
  'refrigerante zero': { cal: 0, p: 0, c: 0, f: 0 },
  'cerveja': { cal: 43, p: 0.5, c: 3.6, f: 0 },
  'cerveja sem álcool': { cal: 18, p: 0.5, c: 4, f: 0 },
  'vinho tinto': { cal: 85, p: 0.1, c: 2.6, f: 0 },
  'vinho branco': { cal: 82, p: 0.1, c: 2.6, f: 0 },
  'isotônico': { cal: 27, p: 0, c: 6.5, f: 0 },
  'gatorade': { cal: 26, p: 0, c: 6.5, f: 0 },
  'powerade': { cal: 30, p: 0, c: 7.3, f: 0 },
  'leite achocolatado': { cal: 77, p: 3.6, c: 12, f: 1.5 },
  'chocolate quente': { cal: 78, p: 3.5, c: 11, f: 2.5 },
  'yakult': { cal: 67, p: 1.2, c: 15, f: 0 },

  // ── LANCHES E FAST FOOD ──────────────────────────────────────
  'pizza': { cal: 266, p: 11, c: 33, f: 10 },
  'hamburguer': { cal: 295, p: 17, c: 24, f: 14 },
  'hambúrguer': { cal: 295, p: 17, c: 24, f: 14 },
  'cheeseburguer': { cal: 340, p: 19, c: 28, f: 16 },
  'cheeseburger': { cal: 340, p: 19, c: 28, f: 16 },
  'hot dog': { cal: 290, p: 12, c: 32, f: 13 },
  'cachorro quente': { cal: 290, p: 12, c: 32, f: 13 },
  'sushi': { cal: 140, p: 5, c: 28, f: 1 },
  'temaki': { cal: 210, p: 10, c: 32, f: 5 },
  'wrap': { cal: 255, p: 14, c: 33, f: 8 },
  'sanduíche': { cal: 260, p: 12, c: 34, f: 8 },
  'sanduiche': { cal: 260, p: 12, c: 34, f: 8 },
  'coxinha': { cal: 280, p: 10, c: 33, f: 13 },
  'empada': { cal: 310, p: 9, c: 35, f: 15 },
  'pastel': { cal: 290, p: 9, c: 34, f: 14 },
  'pastel de forno': { cal: 250, p: 9, c: 32, f: 10 },
  'croquete': { cal: 260, p: 10, c: 27, f: 13 },
  'esfiha': { cal: 230, p: 8, c: 32, f: 8 },
  'kibe': { cal: 232, p: 14, c: 19, f: 11 },

  // ── DOCES E SOBREMESAS ───────────────────────────────────────
  'chocolate': { cal: 546, p: 5, c: 60, f: 31 },
  'chocolate ao leite': { cal: 535, p: 7.7, c: 59, f: 30 },
  'chocolate amargo': { cal: 598, p: 5.4, c: 46, f: 43 },
  'chocolate branco': { cal: 539, p: 6, c: 59, f: 32 },
  'biscoito': { cal: 450, p: 6, c: 65, f: 18 },
  'bolacha': { cal: 450, p: 6, c: 65, f: 18 },
  'biscoito recheado': { cal: 490, p: 5, c: 70, f: 21 },
  'cookie': { cal: 498, p: 5.5, c: 66, f: 23 },
  'bolo simples': { cal: 370, p: 5, c: 57, f: 14 },
  'bolo de chocolate': { cal: 398, p: 5, c: 62, f: 16 },
  'brigadeiro': { cal: 420, p: 5, c: 65, f: 16 },
  'beijinho': { cal: 408, p: 4.5, c: 67, f: 14 },
  'pudim': { cal: 160, p: 4, c: 27, f: 4.5 },
  'sorvete': { cal: 207, p: 3.5, c: 24, f: 11 },
  'açaí na tigela': { cal: 247, p: 2.3, c: 25, f: 16 },
  'paçoca': { cal: 494, p: 14, c: 57, f: 24 },
  'pé de moleque': { cal: 490, p: 12, c: 62, f: 22 },
  'quindim': { cal: 377, p: 7, c: 57, f: 14 },
  'canjica': { cal: 103, p: 3, c: 20, f: 1.5 },
  'curau': { cal: 120, p: 2, c: 23, f: 2 },
  'arroz doce': { cal: 145, p: 2.8, c: 27, f: 3 },
  'doce de leite': { cal: 321, p: 7.5, c: 58, f: 7.5 },
  'mel': { cal: 304, p: 0.3, c: 82, f: 0 },
  'geleia': { cal: 250, p: 0.3, c: 65, f: 0.1 },

  // ── OLEAGINOSAS ──────────────────────────────────────────────
  'amendoim': { cal: 567, p: 26, c: 16, f: 49 },
  'pasta de amendoim': { cal: 598, p: 25, c: 20, f: 51 },
  'castanha do pará': { cal: 656, p: 14, c: 12, f: 67 },
  'castanha de caju': { cal: 553, p: 18, c: 30, f: 44 },
  'amêndoa': { cal: 579, p: 21, c: 22, f: 50 },
  'amendoa': { cal: 579, p: 21, c: 22, f: 50 },
  'nozes': { cal: 654, p: 15, c: 14, f: 65 },
  'pistache': { cal: 562, p: 20, c: 28, f: 45 },
  'avelã': { cal: 628, p: 15, c: 17, f: 61 },
  'macadâmia': { cal: 718, p: 7.9, c: 14, f: 76 },

  // ── CONDIMENTOS E MOLHOS ─────────────────────────────────────
  'azeite': { cal: 884, p: 0, c: 0, f: 100 },
  'azeite de oliva': { cal: 884, p: 0, c: 0, f: 100 },
  'óleo de oliva': { cal: 884, p: 0, c: 0, f: 100 },
  'oleo de coco': { cal: 892, p: 0, c: 0, f: 100 },
  'óleo de coco': { cal: 892, p: 0, c: 0, f: 100 },
  'oleo vegetal': { cal: 884, p: 0, c: 0, f: 100 },
  'maionese': { cal: 680, p: 1.1, c: 1.3, f: 75 },
  'maionese light': { cal: 322, p: 1, c: 5, f: 33 },
  'mostarda': { cal: 70, p: 3.7, c: 6, f: 4 },
  'ketchup': { cal: 101, p: 1.5, c: 24, f: 0.2 },
  'molho de tomate': { cal: 29, p: 1.5, c: 5.5, f: 0.4 },
  'shoyu': { cal: 53, p: 5.5, c: 5, f: 0.6 },
  'açúcar': { cal: 387, p: 0, c: 100, f: 0 },
  'açúcar mascavo': { cal: 380, p: 0, c: 98, f: 0 },
  'adoçante': { cal: 0, p: 0, c: 0, f: 0 },
  'sal': { cal: 0, p: 0, c: 0, f: 0 },
  'farinha de trigo': { cal: 364, p: 10, c: 76, f: 1 },
  'amido de milho': { cal: 381, p: 0.3, c: 91, f: 0.1 },
  'farinha de mandioca': { cal: 361, p: 1.7, c: 88, f: 0.3 },

  // ── PRATOS TÍPICOS BRASILEIROS ───────────────────────────────
  'feijoada': { cal: 155, p: 9, c: 12, f: 7.5 },
  'moqueca': { cal: 145, p: 15, c: 5, f: 8 },
  'arroz com feijão': { cal: 105, p: 3.8, c: 21, f: 0.4 },
  'virado de feijão': { cal: 125, p: 5, c: 22, f: 2 },
  'tutu de feijão': { cal: 120, p: 5, c: 20, f: 2.5 },
  'galinhada': { cal: 200, p: 18, c: 20, f: 6 },
  'baião de dois': { cal: 180, p: 8, c: 28, f: 4 },
  'buchada': { cal: 185, p: 20, c: 2, f: 10 },
  'sarapatel': { cal: 180, p: 18, c: 5, f: 10 },
  'peixe assado': { cal: 120, p: 22, c: 0, f: 3.5 },
  'peixe grelhado': { cal: 115, p: 21, c: 0, f: 3 },
  'frango com quiabo': { cal: 175, p: 20, c: 5, f: 8 },

  // ── SUPLEMENTOS ──────────────────────────────────────────────
  'whey protein': { cal: 120, p: 25, c: 3, f: 2 },
  'whey isolado': { cal: 110, p: 27, c: 1, f: 1 },
  'caseina': { cal: 115, p: 24, c: 3.5, f: 1 },
  'caseína': { cal: 115, p: 24, c: 3.5, f: 1 },
  'albumina': { cal: 350, p: 73, c: 4, f: 1.5 },
  'creatina': { cal: 0, p: 0, c: 0, f: 0 },
  'bcaa': { cal: 10, p: 2.5, c: 0, f: 0 },
  'glutamina': { cal: 0, p: 0, c: 0, f: 0 },
  'pre treino': { cal: 30, p: 0, c: 7, f: 0 },
  'pré-treino': { cal: 30, p: 0, c: 7, f: 0 },
  'colageno': { cal: 37, p: 9, c: 0, f: 0 },
  'colágeno': { cal: 37, p: 9, c: 0, f: 0 },
  'barra de proteina': { cal: 200, p: 20, c: 20, f: 7 },
  'barra de proteína': { cal: 200, p: 20, c: 20, f: 7 },

  'default': { cal: 150, p: 10, c: 15, f: 5 }
};

// ── BANCO DE ALIMENTOS EXTRA (admin-confirmed + user suggestions) ──
const FOOD_EXTRA_PATH = path.join(__dirname, 'food_db_extra.json');
const FOOD_SUGGESTIONS_PATH = path.join(__dirname, 'food_suggestions.json');

let foodExtra = {};
let foodSuggestions = {};
try { foodExtra = JSON.parse(readFileSync(FOOD_EXTRA_PATH, 'utf8')); } catch {}
try { foodSuggestions = JSON.parse(readFileSync(FOOD_SUGGESTIONS_PATH, 'utf8')); } catch {}

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

// Aplica middleware em tudo abaixo — exceto rotas /admin (têm auth própria)
app.use((req, res, next) => {
  if (req.path.startsWith('/admin')) return next();
  authMiddleware(req, res, next);
});

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

    const { dark_mode, language } = req.body;
    const profileData = { weight, height, age, gender, goal, activity_level, biotype, diet, updated_at: new Date().toISOString() };
    // Persist streak + last open date if provided (requires streak, last_open_date columns in profiles table)
    if (streak !== undefined) profileData.streak = streak;
    if (lastOpenDate !== undefined) profileData.last_open_date = lastOpenDate;
    // Persist user preferences
    if (dark_mode !== undefined) profileData.dark_mode = dark_mode;
    if (language !== undefined) profileData.language = language;

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
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    // Apaga mensagens com mais de 1 hora para este usuário
    await supabase.from('chat_history').delete().eq('user_id', req.userId).lt('created_at', oneHourAgo);
    const { data, error } = await supabase
      .from('chat_history')
      .select('*')
      .eq('user_id', req.userId)
      .gte('created_at', oneHourAgo)
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
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    // Limpa tudo do usuário (antigas + novas) e reinsere apenas as recentes
    await supabase.from('chat_history').delete().eq('user_id', req.userId);
    const toInsert = messages.slice(-20).map(m => ({
      user_id: req.userId,
      role: m.role === 'assistant' ? 'assistant' : 'user',
      message: m.text || m.message || ''
    }));
    if (toInsert.length) {
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

app.get('/api/foods', (req, res) => res.json({ ...FOOD_DB, ...foodExtra }));

// Sugestão de alimento pelo usuário (entra fila admin)
app.post('/api/foods/suggest', async (req, res) => {
  try {
    const { name, cal, p, c, f } = req.body;
    if (!name) return res.status(400).json({ error: 'missing name' });
    const key = normalizeKey(name);
    // Não sugerir se já existe no DB principal ou extra
    if (foodExtra[key] || FOOD_DB[key]) return res.json({ ok: true, skipped: true });
    foodSuggestions[key] = {
      name: name.trim(),
      cal: parseFloat(cal) || 0,
      p: parseFloat(p) || 0,
      c: parseFloat(c) || 0,
      f: parseFloat(f) || 0,
      suggested_by: req.userEmail || 'unknown',
      suggested_at: new Date().toISOString()
    };
    try { writeFileSync(FOOD_SUGGESTIONS_PATH, JSON.stringify(foodSuggestions, null, 2)); } catch {}
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

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

    const ctx = context || {};
    const m = ctx.metrics || {};
    const lang = ctx.status?.language || 'pt';
    const isEn = lang === 'en';
    const isBR = lang === 'pt';

    // Formata hora no padrão do usuário (AM/PM para inglês, 24h para pt/es)
    const localTime = ctx.status?.localTime || '';
    const timezone  = ctx.status?.timezone  || (isBR ? 'America/Sao_Paulo' : 'UTC');
    const dataQuality = ctx.status?.todayDataQuality || 'good'; // 'empty' | 'partial' | 'good'

    const todayMealsRaw = ctx.today?.meals || [];
    const todayMeals = todayMealsRaw.map(x => {
      const timeLabel = x.time ? ` às ${x.time}` : '';
      return `${x.name}${timeLabel} (${x.cal}kcal P:${x.p}g)`;
    }).join(', ') || (isEn ? 'none logged yet' : 'nenhuma ainda');

    const weekSummary = (ctx.week || []).map(d => {
      const label = isEn ? `${d.meals} meals, ${d.calories}kcal, P${d.protein}g${d.workout?' +workout':''}${d.sleep?` sleep:${d.sleep}h`:''}`
                          : `${d.meals} refeições, ${d.calories}kcal, P${d.protein}g${d.workout?' +treino':''}${d.sleep?` sono:${d.sleep}h`:''}`;
      return `${d.date}: ${d.active ? `✓ ${label}` : (isEn ? '✗ no data' : '✗ sem registro')}`;
    }).join('\n');

    // Aviso de dados incompletos para a IA
    const dataWarning = dataQuality === 'empty'
      ? (isEn ? '⚠️ TODAY DATA: EMPTY — user has not scanned any meal today. Do NOT comment on today\'s diet. Focus entirely on weekly patterns and ask what they plan to eat.'
               : '⚠️ DADOS DE HOJE: VAZIOS — usuário não escaneou nada hoje. NÃO comente sobre a dieta de hoje. Foque nos padrões semanais e pergunte o que planejam comer.')
      : dataQuality === 'partial'
      ? (isEn ? `⚠️ TODAY DATA: PARTIAL (only ${todayMealsRaw.length} item(s) scanned). The user almost certainly ate more — they just didn't scan everything. NEVER conclude their diet from this. Mention what was scanned lightly and shift focus to weekly trends.`
               : `⚠️ DADOS DE HOJE: PARCIAIS (apenas ${todayMealsRaw.length} item(ns) escaneado(s)). O usuário certamente comeu mais — só não registrou tudo. NUNCA tire conclusões sobre a dieta do dia a partir disso. Mencione o que foi escaneado levemente e foque nas tendências semanais.`)
      : '';

    // Dados de treino detalhados
    const workoutProgram = ctx.workout?.program || null;
    const todayWorkout = ctx.workout?.today || null;
    const workoutSummary = todayWorkout
      ? `${isEn ? 'Program' : 'Programa'}: ${workoutProgram || '—'} | ${isEn ? 'Today' : 'Hoje'}: ${todayWorkout.name || '—'} (${todayWorkout.focus || ''})\n${(todayWorkout.exercises || []).map(e => `  • ${e.name}: ${e.sets}x${e.reps} @ ${e.target_weight||0}kg`).join('\n') || '  —'}`
      : `${isEn ? 'Active program' : 'Programa ativo'}: ${workoutProgram || (isEn ? 'none' : 'nenhum')}`;

    const systemPrompt = `You are ${ctx.user || 'the user'}'s personal AI nutrition & training coach inside the AorType app — proactive, data-driven, motivating.
You KNOW the user deeply. Use the real data below in EVERY response. Never say "I don't have data" — you do. Never be generic.

${dataWarning ? dataWarning + '\n\n' : ''}━━━ PROFILE ━━━
Name: ${ctx.user || 'Athlete'}
Goal: ${ctx.profile?.goalLabel || 'Maintenance'} | Weight: ${ctx.profile?.weight || '?'}kg | Height: ${ctx.profile?.height || '?'}cm | Age: ${ctx.profile?.age || '?'} | BMI: ${ctx.profile?.bmi || '?'}
Activity: ${ctx.profile?.activity || 'moderate'} | Gender: ${ctx.profile?.gender || '?'}

━━━ TODAY — ${localTime || ctx.status?.currentWindow || 'now'} (${timezone}) ━━━
Meals logged: ${todayMeals}
Calories: ${m.calories?.current || 0}/${m.calories?.target || 0}kcal (${m.calories?.pct || 0}%) — ${m.calories?.remaining || 0}kcal left
Protein: ${m.protein?.current || 0}/${m.protein?.target || 0}g (${m.protein?.pct || 0}%) — ${m.protein?.remaining || 0}g left
Carbs: ${m.carbs?.current || 0}/${m.carbs?.target || 0}g | Fat: ${m.fat?.current || 0}/${m.fat?.target || 0}g
Water: ${m.water?.current || 0}/${m.water?.target || 0}ml (${m.water?.pct || 0}%)
Sleep: ${ctx.today?.sleep_hours || 0}h (goal: ${m.sleep?.target || 7}h)
Mood: ${ctx.today?.mood || 'not logged'} | Workout today: ${ctx.today?.workout_done ? (ctx.today.workout_type || 'yes') : 'no'}

━━━ LAST 7 DAYS ━━━
${weekSummary}

━━━ WORKOUT PROGRAM ━━━
${workoutSummary}

━━━ STATUS ━━━
Streak: ${ctx.status?.streak || 0} days | Consistency: ${ctx.status?.consistency7d || 0}% (${ctx.status?.activeDaysThisWeek || 0}/7 active)
Health Score: ${ctx.status?.healthScore || 0}/100

━━━ USER'S FAVORITE FOODS ━━━
${(ctx.favorites || []).join(', ') || 'no history yet'}

━━━ HOW TO RESPOND ━━━
- Be PROACTIVE, not passive. Anticipate insights without being asked.
- On greeting: give an intelligent summary + 1 proactive insight with real data.
- When protein is low: suggest foods from the user's favorites with kcal/g.
- When streak is low: acknowledge and motivate with real historical data.
- When sleep is poor: connect it to physical performance and suggest a concrete action.
- When the day is going well: celebrate with real data (e.g., "you already hit 87% of protein by ${localTime || '2pm'}!").
- Meal suggestions: calculate remaining macros and propose 3 options with estimated kcal and protein.
- Weekly analysis: identify best day, worst day, and main pattern with real numbers.
- Max 220 words. Direct, human, motivating, no fluff.
- PARTIAL/EMPTY data rule: If today has ≤2 meals logged, NEVER draw conclusions about the full day's diet — the user simply didn't scan everything. Always assume they ate more; focus on weekly data and future planning.
- Time format: ${isEn ? 'use AM/PM (e.g. 7:30 AM, 1:15 PM)' : 'use formato 24h (ex: 07:30, 13:15)'}.
- ALWAYS respond in ${isEn ? 'English' : lang === 'es' ? 'Spanish' : lang === 'zh' ? 'Chinese (Simplified)' : 'Brazilian Portuguese'}.
- NEVER invent data. If something is not here, say it hasn't been logged.`;


    // Allow caller to override system prompt (e.g. day-update mode)
    const { systemOverride } = req.body;
    const finalPrompt = systemOverride || systemPrompt;

    const messages = [{ role: 'system', content: finalPrompt }];
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

// ── TRANSCRIÇÃO DE ÁUDIO (Groq Whisper) ───────────────────────
app.post('/api/transcribe', async (req, res) => {
  try {
    const { audio } = req.body;
    const groqKey = process.env.GROQ_API_KEY;
    if (!groqKey) return res.status(401).json({ error: 'Chave Groq não configurada' });
    if (!audio) return res.status(400).json({ error: 'Audio ausente' });

    const audioBuffer = Buffer.from(audio, 'base64');
    const audioBlob = new Blob([audioBuffer], { type: 'audio/webm' });

    const formData = new FormData();
    formData.append('file', audioBlob, 'audio.webm');
    formData.append('model', 'whisper-large-v3');
    formData.append('language', 'pt');
    formData.append('response_format', 'json');

    const response = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${groqKey}` },
      body: formData
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`Groq Whisper error ${response.status}: ${err}`);
    }
    const json = await response.json();
    res.json({ text: json.text || '' });
  } catch (error) {
    console.error('Transcribe error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ══════════════════════════════════════════════════════════════
// ── ADMIN PANEL ───────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════

const ADMIN_JWT_SECRET = process.env.JWT_SECRET + '_admin';

// Middleware para proteger rotas admin
const adminAuth = (req, res, next) => {
  const token = req.headers['x-admin-token'] || req.query.token;
  if (!token) return res.status(401).json({ error: 'Não autorizado' });
  try {
    jwt.verify(token, ADMIN_JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Token inválido' });
  }
};

// Login admin
app.post('/admin/login', (req, res) => {
  const { username, password } = req.body;
  const adminUser = process.env.ADMIN_USERNAME || 'admin';
  const adminPass = process.env.ADMIN_PASSWORD || 'macroai@admin2025';
  if (username === adminUser && password === adminPass) {
    const token = jwt.sign({ admin: true }, ADMIN_JWT_SECRET, { expiresIn: '24h' });
    res.json({ token });
  } else {
    res.status(401).json({ error: 'Credenciais inválidas' });
  }
});

// Listar todos os usuários com métricas básicas
app.get('/admin/api/users', adminAuth, async (req, res) => {
  try {
    const { data: users } = await supabase.from('users').select('id, name, email, phone, user_type, created_at, username').order('created_at', { ascending: false });
    const { data: profiles } = await supabase.from('profiles').select('user_id, weight, height, age, gender, goal, streak, activity_level, daily_calories, daily_protein, daily_carbs, daily_fat, biotype, diet, last_open_date');
    const { data: subs } = await supabase.from('subscriptions').select('user_id, plan_name, amount, status, total_paid, started_at, next_billing').catch(() => ({ data: [] }));
    const profileMap = {};
    (profiles || []).forEach(p => { profileMap[p.user_id] = p; });
    const subMap = {};
    (subs || []).forEach(s => { subMap[s.user_id] = s; });
    const result = (users || []).map(u => ({ ...u, profile: profileMap[u.id] || null, subscription: subMap[u.id] || null }));
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: 'Erro ao buscar usuários' });
  }
});

// Atualizar assinatura de um usuário
app.post('/admin/api/users/:id/subscription', adminAuth, async (req, res) => {
  try {
    const uid = req.params.id;
    const { plan_name, amount, status, next_billing, notes } = req.body;
    const { data: existing } = await supabase.from('subscriptions').select('id, total_paid').eq('user_id', uid).single();
    if (existing) {
      const total = (parseFloat(existing.total_paid) || 0) + (parseFloat(amount) || 0);
      await supabase.from('subscriptions').update({ plan_name, amount, status, next_billing, notes, total_paid: total, updated_at: new Date().toISOString() }).eq('user_id', uid);
    } else {
      await supabase.from('subscriptions').insert({ user_id: uid, plan_name, amount: amount || 0, status: status || 'ativo', next_billing, notes, total_paid: amount || 0 });
    }
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: 'Erro ao salvar assinatura' });
  }
});

// Métricas de um usuário específico
app.get('/admin/api/users/:id/metrics', adminAuth, async (req, res) => {
  try {
    const uid = req.params.id;
    const [meals, checkins, workouts, chats] = await Promise.all([
      supabase.from('meals').select('id, name, calories, protein, carbs, fat, logged_at').eq('user_id', uid).order('logged_at', { ascending: false }).limit(50),
      supabase.from('checkins').select('date, mood, note, workout_type, workout_duration, water_ml, calories_burned, sleep_hours').eq('user_id', uid).order('date', { ascending: false }).limit(30),
      supabase.from('workout_programs').select('id, name, category, is_public, created_at').or(`created_by.eq.${uid},is_assigned.eq.true`).limit(20),
      supabase.from('chat_history').select('role, message, created_at').eq('user_id', uid).order('created_at', { ascending: false }).limit(100),
    ]);
    res.json({
      meals: meals.data || [],
      checkins: checkins.data || [],
      workouts: workouts.data || [],
      chats: chats.data || [],
    });
  } catch (e) {
    res.status(500).json({ error: 'Erro ao buscar métricas' });
  }
});

// Stats gerais do app
app.get('/admin/api/stats', adminAuth, async (req, res) => {
  try {
    const [usersCount, mealsCount, checkinsCount, chatsCount] = await Promise.all([
      supabase.from('users').select('id', { count: 'exact', head: true }),
      supabase.from('meals').select('id', { count: 'exact', head: true }),
      supabase.from('checkins').select('id', { count: 'exact', head: true }),
      supabase.from('chat_history').select('id', { count: 'exact', head: true }),
    ]);
    // Usuários ativos últimos 7 dias
    const since7d = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();
    const { count: activeWeek } = await supabase.from('meals').select('user_id', { count: 'exact', head: true }).gte('logged_at', since7d);
    res.json({
      totalUsers: usersCount.count || 0,
      totalMeals: mealsCount.count || 0,
      totalCheckins: checkinsCount.count || 0,
      totalChats: chatsCount.count || 0,
      activeUsersWeek: activeWeek || 0,
    });
  } catch (e) {
    res.status(500).json({ error: 'Erro ao buscar stats' });
  }
});

// ── ADMIN — BANCO DE ALIMENTOS ─────────────────────────────────
app.get('/admin/api/foods/suggestions', adminAuth, (req, res) => {
  res.json(foodSuggestions);
});

app.post('/admin/api/foods/confirm', adminAuth, (req, res) => {
  try {
    const { name, cal, p, c, f } = req.body;
    if (!name) return res.status(400).json({ error: 'missing name' });
    const key = normalizeKey(name);
    foodExtra[key] = {
      cal: parseFloat(cal) || 0,
      p: parseFloat(p) || 0,
      c: parseFloat(c) || 0,
      f: parseFloat(f) || 0
    };
    writeFileSync(FOOD_EXTRA_PATH, JSON.stringify(foodExtra, null, 2));
    // Remove da fila de sugestões
    delete foodSuggestions[key];
    writeFileSync(FOOD_SUGGESTIONS_PATH, JSON.stringify(foodSuggestions, null, 2));
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.delete('/admin/api/foods/suggestions/:name', adminAuth, (req, res) => {
  try {
    const key = decodeURIComponent(req.params.name);
    delete foodSuggestions[key];
    writeFileSync(FOOD_SUGGESTIONS_PATH, JSON.stringify(foodSuggestions, null, 2));
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Serve o painel admin
app.get('/admin', (req, res) => {
  res.send(`<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>MacroAI Admin</title>
<script src="https://cdn.tailwindcss.com"></script>
<style>
  body { background:#0a0a0a; color:#f0f0f0; font-family:system-ui,sans-serif; }
  .card { background:#161616; border:1px solid #2a2a2a; border-radius:12px; padding:20px; }
  .stat { background:#1a1a1a; border:1px solid #333; border-radius:8px; padding:16px; text-align:center; }
  .badge { display:inline-block; padding:2px 8px; border-radius:99px; font-size:11px; font-weight:700; }
  .badge-green { background:rgba(74,222,128,0.15); color:#4ade80; }
  .badge-blue { background:rgba(96,165,250,0.15); color:#60a5fa; }
  .badge-yellow { background:rgba(250,204,21,0.15); color:#facc15; }
  .btn { padding:8px 20px; border-radius:8px; font-weight:600; cursor:pointer; border:none; transition:opacity .2s; }
  .btn:hover { opacity:.8; }
  .btn-primary { background:#b5f23d; color:#000; }
  .btn-ghost { background:#222; color:#aaa; }
  .input { background:#1a1a1a; border:1px solid #333; border-radius:8px; padding:10px 14px; color:#fff; width:100%; outline:none; }
  .input:focus { border-color:#b5f23d; }
  .msg-user { background:#222; border-radius:8px; padding:8px 12px; margin:4px 0; }
  .msg-ai { background:#1a2e1a; border-left:3px solid #b5f23d; border-radius:8px; padding:8px 12px; margin:4px 0; }
  .tab { padding:8px 16px; border-radius:8px; cursor:pointer; font-size:13px; font-weight:600; color:#888; }
  .tab.active { background:#222; color:#fff; }
  #login-screen, #main-screen { transition: opacity .3s; }
</style>
</head>
<body class="min-h-screen">

<!-- LOGIN -->
<div id="login-screen" class="flex items-center justify-center min-h-screen">
  <div class="card w-full max-w-sm mx-4">
    <div class="text-center mb-6">
      <div class="text-3xl font-black mb-1" style="color:#b5f23d">MacroAI</div>
      <div class="text-gray-500 text-sm">Painel Administrativo</div>
    </div>
    <div class="space-y-3">
      <input id="login-user" class="input" type="text" placeholder="Usuário" onkeydown="if(e.key==='Enter')doLogin()">
      <input id="login-pass" class="input" type="password" placeholder="Senha" onkeydown="if(event.key==='Enter')doLogin()">
      <button class="btn btn-primary w-full" onclick="doLogin()">Entrar</button>
      <div id="login-err" class="text-red-400 text-sm text-center hidden">Credenciais inválidas</div>
    </div>
  </div>
</div>

<!-- MAIN -->
<div id="main-screen" class="hidden">
  <!-- Header -->
  <div class="sticky top-0 z-50 border-b border-gray-800" style="background:#0a0a0a">
    <div class="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
      <div class="flex items-center gap-3">
        <span class="text-xl font-black" style="color:#b5f23d">MacroAI</span>
        <span class="badge badge-green">Admin</span>
      </div>
      <button class="btn btn-ghost text-sm" onclick="doLogout()">Sair</button>
    </div>
  </div>

  <div class="max-w-7xl mx-auto px-6 py-8 space-y-8">
    <!-- Stats Row -->
    <div id="stats-row" class="grid grid-cols-2 md:grid-cols-5 gap-4"></div>

    <!-- Users + Detail -->
    <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <!-- Users List -->
      <div class="card">
        <div class="flex items-center justify-between mb-4">
          <h2 class="font-bold text-lg">Usuários</h2>
          <input id="search-input" class="input text-sm" style="width:160px" placeholder="Buscar..." oninput="filterUsers()">
        </div>
        <div id="users-list" class="space-y-2 max-h-[70vh] overflow-y-auto pr-1"></div>
      </div>

      <!-- User Detail -->
      <div class="card" id="detail-panel">
        <div class="text-gray-600 text-center py-16 text-sm">← Selecione um usuário</div>
      </div>
    </div>

    <!-- Banco de Alimentos -->
    <div class="card">
      <div class="flex items-center justify-between mb-4">
        <h2 class="font-bold text-lg">🥗 Banco de Alimentos</h2>
        <button class="btn btn-ghost text-xs" onclick="loadFoodSuggestions()">↻ Atualizar</button>
      </div>
      <p class="text-gray-500 text-xs mb-4">Alimentos identificados pelos usuários aguardando confirmação para o banco de dados.</p>
      <div id="food-suggestions-list" class="text-gray-600 text-sm text-center py-4">Carregando...</div>
    </div>
  </div>
</div>

<script>
let adminToken = localStorage.getItem('macroai_admin_token');
let allUsers = [];
let selectedUserId = null;

async function doLogin() {
  const u = document.getElementById('login-user').value;
  const p = document.getElementById('login-pass').value;
  try {
    const r = await fetch('/admin/login', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({username:u, password:p}) });
    const d = await r.json();
    if (!r.ok) throw new Error();
    adminToken = d.token;
    localStorage.setItem('macroai_admin_token', adminToken);
    showMain();
  } catch {
    document.getElementById('login-err').classList.remove('hidden');
  }
}

function doLogout() {
  localStorage.removeItem('macroai_admin_token');
  adminToken = null;
  document.getElementById('login-screen').classList.remove('hidden');
  document.getElementById('main-screen').classList.add('hidden');
}

async function api(path) {
  const r = await fetch(path, { headers:{'x-admin-token': adminToken} });
  if (r.status === 401) { doLogout(); throw new Error('auth'); }
  return r.json();
}

function showMain() {
  document.getElementById('login-screen').classList.add('hidden');
  document.getElementById('main-screen').classList.remove('hidden');
  loadStats();
  loadUsers();
  loadFoodSuggestions();
}

async function loadStats() {
  try {
    const s = await api('/admin/api/stats');
    document.getElementById('stats-row').innerHTML = [
      { label:'Usuários', value: s.totalUsers, color:'#b5f23d' },
      { label:'Refeições', value: s.totalMeals, color:'#60a5fa' },
      { label:'Checkins', value: s.totalCheckins, color:'#f97316' },
      { label:'Msgs IA', value: s.totalChats, color:'#c084fc' },
      { label:'Ativos 7d', value: s.activeUsersWeek, color:'#4ade80' },
    ].map(s => \`<div class="stat"><div class="text-2xl font-black mb-1" style="color:\${s.color}">\${s.value}</div><div class="text-gray-500 text-xs">\${s.label}</div></div>\`).join('');
  } catch {}
}

async function loadUsers() {
  try {
    allUsers = await api('/admin/api/users');
    renderUsers(allUsers);
  } catch {}
}

function filterUsers() {
  const q = document.getElementById('search-input').value.toLowerCase();
  renderUsers(allUsers.filter(u => (u.name||'').toLowerCase().includes(q) || (u.email||'').toLowerCase().includes(q)));
}

function renderUsers(users) {
  document.getElementById('users-list').innerHTML = users.map(u => {
    const p = u.profile || {};
    const s = u.subscription || {};
    const type = u.user_type === 'academia' ? '<span class="badge badge-blue">Academia</span>' : '<span class="badge badge-yellow">Aluno</span>';
    const initials = (u.name||'?').split(' ').map(x=>x[0]).slice(0,2).join('').toUpperCase();
    const active = selectedUserId === u.id ? 'border-[#b5f23d]' : 'border-transparent hover:border-gray-600';
    const joinDate = u.created_at ? new Date(u.created_at).toLocaleDateString('pt-BR') : '—';
    const paid = s.total_paid ? \`R$ \${parseFloat(s.total_paid).toFixed(2)}\` : 'R$ 0,00';
    return \`<div class="flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-colors \${active}" onclick="loadUser('\${u.id}')">
      <div class="w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm flex-shrink-0" style="background:#222">\${initials}</div>
      <div class="flex-1 min-w-0">
        <div class="font-semibold text-sm truncate">\${u.name || '—'}</div>
        <div class="text-gray-500 text-xs truncate">\${u.email}</div>
        <div class="text-gray-600 text-[10px]">Entrou: \${joinDate} · \${paid}</div>
      </div>
      <div class="flex flex-col items-end gap-1">
        \${type}
        \${p.streak ? \`<span class="text-xs text-orange-400">🔥 \${p.streak}d</span>\` : ''}
      </div>
    </div>\`;
  }).join('') || '<div class="text-gray-600 text-sm text-center py-8">Nenhum usuário encontrado</div>';
}

async function loadUser(id) {
  selectedUserId = id;
  renderUsers(allUsers.filter(u => {
    const q = document.getElementById('search-input').value.toLowerCase();
    return (u.name||'').toLowerCase().includes(q) || (u.email||'').toLowerCase().includes(q);
  }));
  const user = allUsers.find(u => u.id === id);
  const p = user?.profile || {};
  document.getElementById('detail-panel').innerHTML = \`
    <div class="space-y-4">
      <div class="flex items-start gap-3 pb-4 border-b border-gray-800">
        <div class="w-12 h-12 rounded-full flex items-center justify-center font-bold flex-shrink-0 text-lg" style="background:#222">\${(user?.name||'?').split(' ').map(x=>x[0]).slice(0,2).join('').toUpperCase()}</div>
        <div class="flex-1 min-w-0">
          <div class="font-bold text-base">\${user?.name || '—'}</div>
          <div class="text-gray-400 text-xs">\${user?.email}</div>
          \${user?.phone ? \`<div class="text-gray-500 text-xs">📱 \${user.phone}</div>\` : ''}
          \${user?.username ? \`<div class="text-gray-600 text-xs">@\${user.username}</div>\` : ''}
          <div class="text-gray-600 text-xs mt-1">
            <span class="mr-3">📅 Entrou em \${user?.created_at ? new Date(user.created_at).toLocaleDateString('pt-BR', {day:'2-digit',month:'long',year:'numeric'}) : '—'}</span>
            <span>\${user?.user_type === 'academia' ? '🏢 Academia' : '🎓 Aluno'}</span>
          </div>
        </div>
      </div>

      <!-- Pagamento -->
      <div class="rounded-xl p-3 border border-gray-700" style="background:#0f1f0f">
        <div class="flex justify-between items-center mb-2">
          <span class="text-xs font-bold text-green-400">💰 ASSINATURA</span>
          <button onclick="editSubscription('\${id}')" class="text-xs text-gray-500 hover:text-white transition-colors">✏️ Editar</button>
        </div>
        <div class="grid grid-cols-3 gap-2 text-center text-xs">
          <div><div class="font-bold text-green-400 text-base">R$ \${s.total_paid ? parseFloat(s.total_paid).toFixed(2) : '0,00'}</div><div class="text-gray-600">Total pago</div></div>
          <div><div class="font-bold text-white text-base">R$ \${s.amount ? parseFloat(s.amount).toFixed(2) : '0,00'}</div><div class="text-gray-600">Mensalidade</div></div>
          <div><div class="font-bold text-sm \${s.status === 'ativo' ? 'text-green-400' : 'text-red-400'}">\${s.status || 'sem plano'}</div><div class="text-gray-600">Status</div></div>
        </div>
        \${s.started_at ? \`<div class="text-gray-600 text-[10px] mt-1">Início: \${new Date(s.started_at).toLocaleDateString('pt-BR')} \${s.next_billing ? '· Próx: '+new Date(s.next_billing).toLocaleDateString('pt-BR') : ''}</div>\` : ''}
        <div id="sub-form-\${id}" class="hidden mt-3 space-y-2">
          <div class="flex gap-2">
            <input id="sub-amount-\${id}" placeholder="Valor R$" type="number" step="0.01" class="input text-xs flex-1" value="\${s.amount||''}">
            <select id="sub-status-\${id}" class="input text-xs flex-1">
              <option value="ativo" \${s.status==='ativo'?'selected':''}>Ativo</option>
              <option value="inadimplente" \${s.status==='inadimplente'?'selected':''}>Inadimplente</option>
              <option value="cancelado" \${s.status==='cancelado'?'selected':''}>Cancelado</option>
              <option value="trial" \${s.status==='trial'?'selected':''}>Trial</option>
            </select>
          </div>
          <input id="sub-plan-\${id}" placeholder="Nome do plano" class="input text-xs w-full" value="\${s.plan_name||'Mensal'}">
          <button onclick="saveSubscription('\${id}')" class="btn btn-primary w-full text-xs py-1.5">Salvar pagamento</button>
        </div>
      </div>

      <!-- Stats perfil -->
      <div class="grid grid-cols-4 gap-2 text-center text-xs">
        <div class="stat"><div class="font-bold text-base">\${p.weight ? p.weight+'kg' : '—'}</div><div class="text-gray-500">Peso</div></div>
        <div class="stat"><div class="font-bold text-base">\${p.height ? p.height+'cm' : '—'}</div><div class="text-gray-500">Altura</div></div>
        <div class="stat"><div class="font-bold text-base">\${p.streak||0}🔥</div><div class="text-gray-500">Streak</div></div>
        <div class="stat"><div class="font-bold text-base">\${p.daily_calories||'—'}</div><div class="text-gray-500">Meta kcal</div></div>
      </div>
      <div class="grid grid-cols-3 gap-2 text-center text-xs">
        <div class="stat"><div class="font-bold text-sm">\${p.age||'—'}</div><div class="text-gray-500">Idade</div></div>
        <div class="stat"><div class="font-bold text-sm">\${p.gender==='male'?'♂ M':p.gender==='female'?'♀ F':'—'}</div><div class="text-gray-500">Gênero</div></div>
        <div class="stat"><div class="font-bold text-sm">\${p.goal==='lose'?'🔻 Perda':p.goal==='gain'?'🔺 Ganho':p.goal==='maintain'?'⚖️ Manter':'—'}</div><div class="text-gray-500">Objetivo</div></div>
      </div>
      \${p.weight ? \`<div class="text-xs text-gray-600 bg-gray-900 rounded-lg px-3 py-2">Proteína: \${p.daily_protein||'—'}g · Carbs: \${p.daily_carbs||'—'}g · Gordura: \${p.daily_fat||'—'}g/dia\${p.diet ? ' · Dieta: '+p.diet : ''}\${p.biotype ? ' · Biótipo: '+p.biotype : ''}</div>\` : ''}

      <div class="flex gap-2 flex-wrap" id="detail-tabs">
        <div class="tab active" onclick="switchTab('chats')">Chat IA</div>
        <div class="tab" onclick="switchTab('meals')">Refeições</div>
        <div class="tab" onclick="switchTab('checkins')">Checkins</div>
        <div class="tab" onclick="switchTab('workouts')">Treinos</div>
      </div>
      <div id="detail-content" class="text-gray-400 text-sm text-center py-6">Carregando...</div>
    </div>\`;
  try {
    const m = await api(\`/admin/api/users/\${id}/metrics\`);
    window._adminData = m;
    switchTab('chats');
  } catch {}
}

function switchTab(tab) {
  document.querySelectorAll('#detail-tabs .tab').forEach((t,i) => {
    t.classList.toggle('active', ['chats','meals','checkins','workouts'][i] === tab);
  });
  const m = window._adminData;
  if (!m) return;
  const el = document.getElementById('detail-content');
  if (tab === 'chats') {
    if (!m.chats.length) { el.innerHTML = '<div class="text-gray-600 text-center py-4">Sem mensagens (expiram após 1h)</div>'; return; }
    el.innerHTML = '<div class="space-y-2 max-h-80 overflow-y-auto">' + m.chats.slice().reverse().map(c => {
      const cls = c.role === 'assistant' ? 'msg-ai' : 'msg-user';
      const who = c.role === 'assistant' ? '🤖 IA' : '👤 Usuário';
      const date = c.created_at ? new Date(c.created_at).toLocaleString('pt-BR') : '';
      return \`<div class="\${cls}"><div class="flex justify-between mb-1"><span class="text-xs font-bold">\${who}</span><span class="text-gray-600 text-xs">\${date}</span></div><div class="text-xs">\${c.message}</div></div>\`;
    }).join('') + '</div>';
  } else if (tab === 'meals') {
    if (!m.meals.length) { el.innerHTML = '<div class="text-gray-600 text-center py-4">Sem refeições registradas</div>'; return; }
    el.innerHTML = '<div class="space-y-1 max-h-80 overflow-y-auto">' + m.meals.map(x => {
      const date = x.logged_at ? new Date(x.logged_at).toLocaleDateString('pt-BR') : '';
      return \`<div class="flex justify-between py-1.5 border-b border-gray-800 text-xs"><div><span class="text-white">\${x.name}</span><span class="text-gray-600 ml-2">\${date}</span></div><span class="text-gray-400 flex-shrink-0">\${x.calories||0}kcal · P\${x.protein||0}g · C\${x.carbs||0}g</span></div>\`;
    }).join('') + '</div>';
  } else if (tab === 'checkins') {
    if (!m.checkins.length) { el.innerHTML = '<div class="text-gray-600 text-center py-4">Sem checkins</div>'; return; }
    el.innerHTML = '<div class="space-y-1 max-h-80 overflow-y-auto">' + m.checkins.map(x => \`
      <div class="py-2 border-b border-gray-800 text-xs">
        <div class="flex justify-between mb-1"><span class="font-bold text-white">\${x.date}</span><span class="text-gray-400">\${x.mood||'—'}</span></div>
        <div class="flex gap-3 text-gray-500">
          <span>😴 \${x.sleep_hours||0}h</span>
          <span>💧 \${x.water_ml||0}ml</span>
          <span>🏋️ \${x.workout_type||'—'}</span>
          <span>🔥 \${x.calories_burned||0}kcal</span>
        </div>
        \${x.note ? \`<div class="text-gray-600 mt-1 italic">"\${x.note}"</div>\` : ''}
      </div>\`).join('') + '</div>';
  } else {
    if (!m.workouts.length) { el.innerHTML = '<div class="text-gray-600 text-center py-4">Sem programas de treino</div>'; return; }
    el.innerHTML = '<div class="space-y-2 max-h-80 overflow-y-auto">' + m.workouts.map(w => \`
      <div class="py-2 border-b border-gray-800 text-xs flex justify-between items-center">
        <div><div class="text-white font-semibold">\${w.name}</div><div class="text-gray-500">\${w.category||'—'}</div></div>
        <span class="badge \${w.is_public ? 'badge-green' : 'badge-yellow'}">\${w.is_public ? 'Público' : 'Privado'}</span>
      </div>\`).join('') + '</div>';
  }
}

function editSubscription(uid) {
  const form = document.getElementById(\`sub-form-\${uid}\`);
  if (form) form.classList.toggle('hidden');
}

async function saveSubscription(uid) {
  const amount = document.getElementById(\`sub-amount-\${uid}\`)?.value;
  const status = document.getElementById(\`sub-status-\${uid}\`)?.value;
  const plan_name = document.getElementById(\`sub-plan-\${uid}\`)?.value;
  try {
    const r = await fetch(\`/admin/api/users/\${uid}/subscription\`, {
      method: 'POST',
      headers: {'Content-Type':'application/json','x-admin-token': adminToken},
      body: JSON.stringify({ amount: parseFloat(amount)||0, status, plan_name })
    });
    if (!r.ok) throw new Error();
    // Atualiza lista e recarrega usuário
    await loadUsers();
    loadUser(uid);
  } catch { alert('Erro ao salvar'); }
}

// ── BANCO DE ALIMENTOS ─────────────────────────────────────────
async function loadFoodSuggestions() {
  const el = document.getElementById('food-suggestions-list');
  if (!el) return;
  try {
    const data = await api('/admin/api/foods/suggestions');
    const items = Object.entries(data);
    if (!items.length) {
      el.innerHTML = '<div class="text-gray-600 text-center py-4 text-xs">Nenhuma sugestão pendente</div>';
      return;
    }
    el.innerHTML = '<div class="space-y-2 max-h-80 overflow-y-auto">' + items.map(([key, f]) => \`
      <div class="flex items-center gap-3 p-3 rounded-xl border border-gray-800" style="background:#111">
        <div class="flex-1 min-w-0">
          <div class="font-semibold text-sm capitalize">\${f.name}</div>
          <div class="text-gray-500 text-xs mt-0.5">\${f.cal} kcal · \${f.p}g prot · \${f.c}g carb · \${f.f}g gord <span class="text-gray-700">(por 100g)</span></div>
          <div class="text-gray-700 text-[10px] mt-0.5">Por: \${f.suggested_by} · \${f.suggested_at ? new Date(f.suggested_at).toLocaleDateString('pt-BR') : ''}</div>
        </div>
        <div class="flex gap-2 flex-shrink-0">
          <button onclick="confirmFood('\${key}',\${f.cal},\${f.p},\${f.c},\${f.f},'\${(f.name||'').replace(/'/g,"\\\\'")}')"
            class="btn btn-primary text-xs px-3 py-1.5" style="font-size:11px">✓ Salvar</button>
          <button onclick="rejectFood('\${key}')"
            class="btn btn-ghost text-xs px-3 py-1.5" style="font-size:11px">✕</button>
        </div>
      </div>\`).join('') + '</div>';
  } catch (e) {
    el.innerHTML = '<div class="text-red-400 text-xs text-center py-4">Erro ao carregar sugestões</div>';
  }
}

async function confirmFood(key, cal, p, c, f, name) {
  try {
    const r = await fetch('/admin/api/foods/confirm', {
      method: 'POST',
      headers: {'Content-Type':'application/json','x-admin-token': adminToken},
      body: JSON.stringify({ name, cal, p, c, f })
    });
    if (!r.ok) throw new Error();
    loadFoodSuggestions();
  } catch { alert('Erro ao confirmar'); }
}

async function rejectFood(key) {
  try {
    await fetch(\`/admin/api/foods/suggestions/\${encodeURIComponent(key)}\`, {
      method: 'DELETE',
      headers: {'x-admin-token': adminToken}
    });
    loadFoodSuggestions();
  } catch { alert('Erro ao rejeitar'); }
}

// Auto-login se tiver token
if (adminToken) {
  showMain();
}
</script>
</body></html>`);
});

// ── EXPORTA PARA VERCEL ────────────────────────────────────────
export default app;

if (process.env.NODE_ENV !== 'production') {
  app.listen(PORT, () => console.log(`AorType rodando em http://localhost:${PORT}`));
}

