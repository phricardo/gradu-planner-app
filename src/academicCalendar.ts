import type { Term, TermInfo } from './types';

export function firstBusinessDayOfAugust(year: number) {
  const date = new Date(year, 7, 1);
  while (date.getDay() === 0 || date.getDay() === 6) {
    date.setDate(date.getDate() + 1);
  }
  return date;
}

export function getTermInfo(referenceDate = new Date()): TermInfo {
  const year = referenceDate.getFullYear();
  const secondSemesterStart = firstBusinessDayOfAugust(year);
  const isSecondTerm = referenceDate >= secondSemesterStart;

  return {
    currentTerm: `${year}.${isSecondTerm ? '2' : '1'}` as Term,
    nextTerm: isSecondTerm ? (`${year + 1}.1` as Term) : (`${year}.2` as Term),
    secondSemesterStart,
  };
}

export function nextTermAfter(term: Term): Term {
  const [yearText, semester] = term.split('.');
  const year = Number(yearText);
  return semester === '1' ? (`${year}.2` as Term) : (`${year + 1}.1` as Term);
}
