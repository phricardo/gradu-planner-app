import { STUDENTS } from './data';
import type { SelectedStudent } from './types';

export function findStudentByRegistration(matricula: string): SelectedStudent | undefined {
  const normalized = matricula.trim().toLowerCase();
  if (!normalized) return undefined;

  for (const [campus, students] of Object.entries(STUDENTS)) {
    const student = students.find((candidate) => candidate.matricula.toLowerCase() === normalized);
    if (student) {
      return { ...student, campus };
    }
  }

  return undefined;
}
