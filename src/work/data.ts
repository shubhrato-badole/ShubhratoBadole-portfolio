// All content below is taken from the README files provided. Nothing is invented.
// `year` is intentionally unset: the READMEs state no dates. Add e.g. year: '2026' to show it.
export type Fact = { label: string; value: string }
export type Shot = { src: string; w: number; h: number; alt: string }
export type Clip = { src: string; poster: string; w: number; h: number; label: string }
export type Project = {
  slug: string; title: string; size: 'md' | 'sm'; accent: string
  /** 4:5 portrait still used by the card AND the project hero, so the open/close morph is exact */
  card: string; mediaSub: string
  /** optional 4:5 looping video shown inside the home-page card (the still `card` is its first frame) */
  cardVideo?: string
  clips?: Clip[]; shots: Shot[]
  summary: string; hoverDark: number; placeholder: boolean
  type: string; status: string; year?: string
  scope: string[]; stack: string[]
  tagline: string; description: string[]
  features: { name: string; text?: string }[]
  stackGroups: { label: string; items: string }[]
  architecture: string[]
  facts: { title: string; items: Fact[] }[]
  links: { github?: string; live?: string; api?: string }
}

export const projects: Project[] = [
  {
    summary: 'Upload documents, ask questions, and get cited answers — powered by hybrid search, reranking, and a LangGraph agent that decides when to search your docs vs the web.', hoverDark: 0.35, placeholder: false, slug: 'researchmind-ai', title: 'ResearchMind AI', size: 'md', accent: '#5048b8',
    card: '/work/researchmind-card.webp', cardVideo: '/work/researchmind-card.mp4',
    clips: [{ src: '/work/researchmind.mp4', poster: '/work/researchmind-poster.webp', w: 2000, h: 1134, label: 'Ask a question — get a cited answer (waiting time sped up)' }],
    shots: [
      { src: '/work/researchmind-1.webp', w: 2000, h: 1135, alt: 'ResearchMind answering a question and flagging a contradiction between two documents' },
      { src: '/work/researchmind-2.webp', w: 2000, h: 1140, alt: 'ResearchMind comparison table of a useful trace versus evidence of answer correctness' },
      { src: '/work/researchmind-3.webp', w: 2000, h: 1140, alt: 'ResearchMind document library' },
    ],
    mediaSub: 'Agentic knowledge base',
    type: 'Agentic RAG', status: 'Backend in progress', scope: ['AI', 'Backend', 'RAG'],
    stack: ['Python', 'FastAPI', 'LangGraph', 'ChromaDB'],
    tagline: 'Your documents. Answered instantly.',
    description: [
      'An agentic knowledge base that lets you upload documents, ask questions, and get cited answers — powered by hybrid search, reranking, and a LangGraph agent that decides when to search your docs vs the web.',
    ],
    features: [
      { name: 'Many sources', text: 'PDFs, websites, YouTube videos, images, Word docs, PowerPoints, CSVs and markdown files' },
      { name: 'Natural language or voice questions' },
      { name: 'Exact source citations on every answer' },
      { name: 'Agent searches your documents first, falls back to web search if needed' },
      { name: 'Detects contradictions between sources' },
      { name: 'Flags knowledge gaps and suggests resources' },
      { name: 'Generates quizzes from your uploaded content' },
      { name: 'Builds learning roadmaps from a single goal' },
    ],
    stackGroups: [
      { label: 'Backend', items: 'Python, FastAPI, LangChain, LangGraph' },
      { label: 'Vector DB', items: 'ChromaDB' },
      { label: 'Retrieval', items: 'Hybrid search (vector + BM25), BGE cross-encoder reranking, multi-query RAG' },
      { label: 'LLM', items: 'Gemini (SaaS) / Ollama + Llama 3 (self-hosted / private)' },
      { label: 'Database', items: 'PostgreSQL' },
      { label: 'Auth', items: 'JWT with httpOnly cookies' },
      { label: 'Frontend', items: 'React (in progress)' },
      { label: 'DevOps', items: 'Docker, GitHub Actions' },
    ],
    architecture: [
      'User question',
      'Multi-query generation (3 query variants)',
      'Hybrid search — vector search + BM25 in parallel',
      'BGE reranker — top 20 → top 5',
      'LangGraph agent — docs enough? or search web too?',
      'Answer with citations + contradiction flags',
    ],
    facts: [
      {
        title: 'Deployment modes',
        items: [
          { label: 'SaaS', value: 'Gemini API — standard privacy' },
          { label: 'Self-hosted', value: 'Ollama + Llama 3 — 100% private, data never leaves your server' },
          { label: 'Enterprise', value: 'Azure OpenAI — private cloud' },
        ],
      },
      {
        title: 'Status',
        items: [
          { label: 'Backend', value: 'In progress' },
          { label: 'Frontend', value: 'Coming soon' },
          { label: 'Docker', value: 'Coming soon' },
        ],
      },
    ],
    links: { github: 'https://github.com/shubhrato/researchmind-ai' },
  },
  {
    summary: 'A full-stack AI customer support chat agent that answers questions about store policies using Google Gemini.', hoverDark: 0.6, placeholder: false, slug: 'spur', title: 'Spur', size: 'sm', accent: '#9047ff',
    card: '/work/spur-card.webp',
    shots: [
      { src: '/work/spur-1.webp', w: 2000, h: 1261, alt: 'Spur support chat welcome screen with suggested questions' },
      { src: '/work/spur-2.webp', w: 2000, h: 1262, alt: 'Spur support agent typing a reply to a return-policy question' },
    ],
    mediaSub: 'AI Live Chat Agent',
    type: 'AI chat agent', status: 'Live', scope: ['Full-stack', 'LLM', 'Caching'],
    stack: ['React', 'TypeScript', 'Express', 'Gemini'],
    tagline: 'AI Live Chat Agent',
    description: [
      'A full-stack AI customer support chat agent built for the Spur take-home assignment. Users can chat with an AI agent that answers questions about store policies using Google Gemini as the LLM backend.',
    ],
    features: [
      { name: 'Channel-agnostic LLM service', text: 'generateReply(history, message) takes plain arrays, so a WhatsApp or Instagram handler can reuse it' },
      { name: 'Policies in the database, cached in Redis', text: 'Loaded on first request and cached for 1 hour — update policies without redeploying' },
      { name: 'Escalation handled in code', text: '“Talk to a human” is caught by a keyword check and answered without calling Gemini' },
      { name: 'Guardrails', text: 'Out-of-scope questions get a polite refusal; unknown questions are directed to support email' },
      { name: 'Separation of concerns', text: 'Routes handle HTTP, services handle business logic' },
    ],
    stackGroups: [
      { label: 'Frontend', items: 'React, TypeScript, Tailwind CSS, Vite' },
      { label: 'Backend', items: 'Node.js, Express, TypeScript' },
      { label: 'Database', items: 'PostgreSQL' },
      { label: 'Cache', items: 'Redis (Upstash)' },
      { label: 'LLM', items: 'Google Gemini (gemini-2.5-flash)' },
    ],
    architecture: [
      'POST /chat/message',
      'Input validation (empty, too long)',
      'Escalation check in code',
      'Policies — Redis, then DB on miss',
      'Gemini reply with last 10 messages',
      'Stored in PostgreSQL conversations',
    ],
    facts: [
      {
        title: 'LLM notes',
        items: [
          { label: 'Provider', value: 'Google Gemini (gemini-2.5-flash)' },
          { label: 'History', value: 'Last 10 messages sent for context' },
          { label: 'Input', value: 'Capped at 2000 characters server-side' },
          { label: 'Policy cache', value: 'Key spur:policies, 1-hour TTL' },
        ],
      },
    ],
    links: {
      github: 'https://github.com/shubhrato-badole/spur-chat',
      live: 'https://spur-ai-support-agent-kappa.vercel.app',
      api: 'https://spur-ai-support-agent-91g8.onrender.com',
    },
  },
  {
    summary: 'Upload your resume once, search real job listings, and get an AI match score from 0–100 with the exact skills you are missing and how to improve.', hoverDark: 0.6, placeholder: false, slug: 'jobfit', title: 'JobFit', size: 'md', accent: '#2f5be0',
    card: '/work/jobfit-card.webp', cardVideo: '/work/jobfit-card.mp4',
    clips: [
      { src: '/work/jobfit-landing.mp4', poster: '/work/jobfit-landing-poster.webp', w: 2000, h: 1256, label: 'From the landing page to your dashboard' },
      { src: '/work/jobfit.mp4', poster: '/work/jobfit-poster.webp', w: 2000, h: 1254, label: 'Searching real listings and saving jobs' },
    ],
    shots: [
      { src: '/work/jobfit-1.webp', w: 2000, h: 1257, alt: 'JobFit match score with missing skills and strengths' },
      { src: '/work/jobfit-2.webp', w: 2000, h: 1261, alt: 'JobFit dashboard with applications and top skill gaps' },
      { src: '/work/jobfit-3.webp', w: 2000, h: 1259, alt: 'JobFit live job search results' },
      { src: '/work/jobfit-4.webp', w: 2000, h: 1257, alt: 'JobFit saved jobs list' },
    ],
    mediaSub: 'AI-powered job matching',
    type: 'Full-stack app', status: 'Live', scope: ['AI', 'Full-stack', 'DevOps'],
    stack: ['React', 'Node.js', 'PostgreSQL', 'Redis', 'Gemini'],
    tagline: 'Know exactly why you are not getting callbacks.',
    description: [
      'Most developers apply to 50+ jobs and hear nothing back. They do not know if their resume is wrong, their skills do not match, or the job itself is unrealistic. Manually comparing your resume against 20 job descriptions takes 4–5 hours and you are still just guessing.',
      'JobFit lets you upload your resume once, search real job listings from LinkedIn and Indeed, and get an AI-generated match score from 0–100 with the exact skills you are missing, your strengths for that role, and how to improve. Track every application on a Kanban board and chat with an AI coach that already knows your resume and the job description.',
    ],
    features: [
      { name: 'AI Match Score', text: 'Gemini analyzes your resume against any job description and returns a 0–100 score with skill gap analysis' },
      { name: 'Real Job Search', text: 'Live listings from LinkedIn, Indeed and Glassdoor via the JSearch API' },
      { name: 'Application Tracker', text: 'Kanban board — Applied, Interview, Offer, Rejected — with full analysis on each card' },
      { name: 'AI Chat', text: 'A career coach that knows your resume and the specific job description' },
      { name: 'Privacy Scanner', text: 'Flags PII risks in your resume before you apply' },
      { name: 'Redis Caching', text: 'Same resume + JD returns in under 5ms instead of 4 seconds' },
      { name: 'Admin Dashboard', text: 'Total users, analyses run and skill gap trends across all users' },
      { name: 'Auth', text: 'Google OAuth, email verification, and token-based password reset' },
    ],
    stackGroups: [
      { label: 'Frontend', items: 'React 18, React Router v6, Tailwind CSS, Vite, Axios — deployed on Vercel' },
      { label: 'Backend', items: 'Node.js, Express, Passport.js, Multer, pdf-parse, Nodemailer, Helmet, express-rate-limit — deployed on Render' },
      { label: 'Data', items: 'PostgreSQL (JSONB for skill arrays), Redis (Upstash) with MD5 content-based cache keys' },
      { label: 'AI', items: 'Gemini 1.5 Flash via Google AI Studio, structured JSON prompts with response validation' },
      { label: 'DevOps', items: 'Docker Compose (5 services), GitHub Actions CI/CD, Nginx reverse proxy' },
    ],
    architecture: [
      'Browser',
      'Vercel — React + Nginx',
      'Render — Node.js + Express (httpOnly cookies over HTTPS)',
      'PostgreSQL · Redis (Upstash) · Gemini API',
    ],
    facts: [
      {
        title: 'Performance',
        items: [
          { label: 'Cache miss (Gemini call)', value: '2,000 – 4,000ms' },
          { label: 'Cache hit (Redis)', value: '< 5ms' },
          { label: 'Speed improvement', value: '800x on repeat analyses' },
          { label: 'Load tested', value: '50 parallel requests' },
        ],
      },
      {
        title: 'Security',
        items: [
          { label: 'Tokens', value: 'httpOnly cookies, refresh token rotation' },
          { label: 'Passwords', value: 'bcrypt, 10 rounds' },
          { label: 'Hardening', value: 'Helmet security headers, rate limiting, parameterised SQL' },
        ],
      },
    ],
    links: {
      github: 'https://github.com/shubhrato/jobfit',
      live: 'https://job-fit-murex.vercel.app',
      api: 'https://jobfit-guyz.onrender.com',
    },
  },
  {
    slug: 'safespeak', title: 'SafeSpeak', size: 'sm', accent: '#9047ff',
    card: '/work/safespeak-card.webp', shots: [], mediaSub: 'Anonymous evidence collector',
    summary: 'A mobile app that lets victims collect, store, and report harassment evidence securely and anonymously, with encrypted files shared only with trusted NGOs or contacts.',
    hoverDark: 0.3, placeholder: true,
    type: 'Mobile app', status: 'Final-year project', scope: ['Mobile', 'Security', 'Firebase'], stack: ['Flutter', 'Firebase', 'AES-256'],
    tagline: 'Anonymous harassment evidence collector',
    description: [
      'Many victims of harassment — especially women, LGBTQ+ individuals, students, and others at risk — are unable to report abuse due to fear, lack of proof, social stigma, or unsafe reporting platforms.',
      'SafeSpeak is a mobile app designed to let victims collect, store, and report harassment evidence securely and anonymously. Sensitive data is encrypted and can only be shared with trusted NGOs or pre-defined contacts, protecting the user’s identity.',
    ],
    features: [
      { name: 'Mobile-first', text: 'Android and iOS, built with Flutter' },
      { name: 'Anonymous Evidence Vault', text: 'Encrypts files with AES-256 plus a SHA-256 hash' },
      { name: 'Evidence Capture', text: 'Record audio, record video, or take screenshots' },
      { name: 'Offline-first', text: 'Works without internet and syncs to Firebase when connected' },
      { name: 'Panic / Quick Hide button', text: 'Instantly hides the app behind a dummy calculator screen' },
      { name: 'Trusted Sharing', text: 'Evidence goes only to NGOs or trusted contacts' },
      { name: 'Dual Mode', text: 'Victim mode for evidence collection, NGO/Admin mode with a review dashboard' },
    ],
    stackGroups: [
      { label: 'Frontend', items: 'Flutter' },
      { label: 'Backend', items: 'Firebase — Auth (NGO/Admin login), Cloud Firestore (metadata), Firebase Storage (encrypted evidence)' },
      { label: 'Security', items: 'AES-256 encryption, SHA-256 hashing (timestamps, integrity check)' },
      { label: 'Libraries', items: 'flutter_sound, encrypt + crypto, path_provider, permission_handler' },
    ],
    architecture: [
      'lib/main.dart — app entry point',
      'utils/encryption_helper.dart — AES-256 + SHA-256 functions',
      'services/audio_recorder.dart — audio recording service',
      'widgets/panic_screen.dart — Panic / Quick Hide dummy calculator UI',
    ],
    facts: [
      {
        title: 'About',
        items: [
          { label: 'Context', value: 'Final Year B.Tech (Cyber Security), G H Raisoni College of Engineering & Management, Nagpur' },
          { label: 'Team', value: 'Sneha Rathore, Shubhrato Badole, Vaishnavi Jare, Yamini Asole' },
          { label: 'Guide', value: 'Prof. Ashish Jagneet' },
        ],
      },
      {
        title: 'Planned',
        items: [
          { label: 'Detection', value: 'ML-based harassment detection (TensorFlow Lite)' },
          { label: 'Access', value: 'Multi-language support' },
          { label: 'Backup', value: 'Secure cloud backup with end-to-end encryption' },
          { label: 'Safety', value: 'Emergency SOS mode — share location + evidence instantly' },
        ],
      },
    ],
    links: { github: 'https://github.com/Ayushkanhed/SecureApp' },
  },
  {
    slug: 'ai-crm-hcp', title: 'AI-First CRM', size: 'md', accent: '#3b6be6',
    card: '/work/ai-crm-card.webp', shots: [], mediaSub: 'HCP interaction logger',
    summary: 'An AI-first Log HCP Interaction screen for pharma field reps: a read-only form that is filled entirely through an AI chat powered by a LangGraph agent.',
    hoverDark: 0.3, placeholder: true,
    type: 'AI-first CRM', status: 'Technical assessment', scope: ['AI', 'Full-stack', 'LangGraph'], stack: ['React', 'FastAPI', 'LangGraph', 'Groq'],
    tagline: 'Log HCP Interaction — through chat',
    description: [
      'An AI-first “Log HCP Interaction” screen for pharma field reps. The left panel is a read-only form — it is never filled manually. All data entry happens through the AI assistant chat on the right, powered by a LangGraph agent calling Groq’s gemma2-9b-it.',
      'Built for a technical assessment: design an AI-powered CRM tool for Healthcare Professional (HCP) interaction logging, using LangGraph and an LLM as mandatory components.',
    ],
    features: [
      { name: 'log_interaction', text: 'Extracts HCP name, date/time, topics, sentiment and materials/samples from free text and fills the form' },
      { name: 'edit_interaction', text: 'Patches only the fields the rep says are wrong' },
      { name: 'suggest_followup', text: 'The LLM proposes 3 concrete next actions based on the logged interaction' },
      { name: 'detect_adverse_event', text: 'Pharmacovigilance-style check for patient adverse reactions mentioned in the interaction' },
      { name: 'search_past_interactions', text: 'Answers natural-language questions about a HCP’s history from Postgres' },
    ],
    stackGroups: [
      { label: 'Frontend', items: 'React + Redux Toolkit, Vite, Google Inter font' },
      { label: 'Backend', items: 'Python, FastAPI' },
      { label: 'AI agent', items: 'LangGraph (StateGraph + ToolNode)' },
      { label: 'LLM', items: 'Groq gemma2-9b-it' },
      { label: 'Database', items: 'PostgreSQL (SQLAlchemy)' },
    ],
    architecture: [
      'Rep sends a message in the AI chat',
      'LangGraph agent calls a tool',
      'Tool mutates the session-scoped form state',
      'FastAPI returns that state',
      'Redux re-renders the read-only form',
    ],
    facts: [
      {
        title: 'Example flow',
        items: [
          { label: '1 · Log', value: 'A free-text note fills the form; follow-up suggestions and adverse-event detection run automatically' },
          { label: '2 · Edit', value: '“The name was actually Dr. John” patches only hcp_name and sentiment' },
          { label: '3 · Search', value: '“What did Dr. John say about pricing last time?” is answered from history' },
        ],
      },
    ],
    links: {},
  },
]