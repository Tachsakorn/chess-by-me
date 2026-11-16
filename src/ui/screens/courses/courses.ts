/**
 * The courses on the Courses screen (BRIEF-UI 6.4), as data so that more can be added without
 * touching the screen. The owner writes the lessons; until then every course is "coming soon".
 * `cover` is the word on the cover, line by line as drawn; `name` is a key of the i18n text.
 */
export type CourseColor = 'red' | 'blue' | 'pink' | 'amber' | 'green';
export type CourseName = 'basics' | 'openings' | 'tactics' | 'middlegame' | 'endgame' | 'mates';

export interface Course {
  id: string;
  name: CourseName;
  cover: string[];
  color: CourseColor | null;
  status: 'coming-soon' | 'open';
}

export const START_COURSE: Course = {
  id: 'basics',
  name: 'basics',
  cover: ['Basics'],
  color: null,
  status: 'coming-soon',
};

export const PHASE_COURSES: Course[] = [
  {
    id: 'openings',
    name: 'openings',
    cover: ['Open', 'ings'],
    color: 'red',
    status: 'coming-soon',
  },
  { id: 'tactics', name: 'tactics', cover: ['Tac', 'tics'], color: 'blue', status: 'coming-soon' },
  {
    id: 'middlegame',
    name: 'middlegame',
    cover: ['Middle', 'game'],
    color: 'pink',
    status: 'coming-soon',
  },
  { id: 'endgame', name: 'endgame', cover: ['End', 'game'], color: 'amber', status: 'coming-soon' },
  { id: 'mates', name: 'mates', cover: ['Mates'], color: 'green', status: 'coming-soon' },
];
