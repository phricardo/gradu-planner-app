import flow2019 from './data/fluxograma_2019_1_dependencias.json';
import flow2022 from './data/fluxograma_2022_1_dependencias.json';
import students from './data/alunos.json';
import type { FlowYear, Flowchart, StudentsByCampus } from './types';

export const FLOWCHARTS: Record<FlowYear, Flowchart> = {
  '2019': flow2019 as Flowchart,
  '2022': flow2022 as Flowchart,
};

export const STUDENTS = students as StudentsByCampus;
