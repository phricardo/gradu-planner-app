import { ChangeEvent, useEffect, useMemo, useRef, useState } from 'react';
import { Check, CheckCircle2, Download, FileUp, GraduationCap, Lightbulb, Link2, Search, Trash2 } from 'lucide-react';
import { getTermInfo } from './academicCalendar';
import { FLOWCHARTS } from './data';
import { displayText } from './text';
import { forecastGraduation, getDisciplineSuggestions, getEligibility, getProgressSummary } from './progress';
import { findStudentByRegistration } from './students';
import {
  buildExportPayload,
  buildShareUrl,
  createDefaultState,
  loadState,
  parseImportPayload,
  parseSharedStateFromLocation,
  saveState,
} from './storage';
import type { Discipline, FlowYear, PlannerState } from './types';
import WhatsAppIcon from './WhatsAppIcon';
import styles from './App.module.css';

function formatDate(date: Date) {
  return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' }).format(date);
}

function periodEntries(flowchart: (typeof FLOWCHARTS)[FlowYear]) {
  return Object.entries(flowchart.periodos).sort(([a], [b]) => Number(a) - Number(b));
}

function fileNameForExport() {
  const date = new Date().toISOString().slice(0, 10);
  return `graduplanner-${date}.json`;
}

export default function App() {
  const [initialSharedState] = useState(() => parseSharedStateFromLocation());
  const [state, setState] = useState<PlannerState>(() => initialSharedState.state ?? loadState());
  const [message, setMessage] = useState(() => {
    if (initialSharedState.state) return 'Planejamento compartilhado carregado com sucesso.';
    return initialSharedState.error ?? '';
  });
  const importInputRef = useRef<HTMLInputElement>(null);

  const flowchart = FLOWCHARTS[state.selectedFlowYear];
  const termInfo = useMemo(() => getTermInfo(), []);
  const plannedTerm = termInfo.nextTerm;
  const completedSet = useMemo(() => new Set(state.completedDisciplines), [state.completedDisciplines]);
  const plannedSet = useMemo(() => new Set(state.plannedByTerm[plannedTerm] ?? []), [state.plannedByTerm, plannedTerm]);
  const plannedCount = plannedSet.size;
  const planningLimit = Math.max(1, state.maxSubjectsPerSemester);
  const remainingPlanningSlots = Math.max(0, planningLimit - plannedCount);
  const hasPlanningCapacity = remainingPlanningSlots > 0;
  const progress = useMemo(() => getProgressSummary(flowchart, state.completedDisciplines), [flowchart, state.completedDisciplines]);
  const forecast = useMemo(() => forecastGraduation(flowchart, state, plannedTerm), [flowchart, state, plannedTerm]);
  const suggestions = useMemo(() => getDisciplineSuggestions(flowchart, state, plannedTerm).slice(0, 5), [flowchart, state, plannedTerm]);

  useEffect(() => {
    if (!initialSharedState.found) return;

    const url = new URL(window.location.href);
    url.hash = '';
    window.history.replaceState(null, '', url.toString());
  }, [initialSharedState.found]);

  useEffect(() => {
    saveState(state);
  }, [state]);

  function updateState(next: PlannerState) {
    setState(next);
    setMessage('');
  }

  function handleFlowChange(flowYear: FlowYear) {
    const validIds = new Set(Object.keys(FLOWCHARTS[flowYear].disciplinas));
    const plannedByTerm = Object.fromEntries(
      Object.entries(state.plannedByTerm).map(([term, ids]) => [term, ids.filter((id) => validIds.has(id))]),
    );

    updateState({
      ...state,
      selectedFlowYear: flowYear,
      completedDisciplines: state.completedDisciplines.filter((id) => validIds.has(id)),
      plannedByTerm,
    });
  }

  function handleRegistrationChange(matricula: string) {
    const student = findStudentByRegistration(matricula);
    updateState({
      ...state,
      matricula,
      student,
    });
  }

  function toggleCompleted(discipline: Discipline) {
    if (completedSet.has(discipline.id)) {
      updateState({
        ...state,
        completedDisciplines: state.completedDisciplines.filter((id) => id !== discipline.id),
        plannedByTerm: Object.fromEntries(
          Object.entries(state.plannedByTerm).map(([term, ids]) => [term, ids.filter((id) => id !== discipline.id)]),
        ),
      });
      return;
    }

    const eligibility = getEligibility(flowchart, discipline.id, completedSet);
    if (!eligibility.eligible) {
      setMessage('Esta disciplina ainda possui pré-requisitos pendentes.');
      return;
    }

    updateState({
      ...state,
      completedDisciplines: [...state.completedDisciplines, discipline.id],
      plannedByTerm: Object.fromEntries(
        Object.entries(state.plannedByTerm).map(([term, ids]) => [term, ids.filter((id) => id !== discipline.id)]),
      ),
    });
  }

  function togglePlanned(discipline: Discipline) {
    if (completedSet.has(discipline.id)) return;

    const eligibility = getEligibility(flowchart, discipline.id, completedSet);
    if (!eligibility.eligible) {
      setMessage('Esta disciplina ainda não pode ser planejada porque possui pré-requisitos pendentes.');
      return;
    }

    const current = state.plannedByTerm[plannedTerm] ?? [];
    const isAlreadyPlanned = plannedSet.has(discipline.id);
    if (!isAlreadyPlanned && !hasPlanningCapacity) {
      setMessage(`Limite de ${planningLimit} disciplina(s) para ${plannedTerm} já atingido.`);
      return;
    }

    const next = plannedSet.has(discipline.id)
      ? current.filter((id) => id !== discipline.id)
      : [...current, discipline.id];

    updateState({
      ...state,
      plannedByTerm: {
        ...state.plannedByTerm,
        [plannedTerm]: next,
      },
    });
  }

  function planSuggestedDiscipline(disciplineId: string) {
    const discipline = flowchart.disciplinas[disciplineId];
    if (!discipline || completedSet.has(disciplineId) || plannedSet.has(disciplineId)) return;

    if (!hasPlanningCapacity) {
      setMessage(`Limite de ${planningLimit} disciplina(s) para ${plannedTerm} já atingido.`);
      return;
    }

    const eligibility = getEligibility(flowchart, disciplineId, completedSet);
    if (!eligibility.eligible) {
      setMessage('Esta sugestão deixou de estar disponível por mudança nos pré-requisitos.');
      return;
    }

    updateState({
      ...state,
      plannedByTerm: {
        ...state.plannedByTerm,
        [plannedTerm]: [...(state.plannedByTerm[plannedTerm] ?? []), disciplineId],
      },
    });
  }

  function completePeriod(periodId: string) {
    const periodIds = flowchart.periodos[periodId] ?? [];
    if (periodIds.every((id) => completedSet.has(id))) return;

    const unlocked = periodIds.filter((id) => !completedSet.has(id) && getEligibility(flowchart, id, completedSet).eligible);
    const blocked = periodIds.length - unlocked.length - periodIds.filter((id) => completedSet.has(id)).length;

    updateState({
      ...state,
      completedDisciplines: [...new Set([...state.completedDisciplines, ...unlocked])],
      plannedByTerm: Object.fromEntries(
        Object.entries(state.plannedByTerm).map(([term, ids]) => [term, ids.filter((id) => !unlocked.includes(id))]),
      ),
    });

    if (blocked > 0) {
      setMessage(`${unlocked.length} disciplina(s) concluída(s); ${blocked} ainda ficaram bloqueadas por pré-requisito.`);
    }
  }

  function handleExport() {
    const blob = new Blob([JSON.stringify(buildExportPayload(state), null, 2)], { type: 'application/json' });
    const href = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = href;
    link.download = fileNameForExport();
    link.click();
    URL.revokeObjectURL(href);
  }

  async function handleCopyShareLink() {
    const shareUrl = buildShareUrl(state);

    try {
      await navigator.clipboard.writeText(shareUrl);
      setMessage('Link de planejamento copiado.');
    } catch {
      window.location.hash = new URL(shareUrl).hash;
      setMessage('Nao foi possivel copiar automaticamente. Copie o link pela barra de enderecos.');
    }
  }

  async function handleImport(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    try {
      const importedState = parseImportPayload(await file.text());
      const confirmed = window.confirm('Importar este arquivo vai substituir todo o progresso salvo neste navegador.');
      if (confirmed) {
        setState(importedState);
        setMessage('Progresso importado com sucesso.');
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Não foi possível importar o arquivo.');
    }
  }

  function resetState() {
    const confirmed = window.confirm('Apagar todo o progresso salvo neste navegador?');
    if (confirmed) {
      setState(createDefaultState());
      setMessage('Progresso local apagado.');
    }
  }

  function buildWhatsAppShareText() {
    const baseText = `Minha previsão no GraduPlanner: estou com ${progress.percentage}% do curso concluído (${progress.completed}/${progress.total} disciplinas) na matriz ${state.selectedFlowYear}.`;
    const shareUrl = buildShareUrl(state);

    if (forecast.term) {
      return `${baseText} Previsão de formatura: ${forecast.term}. Link: ${shareUrl}`;
    }

    return `${baseText} A previsão ainda está indisponível: ${forecast.unavailableReason ?? 'sem motivo informado'}. Link: ${shareUrl}`;
  }

  function handleShareForecast() {
    const url = `https://wa.me/?text=${encodeURIComponent(buildWhatsAppShareText())}`;
    window.open(url, '_blank', 'noopener,noreferrer');
  }

  return (
    <main className={styles.page}>
      <section className={styles.topbar}>
        <div>
          <p className={styles.eyebrow}>CEFET/RJ Nova Friburgo</p>
          <h1>GraduPlanner</h1>
          <p className={styles.subtitle}>Planejamento para o Bacharelado em Sistemas de Informação.</p>
        </div>
        <div className={styles.actions}>
          <button type="button" className={styles.iconButton} onClick={handleCopyShareLink} title="Copiar link compartilhável">
            <Link2 size={18} />
            Copiar link
          </button>
          <button type="button" className={styles.iconButton} onClick={handleExport} title="Exportar progresso">
            <Download size={18} />
            Exportar
          </button>
          <button type="button" className={styles.iconButton} onClick={() => importInputRef.current?.click()} title="Importar progresso">
            <FileUp size={18} />
            Importar
          </button>
          <button type="button" className={styles.iconButtonDanger} onClick={resetState} title="Apagar progresso">
            <Trash2 size={18} />
          </button>
          <input ref={importInputRef} className={styles.hiddenInput} type="file" accept="application/json" onChange={handleImport} />
        </div>
      </section>

      <section className={styles.dashboard}>
        <div className={styles.panel}>
          <h2>Perfil</h2>
          <div className={styles.fieldGrid}>
            <label>
              Matriz
              <select value={state.selectedFlowYear} onChange={(event) => handleFlowChange(event.target.value as FlowYear)}>
                <option value="2022">Fluxograma 2022.1</option>
                <option value="2019">Fluxograma 2019.1</option>
              </select>
            </label>
            <label>
              Matrícula
              <span className={styles.inputWithIcon}>
                <Search size={16} />
                <input
                  value={state.matricula ?? ''}
                  placeholder="Opcional"
                  onChange={(event) => handleRegistrationChange(event.target.value)}
                />
              </span>
            </label>
            <label>
              Limite por semestre
              <input
                type="number"
                min={1}
                max={12}
                value={state.maxSubjectsPerSemester}
                onChange={(event) => updateState({ ...state, maxSubjectsPerSemester: Number(event.target.value) })}
              />
            </label>
          </div>
          <div className={styles.studentBox}>
            {state.student ? (
              <>
                <strong>{displayText(state.student.nome)}</strong>
                <span>{state.student.matricula} · {displayText(state.student.campus)}</span>
              </>
            ) : (
              <span>{state.matricula ? 'Matrícula não encontrada nos dados locais.' : 'Informe a matrícula para preencher nome e campus.'}</span>
            )}
          </div>
        </div>

        <div className={styles.panel}>
          <h2>Progresso</h2>
          <div className={styles.progressHeader}>
            <strong>{progress.percentage}%</strong>
            <span>{progress.completed}/{progress.total} disciplinas</span>
          </div>
          <div className={styles.progressTrack}>
            <span style={{ width: `${progress.percentage}%` }} />
          </div>
          <div className={styles.metricGrid}>
            <span>{progress.completedHours}/{progress.totalHours} h</span>
            <span>Atual: {termInfo.currentTerm}</span>
            <span>Planejar: {plannedTerm}</span>
            <span>2º semestre: {formatDate(termInfo.secondSemesterStart)}</span>
          </div>
        </div>

        <div className={styles.panel}>
          <h2>Formatura</h2>
          <div className={styles.forecastContent}>
            <div className={styles.forecast}>
              <GraduationCap size={24} />
              {forecast.term ? (
                <div>
                  <strong>{forecast.term}</strong>
                  <span>{forecast.semesters} semestre(s) estimado(s)</span>
                </div>
              ) : (
                <div>
                  <strong>Indisponível</strong>
                  <span>{forecast.unavailableReason}</span>
                </div>
              )}
            </div>
            <button type="button" className={styles.whatsappButton} onClick={handleShareForecast}>
              <WhatsAppIcon size={18} />
              WhatsApp
            </button>
          </div>
        </div>

        <div className={styles.panelWide}>
          <div className={styles.panelTitleRow}>
            <h2>Sugestões</h2>
            <span>{plannedCount}/{planningLimit} planejadas para {plannedTerm}</span>
          </div>
          {suggestions.length > 0 ? (
            <div className={styles.suggestionList}>
              {suggestions.map((suggestion) => {
                const discipline = flowchart.disciplinas[suggestion.disciplineId];
                const benefited = suggestion.benefitedDisciplineIds
                  .map((id) => displayText(flowchart.disciplinas[id]?.nome ?? id))
                  .join(', ');

                return (
                  <article className={styles.suggestion} key={suggestion.disciplineId}>
                    <div className={styles.suggestionIcon}>
                      <Lightbulb size={18} />
                    </div>
                    <div className={styles.suggestionBody}>
                      <div className={styles.suggestionMeta}>
                        <span>{discipline.codigo ?? 'OPT'}</span>
                        <span>Período {discipline.periodo}</span>
                        <span>Impacto {suggestion.totalImpact}</span>
                      </div>
                      <strong>{displayText(discipline.nome)}</strong>
                      <p>
                        Libera {suggestion.directUnlocks} direta(s)
                        {benefited ? ` · Ajuda em: ${benefited}` : ''}
                      </p>
                    </div>
                    <button type="button" onClick={() => planSuggestedDiscipline(suggestion.disciplineId)}>
                      Planejar
                    </button>
                  </article>
                );
              })}
            </div>
          ) : (
            <p className={styles.emptyState}>
              {hasPlanningCapacity ? 'Não há disciplinas cursáveis pendentes fora do planejamento atual.' : 'Limite do semestre já atingido.'}
            </p>
          )}
        </div>
      </section>

      {message && <p className={styles.message}>{message}</p>}

      <section className={styles.periodGrid}>
        {periodEntries(flowchart).map(([periodId, ids]) => {
          const isPeriodCompleted = ids.every((id) => completedSet.has(id));

          return (
            <article className={styles.period} key={periodId}>
              <header className={styles.periodHeader}>
                <div>
                  <span>Período</span>
                  <strong>{periodId}</strong>
                </div>
                {isPeriodCompleted ? (
                  <button type="button" className={styles.periodDoneButton} disabled>
                    <CheckCircle2 size={16} />
                    Finalizado
                  </button>
                ) : (
                  <button type="button" onClick={() => completePeriod(periodId)}>
                    <Check size={16} />
                    Completar
                  </button>
                )}
              </header>

              <div className={styles.disciplineList}>
                {ids.map((id) => {
                  const discipline = flowchart.disciplinas[id];
                  const eligibility = getEligibility(flowchart, id, completedSet);
                  const isCompleted = completedSet.has(id);
                  const isPlanned = plannedSet.has(id);
                  const missingNames = eligibility.missingPrereqs.map((missingId) => displayText(flowchart.disciplinas[missingId]?.nome ?? missingId));

                  return (
                    <div
                      className={`${styles.discipline} ${isCompleted ? styles.completed : ''} ${isPlanned ? styles.planned : ''}`}
                      key={id}
                    >
                      <div className={styles.disciplineTop}>
                        <span className={styles.code}>{discipline.codigo ?? 'OPT'}</span>
                        <span className={styles.badge}>{discipline.obrigatoria ? 'Obrigatória' : 'Optativa'}</span>
                      </div>
                      <h3>{displayText(discipline.nome)}</h3>
                      <p>{discipline.creditos} créditos · {discipline.carga_horaria_aula} h</p>

                      {!eligibility.eligible && !isCompleted && (
                        <div className={styles.blockedInfo}>
                          {missingNames.length > 0 && <span>Falta: {missingNames.join(', ')}</span>}
                          {eligibility.missingSpecialRules.map((rule) => <span key={rule}>{rule}</span>)}
                        </div>
                      )}

                      {discipline.prereq_condicionais.length > 0 && (
                        <div className={styles.notice}>
                          {discipline.prereq_condicionais.map((rule) => (
                            <span key={`${rule.disciplina_id}-${rule.condicao}`}>Condicional: {displayText(rule.condicao)}</span>
                          ))}
                        </div>
                      )}

                      <div className={styles.cardActions}>
                        <button
                          type="button"
                          className={isCompleted ? styles.primaryActive : styles.primary}
                          onClick={() => toggleCompleted(discipline)}
                          disabled={!isCompleted && !eligibility.eligible}
                        >
                          <Check size={16} />
                          {isCompleted ? 'Concluída' : 'Concluir'}
                        </button>
                        <button
                          type="button"
                          onClick={() => togglePlanned(discipline)}
                          disabled={isCompleted || !eligibility.eligible || (!isPlanned && !hasPlanningCapacity)}
                        >
                          {isPlanned ? 'Planejada' : `Planejar ${plannedTerm}`}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </article>
          );
        })}
      </section>
    </main>
  );
}
