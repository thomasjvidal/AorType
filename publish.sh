#!/bin/bash
# Publica develop → main → Vercel produção
# Só execute quando o usuário autorizar

echo "🚀 Publicando para produção..."
git checkout main
git merge develop --no-edit
git push origin main
git checkout develop
echo "✅ Publicado! Vercel vai fazer o deploy automaticamente."
