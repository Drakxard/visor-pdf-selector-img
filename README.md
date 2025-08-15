# Pdf navigation app

*Automatically synced with your [v0.dev](https://v0.dev) deployments*

## Configuración de Base de Datos Neon

Este proyecto está configurado para usar Neon PostgreSQL como base de datos.

### Pasos para configurar Neon:

1. **Crear cuenta en Neon**: Ve a [neon.tech](https://neon.tech) y crea una cuenta
2. **Crear proyecto**: Crea un nuevo proyecto en Neon
3. **Obtener string de conexión**: Copia el string de conexión desde el dashboard
4. **Configurar variables de entorno**: 
   - Crea un archivo `.env.local` en la raíz del proyecto
   - Agrega tu `DATABASE_URL` de Neon
5. **Inicializar base de datos**: Ejecuta el script `scripts/init-db.sql` en la consola SQL de Neon
6. **Probar conexión**: Visita `/api/test-db` para verificar la conexión

### Variables de entorno requeridas:
```
DATABASE_URL="postgresql://username:password@ep-example-123456.us-east-1.aws.neon.tech/neondb?sslmode=require"
```

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
