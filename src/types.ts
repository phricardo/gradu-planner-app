export type FlowYear = '2019' | '2022';
export type Term = `${number}.1` | `${number}.2`;

export interface ConditionalPrereq {
  disciplina_id: string;
  condicao: string;
}

export interface Discipline {
  id: string;
  codigo: string | null;
  nome: string;
  periodo: number;
  creditos: number;
  carga_horaria_aula: number;
  obrigatoria: boolean;
  prereq: string[];
  regras_especiais: string[];
  prereq_condicionais: ConditionalPrereq[];
  dependentes: string[];
}

export interface Flowchart {
  schema_version: string;
  source: {
    instituicao: string;
    curso: string;
    matriz: string;
  };
  regras_curriculares: {
    total_horas_curso: number;
    prazo_maximo_integralizacao_semestres: number;
  };
  periodos: Record<string, string[]>;
  disciplinas: Record<string, Discipline>;
  ordem_sugerida_base: string[];
}

export interface StudentRecord {
  matricula: string;
  nome: string;
}

export type StudentsByCampus = Record<string, StudentRecord[]>;

export interface SelectedStudent extends StudentRecord {
  campus: string;
}

export interface PlannerState {
  schemaVersion: 1;
  selectedFlowYear: FlowYear;
  matricula?: string;
  student?: SelectedStudent;
  completedDisciplines: string[];
  plannedByTerm: Record<string, string[]>;
  maxSubjectsPerSemester: number;
}

export interface ExportPayload {
  app: 'graduplanner';
  exportedAt: string;
  state: PlannerState;
}

export interface TermInfo {
  currentTerm: Term;
  nextTerm: Term;
  secondSemesterStart: Date;
}

export interface Eligibility {
  eligible: boolean;
  missingPrereqs: string[];
  missingSpecialRules: string[];
}

export interface ProgressSummary {
  completed: number;
  total: number;
  percentage: number;
  completedHours: number;
  totalHours: number;
}

export interface GraduationForecast {
  term?: Term;
  semesters?: number;
  unavailableReason?: string;
}

export interface DisciplineSuggestion {
  disciplineId: string;
  directUnlocks: number;
  chainImpact: number;
  totalImpact: number;
  benefitedDisciplineIds: string[];
  isPlanned: boolean;
}
