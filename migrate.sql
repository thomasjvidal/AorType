-- MacroAI — Migration: Add missing columns to checkins table
-- Run this once in the Supabase SQL Editor:
-- https://supabase.com/dashboard/project/qslgxeodsdbqsgksphty/sql

ALTER TABLE checkins
  ADD COLUMN IF NOT EXISTS note           TEXT,
  ADD COLUMN IF NOT EXISTS workout_specific TEXT,
  ADD COLUMN IF NOT EXISTS calories_burned  INTEGER DEFAULT 0;
