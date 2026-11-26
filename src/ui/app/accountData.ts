/**
 * Deleting an account's data, or everything, for good (1.1.1, Fable review 1.1 B4-01, B4-02).
 * What is still on its way is stopped first, so nothing of the account is written back after the
 * delete: an update from the site (appStore) and the analysis queue.
 */
import { local, ownerKey, type Accounts } from '@/data/local';
import type { AccountSource } from '@/data/ratings';
import { useAnalysisQueue } from './analysisQueue';
import { useApp } from './appStore';

function stopEverything(): void {
  useApp.getState().stopUpdates();
  useAnalysisQueue.getState().stopAll();
}

/** Deletes what is kept for one account, then saves the accounts that are left (`next`). */
export async function deleteAccountData(
  source: AccountSource,
  username: string,
  next: Accounts | null,
): Promise<void> {
  stopEverything();
  await local.deleteOwner(ownerKey(source, username));
  await useApp.getState().setAccounts(next);
}

/**
 * Settings › Privacy › Clear saved data. Throws when the data could not be deleted, so the screen
 * never claims it was (Fable review 1.1 B4-05).
 */
export async function clearEverything(): Promise<void> {
  stopEverything();
  await local.clearAll();
  try {
    localStorage.removeItem('cbm.ratingsSite');
  } catch {
    // storage blocked: nothing kept there either
  }
  await useApp
    .getState()
    .setAccounts(null)
    .catch(() => {});
}
