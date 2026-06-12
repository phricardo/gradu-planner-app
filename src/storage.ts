import { FLOWCHARTS } from './data';
import type { ExportPayload, FlowYear, PlannerState } from './types';

const STORAGE_KEY = 'graduplanner:state';
const SCHEMA_VERSION = 1;

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
