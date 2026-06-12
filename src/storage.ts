import { FLOWCHARTS } from './data';
import type { ExportPayload, FlowYear, PlannerState } from './types';

const STORAGE_KEY = 'graduplanner:state';
const SCHEMA_VERSION = 1;
const SHARE_HASH_PREFIX = '#gp=';

interface SharedPlannerPayload {
  v: 1;
  f: FlowYear;
  c?: string;
  p?: Record<string, string>;
  m?: number;
}

export interface SharedStateParseResult {
  found: boolean;
  state?: PlannerState;
  error?: string;
}

export function createDefaultState(): PlannerState {
  return {
    schemaVersion: SCHEMA_VERSION,
    selectedFlowYear: '2022',
    completedDisciplines: [],
    plannedByTerm: {},
    maxSubjectsPerSemester: 6,
  };
}

function isFlowYear(value: unknown): value is FlowYear {
  return value === '2019' || value === '2022';
}

function uniqueValidIds(ids: unknown, flowYear: FlowYear) {
  if (!Array.isArray(ids)) return [];

  const validIds = new Set(Object.keys(FLOWCHARTS[flowYear].disciplinas));
  return [...new Set(ids.filter((id): id is string => typeof id === 'string' && validIds.has(id)))];
}

function sanitizeState(value: unknown): PlannerState | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const candidate = value as Partial<PlannerState>;
  if (candidate.schemaVersion !== SCHEMA_VERSION || !isFlowYear(candidate.selectedFlowYear)) {
    return undefined;
  }

  const plannedByTerm: Record<string, string[]> = {};
  if (candidate.plannedByTerm && typeof candidate.plannedByTerm === 'object') {
    for (const [term, ids] of Object.entries(candidate.plannedByTerm)) {
      if (/^\d{4}\.[12]$/.test(term)) {
        plannedByTerm[term] = uniqueValidIds(ids, candidate.selectedFlowYear);
      }
    }
  }

  const maxSubjects = Number(candidate.maxSubjectsPerSemester);

  return {
    schemaVersion: SCHEMA_VERSION,
    selectedFlowYear: candidate.selectedFlowYear,
    matricula: typeof candidate.matricula === 'string' ? candidate.matricula : undefined,
    student: candidate.student,
    completedDisciplines: uniqueValidIds(candidate.completedDisciplines, candidate.selectedFlowYear),
    plannedByTerm,
    maxSubjectsPerSemester: Number.isFinite(maxSubjects) ? Math.max(1, Math.min(12, Math.round(maxSubjects))) : 6,
  };
}

function disciplineIdsForFlow(flowYear: FlowYear) {
  return Object.keys(FLOWCHARTS[flowYear].disciplinas);
}

function encodeDisciplineIds(ids: string[], flowYear: FlowYear) {
  const disciplineIndex = new Map(disciplineIdsForFlow(flowYear).map((id, index) => [id, index]));
  return ids
    .map((id) => disciplineIndex.get(id))
    .filter((index): index is number => index !== undefined)
    .map((index) => index.toString(36))
    .join('.');
}

function decodeDisciplineIds(value: unknown, flowYear: FlowYear) {
  if (typeof value !== 'string' || value.trim() === '') return [];

  const disciplineIds = disciplineIdsForFlow(flowYear);
  return value
    .split('.')
    .map((chunk) => Number.parseInt(chunk, 36))
    .filter((index) => Number.isInteger(index) && index >= 0 && index < disciplineIds.length)
    .map((index) => disciplineIds[index]);
}

function encodeSharePayload(payload: SharedPlannerPayload) {
  return encodeURIComponent(window.btoa(JSON.stringify(payload)));
}

function decodeSharePayload(value: string): SharedPlannerPayload {
  return JSON.parse(window.atob(decodeURIComponent(value))) as SharedPlannerPayload;
}

function compactStateForShare(state: PlannerState): SharedPlannerPayload {
  const payload: SharedPlannerPayload = {
    v: SCHEMA_VERSION,
    f: state.selectedFlowYear,
    m: state.maxSubjectsPerSemester,
  };

  const completed = encodeDisciplineIds(state.completedDisciplines, state.selectedFlowYear);
  if (completed) {
    payload.c = completed;
  }

  const plannedEntries = Object.entries(state.plannedByTerm)
    .map(([term, ids]) => [term, encodeDisciplineIds(ids, state.selectedFlowYear)] as const)
    .filter(([, encoded]) => encoded);
  if (plannedEntries.length > 0) {
    payload.p = Object.fromEntries(plannedEntries);
  }

  return payload;
}

function expandSharedPayload(payload: SharedPlannerPayload): PlannerState | undefined {
  if (!payload || payload.v !== SCHEMA_VERSION || !isFlowYear(payload.f)) {
    return undefined;
  }

  const plannedByTerm: Record<string, string[]> = {};
  if (payload.p && typeof payload.p === 'object') {
    for (const [term, encodedIds] of Object.entries(payload.p)) {
      plannedByTerm[term] = decodeDisciplineIds(encodedIds, payload.f);
    }
  }

  return sanitizeState({
    schemaVersion: SCHEMA_VERSION,
    selectedFlowYear: payload.f,
    completedDisciplines: decodeDisciplineIds(payload.c, payload.f),
    plannedByTerm,
    maxSubjectsPerSemester: payload.m,
  });
}

export function loadState(): PlannerState {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return createDefaultState();

  try {
    return sanitizeState(JSON.parse(raw)) ?? createDefaultState();
  } catch {
    return createDefaultState();
  }
}

export function saveState(state: PlannerState) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

export function buildShareUrl(state: PlannerState) {
  const url = new URL(window.location.href);
  url.hash = `${SHARE_HASH_PREFIX.slice(1)}${encodeSharePayload(compactStateForShare(state))}`;
  return url.toString();
}

export function parseSharedStateFromLocation(): SharedStateParseResult {
  if (!window.location.hash.startsWith(SHARE_HASH_PREFIX)) {
    return { found: false };
  }

  try {
    const encodedPayload = window.location.hash.slice(SHARE_HASH_PREFIX.length);
    const sharedState = expandSharedPayload(decodeSharePayload(encodedPayload));
    if (!sharedState) {
      return { found: true, error: 'Link de planejamento incompatível com esta versão do GraduPlanner.' };
    }

    return { found: true, state: sharedState };
  } catch {
    return { found: true, error: 'Não foi possível carregar o planejamento compartilhado deste link.' };
  }
}

export function buildExportPayload(state: PlannerState): ExportPayload {
  return {
    app: 'graduplanner',
    exportedAt: new Date().toISOString(),
    state,
  };
}

export function parseImportPayload(text: string): PlannerState {
  const parsed = JSON.parse(text) as Partial<ExportPayload>;
  if (parsed.app !== 'graduplanner' || !parsed.state) {
    throw new Error('Arquivo de importação inválido.');
  }

  const sanitized = sanitizeState(parsed.state);
  if (!sanitized) {
    throw new Error('Arquivo incompatível com esta versão do GraduPlanner.');
  }

  return sanitized;
}
