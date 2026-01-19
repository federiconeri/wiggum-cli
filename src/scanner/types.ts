/**
 * Scanner Types
 * Type definitions for the project scanner system
 */

/**
 * Result of detecting a single technology/tool
 */
export interface DetectionResult {
  /** Name of the detected technology (e.g., "Next.js", "pnpm") */
  name: string;
  /** Version if detectable from package.json */
  version?: string;
  /** Variant or additional context (e.g., "app-router" for Next.js) */
  variant?: string;
  /** Confidence score from 0-100 */
  confidence: number;
  /** Evidence that led to this detection (files found, deps matched) */
  evidence: string[];
}

/**
 * MCP detection result
 */
export interface MCPStack {
  /** Detected MCP servers from config */
  detected?: DetectionResult[];
  /** Recommended MCP servers based on stack */
  recommended?: string[];
  /** Is this an MCP server project */
  isProject?: boolean;
  /** MCP project detection result (if it's an MCP server project) */
  projectInfo?: DetectionResult;
}

/**
 * Complete detected tech stack for a project
 */
export interface DetectedStack {
  // ============ Core ============
  /** Web framework (Next.js, React, Vue, etc.) */
  framework?: DetectionResult;
  /** Package manager (pnpm, yarn, npm, bun) */
  packageManager?: DetectionResult;
  /** Testing frameworks */
  testing?: {
    unit?: DetectionResult;
    e2e?: DetectionResult;
  };
  /** Styling approach (Tailwind, CSS Modules, etc.) */
  styling?: DetectionResult;

  // ============ Data Layer ============
  /** Database (Supabase, Firebase, MongoDB, PostgreSQL) */
  database?: DetectionResult;
  /** ORM (Prisma, Drizzle) */
  orm?: DetectionResult;
  /** API patterns (tRPC, GraphQL, TanStack Query, REST) - can have multiple */
  api?: DetectionResult[];

  // ============ Frontend ============
  /** State management (Redux, Zustand, Jotai, Pinia, etc.) */
  stateManagement?: DetectionResult;
  /** UI component libraries (shadcn, Radix, MUI, etc.) - can have multiple */
  uiComponents?: DetectionResult[];
  /** Form handling and validation (React Hook Form, Zod, etc.) - can have multiple */
  formHandling?: DetectionResult[];

  // ============ Services ============
  /** Auth provider (NextAuth, Clerk, Auth0, Supabase Auth) */
  auth?: DetectionResult;
  /** Analytics (PostHog, Mixpanel, Vercel Analytics, etc.) - can have multiple */
  analytics?: DetectionResult[];
  /** Payment provider (Stripe, Lemon Squeezy, Paddle) */
  payments?: DetectionResult;
  /** Email provider (Resend, SendGrid, Nodemailer) */
  email?: DetectionResult;

  // ============ Infrastructure ============
  /** Deployment targets (Vercel, Netlify, Railway, Docker) - can have multiple */
  deployment?: DetectionResult[];
  /** Monorepo tools (Turborepo, Nx, pnpm workspaces, Lerna) */
  monorepo?: DetectionResult;

  // ============ MCP ============
  /** MCP (Model Context Protocol) related detection */
  mcp?: MCPStack;
}

/**
 * Category of detector
 */
export type DetectorCategory =
  // Core
  | 'framework'
  | 'packageManager'
  | 'testing'
  | 'styling'
  // Data Layer
  | 'database'
  | 'orm'
  | 'api'
  // Frontend
  | 'stateManagement'
  | 'uiComponents'
  | 'formHandling'
  // Services
  | 'auth'
  | 'analytics'
  | 'payments'
  | 'email'
  // Infrastructure
  | 'deployment'
  | 'monorepo'
  // MCP
  | 'mcp';

/**
 * Interface for a detector function
 */
export interface Detector {
  /** Category this detector belongs to */
  category: DetectorCategory;
  /** Human-readable name */
  name: string;
  /** Run detection on a project directory */
  detect: (projectRoot: string) => Promise<DetectionResult | DetectionResult[] | null>;
}

/**
 * Options for the scanner
 */
export interface ScannerOptions {
  /** Whether to include low-confidence results */
  includeLowConfidence?: boolean;
  /** Minimum confidence threshold (0-100) */
  minConfidence?: number;
}

/**
 * Result of a full project scan
 */
export interface ScanResult {
  /** Path that was scanned */
  projectRoot: string;
  /** Detected tech stack */
  stack: DetectedStack;
  /** Time taken to scan in milliseconds */
  scanTime: number;
  /** Any errors encountered during scanning */
  errors?: string[];
}
