-- MacroAI — Migration: video_url para todos os exercícios de todos os programas
-- Atualiza via jsonb_set por nome de exercício — não sobrescreve outros campos.
-- Rodar no Supabase SQL Editor:
-- https://supabase.com/dashboard/project/qslgxeodsdbqsgksphty/sql

DO $$
DECLARE
  video_map jsonb := '{
    "Supino Reto":                               "https://www.youtube.com/embed/XVYD6356Orw",
    "Supino Reto com Halteres":                  "https://www.youtube.com/embed/XVYD6356Orw",
    "Supino Reto com Halteres + Flexão de Braço":"https://www.youtube.com/embed/XVYD6356Orw",
    "Supino Inclinado Halteres":                 "https://www.youtube.com/embed/wOCAcO00FF8",
    "Supino Inclinado com Halteres":             "https://www.youtube.com/embed/ZaNyRjpoki8",
    "Supino Articulado + Voador na Máquina":     "https://www.youtube.com/embed/a9vQ_hwIksU",
    "Crucifixo Máquina":                         "https://www.youtube.com/embed/a9vQ_hwIksU",
    "Voador na Máquina":                         "https://www.youtube.com/embed/a9vQ_hwIksU",
    "Crucifixo Inclinado":                       "https://www.youtube.com/embed/kIpagzRxFPo",
    "Crucifixo Inclinado + Supino Inclinado Fechado": "https://www.youtube.com/embed/kIpagzRxFPo",
    "Crucifixo Inverso":                         "https://www.youtube.com/embed/LsT-bR_zxLo",
    "Tríceps Corda":                             "https://www.youtube.com/embed/fPG8Nciy_D8",
    "Tríceps Corda à Frente":                    "https://www.youtube.com/embed/fPG8Nciy_D8",
    "Tríceps Francês":                           "https://www.youtube.com/embed/Nw2dPlGz8_Q",
    "Tríceps Pulley":                            "https://www.youtube.com/embed/XpeCPOHJTK8",
    "Tríceps Inverso — Set 21":                  "https://www.youtube.com/embed/XpeCPOHJTK8",
    "Puxada Frente":                             "https://www.youtube.com/embed/kNIWD0-xJpk",
    "Puxada Alta Frontal":                       "https://www.youtube.com/embed/kNIWD0-xJpk",
    "Puxada na Barra":                           "https://www.youtube.com/embed/O34G1d1RoU8",
    "Pulldown":                                  "https://www.youtube.com/embed/kNIWD0-xJpk",
    "Pull Down Barra Reta":                      "https://www.youtube.com/embed/kNIWD0-xJpk",
    "Pull Down na Polia":                        "https://www.youtube.com/embed/kNIWD0-xJpk",
    "Remada Curvada":                            "https://www.youtube.com/embed/_oI7eEG-G3E",
    "Remada Articulada":                         "https://www.youtube.com/embed/W7GHNOjIlSs",
    "Remada Sentada na Polia":                   "https://www.youtube.com/embed/W7GHNOjIlSs",
    "Remada em Pé no Cross":                     "https://www.youtube.com/embed/Yiy_yCa8RdY",
    "Remada no Cross + Agachamento":             "https://www.youtube.com/embed/W7GHNOjIlSs",
    "Rosca Direta":                              "https://www.youtube.com/embed/gSYqGJNFqWE",
    "Rosca Martelo":                             "https://www.youtube.com/embed/-kW2fTFVAA0",
    "Rosca Martelo Alternada":                   "https://www.youtube.com/embed/-kW2fTFVAA0",
    "Rosca Cross (Barra W) — Set 21":            "https://www.youtube.com/embed/gSYqGJNFqWE",
    "Rosca Cross (Barra Reta) + Rosca Inversa":  "https://www.youtube.com/embed/gSYqGJNFqWE",
    "Agachamento Livre":                         "https://www.youtube.com/embed/OSb5-r6XMVo",
    "Leg Press 45":                              "https://www.youtube.com/embed/ubNzAWQPzwY",
    "Leg Press 45°":                             "https://www.youtube.com/embed/ubNzAWQPzwY",
    "Cadeira Extensora":                         "https://www.youtube.com/embed/iQ92TuvBqRo",
    "Cadeira Extensora Unilateral":              "https://www.youtube.com/embed/iQ92TuvBqRo",
    "Mesa Flexora":                              "https://www.youtube.com/embed/bvP0Ru2xgRc",
    "Mesa Flexora Unilateral":                   "https://www.youtube.com/embed/bvP0Ru2xgRc",
    "Panturrilha Sentado":                       "https://www.youtube.com/embed/IkgAv2fzh38",
    "Panturrilha Sentado (Solear)":              "https://www.youtube.com/embed/IkgAv2fzh38",
    "Panturrilha em Pé":                         "https://www.youtube.com/embed/2-FVDvCKjTQ",
    "Hack Machine":                              "https://www.youtube.com/embed/dJcCdRH_2i8",
    "Stiff":                                     "https://www.youtube.com/embed/8tTKm-3wX5s",
    "Afundo Funcional Alternado":                "https://www.youtube.com/embed/BYe4uyGF-h4",
    "Abdução de Quadril":                        "https://www.youtube.com/embed/uFWuVSxsT0Y",
    "Adução de Quadril":                         "https://www.youtube.com/embed/uFWuVSxsT0Y",
    "Elevação de Quadril":                       "https://www.youtube.com/embed/j4vLMpXrxVE",
    "Elevação Pélvica Solo":                     "https://www.youtube.com/embed/j4vLMpXrxVE",
    "Desenvolvimento c/ Halteres":               "https://www.youtube.com/embed/-MS0boEyfuE",
    "Desenvolvimento com Halteres":              "https://www.youtube.com/embed/-MS0boEyfuE",
    "Elevação Lateral":                          "https://www.youtube.com/embed/MLWNw1PGNMM",
    "Elevação Frontal no Cross":                 "https://www.youtube.com/embed/9ThlTL25DH8",
    "Encolhimento c/ Barra":                     "https://www.youtube.com/embed/nd8eNnkFOKU",
    "Posterior de Ombro":                        "https://www.youtube.com/embed/LsT-bR_zxLo",
    "Face Pull":                                 "https://www.youtube.com/embed/a9AaQh1dtRs",
    "Lombar no Banco":                           "https://www.youtube.com/embed/EHOOVYTi2_c",
    "Abdominal Infra":                           "https://www.youtube.com/embed/XAk2_1Dx65Q",
    "Abdominal Supra":                           "https://www.youtube.com/embed/ma3_HNpxR8Q",
    "Crunch na Máquina":                         "https://www.youtube.com/embed/ma3_HNpxR8Q",
    "Elevação de Pernas":                        "https://www.youtube.com/embed/XAk2_1Dx65Q",
    "Prancha":                                   "https://www.youtube.com/embed/E1ughhm_1aU",
    "Prancha Frontal":                           "https://www.youtube.com/embed/E1ughhm_1aU",
    "Prancha Alpinista":                         "https://www.youtube.com/embed/7W4JEfEKuC4",
    "Russian Twist":                             "https://www.youtube.com/embed/e0mgDRSLheY",
    "Corda Naval":                               "https://www.youtube.com/embed/e9fq-C9NotE"
  }';
BEGIN
  UPDATE workout_programs
  SET exercises = (
    SELECT jsonb_agg(
      CASE
        WHEN video_map ? (ex->>'name')
        THEN jsonb_set(ex, '{video_url}', video_map->(ex->>'name'))
        ELSE ex
      END
    )
    FROM jsonb_array_elements(exercises) AS ex
  )
  WHERE exercises IS NOT NULL
    AND jsonb_typeof(exercises) = 'array';
END $$;
