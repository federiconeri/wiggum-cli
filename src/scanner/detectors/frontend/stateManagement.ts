/**
 * State Management Detector
 * Detects: Redux, Zustand, Jotai, Pinia, Recoil, MobX
 */

import type { Detector, DetectionResult } from '../../types.js';
import {
  readPackageJson,
  getDependencies,
  type DependencyMap,
} from '../utils.js';

/**
 * Detect Redux / Redux Toolkit
 */
function detectRedux(deps: DependencyMap): DetectionResult | null {
  const evidence: string[] = [];
  let confidence = 0;
  let variant: string | undefined;

  // Check for Redux Toolkit (modern approach)
  if (deps['@reduxjs/toolkit']) {
    evidence.push(`@reduxjs/toolkit@${deps['@reduxjs/toolkit']} in dependencies`);
    confidence += 70;
    variant = 'toolkit';
  }

  // Check for classic redux
  if (deps.redux) {
    evidence.push(`redux@${deps.redux} in dependencies`);
    confidence += 50;
    if (!variant) variant = 'classic';
  }

  // Check for react-redux bindings
  if (deps['react-redux']) {
    evidence.push(`react-redux@${deps['react-redux']} in dependencies`);
    confidence += 20;
  }

  // Check for redux-saga or redux-thunk
  if (deps['redux-saga']) {
    evidence.push('redux-saga detected');
    confidence += 10;
  }
  if (deps['redux-thunk']) {
    evidence.push('redux-thunk detected');
    confidence += 10;
  }

  if (confidence === 0) return null;

  return {
    name: 'Redux',
    version: deps['@reduxjs/toolkit'] || deps.redux,
    variant,
    confidence: Math.min(confidence, 100),
    evidence,
  };
}

/**
 * Detect Zustand
 */
function detectZustand(deps: DependencyMap): DetectionResult | null {
  const evidence: string[] = [];
  let confidence = 0;

  if (deps.zustand) {
    evidence.push(`zustand@${deps.zustand} in dependencies`);
    confidence += 90;
  }

  if (confidence === 0) return null;

  return {
    name: 'Zustand',
    version: deps.zustand,
    confidence: Math.min(confidence, 100),
    evidence,
  };
}

/**
 * Detect Jotai
 */
function detectJotai(deps: DependencyMap): DetectionResult | null {
  const evidence: string[] = [];
  let confidence = 0;

  if (deps.jotai) {
    evidence.push(`jotai@${deps.jotai} in dependencies`);
    confidence += 90;
  }

  // Check for jotai utils
  if (deps['jotai-devtools']) {
    evidence.push('jotai-devtools detected');
    confidence += 10;
  }

  if (confidence === 0) return null;

  return {
    name: 'Jotai',
    version: deps.jotai,
    confidence: Math.min(confidence, 100),
    evidence,
  };
}

/**
 * Detect Pinia (Vue state management)
 */
function detectPinia(deps: DependencyMap): DetectionResult | null {
  const evidence: string[] = [];
  let confidence = 0;

  if (deps.pinia) {
    evidence.push(`pinia@${deps.pinia} in dependencies`);
    confidence += 90;
  }

  // Check for pinia plugins
  if (deps['pinia-plugin-persistedstate']) {
    evidence.push('pinia-plugin-persistedstate detected');
    confidence += 10;
  }

  if (confidence === 0) return null;

  return {
    name: 'Pinia',
    version: deps.pinia,
    confidence: Math.min(confidence, 100),
    evidence,
  };
}

/**
 * Detect Recoil
 */
function detectRecoil(deps: DependencyMap): DetectionResult | null {
  const evidence: string[] = [];
  let confidence = 0;

  if (deps.recoil) {
    evidence.push(`recoil@${deps.recoil} in dependencies`);
    confidence += 90;
  }

  if (confidence === 0) return null;

  return {
    name: 'Recoil',
    version: deps.recoil,
    confidence: Math.min(confidence, 100),
    evidence,
  };
}

/**
 * Detect MobX
 */
function detectMobX(deps: DependencyMap): DetectionResult | null {
  const evidence: string[] = [];
  let confidence = 0;

  if (deps.mobx) {
    evidence.push(`mobx@${deps.mobx} in dependencies`);
    confidence += 70;
  }

  // Check for mobx-react bindings
  if (deps['mobx-react'] || deps['mobx-react-lite']) {
    evidence.push('mobx-react bindings detected');
    confidence += 20;
  }

  // Check for mobx-state-tree
  if (deps['mobx-state-tree']) {
    evidence.push('mobx-state-tree detected');
    confidence += 10;
  }

  if (confidence === 0) return null;

  return {
    name: 'MobX',
    version: deps.mobx,
    confidence: Math.min(confidence, 100),
    evidence,
  };
}

/**
 * Detect Valtio
 */
function detectValtio(deps: DependencyMap): DetectionResult | null {
  const evidence: string[] = [];
  let confidence = 0;

  if (deps.valtio) {
    evidence.push(`valtio@${deps.valtio} in dependencies`);
    confidence += 90;
  }

  if (confidence === 0) return null;

  return {
    name: 'Valtio',
    version: deps.valtio,
    confidence: Math.min(confidence, 100),
    evidence,
  };
}

/**
 * State management detector
 * Returns the primary state management solution detected
 */
export const stateManagementDetector: Detector = {
  category: 'stateManagement',
  name: 'State Management Detector',

  async detect(projectRoot: string): Promise<DetectionResult | null> {
    const pkg = readPackageJson(projectRoot);
    if (!pkg) {
      return null;
    }

    const deps = getDependencies(pkg);

    // Modern/lightweight solutions preferred in detection order
    const detectors = [
      () => detectZustand(deps),
      () => detectJotai(deps),
      () => detectValtio(deps),
      () => detectPinia(deps),
      () => detectRecoil(deps),
      () => detectRedux(deps),
      () => detectMobX(deps),
    ];

    // Find the highest confidence result
    let bestResult: DetectionResult | null = null;
    let bestConfidence = 0;

    for (const detector of detectors) {
      const result = detector();
      if (result && result.confidence > bestConfidence) {
        bestResult = result;
        bestConfidence = result.confidence;
      }
    }

    return bestResult && bestResult.confidence >= 40 ? bestResult : null;
  },
};

export default stateManagementDetector;
