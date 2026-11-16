/**
 * The typefaces the app carries with it, for devices without San Francisco (Android, Windows):
 * Inter for Latin and Anuphan for Thai, both OFL-1.1 (see docs/STACK.md). Served from the app
 * itself so they work offline; Apple devices use their system fonts and never load these.
 * Only the weights and subsets the design uses (BRIEF-UI section 3). Anuphan has no 800.
 */
import '@fontsource/inter/latin-400.css';
import '@fontsource/inter/latin-500.css';
import '@fontsource/inter/latin-600.css';
import '@fontsource/inter/latin-700.css';
import '@fontsource/inter/latin-800.css';
import '@fontsource/anuphan/thai-400.css';
import '@fontsource/anuphan/thai-500.css';
import '@fontsource/anuphan/thai-600.css';
import '@fontsource/anuphan/thai-700.css';
