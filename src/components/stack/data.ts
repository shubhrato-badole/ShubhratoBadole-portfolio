// ─────────────────────────────────────────────────────────────────────────────
// The 19 technologies shown on the ring. Edit this file to change cards, text,
// categories or "used in" – nothing else in the project needs to change.
// Card art lives in /public/cards/<slug>.jpg (3:4 portrait).
// ─────────────────────────────────────────────────────────────────────────────
export type Category = 'Frontend' | 'Backend' | 'AI/ML' | 'DB & Cache' | 'DevOps';

export const CATEGORIES: Category[] = ['Frontend', 'Backend', 'AI/ML', 'DB & Cache', 'DevOps'];

// Colour = category. Same five accent colours the reference uses for its five "emotions".
export const CATEGORY_COLOR: Record<Category, string> = {
  Frontend: '#38bdf8',
  Backend: '#8b5cf6',
  'AI/ML': '#d946ef',
  'DB & Cache': '#f97316',
  DevOps: '#2563eb'
};

// Each technology has its own accent: hovering a card recolours the rails, ceiling light, borders and reflection.
export const TECH_COLOR: Record<string, string> = {
  react: '#38bdf8', typescript: '#2f74ff', javascript: '#f7a21b', nodejs: '#7ccf3a', fastapi: '#00d1b2', python: '#ffd43b',
  langchain: '#2dd4a7', langgraph: '#7c5cff', langsmith: '#f472b6', 'agentic-rag': '#d946ef',
  chromadb: '#ff8a3d', postgresql: '#3b82c4', mongodb: '#13aa52', redis: '#ff3b30',
  aws: '#ff9900', docker: '#33a8ff', nginx: '#2ee66b', git: '#f05033', 'github-actions': '#8b9cff'
};

export interface Tech {
  slug: string;
  title: string;
  category: Category;
  type: string;        // short noun shown in the hover grid
  line: string;        // one-liner under the big title
  usedIn: string[];    // projects (max 2 lines in the hover grid)
  proof: string[];     // two short lines (≤ 12 chars each) – a metric or a fact
  built: string;       // "What I built with it" on the detail page
  related: string[];   // "Works with" on the detail page
  asset: string;
}

const t = (x: Omit<Tech, 'asset'>): Tech => ({ ...x, asset: `/cards/${x.slug}.jpg` });

export const TECHS: Tech[] = [
  t({ slug: 'react', title: 'React', category: 'Frontend', type: 'UI library',
      line: 'Component-driven interfaces that stay fast as they grow',
      usedIn: ['JobFit', 'Portfolio'], proof: ['COMPONENT', 'DRIVEN UI'],
      built: 'Dashboards, resume tools and the conversational UI for JobFit, plus this portfolio – composed from small, typed, reusable components.',
      related: ['TypeScript', 'Tailwind CSS', 'Node.js'] }),
  t({ slug: 'typescript', title: 'TypeScript', category: 'Frontend', type: 'Language',
      line: 'Types from the database row to the button on screen',
      usedIn: ['Portfolio', 'JobFit'], proof: ['TYPED', 'END TO END'],
      built: 'Shared types between UI and API layers so contract changes fail at build time, not in production.',
      related: ['React', 'Node.js', 'JavaScript'] }),
  t({ slug: 'javascript', title: 'JavaScript', category: 'Frontend', type: 'Language',
      line: 'The runtime language behind every interactive surface',
      usedIn: ['JobFit', 'Portfolio'], proof: ['EVERY', 'FRONTEND'],
      built: 'Interaction logic, async data flows and browser APIs – the foundation under every framework I use.',
      related: ['TypeScript', 'React', 'Node.js'] }),
  t({ slug: 'nodejs', title: 'Node.js', category: 'Backend', type: 'Runtime',
      line: 'REST APIs, auth and background jobs on a single runtime',
      usedIn: ['JobFit'], proof: ['REST + JWT', 'AUTH APIS'],
      built: 'API services with JWT authentication, role checks and validation, backed by PostgreSQL and Redis.',
      related: ['PostgreSQL', 'Redis', 'Docker'] }),
  t({ slug: 'python', title: 'Python', category: 'Backend', type: 'Language',
      line: 'Pipelines, services and the glue for AI workloads',
      usedIn: ['ResearchMind AI'], proof: ['RAG', 'PIPELINES'],
      built: 'Ingestion, retrieval and orchestration code for ResearchMind AI, exposed through FastAPI.',
      related: ['FastAPI', 'LangChain', 'ChromaDB'] }),
  t({ slug: 'fastapi', title: 'FastAPI', category: 'Backend', type: 'Web framework',
      line: 'Async Python APIs with typed contracts and live docs',
      usedIn: ['ResearchMind AI'], proof: ['ASYNC', 'REST APIS'],
      built: 'The service layer for ResearchMind AI – streaming answers, ingestion endpoints and health checks.',
      related: ['Python', 'PostgreSQL', 'Docker'] }),
  t({ slug: 'langchain', title: 'LangChain', category: 'AI/ML', type: 'LLM framework',
      line: 'Retrievers, tools and prompts wired into one pipeline',
      usedIn: ['ResearchMind AI'], proof: ['RETRIEVERS', 'TOOLS'],
      built: 'Retrieval chains, tool calling and prompt templates that sit underneath the agent graph.',
      related: ['LangGraph', 'ChromaDB', 'LangSmith'] }),
  t({ slug: 'langgraph', title: 'LangGraph', category: 'AI/ML', type: 'Agent framework',
      line: 'Stateful agent graphs with explicit control flow',
      usedIn: ['ResearchMind AI'], proof: ['AGENTIC', 'RAG GRAPH'],
      built: 'The agentic RAG loop: plan, retrieve, grade, rewrite and answer as nodes in a graph with shared state.',
      related: ['LangChain', 'LangSmith', 'Agentic RAG'] }),
  t({ slug: 'langsmith', title: 'LangSmith', category: 'AI/ML', type: 'Observability',
      line: 'Traces and evaluations for every model call',
      usedIn: ['ResearchMind AI'], proof: ['TRACES', 'EVALS'],
      built: 'Tracing of every retrieval and generation step, so regressions in answer quality are visible and debuggable.',
      related: ['LangChain', 'LangGraph', 'Agentic RAG'] }),
  t({ slug: 'agentic-rag', title: 'Agentic RAG', category: 'AI/ML', type: 'Architecture',
      line: 'Multi-query retrieval with reranking and a decision loop',
      usedIn: ['ResearchMind AI'], proof: ['MULTI-QUERY', '+ RERANK'],
      built: 'Multi-query retrieval, hybrid search (BM25 + vectors), a BGE cross-encoder reranker and an agent that decides when to retrieve again.',
      related: ['LangGraph', 'ChromaDB', 'Python'] }),
  t({ slug: 'postgresql', title: 'PostgreSQL', category: 'DB & Cache', type: 'Database',
      line: 'Relational data with real access control',
      usedIn: ['JobFit', 'ResearchMind AI'], proof: ['ROLE-BASED', 'ACCESS'],
      built: 'Schemas, indexes and a role-based admin dashboard for database access control.',
      related: ['Node.js', 'Redis', 'Docker'] }),
  t({ slug: 'mongodb', title: 'MongoDB', category: 'DB & Cache', type: 'Document DB',
      line: 'Flexible documents for fast-moving schemas',
      usedIn: ['Side projects'], proof: ['DOCUMENT', 'STORE'],
      built: 'Document models for projects where the schema changes weekly and joins are the exception.',
      related: ['Node.js', 'Express', 'Docker'] }),
  t({ slug: 'redis', title: 'Redis', category: 'DB & Cache', type: 'Cache',
      line: 'Cut repeat-query latency from ~4 s to ~5 ms',
      usedIn: ['JobFit', 'ResearchMind AI'], proof: ['4S TO 5MS', 'ON REPEATS'],
      built: 'A caching layer for expensive queries and short-lived state like OTP codes and sessions.',
      related: ['PostgreSQL', 'Node.js', 'Docker'] }),
  t({ slug: 'chromadb', title: 'ChromaDB', category: 'DB & Cache', type: 'Vector DB',
      line: 'Embeddings and metadata filters for semantic search',
      usedIn: ['ResearchMind AI'], proof: ['VECTOR', 'SEARCH'],
      built: 'The vector store behind retrieval: embeddings with metadata filters feeding hybrid search and reranking.',
      related: ['LangChain', 'Agentic RAG', 'Python'] }),
  t({ slug: 'docker', title: 'Docker', category: 'DevOps', type: 'Containers',
      line: 'Five services, one command, identical everywhere',
      usedIn: ['ResearchMind AI'], proof: ['5 SERVICES', 'CONTAINERS'],
      built: 'Containerised microservices with Compose for local development and the same images in production.',
      related: ['GitHub Actions', 'AWS', 'Nginx'] }),
  t({ slug: 'github-actions', title: 'GitHub Actions', category: 'DevOps', type: 'CI/CD',
      line: 'Build, test and deploy on every push',
      usedIn: ['ResearchMind AI'], proof: ['CI/CD', 'ON PUSH'],
      built: 'Pipelines that lint, test, build images and deploy to AWS without manual steps.',
      related: ['Docker', 'AWS', 'Git'] }),
  t({ slug: 'aws', title: 'AWS', category: 'DevOps', type: 'Cloud',
      line: 'EC2, S3, IAM and CloudWatch running real workloads',
      usedIn: ['ResearchMind AI'], proof: ['EC2 S3 IAM', 'CLOUDWATCH'],
      built: 'Deployment on EC2, storage on S3, least-privilege IAM roles and CloudWatch alarms for monitoring.',
      related: ['Docker', 'Nginx', 'GitHub Actions'] }),
  t({ slug: 'nginx', title: 'Nginx', category: 'DevOps', type: 'Reverse proxy',
      line: 'TLS, routing and caching in front of every service',
      usedIn: ['ResearchMind AI'], proof: ['REVERSE', 'PROXY'],
      built: 'Reverse proxy and TLS termination in front of the API containers.',
      related: ['Docker', 'AWS', 'Node.js'] }),
  t({ slug: 'git', title: 'Git', category: 'DevOps', type: 'Version control',
      line: 'Branches, reviews and a history that explains itself',
      usedIn: ['Every project'], proof: ['BRANCH', '+ REVIEW'],
      built: 'Feature branches, pull-request reviews and tags that trigger the deployment pipeline.',
      related: ['GitHub Actions', 'Docker', 'AWS'] })
];

export const techBySlug = (slug: string) => TECHS.find((x) => x.slug === slug);
export const hexToRgb = (hex: string): [number, number, number] => {
  const n = parseInt(hex.slice(1), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
};
export const DEFAULT_ACCENT = '#9047ff'; // reference's idle purple  [.381, .15, 1]
