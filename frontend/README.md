# CloudSizer Frontend

Next.js frontend for the CloudSizer FastAPI backend.

## Prerequisites

- Node.js 20 or newer
- npm 10 or newer
- FastAPI backend running on `http://127.0.0.1:8068`

## Setup

```powershell
cd frontend
Copy-Item .env.example .env.local
npm install
```

## Run

```powershell
npm run dev
```

Open `http://127.0.0.1:3000`.

## API Configuration

The frontend reads the backend base URL from `NEXT_PUBLIC_API_BASE_URL`.

Default:

```text
http://127.0.0.1:8068
```
