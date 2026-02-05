// src/context/convert.test.ts
import { describe, it, expect } from 'vitest';
import {
  toPersistedScanResult,
  toPersistedAIAnalysis,
  toScanResultFromPersisted,
} from './convert.js';
import type { ScanResult } from '../scanner/types.js';
import type { AIAnalysisResult } from '../ai/enhancer.js';

describe('context/convert', () => {
  describe('toPersistedScanResult', () => {
    it('maps DetectedStack fields to flat persisted format', () => {
      const scanResult: ScanResult = {
        projectRoot: '/tmp/test',
        scanTime: 100,
        stack: {
          framework: { name: 'Next.js', version: '14.0.0', variant: 'app-router', confidence: 95, evidence: [] },
          packageManager: { name: 'pnpm', confidence: 90, evidence: [] },
          testing: {
            unit: { name: 'Vitest', confidence: 85, evidence: [] },
            e2e: { name: 'Playwright', confidence: 80, evidence: [] },
          },
          styling: { name: 'Tailwind CSS', confidence: 90, evidence: [] },
          database: { name: 'Supabase', confidence: 75, evidence: [] },
          orm: { name: 'Prisma', confidence: 70, evidence: [] },
          auth: { name: 'NextAuth', confidence: 65, evidence: [] },
        },
      };

      const result = toPersistedScanResult(scanResult);

      expect(result.framework).toBe('Next.js');
      expect(result.frameworkVersion).toBe('14.0.0');
      expect(result.frameworkVariant).toBe('app-router');
      expect(result.packageManager).toBe('pnpm');
      expect(result.testing?.unit).toBe('Vitest');
      expect(result.testing?.e2e).toBe('Playwright');
      expect(result.styling).toBe('Tailwind CSS');
      expect(result.database).toBe('Supabase');
      expect(result.orm).toBe('Prisma');
      expect(result.auth).toBe('NextAuth');
    });

    it('handles missing optional fields gracefully', () => {
      const scanResult: ScanResult = {
        projectRoot: '/tmp/test',
        scanTime: 50,
        stack: {},
      };

      const result = toPersistedScanResult(scanResult);

      expect(result.framework).toBeUndefined();
      expect(result.packageManager).toBeUndefined();
      expect(result.testing?.unit).toBeNull();
      expect(result.testing?.e2e).toBeNull();
    });
  });

  describe('toPersistedAIAnalysis', () => {
    it('maps AIAnalysisResult to persisted format', () => {
      const analysis: AIAnalysisResult = {
        projectContext: {
          entryPoints: ['src/index.ts'],
          keyDirectories: { 'src/api': 'API routes' },
          namingConventions: 'camelCase',
        },
        commands: { test: 'npm test', build: 'npm run build' },
        implementationGuidelines: ['Use TypeScript strict mode'],
        technologyPractices: {
          projectType: 'Web App',
          practices: ['SSR first'],
          antiPatterns: ['No inline styles'],
        },
      };

      const result = toPersistedAIAnalysis(analysis);

      expect(result.projectContext?.entryPoints).toEqual(['src/index.ts']);
      expect(result.projectContext?.keyDirectories).toEqual({ 'src/api': 'API routes' });
      expect(result.commands?.test).toBe('npm test');
      expect(result.implementationGuidelines).toEqual(['Use TypeScript strict mode']);
      expect(result.technologyPractices?.projectType).toBe('Web App');
    });

    it('returns empty object for undefined analysis', () => {
      const result = toPersistedAIAnalysis(undefined);
      expect(result).toEqual({});
    });
  });

  describe('toScanResultFromPersisted', () => {
    it('rehydrates minimal ScanResult for codebase summary', () => {
      const persisted = {
        framework: 'Next.js',
        frameworkVersion: '14.0.0',
        frameworkVariant: 'app-router',
        packageManager: 'pnpm',
        testing: { unit: 'Vitest', e2e: 'Playwright' },
        styling: 'Tailwind CSS',
        database: 'Supabase',
        orm: 'Prisma',
        auth: 'NextAuth',
      };

      const scan = toScanResultFromPersisted(persisted, '/tmp/project');

      expect(scan.projectRoot).toBe('/tmp/project');
      expect(scan.stack.framework?.name).toBe('Next.js');
      expect(scan.stack.framework?.version).toBe('14.0.0');
      expect(scan.stack.framework?.variant).toBe('app-router');
      expect(scan.stack.packageManager?.name).toBe('pnpm');
      expect(scan.stack.testing?.unit?.name).toBe('Vitest');
      expect(scan.stack.testing?.e2e?.name).toBe('Playwright');
      expect(scan.stack.styling?.name).toBe('Tailwind CSS');
      expect(scan.stack.database?.name).toBe('Supabase');
      expect(scan.stack.orm?.name).toBe('Prisma');
      expect(scan.stack.auth?.name).toBe('NextAuth');
    });

    it('handles empty persisted fields without crashing', () => {
      const scan = toScanResultFromPersisted({}, '/tmp/project');
      expect(scan.projectRoot).toBe('/tmp/project');
      expect(scan.stack.framework).toBeUndefined();
      expect(scan.stack.testing).toBeUndefined();
    });
  });
});
