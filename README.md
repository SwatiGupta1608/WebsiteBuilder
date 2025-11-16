# WebsiteBuilder Platform

A full‑stack, TypeScript‑powered AI code generation platform inspired by tools like **Bolt**, **Lovable**, etc. 
This project integrates **Gemini API** to generate, modify, and manage code—complete with a full UI, file explorer, streaming responses, templates, and structured API endpoints.

---

##  Overview

This repository contains both the **backend (Node.js + Express + TypeScript)** and **frontend (React + TypeScript)** code for an AI‑assisted coding environment. 
The system communicates with the Gemini API to generate code, build templates, refine prompts, and manage user interactions in real time.

## Demo Sreenshots

<img width="1399" height="808" alt="Demopic1" src="https://github.com/user-attachments/assets/0954ef7f-1f21-432d-b10b-0df2adfd8848" />

<img width="1381" height="851" alt="Demopic2" src="https://github.com/user-attachments/assets/fc1ba0cb-b5f7-4ef0-b91c-a6d3ce4729ff" />
<img width="1407" height="848" alt="Demopic3" src="https://github.com/user-attachments/assets/52103615-ca4b-4e8e-93d6-4f0c5471573c" />
<img width="1385" height="830" alt="Demopic4" src="https://github.com/user-attachments/assets/fda31066-6965-4bc0-a37d-d1fb417a6a5c" />
<img width="1379" height="848" alt="Demopic5" src="https://github.com/user-attachments/assets/1a588815-2656-465e-a599-d1793ff4b556" />


---

#  Architecture

### 🔹 High-Level Flow

```
User → Frontend UI → /chat API → Gemini API → Streamed Response → UI Renderer
```

###  Project Structure

```
root/
├── backend/
│   ├── src/
│   │   ├── index.ts
│   │   ├── routes/
│   │   │   ├── chat.ts
│   │   │   ├── template.ts
│   │   ├── services/
│   │   │   └── geminiService.ts
│   │   ├── utils/
│   │   └── types/
│   ├── package.json
│   └── tsconfig.json
│
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   ├── pages/
│   │   ├── hooks/
│   │   ├── utils/
│   │   └── App.tsx
│   ├── package.json
│   └── tsconfig.json
│
└── README.md
```

---

#  Features

| Feature                       | Description                                                  |
| ----------------------------- | ------------------------------------------------------------ |
| 🧠 **AI Code Generation**     | Generate full apps, components, or snippets using Gemini API |
| ⚡ **Streaming Responses**     | Faster, incremental token streaming for real‑time UI updates |
| 🧩 **Template Builder**       | Predefined templates generated via /template endpoint        |
| 💬 **Follow-up Prompts**      | Continue conversation with context memory                    |     
| 🕸️ **WebContainers Support**  | Run generated code inside the browser                        |
| 🛡️ **Security Layer**         | Input sanitization, rate limiting, API key protection        |

---

#  Quick Start Guide

## 1. Clone the Repository

```bash
git clone <your-repo-url>
cd project
```

## 2. Backend Setup

```bash
cd backend
npm install
cp .env.example .env   # Add GEMINI_API_KEY
tsc -b
npm start
```

## 3. Frontend Setup

```bash
cd frontend
npm install
npm run dev
```

---

#  How It Works

1. **User sends a prompt** from the UI.
2. The frontend hits the backend `/chat` endpoint.
3. The backend forwards request to **Gemini API** with instruction‑engineered prompts.
4. The backend streams the Gemini response.
5. The frontend renders code blocks, folders, and follow‑ups.

---

#  Security Features

* API key stored only in backend
* Input validation & size limits
* Basic rate limiting
* Sanitization before sending to Gemini API
* No direct eval or code execution on backend

---

# API Documentation

### `POST /template`

Generates a project template based on user requirements.

**Body:**

```json
{
  "projectType": "fullstack-react-express",
  "instructions": "Create a notes app"
}
```

**Returns:** folder structure + base code.

---

### `POST /chat`

Main endpoint for AI code generation.

**Body:**

```json
{
  "message": "Create a login component using React",
  "history": []
}
```

**Response:** streamed AI response.

---

# 🎨 UI Components

| Component         | Purpose                            |
| ----------------- | ---------------------------------- |
| **ChatBox**       | Send/receive messages              |
| **FileExplorer**  | Display project tree               |
| **CodeViewer**    | Syntax-highlighted code frames     |
| **PromptEditor**  | System + user prompt customization |
| **FollowUpPanel** | Suggested AI prompts               |

---

#  Development Commands

### Backend

```bash
npm run build
npm run start
npm run dev
npm run lint
```

### Frontend

```bash
npm run dev
npm run lint
npm run preview
```

---

# 📦 Important Dependencies

### Backend

* Express
* TypeScript
* Gemini SDK (Google Generative AI)
* Nodemon
* CORS

### Frontend

* React
* TypeScript
* Vite
* Tailwind or custom CSS

---
# Key Challenges in Prompt Engineering & Structured LLM Output
1. Enriching the Prompt
2. Instructing LLM to Return Output in a Specific Format
3. Parsing the Response in a Structured Way

---   
# 🤝 Contributing

1. Fork the repo
2. Create your feature branch
3. Commit changes with meaningful messages
4. Create a PR

I welcome improvements to templates, UX, API abstractions, and performance.

---

# 📚 Learning Resources

* Gemini API Documentation
* Node.js + Express Guides
* React + TypeScript Best Practices
* Streaming API Patterns
* WebContainers Documentation

---

## ⭐ Summary

This project replicates the flow of modern AI dev tools like **Bolt**, **Lovable**, and **v0.dev**, but powered by **Gemini** and built entirely in **TypeScript**.
