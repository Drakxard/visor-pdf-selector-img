# PDF Navigation App con Supabase

*Automatically synced with your [v0.dev](https://v0.dev) deployments*

## Configuración de Base de Datos Supabase

Este proyecto está configurado para usar Supabase como base de datos y backend.

### Pasos para configurar Supabase:

1. **Crear cuenta en Supabase**: Ve a [supabase.com](https://supabase.com) y crea una cuenta
2. **Crear proyecto**: Crea un nuevo proyecto en Supabase
3. **Obtener credenciales**: Desde Settings > API, copia:
   - Project URL
   - Anon (public) key
   - Service role key
4. **Configurar variables de entorno**:
   - Crea un archivo `.env.local` en la raíz del proyecto
   - Agrega tus credenciales de Supabase
5. **Inicializar base de datos**: Ejecuta la migración `supabase/migrations/create_progress_table.sql` en el SQL Editor de Supabase
6. **Probar conexión**: Visita `/api/test-db` para verificar la conexión

### Variables de entorno requeridas:
```
NEXT_PUBLIC_SUPABASE_URL=https://tu-proyecto.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=tu_anon_key
SUPABASE_SERVICE_ROLE_KEY=tu_service_role_key
```

### Características de Supabase incluidas:
- ✅ Base de datos PostgreSQL
- ✅ APIs REST automáticas
- ✅ Row Level Security (RLS)
- ✅ Triggers y funciones automáticas
- ✅ Datos de ejemplo incluidos

[![Deployed on Vercel](https://img.shields.io/badge/Deployed%20on-Vercel-black?style=for-the-badge&logo=vercel)](https://vercel.com/ovh6581-4224s-projects/v0-pdf-navigation-app)
[![Built with v0](https://img.shields.io/badge/Built%20with-v0.dev-black?style=for-the-badge)](https://v0.dev/chat/projects/t0Ir8jE5Db2)

## Overview

This repository will stay in sync with your deployed chats on [v0.dev](https://v0.dev).
Any changes you make to your deployed app will be automatically pushed to this repository from [v0.dev](https://v0.dev).

## Deployment

Your project is live at:

**[https://vercel.com/ovh6581-4224s-projects/v0-pdf-navigation-app](https://vercel.com/ovh6581-4224s-projects/v0-pdf-navigation-app)**

## Build your app

Continue building your app on:

**[https://v0.dev/chat/projects/t0Ir8jE5Db2](https://v0.dev/chat/projects/t0Ir8jE5Db2)**

## How It Works

1. Create and modify your project using [v0.dev](https://v0.dev)
2. Deploy your chats from the v0 interface
3. Changes are automatically pushed to this repository
4. Vercel deploys the latest version from this repository
