import { nextTermAfter } from './academicCalendar';
import type {
  Discipline,
  DisciplineSuggestion,
  Eligibility,
  Flowchart,
  GraduationForecast,
  PlannerState,
  ProgressSummary,
  Term,
} from './types';

function allDisciplineIds(flowchart: Flowchart) {
  return Object.keys(flowchart.disciplinas);
}

function totalHours(flowchart: Flowchart) {
  return Object.values(flowchart.disciplinas).reduce((sum, discipline) => sum + discipline.carga_horaria_aula, 0);
}

function completedHours(flowchart: Flowchart, completedIds: Set<string>) {
  return [...completedIds].reduce((sum, id) => sum + (flowchart.disciplinas[id]?.carga_horaria_aula ?? 0), 0);
}

function hasSeventyPercentRule(discipline: Discipline) {
  return discipline.regras_especiais.some((rule) => rule.includes('70%'));
}

export function getEligibility(flowchart: Flowchart, disciplineId: string, completedIds: Set<string>): Eligibility {
  const discipline = flowchart.disciplinas[disciplineId];
  if (!discipline) {
    return { eligible: false, missingPrereqs: [], missingSpecialRules: ['Disciplina inexistente nesta matriz.'] };
  }

  const missingPrereqs = discipline.prereq.filter((id) => !completedIds.has(id));
  const missingSpecialRules: string[] = [];
  if (hasSeventyPercentRule(discipline)) {
    const ratio = completedHours(flowchart, completedIds) / totalHours(flowchart);
    if (ratio < 0.7) {
      missingSpecialRules.push('Exige 70% da carga horária concluída.');
    }
  }

  return {
    eligible: missingPrereqs.length === 0 && missingSpecialRules.length === 0,
    missingPrereqs,
    missingSpecialRules,
  };
}

export function getProgressSummary(flowchart: Flowchart, completedDisciplines: string[]): ProgressSummary {
  const completedIds = new Set(completedDisciplines);
  const total = allDisciplineIds(flowchart).length;
  const completed = [...completedIds].filter((id) => Boolean(flowchart.disciplinas[id])).length;
  const hoursDone = completedHours(flowchart, completedIds);
  const hoursTotal = totalHours(flowchart);

  return {
    completed,
    total,
    percentage: total === 0 ? 0 : Math.round((completed / total) * 100),
    completedHours: hoursDone,
    totalHours: hoursTotal,
  };
}

export function getAvailableDisciplines(flowchart: Flowchart, completedIds: Set<string>) {
  return flowchart.ordem_sugerida_base.filter((id) => {
    if (completedIds.has(id)) return false;
    return getEligibility(flowchart, id, completedIds).eligible;
  });
}

function getDirectUnlocks(flowchart: Flowchart, before: Set<string>, after: Set<string>) {
  return allDisciplineIds(flowchart).filter((id) => {
    if (after.has(id)) return false;
    const wasEligible = getEligibility(flowchart, id, before).eligible;
    const isEligible = getEligibility(flowchart, id, after).eligible;
    return !wasEligible && isEligible;
  });
}

function getChainImpact(flowchart: Flowchart, candidateId: string, completedIds: Set<string>) {
  const visited = new Set<string>();
  const queue = [{ id: candidateId, distance: 0 }];
  let impact = 0;
  const benefited: string[] = [];

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) break;

    const dependents = flowchart.disciplinas[current.id]?.dependentes ?? [];
    for (const dependentId of dependents) {
      if (visited.has(dependentId) || completedIds.has(dependentId)) continue;
      visited.add(dependentId);

      const distance = current.distance + 1;
      const weight = 1 / distance;
      impact += weight;
      benefited.push(dependentId);
      queue.push({ id: dependentId, distance });
    }
  }

  return { impact, benefited };
}

export function getDisciplineSuggestions(flowchart: Flowchart, state: PlannerState, plannedTerm: Term): DisciplineSuggestion[] {
  const completedIds = new Set(state.completedDisciplines);
  const plannedIds = new Set(state.plannedByTerm[plannedTerm] ?? []);
  const remainingSlots = Math.max(0, state.maxSubjectsPerSemester - plannedIds.size);
  const baseOrder = new Map(flowchart.ordem_sugerida_base.map((id, index) => [id, index]));

  if (remainingSlots === 0) {
    return [];
  }

  return allDisciplineIds(flowchart)
    .filter((id) => !completedIds.has(id) && !plannedIds.has(id) && getEligibility(flowchart, id, completedIds).eligible)
    .map((id) => {
      const completedAfterCandidate = new Set([...completedIds, id]);
      const directUnlockIds = getDirectUnlocks(flowchart, completedIds, completedAfterCandidate);
      const chain = getChainImpact(flowchart, id, completedIds);
      const benefitedDisciplineIds = [...new Set([...directUnlockIds, ...chain.benefited])].slice(0, 4);
      const chainImpact = Number(chain.impact.toFixed(2));
      const totalImpact = Number((directUnlockIds.length * 2 + chainImpact).toFixed(2));

      return {
        disciplineId: id,
        directUnlocks: directUnlockIds.length,
        chainImpact,
        totalImpact,
        benefitedDisciplineIds,
        isPlanned: plannedIds.has(id),
      };
    })
    .sort((a, b) => {
      const disciplineA = flowchart.disciplinas[a.disciplineId];
      const disciplineB = flowchart.disciplinas[b.disciplineId];

      return (
        b.totalImpact - a.totalImpact ||
        b.directUnlocks - a.directUnlocks ||
        disciplineA.periodo - disciplineB.periodo ||
        (baseOrder.get(a.disciplineId) ?? Number.MAX_SAFE_INTEGER) - (baseOrder.get(b.disciplineId) ?? Number.MAX_SAFE_INTEGER)
      );
    })
    .slice(0, remainingSlots);
}

export function forecastGraduation(flowchart: Flowchart, state: PlannerState, firstTerm: Term): GraduationForecast {
  const completedIds = new Set(state.completedDisciplines);
  const total = allDisciplineIds(flowchart).length;
  const capacity = Math.max(1, state.maxSubjectsPerSemester);
  let term = firstTerm;

  for (let semester = 1; semester <= 40; semester += 1) {
    if (completedIds.size >= total) {
      return { term: nextTermAfter(term), semesters: semester - 1 };
    }

    const isFirstSimulatedTerm = semester === 1;
    const planned = isFirstSimulatedTerm ? state.plannedByTerm[firstTerm] ?? [] : [];
    const selected: string[] = [];

    for (const id of planned) {
      if (!completedIds.has(id) && selected.length < capacity && getEligibility(flowchart, id, completedIds).eligible) {
        selected.push(id);
      }
    }

    for (const id of getAvailableDisciplines(flowchart, completedIds)) {
      if (selected.length >= capacity) break;
      if (!selected.includes(id)) {
        selected.push(id);
      }
    }

    if (selected.length === 0) {
      return {
        unavailableReason: 'Nenhuma disciplina restante está liberada com os pré-requisitos atuais.',
      };
    }

    selected.forEach((id) => completedIds.add(id));

    if (completedIds.size >= total) {
      return { term, semesters: semester };
    }

    term = nextTermAfter(term);
  }

  return { unavailableReason: 'A simulação passou de 40 semestres sem concluir todas as disciplinas.' };
}
