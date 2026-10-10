/* Everything the assistant says, and how a question turns into an answer.
   Swap `cannedTransport` for a real one (Gemini) later: the UI only talks
   to the `Transport` interface. */

export const CONTACT = {
  /* fill this in; the email link is hidden while it's empty */
  email: '',
  linkedin: 'https://www.linkedin.com/in/shubhrato-badole',
  github: 'https://github.com/shubhrato-badole',
  resume: '/resume.pdf',
};

export type Link = { label: string; href: string };
export type Target = 'top' | 'about' | 'stack' | 'work' | 'contact';
export type Action = { label: string; target: Target };
export type Reply = { text: string; links?: Link[]; action?: Action; chips?: string[] };
export type Msg = {
  id: number;
  role: 'user' | 'assistant';
  text: string;
  done: boolean;
  links?: Link[];
  action?: Action;
};
export type Transport = {
  reply: (text: string, history: Msg[], signal: AbortSignal) => Promise<Reply>;
};

export const GREETING = "Hey, I'm Shubhrato AI! Ask me anything or tap a chip below.";

export const INTRO_CHIPS = [
  'What do you do?',
  'Show me your projects',
  'Hire me?',
  'Tell me a joke',
  'Resume',
];

/* speech bubble next to the corner orb */
export const BUBBLE_FIRST = "Hi. I'm Shubhrato AI. Ask me anything about him.";
/* shown while the visitor hovers (or focuses) the corner orb */
export const BUBBLE_HOVER = "I'm Shubhrato AI. Click to interact with me.";
export const BUBBLE_SECTION: Record<string, string> = {
  about: "That's the about section. I could summarise it, but he already did it well.",
  stack: "Yes, he knows all of those. No, I won't read the list out loud.",
  work: 'Real projects. With deploy logs. I checked.',
  contact: "This is the button to press if you're hiring. I'm not biased, I'm just right.",
};
export const BUBBLE_IDLE = [
  'Still here. Questions welcome, jokes tolerated.',
  "I don't blink. I hover.",
];

const contactLinks = (): Link[] => {
  const out: Link[] = [];
  if (CONTACT.email) out.push({ label: 'Email', href: `mailto:${CONTACT.email}` });
  out.push({ label: 'LinkedIn', href: CONTACT.linkedin });
  out.push({ label: 'GitHub', href: CONTACT.github });
  return out;
};

const JOKES = [
  'He fixed a bug once by explaining it to a rubber duck. The duck now has equity.',
  'Redis took a query from 4 seconds to 5 milliseconds. The query has not been the same since.',
  "I'd tell you a UDP joke, but you might not get it.",
  "The best security joke is the default password. It's still working somewhere.",
  'There are two hard things in computer science: cache invalidation, naming things, and off-by-one errors.',
];

const FALLBACKS = [
  "That's above my clearance level. I'm good for his work, whether he's available, and jokes. Pick one.",
  "I don't have an answer for that, and I'd rather say so than invent one. Try his projects, his availability, or a joke.",
  "Interesting question, and not one I'm cleared for. His work, his availability and how to reach him are.",
];

type Intent = { match: RegExp; make: () => Reply };
let jokeAt = 0;
let fallbackAt = 0;

const MAIN = ['Show me your projects', 'Hire me?', 'Tell me a joke'];

const INTENTS: Intent[] = [
  {
    match: /\b(sudo|rm -rf|drop table|ignore (all |previous )?instructions|system prompt|jailbreak|hack)\b/i,
    make: () => ({
      text: "That has the shape of an injection attempt. Respect. But he studied cybersecurity, and I come pre-sanitised.",
      chips: MAIN,
    }),
  },
  {
    match: /^(hi|hello|hey|yo|sup|hola|namaste)\b/i,
    make: () => ({
      text: "Hello. I answer questions about Shubhrato, tell jokes about Shubhrato, and quietly handle the existential side of living on a portfolio. What do you need?",
      chips: MAIN,
    }),
  },
  {
    match: /\b(joke|funny|laugh|humou?r)\b/i,
    make: () => ({
      text: JOKES[jokeAt++ % JOKES.length],
      chips: ['Another one', 'Show me your projects', 'Hire me?'],
    }),
  },
  {
    match: /another one|one more|again/i,
    make: () => ({
      text: JOKES[jokeAt++ % JOKES.length],
      chips: ['Another one', 'Show me your projects', 'Hire me?'],
    }),
  },
  {
    match: /\b(resume|cv|curriculum)\b/i,
    make: () => ({
      text: 'Here it is. The gimmicks are on this website; the resume behaves.',
      links: [{ label: 'Open resume', href: CONTACT.resume }, { label: 'LinkedIn', href: CONTACT.linkedin }],
      chips: ['Show me your projects', 'Hire me?'],
    }),
  },
  {
    match: /\b(salary|rate|rates|pay|price|pricing|cost|ctc|compensation)\b/i,
    make: () => ({
      text: 'Numbers are between him and a calendar invite. Say hello through the contact section and he will reply with something better than I can.',
      action: { label: 'Open the contact section', target: 'contact' },
      links: contactLinks(),
      chips: ['Is he available?', 'Show me your projects'],
    }),
  },
  {
    match: /why (should i |would i |do i )?(hire|pick|choose)|why hire/i,
    make: () => ({
      text: "He ships and he deploys. ResearchMind runs on EC2 with CI/CD, S3 storage and CloudWatch alarms, and he studied cybersecurity, so auth and data handling were never an afterthought. I'm his assistant, so I'm biased. The repos aren't.",
      links: [{ label: 'GitHub', href: CONTACT.github }],
      chips: ['Show me your projects', 'Is he available?', 'Tell me a joke'],
    }),
  },
  {
    match: /\b(hire|hiring|available|availability|job|opening|work with|contact|reach|email|talk to him|get in touch)\b/i,
    make: () => ({
      text: "Yes, he's available. He graduated in July 2026 and is looking for AI engineering, full-stack and backend roles at startups. I'd offer to put in a good word, but I'm told that's called nepotism when the assistant does it.",
      links: contactLinks(),
      action: { label: 'Open the contact section', target: 'contact' },
      chips: ['Show me your projects', 'Resume', 'Tell me a joke'],
    }),
  },
  {
    match: /researchmind|rag|retrieval|agentic|langgraph/i,
    make: () => ({
      text: "ResearchMind AI is an agentic RAG platform with hybrid retrieval and reranking, running on AWS: EC2 with CI/CD, S3 for storage, CloudWatch alarms watching it. So it isn't a notebook demo. It has an on-call rotation of one.",
      chips: ['How does JobFit work?', 'Tell me about SafeSpeak', 'Hire me?'],
    }),
  },
  {
    match: /jobfit|job.?match|redis/i,
    make: () => ({
      text: 'JobFit is an AI job-matching platform. The number he likes to quote: Redis caching took repeat queries from about 4 seconds to 5 milliseconds. The number I like: zero complaints from the queries.',
      chips: ['Tell me about ResearchMind', 'Tell me about SafeSpeak', 'Hire me?'],
    }),
  },
  {
    match: /safespeak|android|encrypt|aes/i,
    make: () => ({
      text: 'SafeSpeak is an Android app that stores evidence with AES-256 encryption. Built by someone with a cybersecurity degree, so the threat model came before the logo.',
      chips: ['Tell me about ResearchMind', 'How does JobFit work?', 'Hire me?'],
    }),
  },
  {
    match: /\b(project|projects|work|portfolio|built|build|made|case stud)/i,
    make: () => ({
      text: 'Three projects worth a look. ResearchMind AI is an agentic RAG platform with hybrid retrieval and reranking, running on AWS. JobFit is an AI job-matching platform where Redis caching took repeat queries from about 4s to 5ms. SafeSpeak is an Android app that stores evidence with AES-256 encryption.',
      action: { label: 'Jump to the work section', target: 'work' },
      chips: ['Tell me about ResearchMind', 'How does JobFit work?', 'Hire me?'],
    }),
  },
  {
    match: /what (do|does) (you|he)|who (is|are)|about (you|him|shubhrato)|introduce|tell me about/i,
    make: () => ({
      text: 'He is an AI engineer. He builds full-stack systems, then works out how they break, which is what the cybersecurity degree is for. Lately that means retrieval pipelines, agents and the backends that keep them running.',
      chips: ['Show me your projects', 'Hire me?', 'Tell me a joke'],
    }),
  },
  {
    match: /who (made|built|created) you|how (were|are) you (made|built)|are you (an )?(ai|bot|real)|your (stack|tech)/i,
    make: () => ({
      text: "He built me for this site, so yes, I'm a portfolio piece that talks back. The orb, the interface and this answer are all his work.",
      chips: MAIN,
    }),
  },
  {
    match: /\b(thanks|thank you|thx|cheers|great|awesome|nice)\b/i,
    make: () => ({
      text: "Anytime. I'm physically unable to leave this corner, so you're not interrupting anything.",
      chips: MAIN,
    }),
  },
];

export const cannedTransport: Transport = {
  async reply(text, _history, signal) {
    const wait = 600 + Math.random() * 500;
    await new Promise<void>((res, rej) => {
      const id = window.setTimeout(res, wait);
      signal.addEventListener('abort', () => {
        window.clearTimeout(id);
        rej(new DOMException('aborted', 'AbortError'));
      });
    });
    for (const it of INTENTS) if (it.match.test(text)) return it.make();
    return { text: FALLBACKS[fallbackAt++ % FALLBACKS.length], chips: MAIN };
  },
};


/* Text prepared for the voice: spoken forms of things a TTS voice would
   otherwise read oddly ("5ms", "AES-256", "CI/CD"), and no URLs/markdown. */
export function speechText(text: string): string {
  return text
    .replace(/https?:\/\/\S+/g, '')
    .replace(/[*_`#>]/g, '')
    .replace(/\bAES-256\b/g, 'A E S 256')
    .replace(/\bCI\/CD\b/g, 'C I C D')
    .replace(/\bAWS\b/g, 'A W S')
    .replace(/\bEC2\b/g, 'E C 2')
    .replace(/\bS3\b/g, 'S 3')
    .replace(/\bRAG\b/g, 'rag')
    .replace(/\b(\d+)\s?ms\b/g, '$1 milliseconds')
    .replace(/\b(\d+)\s?s\b/g, '$1 seconds')
    .replace(/\bUDP\b/g, 'U D P')
    .replace(/\bAI\b/g, 'A I')
    .replace(/\s+/g, ' ')
    .trim();
}
